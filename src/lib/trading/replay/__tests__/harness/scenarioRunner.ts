/**
 * Deterministic Scenario Runner for Property-Based Testing
 * ========================================================
 * Executes a sequence of ReplayScenarioEvents one-by-one through ReplayEngine.replay(),
 * threads account state across steps via AccountStateThreader, and validates the final
 * financial state against the synthetic audit trail via PaperReconciliationEngine.
 * 
 * Invariants:
 * - Strictly Single-Event Chaining (No parallel/batch replay API invention).
 * - Exact reuse of canonical ReplayEngine, AccountStateThreader, and PaperReconciliationEngine.
 * - 100% deterministic and non-mutating.
 */

import { ReplayEngine } from '../..';
import { PaperReconciliationEngine } from '../../../paper/reconciliation/PaperReconciliationEngine.ts';
import type { PaperAuditEntry } from '../../../paper/PaperTradeLedger.ts';
import type { BrokerAccount } from '../../../execution/BrokerAdapter.ts';
import type {
  ReplayScenario,
  ScenarioExecutionResult,
  ScenarioStepResult,
} from './scenarioTypes.ts';
import { AccountStateThreader } from './accountStateThreader.ts';
import { FailureDiagnostics } from './failureDiagnostics.ts';

export class ScenarioRunner {
  private readonly reconciliationEngine: PaperReconciliationEngine;

  constructor() {
    this.reconciliationEngine = new PaperReconciliationEngine({
      moneyToleranceVND: 1.0,
      quantityTolerance: 0,
      priceToleranceVND: 1.0,
      percentTolerance: 0.01,
    });
  }

  /**
   * Runs a complete multi-event scenario through sequential single-event ReplayEngine calls.
   */
  runScenario(scenario: ReplayScenario): ScenarioExecutionResult {
    let currentAccount: BrokerAccount = AccountStateThreader.cloneAccount(scenario.initialAccount);
    const stepResults: ScenarioStepResult[] = [];
    const syntheticLedger: PaperAuditEntry[] = [];
    const executionErrors: string[] = [];

    for (let stepIndex = 0; stepIndex < scenario.events.length; stepIndex++) {
      const event = scenario.events[stepIndex];
      const accountBeforeStep = AccountStateThreader.cloneAccount(currentAccount);

      let replayResult;
      try {
        replayResult = ReplayEngine.replay({
          snapshot: event.snapshot,
          executionContext: event.executionContext,
          orderIntent: event.orderIntent,
          initialAccount: accountBeforeStep,
          policy: scenario.policy,
          tradingCosts: scenario.tradingCosts,
          customNow: event.timestamp,
        });
      } catch (err) {
        const errorMsg = `ReplayEngine threw an unhandled exception at step ${stepIndex}: ${err instanceof Error ? err.message : String(err)}`;
        executionErrors.push(errorMsg);
        stepResults.push({
          stepIndex,
          event,
          accountBefore: accountBeforeStep,
          replayResult: null as any,
          accountAfter: accountBeforeStep,
          isConsistent: false,
          stepError: errorMsg,
        });
        break;
      }

      // Thread state to next account state
      const { nextAccount, auditEntry } = AccountStateThreader.applyReplayResult(
        accountBeforeStep,
        replayResult,
        event.orderIntent,
        event.snapshot,
        stepIndex,
        event.timestamp
      );

      if (auditEntry) {
        syntheticLedger.push(auditEntry);
      }

      const isStepValid =
        event.classification === 'INVALID_INPUT'
          ? (replayResult.status === 'REPLAY_INVALID' || (replayResult.replayExecution && replayResult.replayExecution.status === 'REJECTED'))
          : event.classification === 'VALID_NON_EXECUTABLE'
          ? (replayResult.status === 'REPLAYED' && replayResult.replayExecution?.status === 'REJECTED')
          : (replayResult.status === 'REPLAYED' && replayResult.replayExecution?.status === 'FILLED');

      stepResults.push({
        stepIndex,
        event,
        accountBefore: accountBeforeStep,
        replayResult,
        accountAfter: nextAccount,
        auditEntry,
        isConsistent: isStepValid,
      });

      currentAccount = nextAccount;
    }

    // Run canonical financial reconciliation on final state vs audit trail
    const reconciliationReport = this.reconciliationEngine.reconcile({
      account: currentAccount,
      ledger: syntheticLedger,
      initialCash: scenario.initialAccount.cash,
      now: scenario.events.length > 0 ? scenario.events[scenario.events.length - 1].timestamp : undefined,
    });

    const success =
      executionErrors.length === 0 &&
      stepResults.every((s) => s.isConsistent) &&
      reconciliationReport.status === 'RECONCILED';

    let diagnostics;
    if (!success) {
      const failingStep = stepResults.find((s) => !s.isConsistent);
      diagnostics = {
        propertyId: 'SCENARIO_EXECUTION_INTEGRITY',
        seed: scenario.seed,
        scenarioId: scenario.scenarioId,
        stepIndex: failingStep?.stepIndex,
        expectedInvariant: 'All steps consistent and final state reconciled',
        actualResult: {
          reconciliationStatus: reconciliationReport.status,
          mismatches: reconciliationReport.mismatches,
          errors: executionErrors,
        },
        initialAccount: scenario.initialAccount,
        currentAccount,
        event: failingStep?.event,
        snapshotId: failingStep?.event.snapshot.snapshotId,
        replayResult: failingStep?.replayResult,
        reconciliationMismatches: reconciliationReport.mismatches,
        message: failingStep?.stepError || `Reconciliation failed with status: ${reconciliationReport.status}`,
      };
    }

    return {
      scenarioId: scenario.scenarioId,
      seed: scenario.seed,
      initialAccount: scenario.initialAccount,
      finalAccount: currentAccount,
      stepResults,
      syntheticLedger,
      reconciliationReport,
      success,
      executionErrors,
      diagnostics,
    };
  }
}

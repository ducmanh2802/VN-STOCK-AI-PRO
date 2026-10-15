/**
 * Failure Diagnostics Formatter for Property-Based Testing
 * ========================================================
 * Provides clear, human-readable and machine-parseable diagnostics
 * when a property invariant is violated.
 */

import type { ScenarioFailureDiagnostics } from './scenarioTypes.ts';

export class FailureDiagnostics {
  /**
   * Formats a ScenarioFailureDiagnostics object into a detailed diagnostic string.
   */
  static format(diag: ScenarioFailureDiagnostics): string {
    const lines: string[] = [
      '================================================================================',
      `🚨 PROPERTY VIOLATION: ${diag.propertyId}`,
      '================================================================================',
      `Seed:               ${diag.seed}`,
      `Scenario ID:        ${diag.scenarioId}`,
      `Step Index:         ${diag.stepIndex !== undefined ? diag.stepIndex : 'N/A'}`,
      `Snapshot ID:        ${diag.snapshotId || 'N/A'}`,
      `Expected Invariant: ${diag.expectedInvariant}`,
      `Message:            ${diag.message}`,
      '--------------------------------------------------------------------------------',
      'INITIAL ACCOUNT STATE:',
      JSON.stringify(diag.initialAccount, null, 2),
    ];

    if (diag.currentAccount) {
      lines.push(
        '--------------------------------------------------------------------------------',
        'CURRENT ACCOUNT STATE:',
        JSON.stringify(diag.currentAccount, null, 2)
      );
    }

    if (diag.event) {
      lines.push(
        '--------------------------------------------------------------------------------',
        'EVENT DETAILS:',
        `Event ID:       ${diag.event.eventId}`,
        `Classification: ${diag.event.classification} (${diag.event.subCategory})`,
        `Side:           ${diag.event.orderIntent.side}`,
        `Quantity:       ${diag.event.orderIntent.quantity}`,
        `Price:          ${diag.event.orderIntent.limitPrice ?? diag.event.snapshot.quote.last}`,
        `Order Intent:   ${JSON.stringify(diag.event.orderIntent)}`
      );
    }

    if (diag.replayResult) {
      lines.push(
        '--------------------------------------------------------------------------------',
        'REPLAY RESULT:',
        `Status:         ${diag.replayResult.status}`,
        `Deterministic:  ${diag.replayResult.deterministic}`,
        `Error:          ${diag.replayResult.error || 'None'}`,
        `Execution:      ${JSON.stringify(diag.replayResult.replayExecution ?? null, null, 2)}`,
        `Mismatches:     ${JSON.stringify(diag.replayResult.mismatches, null, 2)}`
      );
    }

    if (diag.reconciliationMismatches && diag.reconciliationMismatches.length > 0) {
      lines.push(
        '--------------------------------------------------------------------------------',
        'RECONCILIATION MISMATCHES:',
        JSON.stringify(diag.reconciliationMismatches, null, 2)
      );
    }

    lines.push(
      '--------------------------------------------------------------------------------',
      'ACTUAL RESULT:',
      typeof diag.actualResult === 'object'
        ? JSON.stringify(diag.actualResult, null, 2)
        : String(diag.actualResult),
      '================================================================================'
    );

    return lines.join('\n');
  }

  /**
   * Throws an assertion error containing the formatted diagnostic report.
   */
  static assert(condition: boolean, diag: ScenarioFailureDiagnostics): void {
    if (!condition) {
      const formatted = this.format(diag);
      const err = new Error(formatted);
      err.name = `PropertyViolationError [${diag.propertyId}]`;
      throw err;
    }
  }
}

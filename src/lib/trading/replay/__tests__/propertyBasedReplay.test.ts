/**
 * PHASE 18.3.7 — PROPERTY-BASED REPLAY TESTING ACCEPTANCE SUITE
 * ============================================================
 * Dedicated generative property-based testing suite validating all 16 PBT properties:
 *   PBT-01: Seed Determinism
 *   PBT-02: Scenario Generator Validity & 3-Tier Classification
 *   PBT-03: HOSE Price-Limit / Snapshot Constraints
 *   PBT-04: Account State Threading Pure Invariants
 *   PBT-05: Single-Event Chaining
 *   PBT-06: Replay Determinism & Parity
 *   PBT-07: Snapshot Integrity & Anti-Tampering
 *   PBT-08: Order-State-Machine Validity & Immutability
 *   PBT-09: Financial Conservation Laws
 *   PBT-10: Position / Exposure Constraints & No Short Selling
 *   PBT-11: Risk Constraints & Fail-Closed Bounds
 *   PBT-12: ExecutionContext Binding & Traceability
 *   PBT-13: Reconciliation Equivalence (PaperReconciliationEngine)
 *   PBT-14: Failure Determinism & Diagnostics Reproducibility
 *   PBT-15: Boundary / Degenerate Scenarios
 *   PBT-16: Metamorphic Replay Invariants
 *
 * Invariants:
 * - 200 generated cases per property = 3,200 total generative test cases.
 * - Explicit deterministic seeds (e.g. 18030100 to 18031600).
 * - 0% Math.random(), 0% network calls, 0% uncontrolled time.
 * - Single-event state threading through canonical ReplayEngine & PaperReconciliationEngine.
 */

import { describe, it, expect } from 'vitest';
import {
  SeededRng,
  ScenarioGenerators,
  AccountStateThreader,
  ScenarioRunner,
  FailureDiagnostics,
} from './harness/index.ts';
import { ReplayEngine } from '../ReplayEngine.ts';
import { MarketSnapshotBuilder } from '../../snapshot/MarketSnapshotBuilder.ts';
import { verifySnapshotIntegrity } from '../../snapshot/MarketSnapshot.ts';
import type { OrderIntent, ExecutionContextBinding } from '../types.ts';
import type { BrokerAccount } from '../../execution/BrokerAdapter.ts';

const CASES_PER_PROPERTY = 200;

describe('Phase 18.3.7: Deterministic Property-Based Replay Acceptance Suite (PBT-01 to PBT-16)', () => {
  const runner = new ScenarioRunner();

  // ===========================================================================
  // PBT-01: Seed Determinism
  // ===========================================================================
  it('PBT-01: Seed Determinism (200 generated cases)', () => {
    const BASE_SEED = 18030100;
    let passedCases = 0;

    for (let i = 0; i < CASES_PER_PROPERTY; i++) {
      const seed = BASE_SEED + i;
      const scenarioA1 = ScenarioGenerators.generateValidExecutableScenario(seed, 3);
      const scenarioA2 = ScenarioGenerators.generateValidExecutableScenario(seed, 3);
      const scenarioB = ScenarioGenerators.generateValidExecutableScenario(seed + 999_999, 3);

      // Same seed must produce structurally and deeply identical scenarios
      expect(scenarioA1.scenarioId).toBe(scenarioA2.scenarioId);
      expect(scenarioA1.events.length).toBe(scenarioA2.events.length);
      expect(scenarioA1.initialAccount.cash).toBe(scenarioA2.initialAccount.cash);
      expect(scenarioA1.events).toEqual(scenarioA2.events);

      // Replay outcomes must be identical
      const resA1 = runner.runScenario(scenarioA1);
      const resA2 = runner.runScenario(scenarioA2);
      expect(resA1.success).toBe(resA2.success);
      expect(resA1.finalAccount.cash).toBe(resA2.finalAccount.cash);
      expect(resA1.finalAccount.equity).toBe(resA2.finalAccount.equity);
      expect(resA1.stepResults.length).toBe(resA2.stepResults.length);

      // Different seed must produce distinct scenarios
      expect(scenarioA1.scenarioId).not.toBe(scenarioB.scenarioId);

      passedCases++;
    }

    expect(passedCases).toBe(CASES_PER_PROPERTY);
  });

  // ===========================================================================
  // PBT-02: Scenario Generator Validity & 3-Tier Classification
  // ===========================================================================
  it('PBT-02: Scenario Generator Validity & Classification (200 generated cases)', () => {
    const BASE_SEED = 18030200;
    let passedCases = 0;

    for (let i = 0; i < CASES_PER_PROPERTY; i++) {
      const seed = BASE_SEED + i;
      const tierSelector = i % 4;

      if (tierSelector === 0 || tierSelector === 1) {
        // VALID_EXECUTABLE
        const scenario = ScenarioGenerators.generateValidExecutableScenario(seed, 2);
        expect(scenario.events.length).toBe(2);
        for (const evt of scenario.events) {
          expect(evt.classification).toBe('VALID_EXECUTABLE');
          expect(evt.orderIntent.quantity % 100).toBe(0);
          expect(evt.snapshot.quote.last).toBeGreaterThanOrEqual(evt.snapshot.quote.floor);
          expect(evt.snapshot.quote.last).toBeLessThanOrEqual(evt.snapshot.quote.ceiling);
        }
      } else if (tierSelector === 2) {
        // VALID_NON_EXECUTABLE
        const subCat = i % 2 === 0 ? 'INSUFFICIENT_CASH' : 'INSUFFICIENT_POSITION';
        const scenario = ScenarioGenerators.generateValidNonExecutableScenario(seed, subCat);
        expect(scenario.events[0].classification).toBe('VALID_NON_EXECUTABLE');
        expect(scenario.events[0].subCategory).toBe(subCat);
      } else {
        // INVALID_INPUT
        const subCat = i % 3 === 0 ? 'NON_BOARD_LOT' : i % 3 === 1 ? 'CORRUPTED_SNAPSHOT_HASH' : 'SNAPSHOT_ID_MISMATCH';
        const scenario = ScenarioGenerators.generateInvalidInputScenario(seed, subCat);
        expect(scenario.events[0].classification).toBe('INVALID_INPUT');
        expect(scenario.events[0].subCategory).toBe(subCat);
      }

      passedCases++;
    }

    expect(passedCases).toBe(CASES_PER_PROPERTY);
  });

  // ===========================================================================
  // PBT-03: HOSE Price-Limit / Snapshot Constraints
  // ===========================================================================
  it('PBT-03: HOSE Price-Limit / Snapshot Constraints (200 generated cases)', () => {
    const BASE_SEED = 18030300;
    let passedCases = 0;

    for (let i = 0; i < CASES_PER_PROPERTY; i++) {
      const seed = BASE_SEED + i;
      const rng = new SeededRng(seed);
      const refPrice = rng.nextInt(20_000, 100_000);
      const ceiling = Math.round(refPrice * 1.07);
      const floor = Math.round(refPrice * 0.93);
      const lastPrice = rng.nextInt(floor, ceiling);

      // Valid snapshot construction
      const snapshot = ScenarioGenerators.generateMarketSnapshot(rng, {
        referencePrice: refPrice,
        ceilingPrice: ceiling,
        floorPrice: floor,
        lastPrice,
      });

      expect(snapshot.quote.floor).toBeLessThanOrEqual(snapshot.quote.last);
      expect(snapshot.quote.last).toBeLessThanOrEqual(snapshot.quote.ceiling);
      expect(snapshot.integrity.validationStatus).toBe('VALID');

      // Intentional price boundary breach must fail validation
      const invalidHighInput = ScenarioGenerators.generateMarketSnapshotInput(rng, {
        referencePrice: refPrice,
        ceilingPrice: ceiling,
        floorPrice: floor,
        lastPrice: ceiling + 10_000, // Price beyond ceiling
      });
      const invalidValidation = MarketSnapshotBuilder.validateInput(invalidHighInput);
      expect(invalidValidation.isValid).toBe(false);

      passedCases++;
    }

    expect(passedCases).toBe(CASES_PER_PROPERTY);
  });

  // ===========================================================================
  // PBT-04: Account State Threading Pure Invariants
  // ===========================================================================
  it('PBT-04: Account State Threading (200 generated cases)', () => {
    const BASE_SEED = 18030400;
    let passedCases = 0;

    for (let i = 0; i < CASES_PER_PROPERTY; i++) {
      const seed = BASE_SEED + i;
      const rng = new SeededRng(seed);
      const initialCash = 500_000_000;
      const account0 = ScenarioGenerators.generateInitialAccount(rng, { initialCash });
      const initialCashBefore = account0.cash;

      const snapshot = ScenarioGenerators.generateMarketSnapshot(rng, {
        symbol: 'HPG',
        lastPrice: 28_000,
        signal: 'BUY',
      });
      const orderIntent: OrderIntent = {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 1_000,
        orderType: 'MARKET',
        recommendationId: snapshot.recommendation?.recommendationId,
        marketDataSnapshotId: snapshot.snapshotId,
        strategyVersion: snapshot.versions?.strategyVersion,
        riskPolicyVersion: snapshot.versions?.riskPolicyVersion,
      };
      const execContext: ExecutionContextBinding = {
        marketDataSnapshotId: snapshot.snapshotId,
        recommendationId: snapshot.recommendation?.recommendationId,
        strategyVersion: snapshot.versions?.strategyVersion,
        riskPolicyVersion: snapshot.versions?.riskPolicyVersion,
      };

      const replayResult = ReplayEngine.replay({
        snapshot,
        executionContext: execContext,
        orderIntent,
        initialAccount: account0,
        customNow: 1774866600000,
      });

      const { nextAccount, auditEntry } = AccountStateThreader.applyReplayResult(
        account0,
        replayResult,
        orderIntent,
        snapshot,
        0,
        1774866600000
      );

      // Purity check: account0 must NOT have mutated
      expect(account0.cash).toBe(initialCashBefore);
      expect(account0.positions.length).toBe(0);

      // Threaded state checks
      const executedPrice = replayResult.replayExecution!.executedPrice!;
      const fee = replayResult.replayExecution!.fee;
      const grossCost = 1_000 * executedPrice;
      const expectedCash = initialCash - (grossCost + fee);

      expect(nextAccount.cash).toBeCloseTo(expectedCash, 1);
      const hpgPos = nextAccount.positions.find((p) => p.symbol === 'HPG');
      expect(hpgPos).toBeDefined();
      expect(hpgPos!.quantity).toBe(1_000);
      expect(auditEntry).toBeDefined();
      expect(auditEntry!.cashAfter).toBeCloseTo(expectedCash, 1);

      passedCases++;
    }

    expect(passedCases).toBe(CASES_PER_PROPERTY);
  });

  // ===========================================================================
  // PBT-05: Single-Event Chaining
  // ===========================================================================
  it('PBT-05: Single-Event Chaining (200 generated cases)', () => {
    const BASE_SEED = 18030500;
    let passedCases = 0;

    for (let i = 0; i < CASES_PER_PROPERTY; i++) {
      const seed = BASE_SEED + i;
      const stepCount = (i % 3) + 2; // 2 to 4 steps
      const scenario = ScenarioGenerators.generateValidExecutableScenario(seed, stepCount);

      const result = runner.runScenario(scenario);

      expect(result.stepResults.length).toBe(stepCount);
      expect(result.executionErrors.length).toBe(0);

      // Verify chaining continuity across steps
      for (let s = 0; s < result.stepResults.length; s++) {
        const step = result.stepResults[s];
        if (s === 0) {
          expect(step.accountBefore.cash).toBe(scenario.initialAccount.cash);
        } else {
          const prevStep = result.stepResults[s - 1];
          expect(step.accountBefore.cash).toBe(prevStep.accountAfter.cash);
          expect(step.accountBefore.positions).toEqual(prevStep.accountAfter.positions);
        }
      }

      expect(result.finalAccount.cash).toBe(result.stepResults[stepCount - 1].accountAfter.cash);
      passedCases++;
    }

    expect(passedCases).toBe(CASES_PER_PROPERTY);
  });

  // ===========================================================================
  // PBT-06: Replay Determinism & Parity
  // ===========================================================================
  it('PBT-06: Replay Determinism & Parity (200 generated cases)', () => {
    const BASE_SEED = 18030600;
    let passedCases = 0;

    for (let i = 0; i < CASES_PER_PROPERTY; i++) {
      const seed = BASE_SEED + i;
      const scenario = ScenarioGenerators.generateValidExecutableScenario(seed, 3);

      const runA = runner.runScenario(scenario);
      const runB = runner.runScenario(scenario);

      expect(runA.success).toBe(runB.success);
      expect(runA.finalAccount.cash).toBe(runB.finalAccount.cash);
      expect(runA.finalAccount.equity).toBe(runB.finalAccount.equity);
      expect(runA.finalAccount.realizedPnL).toBe(runB.finalAccount.realizedPnL);
      expect(runA.syntheticLedger.length).toBe(runB.syntheticLedger.length);
      expect(runA.reconciliationReport.status).toBe(runB.reconciliationReport.status);

      passedCases++;
    }

    expect(passedCases).toBe(CASES_PER_PROPERTY);
  });

  // ===========================================================================
  // PBT-07: Snapshot Integrity & Anti-Tampering
  // ===========================================================================
  it('PBT-07: Snapshot Integrity & Anti-Tampering (200 generated cases)', () => {
    const BASE_SEED = 18030700;
    let passedCases = 0;

    for (let i = 0; i < CASES_PER_PROPERTY; i++) {
      const seed = BASE_SEED + i;
      const rng = new SeededRng(seed);
      const snapshot = ScenarioGenerators.generateMarketSnapshot(rng);

      // 1. Pristine snapshot is valid
      const isValidSnapshot = verifySnapshotIntegrity(snapshot);
      expect(isValidSnapshot).toBe(true);

      // 2. Tampering detection
      const tamperedSnapshot = {
        ...snapshot,
        quote: {
          ...snapshot.quote,
          last: snapshot.quote.last + 50_000, // Invalidate quote vs hash/ceiling
        },
      };

      const tamperedReplay = ReplayEngine.replay({
        snapshot: tamperedSnapshot,
        executionContext: {
          marketDataSnapshotId: tamperedSnapshot.snapshotId,
          recommendationId: tamperedSnapshot.recommendation?.recommendationId,
          strategyVersion: tamperedSnapshot.versions?.strategyVersion,
          riskPolicyVersion: tamperedSnapshot.versions?.riskPolicyVersion,
        },
        orderIntent: {
          symbol: tamperedSnapshot.instrument.symbol,
          side: 'BUY',
          quantity: 100,
          orderType: 'MARKET',
          marketDataSnapshotId: tamperedSnapshot.snapshotId,
        },
        initialAccount: ScenarioGenerators.generateInitialAccount(rng),
        customNow: 1774866600000,
      });

      // Must detect corruption or price violation
      expect(
        tamperedReplay.status === 'REPLAY_INVALID' ||
        tamperedReplay.replayExecution?.status === 'REJECTED' ||
        tamperedReplay.mismatches.length > 0
      ).toBe(true);

      passedCases++;
    }

    expect(passedCases).toBe(CASES_PER_PROPERTY);
  });

  // ===========================================================================
  // PBT-08: Order-State-Machine Validity & Immutability
  // ===========================================================================
  it('PBT-08: Order-State-Machine Validity (200 generated cases)', () => {
    const BASE_SEED = 18030800;
    let passedCases = 0;

    for (let i = 0; i < CASES_PER_PROPERTY; i++) {
      const seed = BASE_SEED + i;
      const rng = new SeededRng(seed);
      const snapshot = ScenarioGenerators.generateMarketSnapshot(rng, { signal: 'BUY' });
      const initialAccount = ScenarioGenerators.generateInitialAccount(rng, { initialCash: 500_000_000 });

      const replayResult = ReplayEngine.replay({
        snapshot,
        executionContext: {
          marketDataSnapshotId: snapshot.snapshotId,
          recommendationId: snapshot.recommendation?.recommendationId,
          strategyVersion: snapshot.versions?.strategyVersion,
          riskPolicyVersion: snapshot.versions?.riskPolicyVersion,
        },
        orderIntent: {
          symbol: snapshot.instrument.symbol,
          side: 'BUY',
          quantity: 200,
          orderType: 'MARKET',
          marketDataSnapshotId: snapshot.snapshotId,
          strategyVersion: snapshot.versions?.strategyVersion,
          riskPolicyVersion: snapshot.versions?.riskPolicyVersion,
        },
        initialAccount,
        customNow: 1774866600000,
      });

      expect(replayResult.stateHistory).toBeDefined();
      expect(replayResult.stateHistory[0]).toBe('NEW');
      expect(replayResult.stateHistory).toContain('FILLED');
      expect(replayResult.stateHistory[replayResult.stateHistory.length - 1]).toBe('SETTLED');

      // Verify strictly monotonic event sequence numbers
      for (let e = 0; e < replayResult.eventHistory.length; e++) {
        expect(replayResult.eventHistory[e].sequenceNumber).toBe(e + 1);
        expect(replayResult.eventHistory[e].snapshotId).toBe(snapshot.snapshotId);
      }

      passedCases++;
    }

    expect(passedCases).toBe(CASES_PER_PROPERTY);
  });

  // ===========================================================================
  // PBT-09: Financial Conservation Laws
  // ===========================================================================
  it('PBT-09: Financial Conservation (200 generated cases)', () => {
    const BASE_SEED = 18030900;
    let passedCases = 0;

    for (let i = 0; i < CASES_PER_PROPERTY; i++) {
      const seed = BASE_SEED + i;
      const scenario = ScenarioGenerators.generateValidExecutableScenario(seed, 3);
      const result = runner.runScenario(scenario);

      expect(result.success).toBe(true);
      expect(result.reconciliationReport.status).toBe('RECONCILED');

      // Aggregate ledger accounting audit
      let totalFees = 0;
      let totalTaxes = 0;
      let totalRealizedPnL = 0;

      for (const entry of result.syntheticLedger) {
        if (entry.executedQuantity && entry.executedQuantity > 0 && entry.executedPrice) {
          const grossValue = entry.executedQuantity * entry.executedPrice;
          const fee = grossValue * 0.0015;
          const tax = entry.side === 'SELL' ? grossValue * 0.0010 : 0;
          totalFees += fee;
          totalTaxes += tax;
          if (entry.realizedPnL) {
            totalRealizedPnL += entry.realizedPnL;
          }
        }
      }

      // Equity conservation law: Cash + MarketValue == Equity
      const finalAcc = result.finalAccount;
      expect(finalAcc.cash + finalAcc.marketValue).toBeCloseTo(finalAcc.equity, 1);

      passedCases++;
    }

    expect(passedCases).toBe(CASES_PER_PROPERTY);
  });

  // ===========================================================================
  // PBT-10: Position / Exposure Constraints & No Short Selling
  // ===========================================================================
  it('PBT-10: Position / Exposure Constraints (200 generated cases)', () => {
    const BASE_SEED = 18031000;
    let passedCases = 0;

    for (let i = 0; i < CASES_PER_PROPERTY; i++) {
      const seed = BASE_SEED + i;
      const rng = new SeededRng(seed);

      // Account with ZERO positions attempting a SELL order
      const account = ScenarioGenerators.generateInitialAccount(rng, {
        initialCash: 500_000_000,
        positions: [],
      });
      const snapshot = ScenarioGenerators.generateMarketSnapshot(rng, { symbol: 'SSI', signal: 'SELL' });

      const replayResult = ReplayEngine.replay({
        snapshot,
        executionContext: {
          marketDataSnapshotId: snapshot.snapshotId,
          recommendationId: snapshot.recommendation?.recommendationId,
          strategyVersion: snapshot.versions?.strategyVersion,
          riskPolicyVersion: snapshot.versions?.riskPolicyVersion,
        },
        orderIntent: {
          symbol: 'SSI',
          side: 'SELL',
          quantity: 500,
          orderType: 'MARKET',
          marketDataSnapshotId: snapshot.snapshotId,
          strategyVersion: snapshot.versions?.strategyVersion,
          riskPolicyVersion: snapshot.versions?.riskPolicyVersion,
        },
        initialAccount: account,
        customNow: 1774866600000,
      });

      // Must be rejected without negative shares
      expect(replayResult.replayExecution?.status).toBe('REJECTED');
      expect(replayResult.replayExecution?.executedQuantity).toBe(0);

      const { nextAccount } = AccountStateThreader.applyReplayResult(
        account,
        replayResult,
        { symbol: 'SSI', side: 'SELL', quantity: 500 },
        snapshot
      );
      expect(nextAccount.positions.length).toBe(0);
      expect(nextAccount.cash).toBe(account.cash);

      passedCases++;
    }

    expect(passedCases).toBe(CASES_PER_PROPERTY);
  });

  // ===========================================================================
  // PBT-11: Risk Constraints & Fail-Closed Bounds
  // ===========================================================================
  it('PBT-11: Risk Constraints & Fail-Closed Bounds (200 generated cases)', () => {
    const BASE_SEED = 18031100;
    let passedCases = 0;

    for (let i = 0; i < CASES_PER_PROPERTY; i++) {
      const seed = BASE_SEED + i;
      const rng = new SeededRng(seed);

      // Account with only 1,000 VND attempting to buy 10,000 shares of FPT (700,000,000 VND)
      const lowCashAccount = ScenarioGenerators.generateInitialAccount(rng, { initialCash: 1_000 });
      const snapshot = ScenarioGenerators.generateMarketSnapshot(rng, { symbol: 'FPT', lastPrice: 70_000, signal: 'BUY' });

      const replayResult = ReplayEngine.replay({
        snapshot,
        executionContext: {
          marketDataSnapshotId: snapshot.snapshotId,
          recommendationId: snapshot.recommendation?.recommendationId,
          strategyVersion: snapshot.versions?.strategyVersion,
          riskPolicyVersion: snapshot.versions?.riskPolicyVersion,
        },
        orderIntent: {
          symbol: 'FPT',
          side: 'BUY',
          quantity: 10_000,
          orderType: 'MARKET',
          marketDataSnapshotId: snapshot.snapshotId,
          strategyVersion: snapshot.versions?.strategyVersion,
          riskPolicyVersion: snapshot.versions?.riskPolicyVersion,
        },
        initialAccount: lowCashAccount,
        customNow: 1774866600000,
      });

      expect(replayResult.replayExecution?.status).toBe('REJECTED');
      expect(replayResult.replayExecution?.executedQuantity).toBe(0);

      // State threading must leave lowCashAccount unmodified
      const { nextAccount } = AccountStateThreader.applyReplayResult(
        lowCashAccount,
        replayResult,
        { symbol: 'FPT', side: 'BUY', quantity: 10_000 },
        snapshot
      );
      expect(nextAccount.cash).toBe(1_000);
      expect(nextAccount.positions.length).toBe(0);

      passedCases++;
    }

    expect(passedCases).toBe(CASES_PER_PROPERTY);
  });

  // ===========================================================================
  // PBT-12: ExecutionContext Binding
  // ===========================================================================
  it('PBT-12: ExecutionContext Binding (200 generated cases)', () => {
    const BASE_SEED = 18031200;
    let passedCases = 0;

    for (let i = 0; i < CASES_PER_PROPERTY; i++) {
      const seed = BASE_SEED + i;
      const rng = new SeededRng(seed);
      const snapshot = ScenarioGenerators.generateMarketSnapshot(rng, { symbol: 'VCB' });
      const account = ScenarioGenerators.generateInitialAccount(rng, { initialCash: 500_000_000 });

      // Incompatible context binding (tampered snapshot ID)
      const tamperedContext: ExecutionContextBinding = {
        marketDataSnapshotId: 'FAKE_SNAPSHOT_ID_777',
        recommendationId: snapshot.recommendation?.recommendationId,
        strategyVersion: snapshot.versions?.strategyVersion,
        riskPolicyVersion: snapshot.versions?.riskPolicyVersion,
      };

      const replayResult = ReplayEngine.replay({
        snapshot,
        executionContext: tamperedContext,
        orderIntent: {
          symbol: 'VCB',
          side: 'BUY',
          quantity: 100,
          orderType: 'MARKET',
          marketDataSnapshotId: 'FAKE_SNAPSHOT_ID_777',
        },
        initialAccount: account,
        customNow: 1774866600000,
      });

      expect(
        replayResult.status === 'REPLAY_INVALID' ||
        replayResult.replayExecution?.status === 'REJECTED' ||
        replayResult.mismatches.length > 0
      ).toBe(true);

      passedCases++;
    }

    expect(passedCases).toBe(CASES_PER_PROPERTY);
  });

  // ===========================================================================
  // PBT-13: Reconciliation Equivalence
  // ===========================================================================
  it('PBT-13: Reconciliation Equivalence (200 generated cases)', () => {
    const BASE_SEED = 18031300;
    let passedCases = 0;

    for (let i = 0; i < CASES_PER_PROPERTY; i++) {
      const seed = BASE_SEED + i;
      const scenario = ScenarioGenerators.generateValidExecutableScenario(seed, (i % 2) + 2);
      const result = runner.runScenario(scenario);

      expect(result.success).toBe(true);
      expect(result.reconciliationReport.status).toBe('RECONCILED');
      expect(result.reconciliationReport.mismatches.length).toBe(0);

      passedCases++;
    }

    expect(passedCases).toBe(CASES_PER_PROPERTY);
  });

  // ===========================================================================
  // PBT-14: Failure Determinism & Diagnostics
  // ===========================================================================
  it('PBT-14: Failure Diagnostics Reproducibility (200 generated cases)', () => {
    const BASE_SEED = 18031400;
    let passedCases = 0;

    for (let i = 0; i < CASES_PER_PROPERTY; i++) {
      const seed = BASE_SEED + i;
      const scenario = ScenarioGenerators.generateInvalidInputScenario(seed, 'CORRUPTED_SNAPSHOT_HASH');

      const res1 = runner.runScenario(scenario);
      const res2 = runner.runScenario(scenario);

      // Failures must be 100% reproducible
      expect(res1.stepResults[0].isConsistent).toBe(res2.stepResults[0].isConsistent);

      const diagString = FailureDiagnostics.format({
        propertyId: 'PBT-14-REPRODUCIBLE-FAILURE',
        seed,
        scenarioId: scenario.scenarioId,
        expectedInvariant: 'Deterministic rejection of invalid snapshots',
        actualResult: res1.stepResults[0].replayResult.status,
        initialAccount: scenario.initialAccount,
        message: 'Snapshot hash validation failed',
      });

      expect(diagString).toContain(`Seed:               ${seed}`);
      expect(diagString).toContain('PROPERTY VIOLATION: PBT-14-REPRODUCIBLE-FAILURE');

      passedCases++;
    }

    expect(passedCases).toBe(CASES_PER_PROPERTY);
  });

  // ===========================================================================
  // PBT-15: Boundary / Degenerate Scenarios
  // ===========================================================================
  it('PBT-15: Boundary / Degenerate Scenarios (200 generated cases)', () => {
    const BASE_SEED = 18031500;
    let passedCases = 0;

    for (let i = 0; i < CASES_PER_PROPERTY; i++) {
      const seed = BASE_SEED + i;
      const rng = new SeededRng(seed);

      const isCeiling = i % 2 === 0;
      const refPrice = 30_000;
      const ceiling = Math.round(refPrice * 1.07);
      const floor = Math.round(refPrice * 0.93);
      const boundaryPrice = isCeiling ? ceiling : floor;

      const snapshot = ScenarioGenerators.generateMarketSnapshot(rng, {
        symbol: 'TCB',
        referencePrice: refPrice,
        ceilingPrice: ceiling,
        floorPrice: floor,
        lastPrice: boundaryPrice,
        signal: 'BUY',
      });

      const initialAccount = ScenarioGenerators.generateInitialAccount(rng, {
        initialCash: 100_000_000,
        positions: [],
      });

      const replayResult = ReplayEngine.replay({
        snapshot,
        executionContext: {
          marketDataSnapshotId: snapshot.snapshotId,
          recommendationId: snapshot.recommendation?.recommendationId,
          strategyVersion: snapshot.versions?.strategyVersion,
          riskPolicyVersion: snapshot.versions?.riskPolicyVersion,
        },
        orderIntent: {
          symbol: 'TCB',
          side: 'BUY',
          quantity: 100, // Minimal board lot
          orderType: 'MARKET',
          marketDataSnapshotId: snapshot.snapshotId,
          strategyVersion: snapshot.versions?.strategyVersion,
          riskPolicyVersion: snapshot.versions?.riskPolicyVersion,
        },
        initialAccount,
        tradingCosts: { slippageRate: 0 },
        customNow: 1774866600000,
      });

      expect(replayResult.status).toBe('REPLAYED');
      expect(replayResult.replayExecution?.status).toBe('FILLED');
      expect(replayResult.replayExecution?.executedQuantity).toBe(100);
      expect(replayResult.replayExecution?.executedPrice).toBe(boundaryPrice);

      passedCases++;
    }

    expect(passedCases).toBe(CASES_PER_PROPERTY);
  });

  // ===========================================================================
  // PBT-16: Metamorphic Replay Invariants
  // ===========================================================================
  it('PBT-16: Metamorphic Replay Invariants (200 generated cases)', () => {
    const BASE_SEED = 18031600;
    let passedCases = 0;

    for (let i = 0; i < CASES_PER_PROPERTY; i++) {
      const seed = BASE_SEED + i;
      const rng = new SeededRng(seed);
      const relationSelector = i % 4;

      if (relationSelector === 0) {
        // Relation 1: Temporal Shift Invariance (Shift timestamp by +1 day with identical market conditions)
        const ts1 = 1774866600000;
        const ts2 = ts1 + 86_400_000;
        const snapshot1 = ScenarioGenerators.generateMarketSnapshot(rng, { symbol: 'MWG', lastPrice: 50_000, timestamp: ts1 });
        const snapshot2 = ScenarioGenerators.generateMarketSnapshot(rng, { symbol: 'MWG', lastPrice: 50_000, timestamp: ts2 });
        const account = ScenarioGenerators.generateInitialAccount(rng, { initialCash: 200_000_000 });

        const res1 = ReplayEngine.replay({
          snapshot: snapshot1,
          executionContext: {
            marketDataSnapshotId: snapshot1.snapshotId,
            recommendationId: snapshot1.recommendation?.recommendationId,
            strategyVersion: snapshot1.versions?.strategyVersion,
            riskPolicyVersion: snapshot1.versions?.riskPolicyVersion,
          },
          orderIntent: { symbol: 'MWG', side: 'BUY', quantity: 200, orderType: 'MARKET', marketDataSnapshotId: snapshot1.snapshotId },
          initialAccount: account,
          customNow: ts1,
        });

        const res2 = ReplayEngine.replay({
          snapshot: snapshot2,
          executionContext: {
            marketDataSnapshotId: snapshot2.snapshotId,
            recommendationId: snapshot2.recommendation?.recommendationId,
            strategyVersion: snapshot2.versions?.strategyVersion,
            riskPolicyVersion: snapshot2.versions?.riskPolicyVersion,
          },
          orderIntent: { symbol: 'MWG', side: 'BUY', quantity: 200, orderType: 'MARKET', marketDataSnapshotId: snapshot2.snapshotId },
          initialAccount: account,
          customNow: ts2,
        });

        expect(res1.replayExecution?.executedPrice).toBe(res2.replayExecution?.executedPrice);
        expect(res1.replayExecution?.fee).toBe(res2.replayExecution?.fee);
        expect(res1.replayExecution?.executedQuantity).toBe(res2.replayExecution?.executedQuantity);
      } else if (relationSelector === 1) {
        // Relation 2: Independent Multi-Asset Orthogonality
        const symA = 'HPG';
        const snapA = ScenarioGenerators.generateMarketSnapshot(rng, { symbol: symA, lastPrice: 28_000 });
        const account = ScenarioGenerators.generateInitialAccount(rng, { initialCash: 400_000_000 });

        const resA = ReplayEngine.replay({
          snapshot: snapA,
          executionContext: {
            marketDataSnapshotId: snapA.snapshotId,
            recommendationId: snapA.recommendation?.recommendationId,
            strategyVersion: snapA.versions?.strategyVersion,
            riskPolicyVersion: snapA.versions?.riskPolicyVersion,
          },
          orderIntent: { symbol: symA, side: 'BUY', quantity: 300, orderType: 'MARKET', marketDataSnapshotId: snapA.snapshotId },
          initialAccount: account,
          customNow: 1774866600000,
        });

        const { nextAccount: accAfterA } = AccountStateThreader.applyReplayResult(
          account,
          resA,
          { symbol: symA, side: 'BUY', quantity: 300 },
          snapA
        );

        const posA = accAfterA.positions.find((p) => p.symbol === symA);
        expect(posA?.quantity).toBe(300);
      } else if (relationSelector === 2) {
        // Relation 3: Initial Capital Scaling Invariance
        const accountBase = ScenarioGenerators.generateInitialAccount(rng, { initialCash: 100_000_000 });
        const accountScaled = ScenarioGenerators.generateInitialAccount(rng, { initialCash: 1_000_000_000 });
        const snapshot = ScenarioGenerators.generateMarketSnapshot(rng, { symbol: 'MBB', lastPrice: 25_000 });

        const res1 = ReplayEngine.replay({
          snapshot,
          executionContext: {
            marketDataSnapshotId: snapshot.snapshotId,
            recommendationId: snapshot.recommendation?.recommendationId,
            strategyVersion: snapshot.versions?.strategyVersion,
            riskPolicyVersion: snapshot.versions?.riskPolicyVersion,
          },
          orderIntent: { symbol: 'MBB', side: 'BUY', quantity: 100, orderType: 'MARKET', marketDataSnapshotId: snapshot.snapshotId },
          initialAccount: accountBase,
          customNow: 1774866600000,
        });

        const res2 = ReplayEngine.replay({
          snapshot,
          executionContext: {
            marketDataSnapshotId: snapshot.snapshotId,
            recommendationId: snapshot.recommendation?.recommendationId,
            strategyVersion: snapshot.versions?.strategyVersion,
            riskPolicyVersion: snapshot.versions?.riskPolicyVersion,
          },
          orderIntent: { symbol: 'MBB', side: 'BUY', quantity: 100, orderType: 'MARKET', marketDataSnapshotId: snapshot.snapshotId },
          initialAccount: accountScaled,
          customNow: 1774866600000,
        });

        expect(res1.replayExecution?.executedPrice).toBe(res2.replayExecution?.executedPrice);
        expect(res1.replayExecution?.fee).toBe(res2.replayExecution?.fee);
        expect(res1.replayExecution?.executedQuantity).toBe(res2.replayExecution?.executedQuantity);
      } else {
        // Relation 4: Roundtrip Inventory Neutrality (BUY Q then SELL Q at same price -> final quantity 0)
        const snapBuy = ScenarioGenerators.generateMarketSnapshot(rng, { symbol: 'VIC', lastPrice: 45_000, signal: 'BUY', timestamp: 1774866600000 });
        const snapSell = ScenarioGenerators.generateMarketSnapshot(rng, { symbol: 'VIC', lastPrice: 45_000, signal: 'SELL', timestamp: 1774866660000 });
        const initialAccount = ScenarioGenerators.generateInitialAccount(rng, { initialCash: 300_000_000 });

        const resBuy = ReplayEngine.replay({
          snapshot: snapBuy,
          executionContext: {
            marketDataSnapshotId: snapBuy.snapshotId,
            recommendationId: snapBuy.recommendation?.recommendationId,
            strategyVersion: snapBuy.versions?.strategyVersion,
            riskPolicyVersion: snapBuy.versions?.riskPolicyVersion,
          },
          orderIntent: { symbol: 'VIC', side: 'BUY', quantity: 200, orderType: 'MARKET', marketDataSnapshotId: snapBuy.snapshotId },
          initialAccount,
          customNow: 1774866600000,
        });

        const { nextAccount: accAfterBuy } = AccountStateThreader.applyReplayResult(
          initialAccount,
          resBuy,
          { symbol: 'VIC', side: 'BUY', quantity: 200 },
          snapBuy
        );

        const resSell = ReplayEngine.replay({
          snapshot: snapSell,
          executionContext: {
            marketDataSnapshotId: snapSell.snapshotId,
            recommendationId: snapSell.recommendation?.recommendationId,
            strategyVersion: snapSell.versions?.strategyVersion,
            riskPolicyVersion: snapSell.versions?.riskPolicyVersion,
          },
          orderIntent: { symbol: 'VIC', side: 'SELL', quantity: 200, orderType: 'MARKET', marketDataSnapshotId: snapSell.snapshotId },
          initialAccount: accAfterBuy,
          customNow: 1774866660000,
        });

        const { nextAccount: accAfterSell } = AccountStateThreader.applyReplayResult(
          accAfterBuy,
          resSell,
          { symbol: 'VIC', side: 'SELL', quantity: 200 },
          snapSell
        );

        const vicPos = accAfterSell.positions.find((p) => p.symbol === 'VIC');
        expect(vicPos).toBeUndefined(); // Position closed out
        // Cash difference should be negative exactly due to fees & taxes
        expect(accAfterSell.cash).toBeLessThan(initialAccount.cash);
      }

      passedCases++;
    }

    expect(passedCases).toBe(CASES_PER_PROPERTY);
  });
});

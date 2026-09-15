/**
 * PHASE 18.3 — SHARED DETERMINISTIC TEST HARNESS VERIFICATION
 * ==========================================================
 * Focused test suite validating the test-only property-based testing harness:
 *   1. SeededRng Determinism & Reproducibility
 *   2. Scenario Generators & 3-Tier Classification
 *   3. Account State Threading & Financial Conservation
 *   4. Sequential Single-Event Chaining (ReplayEngine + PaperReconciliationEngine)
 *   5. Failure Diagnostics Formatting
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

describe('Phase 18.3 Shared Deterministic Test Harness', () => {
  // ===========================================================================
  // 1. SeededRng Determinism & Reproducibility
  // ===========================================================================
  describe('1. SeededRng Determinism & Reproducibility', () => {
    it('generates identical sequence from the same initial seed', () => {
      const rng1 = new SeededRng(12345);
      const rng2 = new SeededRng(12345);

      const seq1 = Array.from({ length: 100 }, () => rng1.nextFloat());
      const seq2 = Array.from({ length: 100 }, () => rng2.nextFloat());

      expect(seq1).toEqual(seq2);
    });

    it('generates distinct sequences from different seeds', () => {
      const rng1 = new SeededRng(1001);
      const rng2 = new SeededRng(2002);

      const seq1 = Array.from({ length: 50 }, () => rng1.nextInt(1, 1000));
      const seq2 = Array.from({ length: 50 }, () => rng2.nextInt(1, 1000));

      expect(seq1).not.toEqual(seq2);
    });

    it('resets back to initial state perfectly', () => {
      const rng = new SeededRng(999);
      const initialSeq = Array.from({ length: 20 }, () => rng.nextUint32());

      rng.reset();
      const resetSeq = Array.from({ length: 20 }, () => rng.nextUint32());

      expect(resetSeq).toEqual(initialSeq);
    });

    it('forks independent child RNGs deterministically', () => {
      const parent1 = new SeededRng(777);
      const parent2 = new SeededRng(777);

      const child1 = parent1.fork();
      const child2 = parent2.fork();

      const childSeq1 = Array.from({ length: 30 }, () => child1.nextFloat());
      const childSeq2 = Array.from({ length: 30 }, () => child2.nextFloat());

      expect(childSeq1).toEqual(childSeq2);
    });

    it('correctly bounds integers and floating point values', () => {
      const rng = new SeededRng(42);
      for (let i = 0; i < 500; i++) {
        const floatVal = rng.nextFloat();
        expect(floatVal).toBeGreaterThanOrEqual(0);
        expect(floatVal).toBeLessThan(1);

        const intVal = rng.nextInt(10, 50);
        expect(intVal).toBeGreaterThanOrEqual(10);
        expect(intVal).toBeLessThanOrEqual(50);
        expect(Number.isInteger(intVal)).toBe(true);
      }
    });

    it('samples, picks, and shuffles deterministically', () => {
      const rng1 = new SeededRng(555);
      const rng2 = new SeededRng(555);

      const items = ['HPG', 'SSI', 'VNM', 'FPT', 'VCB'];

      expect(rng1.pick(items)).toBe(rng2.pick(items));
      expect(rng1.sample(items, 3)).toEqual(rng2.sample(items, 3));
      expect(rng1.shuffle(items)).toEqual(rng2.shuffle(items));
    });
  });

  // ===========================================================================
  // 2. Scenario Generators & 3-Tier Classification
  // ===========================================================================
  describe('2. Scenario Generators & Classification', () => {
    it('generates valid executable scenario with correct structures', () => {
      const scenario = ScenarioGenerators.generateValidExecutableScenario(101, 3, 'HPG');

      expect(scenario.seed).toBe(101);
      expect(scenario.events.length).toBe(3);
      expect(scenario.initialAccount.cash).toBe(500_000_000);
      expect(scenario.events.every((e) => e.classification === 'VALID_EXECUTABLE')).toBe(true);
      expect(scenario.events.every((e) => e.orderIntent.quantity % 100 === 0)).toBe(true);
    });

    it('generates valid non-executable scenarios (insufficient cash and position)', () => {
      const cashScenario = ScenarioGenerators.generateValidNonExecutableScenario(202, 'INSUFFICIENT_CASH');
      expect(cashScenario.events[0].classification).toBe('VALID_NON_EXECUTABLE');
      expect(cashScenario.events[0].subCategory).toBe('INSUFFICIENT_CASH');
      expect(cashScenario.initialAccount.cash).toBe(10_000);

      const posScenario = ScenarioGenerators.generateValidNonExecutableScenario(203, 'INSUFFICIENT_POSITION');
      expect(posScenario.events[0].classification).toBe('VALID_NON_EXECUTABLE');
      expect(posScenario.events[0].subCategory).toBe('INSUFFICIENT_POSITION');
      expect(posScenario.initialAccount.positions.length).toBe(0);
    });

    it('generates invalid input scenarios (non-board lot and tampered snapshot)', () => {
      const oddLotScenario = ScenarioGenerators.generateInvalidInputScenario(301, 'NON_BOARD_LOT');
      expect(oddLotScenario.events[0].classification).toBe('INVALID_INPUT');
      expect(oddLotScenario.events[0].orderIntent.quantity % 100).not.toBe(0);

      const tamperedScenario = ScenarioGenerators.generateInvalidInputScenario(302, 'CORRUPTED_SNAPSHOT_HASH');
      expect(tamperedScenario.events[0].classification).toBe('INVALID_INPUT');
      expect(tamperedScenario.events[0].snapshot.quote.last).toBe(999_999);
    });
  });

  // ===========================================================================
  // 3. Account State Threading & Financial Conservation
  // ===========================================================================
  describe('3. Account State Threading', () => {
    it('threads BUY execution state correctly with fee inclusion in averageCost', () => {
      const rng = new SeededRng(401);
      const snapshot = ScenarioGenerators.generateMarketSnapshot(rng, {
        symbol: 'HPG',
        lastPrice: 28_000,
      });

      const initialAccount = ScenarioGenerators.generateInitialAccount(rng, {
        initialCash: 100_000_000,
        positions: [],
      });

      const { orderIntent, executionContext } = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 1_000,
        orderType: 'MARKET',
      });

      const replayResult = ReplayEngine.replay({
        snapshot,
        executionContext,
        orderIntent,
        initialAccount,
      });

      expect(replayResult.status).toBe('REPLAYED');
      expect(replayResult.replayExecution?.status).toBe('FILLED');

      const { nextAccount, auditEntry } = AccountStateThreader.applyReplayResult(
        initialAccount,
        replayResult,
        orderIntent,
        snapshot,
        0
      );

      const executedPrice = replayResult.replayExecution!.executedPrice!;
      const fee = replayResult.replayExecution!.fee;
      const grossValue = 1_000 * executedPrice;
      const expectedCash = 100_000_000 - (grossValue + fee);

      expect(nextAccount.cash).toBeCloseTo(expectedCash, 1);
      expect(nextAccount.positions.length).toBe(1);
      expect(nextAccount.positions[0].symbol).toBe('HPG');
      expect(nextAccount.positions[0].quantity).toBe(1_000);
      expect(nextAccount.positions[0].averageCost).toBeCloseTo((grossValue + fee) / 1_000, 2);
      expect(auditEntry).toBeDefined();
      expect(auditEntry?.cashAfter).toBeCloseTo(expectedCash, 1);
    });

    it('threads SELL execution state correctly with realized PnL calculation', () => {
      const rng = new SeededRng(402);
      const snapshot = ScenarioGenerators.generateMarketSnapshot(rng, {
        symbol: 'HPG',
        lastPrice: 30_000,
        signal: 'SELL',
      });

      const initialAccount = ScenarioGenerators.generateInitialAccount(rng, {
        initialCash: 50_000_000,
        positions: [{ symbol: 'HPG', quantity: 1_000, averageCost: 28_000, currentPrice: 30_000 }],
      });

      const { orderIntent, executionContext } = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'SELL',
        quantity: 1_000,
        orderType: 'MARKET',
      });

      const replayResult = ReplayEngine.replay({
        snapshot,
        executionContext,
        orderIntent,
        initialAccount,
      });

      expect(replayResult.status).toBe('REPLAYED');
      expect(replayResult.replayExecution?.status).toBe('FILLED');

      const { nextAccount } = AccountStateThreader.applyReplayResult(
        initialAccount,
        replayResult,
        orderIntent,
        snapshot,
        0
      );

      const executedPrice = replayResult.replayExecution!.executedPrice!;
      const fee = replayResult.replayExecution!.fee;
      const tax = replayResult.replayExecution!.tax;
      const grossValue = 1_000 * executedPrice;
      const netProceeds = grossValue - fee - tax;
      const expectedCash = 50_000_000 + netProceeds;
      const expectedRealizedPnL = netProceeds - (1_000 * 28_000);

      expect(nextAccount.cash).toBeCloseTo(expectedCash, 1);
      expect(nextAccount.positions.length).toBe(0); // Position fully closed
      expect(nextAccount.realizedPnL).toBeCloseTo(expectedRealizedPnL, 1);
    });

    it('does not mutate account state when an execution is rejected', () => {
      const rng = new SeededRng(403);
      const snapshot = ScenarioGenerators.generateMarketSnapshot(rng, { symbol: 'HPG', lastPrice: 28_000 });
      const initialAccount = ScenarioGenerators.generateInitialAccount(rng, { initialCash: 1_000 }); // Insufficient cash

      const { orderIntent, executionContext } = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 1_000,
        orderType: 'MARKET',
      });

      const replayResult = ReplayEngine.replay({
        snapshot,
        executionContext,
        orderIntent,
        initialAccount,
      });

      expect(replayResult.replayExecution?.status).toBe('REJECTED');

      const { nextAccount } = AccountStateThreader.applyReplayResult(
        initialAccount,
        replayResult,
        orderIntent,
        snapshot,
        0
      );

      expect(nextAccount.cash).toBe(initialAccount.cash);
      expect(nextAccount.positions).toEqual(initialAccount.positions);
      expect(nextAccount.equity).toBe(initialAccount.equity);
    });
  });

  // ===========================================================================
  // 4. Sequential Single-Event Chaining & Reconciliation
  // ===========================================================================
  describe('4. Sequential Single-Event Chaining & Reconciliation', () => {
    it('executes a 3-step valid scenario and passes PaperReconciliationEngine audit', () => {
      const runner = new ScenarioRunner();
      const scenario = ScenarioGenerators.generateValidExecutableScenario(501, 3, 'HPG');

      const result = runner.runScenario(scenario);

      expect(result.success).toBe(true);
      expect(result.executionErrors.length).toBe(0);
      expect(result.stepResults.length).toBe(3);
      expect(result.reconciliationReport.status).toBe('RECONCILED');
      expect(result.reconciliationReport.mismatches.length).toBe(0);
    });

    it('executes a non-executable scenario without crashing and maintains reconciliation', () => {
      const runner = new ScenarioRunner();
      const scenario = ScenarioGenerators.generateValidNonExecutableScenario(502, 'INSUFFICIENT_CASH');

      const result = runner.runScenario(scenario);

      expect(result.success).toBe(true);
      expect(result.stepResults[0].replayResult.replayExecution?.status).toBe('REJECTED');
      expect(result.reconciliationReport.status).toBe('RECONCILED');
    });

    it('properly detects invalid input steps and flags them accordingly', () => {
      const runner = new ScenarioRunner();
      const scenario = ScenarioGenerators.generateInvalidInputScenario(503, 'CORRUPTED_SNAPSHOT_HASH');

      const result = runner.runScenario(scenario);

      expect(result.stepResults[0].replayResult.status).toBe('REPLAY_INVALID');
      expect(result.stepResults[0].isConsistent).toBe(true);
      expect(result.reconciliationReport.status).toBe('RECONCILED');
    });
  });

  // ===========================================================================
  // 5. Failure Diagnostics
  // ===========================================================================
  describe('5. Failure Diagnostics Formatting', () => {
    it('formats a structured diagnostic error message containing seed and property ID', () => {
      const rng = new SeededRng(601);
      const initialAccount = ScenarioGenerators.generateInitialAccount(rng, { initialCash: 100_000_000 });

      const diagString = FailureDiagnostics.format({
        propertyId: 'PBT-04-NO-NEGATIVE-CASH',
        seed: 601,
        scenarioId: 'SCENARIO_TEST_601',
        stepIndex: 2,
        expectedInvariant: 'Cash balance must be >= 0',
        actualResult: -15_000_000,
        initialAccount,
        message: 'Account cash became negative after step 2',
      });

      expect(diagString).toContain('PROPERTY VIOLATION: PBT-04-NO-NEGATIVE-CASH');
      expect(diagString).toContain('Seed:               601');
      expect(diagString).toContain('Scenario ID:        SCENARIO_TEST_601');
      expect(diagString).toContain('Step Index:         2');
      expect(diagString).toContain('Expected Invariant: Cash balance must be >= 0');
      expect(diagString).toContain('INITIAL ACCOUNT STATE:');
    });
  });
});

import { describe, it, expect } from 'vitest';
import { MarketSnapshotBuilder } from '../../snapshot/MarketSnapshotBuilder.ts';
import { computeSnapshotHash, computeSnapshotId } from '../../snapshot/snapshotHash.ts';
import type { MarketSnapshotInput } from '../../snapshot/types.ts';
import { PaperExecutionEngine } from '../../paper/PaperExecutionEngine.ts';
import { PaperBroker } from '../../paper/PaperBroker.ts';
import { PaperTradeLedger } from '../../paper/PaperTradeLedger.ts';
import type { BrokerAccount } from '../../execution/BrokerAdapter.ts';
import type { InvestmentRecommendation } from '../../../../types/recommendation.ts';
import { ReplayEngine } from '../ReplayEngine.ts';
import { ReplayValidator } from '../ReplayValidator.ts';
import { ReplayResultFactory } from '../ReplayResult.ts';
import type { OrderIntent, ExecutionContextBinding, ReplayExecutionSummary } from '../types.ts';

describe('PHASE 18.3.4 — FAULT INJECTION & DETERMINISTIC REPLAY VERIFICATION', () => {
  const baseInput: MarketSnapshotInput = {
    capturedAt: '2026-03-30T10:30:00.000Z',
    source: {
      provider: 'SSI',
      feed: 'REALTIME_STREAM',
    },
    market: {
      exchange: 'HOSE',
      tradingDate: '2026-03-30',
      session: 'CONTINUOUS',
      isOpen: true,
    },
    instrument: {
      symbol: 'HPG',
      name: 'Tập đoàn Hòa Phát',
    },
    quote: {
      last: 28500,
      open: 28000,
      high: 28900,
      low: 27900,
      close: 28500,
      volume: 12500000,
      reference: 28200,
      ceiling: 30150,
      floor: 26250,
      timestamp: '2026-03-30T10:30:00.000Z',
    },
    recommendation: {
      recommendationId: 'REC-HPG-20260330-01',
      strategyVersion: 'v2.1.0',
      signal: 'BUY',
      horizon: 'SHORT_TERM',
      confidence: 85,
    },
    integrity: {
      dataFreshnessMs: 1500,
      validationStatus: 'VALID',
      warnings: [],
    },
    versions: {
      snapshotSchemaVersion: '1.0.0',
      strategyVersion: 'v2.1.0',
      riskPolicyVersion: 'v1.4.0',
    },
  };

  const createAccount = (cash = 500_000_000): BrokerAccount => ({
    accountId: 'ACC_FAULT_TEST_01',
    currency: 'VND',
    cash,
    reservedCash: 0,
    availableCash: cash,
    marketValue: 0,
    equity: cash,
    realizedPnL: 0,
    unrealizedPnL: 0,
    positions: [],
    openOrders: [],
    updatedAt: '2026-03-30T10:00:00.000Z',
  });

  // =========================================================================
  // GROUP A — SNAPSHOT INTEGRITY FAULT INJECTION (A1 - A5)
  // =========================================================================
  describe('Group A: Snapshot Integrity Fault Injection', () => {
    it('A1. Snapshot price mutation: rejects altered quote price with SNAPSHOT_HASH_INVALID', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 1000,
      });

      // Tamper quote price to 35,000 while retaining original hash
      const tamperedSnapshot = {
        ...snapshot,
        quote: {
          ...snapshot.quote,
          last: 35000,
        },
      };

      const replayResult = ReplayEngine.replay({
        snapshot: tamperedSnapshot as any,
        executionContext: binding.executionContext,
        orderIntent: binding.orderIntent,
      });

      expect(replayResult.status).toBe('REPLAY_INVALID');
      expect(replayResult.mismatches.some(m => m.code === 'SNAPSHOT_HASH_INVALID')).toBe(true);
      expect(replayResult.replayExecution).toBeUndefined();
    });

    it('A2. Snapshot quantity/volume mutation: rejects altered quote volume with SNAPSHOT_HASH_INVALID', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 1000,
      });

      // Tamper quote volume to 99,999,999 while retaining original hash
      const tamperedSnapshot = {
        ...snapshot,
        quote: {
          ...snapshot.quote,
          volume: 99_999_999,
        },
      };

      const replayResult = ReplayEngine.replay({
        snapshot: tamperedSnapshot as any,
        executionContext: binding.executionContext,
        orderIntent: binding.orderIntent,
      });

      expect(replayResult.status).toBe('REPLAY_INVALID');
      expect(replayResult.mismatches.some(m => m.code === 'SNAPSHOT_HASH_INVALID')).toBe(true);
      expect(replayResult.replayExecution).toBeUndefined();
    });

    it('A3. Timestamp mutation: rejects altered quote timestamp with SNAPSHOT_HASH_INVALID', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 1000,
      });

      // Tamper quote timestamp while retaining original hash
      const tamperedSnapshot = {
        ...snapshot,
        quote: {
          ...snapshot.quote,
          timestamp: '2026-04-01T10:30:00.000Z',
        },
      };

      const replayResult = ReplayEngine.replay({
        snapshot: tamperedSnapshot as any,
        executionContext: binding.executionContext,
        orderIntent: binding.orderIntent,
      });

      expect(replayResult.status).toBe('REPLAY_INVALID');
      expect(replayResult.mismatches.some(m => m.code === 'SNAPSHOT_HASH_INVALID')).toBe(true);
      expect(replayResult.replayExecution).toBeUndefined();
    });

    it('A4. Hash forgery: rejects forged or non-canonical hash computation', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 1000,
      });

      // Inject an arbitrary forged hash string
      const tamperedSnapshot = {
        ...snapshot,
        hash: 'forged_deadbeef_sha256_0123456789abcdef0123456789abcdef',
      };

      const replayResult = ReplayEngine.replay({
        snapshot: tamperedSnapshot as any,
        executionContext: binding.executionContext,
        orderIntent: binding.orderIntent,
      });

      expect(replayResult.status).toBe('REPLAY_INVALID');
      expect(replayResult.mismatches.some(m => m.code === 'SNAPSHOT_HASH_INVALID')).toBe(true);
      expect(replayResult.replayExecution).toBeUndefined();
    });

    it('A5. Snapshot ID mismatch: rejects altered snapshotId despite valid payload structure', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 1000,
      });

      // Tamper snapshotId to an arbitrary identifier
      const tamperedSnapshot = {
        ...snapshot,
        snapshotId: 'SNAP_FORGED_DIFFERENT_ID_9999',
      };

      const replayResult = ReplayEngine.replay({
        snapshot: tamperedSnapshot as any,
        executionContext: binding.executionContext,
        orderIntent: binding.orderIntent,
      });

      expect(replayResult.status).toBe('REPLAY_INVALID');
      expect(replayResult.mismatches.some(m => m.code === 'SNAPSHOT_ID_MISMATCH')).toBe(true);
      expect(replayResult.replayExecution).toBeUndefined();
    });
  });

  // =========================================================================
  // GROUP B — SNAPSHOT-INTENT BINDING FAULT INJECTION (B1 - B6)
  // =========================================================================
  describe('Group B: Snapshot-Intent Binding Fault Injection', () => {
    it('B1. Wrong snapshot ID: rejects OrderIntent or Context bound to another snapshot', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 1000,
      });

      const replayResult = ReplayEngine.replay({
        snapshot,
        executionContext: {
          ...binding.executionContext,
          marketDataSnapshotId: 'SNAP_DIFFERENT_SNAPSHOT_ID_XYZ',
        },
        orderIntent: binding.orderIntent,
      });

      expect(replayResult.status).toBe('REPLAY_INVALID');
      expect(replayResult.mismatches.some(m => m.code === 'ORDER_SNAPSHOT_MISMATCH')).toBe(true);
    });

    it('B2. Wrong symbol: rejects OrderIntent symbol mismatching snapshot instrument', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput); // Symbol: HPG
      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'FPT', // Mismatched ticker
        side: 'BUY',
        quantity: 1000,
      });

      const replayResult = ReplayEngine.replay({
        snapshot,
        executionContext: binding.executionContext,
        orderIntent: binding.orderIntent,
      });

      expect(replayResult.status).toBe('REPLAY_INVALID');
      expect(replayResult.mismatches.some(m => m.field === 'orderIntent.symbol')).toBe(true);
    });

    it('B3. Wrong recommendation ID: rejects mismatched recommendation identifier', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 1000,
      });

      const replayResult = ReplayEngine.replay({
        snapshot,
        executionContext: {
          ...binding.executionContext,
          recommendationId: 'REC-MISMATCHED-OTHER-SYMBOL',
        },
        orderIntent: binding.orderIntent,
      });

      expect(replayResult.status).toBe('REPLAY_INVALID');
      expect(replayResult.mismatches.some(m => m.code === 'RECOMMENDATION_MISMATCH')).toBe(true);
    });

    it('B4. Strategy version mismatch: rejects mismatched strategy version', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput); // Snapshot has strategyVersion: 'v2.1.0'
      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 1000,
      });

      const replayResult = ReplayEngine.replay({
        snapshot,
        executionContext: {
          ...binding.executionContext,
          strategyVersion: 'v1.0.0_OBSOLETE',
        },
        orderIntent: binding.orderIntent,
      });

      expect(replayResult.status).toBe('REPLAY_INVALID');
      expect(replayResult.mismatches.some(m => m.code === 'STRATEGY_VERSION_MISMATCH')).toBe(true);
    });

    it('B5. Risk policy version mismatch: rejects mismatched risk policy version', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput); // Snapshot has riskPolicyVersion: 'v1.4.0'
      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 1000,
      });

      const replayResult = ReplayEngine.replay({
        snapshot,
        executionContext: {
          ...binding.executionContext,
          riskPolicyVersion: 'v3.0.0_EXPERIMENTAL',
        },
        orderIntent: binding.orderIntent,
      });

      expect(replayResult.status).toBe('REPLAY_INVALID');
      expect(replayResult.mismatches.some(m => m.code === 'RISK_POLICY_VERSION_MISMATCH')).toBe(true);
    });

    it('B6. Missing binding fields: fails closed without guessing defaults', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);

      // B6.1: Missing marketDataSnapshotId in executionContext
      const resMissingSnapshotId = ReplayEngine.replay({
        snapshot,
        executionContext: { marketDataSnapshotId: '' },
        orderIntent: { symbol: 'HPG', side: 'BUY', quantity: 1000 },
      });
      expect(resMissingSnapshotId.status).toBe('REPLAY_INVALID');
      expect(resMissingSnapshotId.mismatches.some(m => m.field === 'executionContext.marketDataSnapshotId')).toBe(true);

      // B6.2: Missing strategyVersion in executionContext when snapshot requires it
      const resMissingStrategyVersion = ReplayEngine.replay({
        snapshot,
        executionContext: {
          marketDataSnapshotId: snapshot.snapshotId,
          strategyVersion: undefined,
        },
        orderIntent: { symbol: 'HPG', side: 'BUY', quantity: 1000 },
      });
      expect(resMissingStrategyVersion.status).toBe('REPLAY_INVALID');
      expect(resMissingStrategyVersion.mismatches.some(m => m.code === 'STRATEGY_VERSION_MISMATCH')).toBe(true);

      // B6.3: Missing riskPolicyVersion in executionContext when snapshot requires it
      const resMissingRiskPolicy = ReplayEngine.replay({
        snapshot,
        executionContext: {
          marketDataSnapshotId: snapshot.snapshotId,
          strategyVersion: 'v2.1.0',
          riskPolicyVersion: undefined,
        },
        orderIntent: { symbol: 'HPG', side: 'BUY', quantity: 1000 },
      });
      expect(resMissingRiskPolicy.status).toBe('REPLAY_INVALID');
      expect(resMissingRiskPolicy.mismatches.some(m => m.code === 'RISK_POLICY_VERSION_MISMATCH')).toBe(true);

      // B6.4: Missing recommendationId in executionContext when snapshot specifies it
      const resMissingRecId = ReplayEngine.replay({
        snapshot,
        executionContext: {
          marketDataSnapshotId: snapshot.snapshotId,
          strategyVersion: 'v2.1.0',
          riskPolicyVersion: 'v1.4.0',
          recommendationId: undefined,
        },
        orderIntent: { symbol: 'HPG', side: 'BUY', quantity: 1000 },
      });
      expect(resMissingRecId.status).toBe('REPLAY_INVALID');
      expect(resMissingRecId.mismatches.some(m => m.code === 'RECOMMENDATION_MISMATCH')).toBe(true);

      // B6.5: Missing symbol in orderIntent
      const resMissingSymbol = ReplayEngine.replay({
        snapshot,
        executionContext: {
          marketDataSnapshotId: snapshot.snapshotId,
          strategyVersion: 'v2.1.0',
          riskPolicyVersion: 'v1.4.0',
        },
        orderIntent: { symbol: '', side: 'BUY', quantity: 1000 },
      });
      expect(resMissingSymbol.status).toBe('REPLAY_INVALID');
      expect(resMissingSymbol.mismatches.some(m => m.field === 'orderIntent.symbol')).toBe(true);
    });
  });

  // =========================================================================
  // GROUP C — EXECUTION RESULT TAMPERING & DIVERGENCE (C1 - C7)
  // =========================================================================
  describe('Group C: Execution Result Tampering & Divergence Detection', () => {
    const createBaseReplaySummary = (): ReplayExecutionSummary => ({
      orderId: 'ORD_ORIG_001',
      status: 'FILLED',
      side: 'BUY',
      symbol: 'HPG',
      requestedQuantity: 1000,
      executedQuantity: 1000,
      requestedPrice: 28500,
      executedPrice: 28500,
      fee: 42750,
      tax: 0,
      slippage: 0,
      code: 'EXECUTED',
      success: true,
      realizedPnL: 0,
    });

    it('C1. Price tampering: detects divergence in executed price', () => {
      const orig = createBaseReplaySummary();
      const tampered = { ...orig, executedPrice: 31000 };

      const mismatches = ReplayResultFactory.compareExecutions(orig, tampered);
      expect(mismatches.length).toBeGreaterThan(0);
      expect(mismatches.some(m => m.field === 'executedPrice')).toBe(true);

      const mismatchResult = ReplayResultFactory.mismatch('SNAP_TEST', orig, tampered, mismatches);
      expect(mismatchResult.status).toBe('REPLAY_MISMATCH');
    });

    it('C2. Quantity tampering: detects divergence in executed quantity', () => {
      const orig = createBaseReplaySummary();
      const tampered = { ...orig, executedQuantity: 800 };

      const mismatches = ReplayResultFactory.compareExecutions(orig, tampered);
      expect(mismatches.length).toBeGreaterThan(0);
      expect(mismatches.some(m => m.field === 'executedQuantity')).toBe(true);
    });

    it('C3. Fee tampering: detects divergence in brokerage fee', () => {
      const orig = createBaseReplaySummary();
      const tampered = { ...orig, fee: 99999 };

      const mismatches = ReplayResultFactory.compareExecutions(orig, tampered);
      expect(mismatches.length).toBeGreaterThan(0);
      expect(mismatches.some(m => m.field === 'fee')).toBe(true);
    });

    it('C4. Tax tampering: detects divergence in sales tax', () => {
      const orig = { ...createBaseReplaySummary(), side: 'SELL' as const, tax: 28500 };
      const tampered = { ...orig, tax: 50000 };

      const mismatches = ReplayResultFactory.compareExecutions(orig, tampered);
      expect(mismatches.length).toBeGreaterThan(0);
      expect(mismatches.some(m => m.field === 'tax')).toBe(true);
    });

    it('C5. Slippage tampering: detects divergence in execution slippage', () => {
      const orig = createBaseReplaySummary();
      const tampered = { ...orig, slippage: 150 };

      const mismatches = ReplayResultFactory.compareExecutions(orig, tampered);
      expect(mismatches.length).toBeGreaterThan(0);
      expect(mismatches.some(m => m.field === 'slippage')).toBe(true);
    });

    it('C6. Realized PnL tampering: detects divergence in realized PnL', () => {
      const orig = { ...createBaseReplaySummary(), side: 'SELL' as const, realizedPnL: 3500000 };
      const tampered = { ...orig, realizedPnL: 99000000 };

      const mismatches = ReplayResultFactory.compareExecutions(orig, tampered);
      expect(mismatches.length).toBeGreaterThan(0);
      expect(mismatches.some(m => m.field === 'realizedPnL')).toBe(true);
    });

    it('C7. Status tampering: detects divergence when status or success is flipped', () => {
      const orig = createBaseReplaySummary();
      const tampered = { ...orig, status: 'REJECTED' as const, success: false };

      const mismatches = ReplayResultFactory.compareExecutions(orig, tampered);
      expect(mismatches.length).toBeGreaterThan(0);
      expect(mismatches.some(m => m.field === 'status')).toBe(true);
      expect(mismatches.some(m => m.field === 'success')).toBe(true);
    });
  });

  // =========================================================================
  // GROUP D — DETERMINISM & NON-CONTAMINATION (D1 - D3)
  // =========================================================================
  describe('Group D: Determinism & Non-Contamination', () => {
    it('D1. Same input, same output: produces identical execution across 5 repeated runs', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 1000,
      });

      const runs = Array.from({ length: 5 }, () =>
        ReplayEngine.replay({
          snapshot,
          executionContext: binding.executionContext,
          orderIntent: binding.orderIntent,
          initialAccount: createAccount(300_000_000),
          tradingCosts: { slippageRate: 0 },
        })
      );

      const first = runs[0];
      expect(first.status).toBe('REPLAYED');
      expect(first.deterministic).toBe(true);
      expect(first.replayExecution?.executedQuantity).toBe(1000);
      expect(first.replayExecution?.executedPrice).toBe(28500);
      expect(first.replayExecution?.fee).toBe(42750); // 1000 * 28500 * 0.0015

      for (let i = 1; i < runs.length; i++) {
        const current = runs[i];
        expect(current.status).toBe(first.status);
        expect(current.deterministic).toBe(first.deterministic);
        expect(current.replayExecution?.executedQuantity).toBe(first.replayExecution?.executedQuantity);
        expect(current.replayExecution?.executedPrice).toBe(first.replayExecution?.executedPrice);
        expect(current.replayExecution?.fee).toBe(first.replayExecution?.fee);
        expect(current.replayExecution?.tax).toBe(first.replayExecution?.tax);
        expect(current.replayExecution?.slippage).toBe(first.replayExecution?.slippage);
        expect(current.replayExecution?.realizedPnL).toBe(first.replayExecution?.realizedPnL);
        expect(current.mismatches.length).toBe(0);
      }
    });

    it('D2. Different input, different output: parameter variations produce distinct outcomes', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);

      // Variation 1: Different quantities
      const binding1 = ReplayEngine.bindOrderIntent(snapshot, { symbol: 'HPG', side: 'BUY', quantity: 1000 });
      const binding2 = ReplayEngine.bindOrderIntent(snapshot, { symbol: 'HPG', side: 'BUY', quantity: 2000 });

      const res1 = ReplayEngine.replay({
        snapshot,
        executionContext: binding1.executionContext,
        orderIntent: binding1.orderIntent,
        initialAccount: createAccount(300_000_000),
        tradingCosts: { slippageRate: 0 },
      });

      const res2 = ReplayEngine.replay({
        snapshot,
        executionContext: binding2.executionContext,
        orderIntent: binding2.orderIntent,
        initialAccount: createAccount(300_000_000),
        tradingCosts: { slippageRate: 0 },
      });

      expect(res1.replayExecution?.executedQuantity).toBe(1000);
      expect(res2.replayExecution?.executedQuantity).toBe(2000);
      expect(res1.replayExecution?.fee).toBe(42750); // 1000 * 28500 * 0.0015
      expect(res2.replayExecution?.fee).toBe(85500); // 2000 * 28500 * 0.0015
    });

    it('D3. No cross-run contamination: sandbox state from Run A does not leak into Run B', () => {
      const snapshotHPG = MarketSnapshotBuilder.buildFrom(baseInput);
      const bindingHPG = ReplayEngine.bindOrderIntent(snapshotHPG, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 1000,
      });

      // Run A executes BUY HPG
      const runA = ReplayEngine.replay({
        snapshot: snapshotHPG,
        executionContext: bindingHPG.executionContext,
        orderIntent: bindingHPG.orderIntent,
        initialAccount: createAccount(100_000_000),
        tradingCosts: { slippageRate: 0 },
      });
      expect(runA.status).toBe('REPLAYED');

      // Prepare Run B for VNM with separate snapshot and appropriate limits
      const vnmInput: MarketSnapshotInput = {
        ...baseInput,
        instrument: { symbol: 'VNM', name: 'Vinamilk' },
        quote: {
          last: 68000,
          open: 67500,
          high: 68500,
          low: 67200,
          close: 68000,
          volume: 3500000,
          reference: 68000,
          ceiling: 72700,
          floor: 63300,
          timestamp: '2026-03-30T10:30:00.000Z',
        },
      };
      const snapshotVNM = MarketSnapshotBuilder.buildFrom(vnmInput);
      const bindingVNM = ReplayEngine.bindOrderIntent(snapshotVNM, {
        symbol: 'VNM',
        side: 'BUY',
        quantity: 500,
      });

      // Run B executes BUY VNM
      const runB = ReplayEngine.replay({
        snapshot: snapshotVNM,
        executionContext: bindingVNM.executionContext,
        orderIntent: bindingVNM.orderIntent,
        initialAccount: createAccount(50_000_000),
        tradingCosts: { slippageRate: 0 },
      });

      expect(runB.status).toBe('REPLAYED');
      expect(runB.replayExecution?.symbol).toBe('VNM');
      expect(runB.replayExecution?.executedQuantity).toBe(500);
      // Ensure cashAfter matches 50M - (500 * 68000 + 0.15% fees), not contaminated by Run A's 100M
      const expectedCashAfter = 50_000_000 - (500 * 68000 + Math.round(500 * 68000 * 0.0015));
      expect(runB.replayExecution?.cashAfter).toBe(expectedCashAfter);
    });
  });

  // =========================================================================
  // GROUP E — HISTORICAL REPLAY SESSION ISOLATION (E1 - E3)
  // =========================================================================
  describe('Group E: Historical Replay Session Isolation', () => {
    it('E1. Historical snapshot outside current session: executes cleanly regardless of wall-clock time', () => {
      // Create snapshot marked as session CLOSED, isOpen: false, weekend timestamp
      const historicalInput: MarketSnapshotInput = {
        ...baseInput,
        market: {
          exchange: 'HOSE',
          tradingDate: '2026-03-29', // Sunday
          session: 'CLOSED',
          isOpen: false,
        },
        quote: {
          ...baseInput.quote,
          timestamp: '2026-03-29T18:00:00.000Z',
        },
      };

      const historicalSnapshot = MarketSnapshotBuilder.buildFrom(historicalInput);
      const binding = ReplayEngine.bindOrderIntent(historicalSnapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 1000,
      });

      const replayResult = ReplayEngine.replay({
        snapshot: historicalSnapshot,
        executionContext: binding.executionContext,
        orderIntent: binding.orderIntent,
        initialAccount: createAccount(100_000_000),
      });

      expect(replayResult.status).toBe('REPLAYED');
      expect(replayResult.replayExecution?.status).toBe('FILLED');
      expect(replayResult.replayExecution?.executedQuantity).toBe(1000);
    });

    it('E2. Live account immutability: replay execution never modifies the caller live account', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 1000,
      });

      const liveAccount: BrokerAccount = {
        accountId: 'LIVE_PROD_ACC_001',
        currency: 'VND',
        cash: 120_000_000,
        reservedCash: 0,
        availableCash: 120_000_000,
        marketValue: 57_000_000,
        equity: 177_000_000,
        realizedPnL: 5_000_000,
        unrealizedPnL: 2_000_000,
        positions: [
          {
            symbol: 'HPG',
            quantity: 2000,
            reservedQuantity: 0,
            availableQuantity: 2000,
            averageCost: 27500,
            currentPrice: 28500,
            marketValue: 57000000,
            unrealizedPnL: 2000000,
            unrealizedPnLPercent: 3.64,
            updatedAt: '2026-03-30T10:00:00.000Z',
          },
        ],
        openOrders: [],
        updatedAt: '2026-03-30T10:00:00.000Z',
      };

      const liveAccountSnapshot = JSON.stringify(liveAccount);

      // Execute replay
      const replayResult = ReplayEngine.replay({
        snapshot,
        executionContext: binding.executionContext,
        orderIntent: binding.orderIntent,
        initialAccount: liveAccount,
      });

      expect(replayResult.status).toBe('REPLAYED');
      // Assert that liveAccount object was completely unmutated
      expect(JSON.stringify(liveAccount)).toBe(liveAccountSnapshot);
      expect(liveAccount.cash).toBe(120_000_000);
      expect(liveAccount.positions[0].quantity).toBe(2000);
    });

    it('E3. Persistent ledger isolation: replay executions never write to the production ledger', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
      const liveLedger = new PaperTradeLedger();
      const liveAccount = createAccount(200_000_000);
      const liveBroker = new PaperBroker({
        initialCash: liveAccount.cash,
        accountId: liveAccount.accountId,
        skipSessionValidation: true,
      });
      const liveEngine = new PaperExecutionEngine({ ledger: liveLedger });

      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 1000,
      });

      // 1. Perform 1 live execution to record an authentic entry in production ledger
      const liveResult = liveEngine.execute({
        recommendation: {
          symbol: 'HPG',
          strategy: 'MEDIUM_TERM',
          signal: 'BUY',
          score: 85,
          confidence: 'HIGH',
          entryPrice: 28500,
          targetPrice: 33000,
          stopLoss: 26500,
          riskReward: 2.25,
          expectedReturn: 12,
          holdingPeriod: 30,
          reasons: ['Authentic buy'],
          warnings: [],
          currency: 'VND',
          generatedAt: snapshot.capturedAt,
          asOfDate: snapshot.market.tradingDate,
          scoreBreakdown: { technical: null, fundamental: null, momentum: null, moneyFlow: null, valuation: null, risk: null },
          evidence: [],
        },
        marketData: {
          symbol: 'HPG',
          price: 28500,
          timestamp: new Date(snapshot.quote.timestamp).getTime(),
          dataSource: 'SSI',
        },
        broker: liveBroker,
        account: liveAccount,
        customQuantity: 1000,
        policy: { maxStaleTimeMs: Number.MAX_SAFE_INTEGER },
        executionContext: binding.executionContext,
      });

      expect(liveResult.success).toBe(true);
      expect(liveLedger.getAllEntries().length).toBe(1);

      // 2. Perform multiple replay runs
      ReplayEngine.replay({
        snapshot,
        executionContext: binding.executionContext,
        orderIntent: binding.orderIntent,
        originalExecution: liveResult,
      });

      ReplayEngine.replay({
        snapshot,
        executionContext: binding.executionContext,
        orderIntent: binding.orderIntent,
      });

      // 3. Confirm production ledger still has strictly 1 entry
      expect(liveLedger.getAllEntries().length).toBe(1);
      expect(liveLedger.getEntriesBySnapshotId(snapshot.snapshotId).length).toBe(1);
    });
  });

  // =========================================================================
  // GROUP F — VIETNAM MARKET EXECUTION RULES REGRESSION (F1 - F5)
  // =========================================================================
  describe('Group F: Vietnam Market Execution Rules Regression', () => {
    it('F1. Board lot: rounds down to 100 shares, rejects orders below minimum 100 shares', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);

      // 150 shares -> executes 100 shares
      const binding150 = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 150,
      });

      const replayResult150 = ReplayEngine.replay({
        snapshot,
        executionContext: binding150.executionContext,
        orderIntent: binding150.orderIntent,
        initialAccount: createAccount(50_000_000),
      });

      expect(replayResult150.status).toBe('REPLAYED');
      expect(replayResult150.replayExecution?.executedQuantity).toBe(100);

      // 50 shares -> below 100 lot -> rejected
      const binding50 = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 50,
      });

      const replayResult50 = ReplayEngine.replay({
        snapshot,
        executionContext: binding50.executionContext,
        orderIntent: binding50.orderIntent,
        initialAccount: createAccount(50_000_000),
      });

      expect(replayResult50.status).toBe('REPLAYED');
      expect(replayResult50.replayExecution?.status).toBe('REJECTED');
      expect(replayResult50.replayExecution?.executedQuantity).toBe(0);
    });

    it('F2. Short selling: rejects SELL order when holding quantity is insufficient', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'SELL',
        quantity: 500,
      });

      // Account holds only 200 shares
      const accountWithFewShares: BrokerAccount = {
        ...createAccount(50_000_000),
        positions: [
          {
            symbol: 'HPG',
            quantity: 200,
            reservedQuantity: 0,
            availableQuantity: 200,
            averageCost: 25000,
            currentPrice: 28500,
            marketValue: 5700000,
            unrealizedPnL: 700000,
            unrealizedPnLPercent: 14.0,
            updatedAt: '2026-03-30T10:00:00.000Z',
          },
        ],
      };

      const replayResult = ReplayEngine.replay({
        snapshot,
        executionContext: binding.executionContext,
        orderIntent: binding.orderIntent,
        initialAccount: accountWithFewShares,
      });

      expect(replayResult.status).toBe('REPLAYED');
      expect(replayResult.replayExecution?.status).toBe('REJECTED');
      expect(replayResult.replayExecution?.executedQuantity).toBe(0);
      expect(replayResult.replayExecution?.code).toBe('INSUFFICIENT_POSITION');
    });

    it('F3. Sales tax: applies exact 0.10% Vietnam statutory tax on SELL gross proceeds', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'SELL',
        quantity: 1000, // 1000 * 28500 = 28,500,000 VND
      });

      const accountWithShares: BrokerAccount = {
        ...createAccount(50_000_000),
        positions: [
          {
            symbol: 'HPG',
            quantity: 1000,
            reservedQuantity: 0,
            availableQuantity: 1000,
            averageCost: 25000,
            currentPrice: 28500,
            marketValue: 28500000,
            unrealizedPnL: 3500000,
            unrealizedPnLPercent: 14.0,
            updatedAt: '2026-03-30T10:00:00.000Z',
          },
        ],
      };

      const replayResult = ReplayEngine.replay({
        snapshot,
        executionContext: binding.executionContext,
        orderIntent: binding.orderIntent,
        initialAccount: accountWithShares,
        tradingCosts: { slippageRate: 0 },
      });

      expect(replayResult.status).toBe('REPLAYED');
      expect(replayResult.replayExecution?.status).toBe('FILLED');
      const gross = 1000 * 28500;
      const expectedTax = Math.round(gross * 0.001); // 28,500 VND
      expect(replayResult.replayExecution?.tax).toBe(expectedTax);
    });

    it('F4. Brokerage fee: applies exact 0.15% fee on both BUY and SELL', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);

      // BUY 1000 shares @ 28500
      const bindingBuy = ReplayEngine.bindOrderIntent(snapshot, { symbol: 'HPG', side: 'BUY', quantity: 1000 });
      const resBuy = ReplayEngine.replay({
        snapshot,
        executionContext: bindingBuy.executionContext,
        orderIntent: bindingBuy.orderIntent,
        initialAccount: createAccount(100_000_000),
        tradingCosts: { slippageRate: 0 },
      });

      const expectedBuyFee = Math.round(1000 * 28500 * 0.0015); // 42,750 VND
      expect(resBuy.replayExecution?.fee).toBe(expectedBuyFee);

      // SELL 1000 shares @ 28500
      const bindingSell = ReplayEngine.bindOrderIntent(snapshot, { symbol: 'HPG', side: 'SELL', quantity: 1000 });
      const resSell = ReplayEngine.replay({
        snapshot,
        executionContext: bindingSell.executionContext,
        orderIntent: bindingSell.orderIntent,
        initialAccount: {
          ...createAccount(50_000_000),
          positions: [
            {
              symbol: 'HPG',
              quantity: 1000,
              reservedQuantity: 0,
              availableQuantity: 1000,
              averageCost: 25000,
              currentPrice: 28500,
              marketValue: 28500000,
              unrealizedPnL: 3500000,
              unrealizedPnLPercent: 14.0,
              updatedAt: '2026-03-30T10:00:00.000Z',
            },
          ],
        },
        tradingCosts: { slippageRate: 0 },
      });

      const expectedSellFee = Math.round(1000 * 28500 * 0.0015); // 42,750 VND
      expect(resSell.replayExecution?.fee).toBe(expectedSellFee);
    });

    it('F5. BUY insufficient cash: rejects execution and preserves cash balance', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 1000, // requires ~28,542,750 VND
      });

      // Account with plenty of portfolio equity (500M) so RiskGuard authorizes position, but only 10M cash
      const poorAccount: BrokerAccount = {
        ...createAccount(10_000_000),
        equity: 500_000_000,
        availableCash: 10_000_000,
      };

      const replayResult = ReplayEngine.replay({
        snapshot,
        executionContext: binding.executionContext,
        orderIntent: binding.orderIntent,
        initialAccount: poorAccount,
      });

      expect(replayResult.status).toBe('REPLAYED');
      expect(replayResult.replayExecution?.status).toBe('REJECTED');
      expect(replayResult.replayExecution?.code).toBe('INSUFFICIENT_CASH');
      expect(replayResult.replayExecution?.executedQuantity).toBe(0);
      expect(replayResult.replayExecution?.cashAfter).toBe(10_000_000);
    });
  });
});

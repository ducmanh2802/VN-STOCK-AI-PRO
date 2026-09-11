import { describe, it, expect } from 'vitest';
import { MarketSnapshotBuilder } from '../../snapshot/MarketSnapshotBuilder.ts';
import { computeSnapshotHash } from '../../snapshot/snapshotHash.ts';
import type { MarketSnapshotInput } from '../../snapshot/types.ts';
import { PaperExecutionEngine } from '../../paper/PaperExecutionEngine.ts';
import { PaperBroker } from '../../paper/PaperBroker.ts';
import { PaperTradeLedger } from '../../paper/PaperTradeLedger.ts';
import type { BrokerAccount } from '../../execution/BrokerAdapter.ts';
import type { InvestmentRecommendation } from '../../../../types/recommendation.ts';
import { ReplayEngine } from '../ReplayEngine.ts';
import { ReplayValidator } from '../ReplayValidator.ts';
import { ReplayResultFactory } from '../ReplayResult.ts';
import type { OrderIntent, ExecutionContextBinding, ReplayRequest } from '../types.ts';

describe('PHASE 18.3.3 — DETERMINISTIC REPLAY ENGINE + SNAPSHOT BINDING', () => {
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

  const createInitialAccount = (cash = 500_000_000): BrokerAccount => ({
    accountId: 'ACC_TEST_01',
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
  // 1. SNAPSHOT BINDING & EXECUTION CONTEXT METADATA
  // =========================================================================
  describe('1. Snapshot Binding & Audit Ledger Preservation', () => {
    it('propagates marketDataSnapshotId, recommendationId, and versions into PaperAuditEntry', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
      const ledger = new PaperTradeLedger();
      const account = createInitialAccount();
      const broker = new PaperBroker({ initialAccount: account });
      const engine = new PaperExecutionEngine({ ledger });

      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 1000,
      });

      const rec: InvestmentRecommendation = {
        symbol: 'HPG',
        strategy: 'GROWTH',
        signal: 'BUY',
        score: 85,
        confidence: 'HIGH',
        entryPrice: 28500,
        targetPrice: 32000,
        stopLoss: 26500,
        riskReward: 2.1,
        expectedReturn: 12,
        holdingPeriod: 30,
        reasons: ['Breakout with high volume'],
        warnings: [],
        currency: 'VND',
        generatedAt: snapshot.capturedAt,
        asOfDate: snapshot.market.tradingDate,
        scoreBreakdown: { technical: null, fundamental: null, momentum: null, moneyFlow: null, valuation: null, risk: null },
        evidence: [],
      };

      const result = engine.execute({
        recommendation: rec,
        marketData: {
          symbol: 'HPG',
          price: 28500,
          timestamp: new Date(snapshot.quote.timestamp).getTime(),
          dataSource: 'SSI',
        },
        broker,
        account,
        customQuantity: 1000,
        policy: { skipSessionValidation: true, maxStaleTimeMs: Number.MAX_SAFE_INTEGER },
        executionContext: binding.executionContext,
      });

      expect(result.success).toBe(true);
      expect(result.marketDataSnapshotId).toBe(snapshot.snapshotId);
      expect(result.recommendationId).toBe('REC-HPG-20260330-01');
      expect(result.strategyVersion).toBe('v2.1.0');
      expect(result.riskPolicyVersion).toBe('v1.4.0');

      // Verify Ledger persistence
      const latestAudit = ledger.getLatestEntry();
      expect(latestAudit).toBeDefined();
      expect(latestAudit?.marketDataSnapshotId).toBe(snapshot.snapshotId);
      expect(latestAudit?.recommendationId).toBe('REC-HPG-20260330-01');
      expect(latestAudit?.strategyVersion).toBe('v2.1.0');
      expect(latestAudit?.riskPolicyVersion).toBe('v1.4.0');

      // Verify query methods
      const entriesBySnap = ledger.getEntriesBySnapshotId(snapshot.snapshotId);
      expect(entriesBySnap.length).toBe(1);
      expect(entriesBySnap[0].orderId).toBe(result.orderId);

      const entriesByRec = ledger.getEntriesByRecommendationId('REC-HPG-20260330-01');
      expect(entriesByRec.length).toBe(1);
    });

    it('preserves metadata in ledger even when execution is rejected by RiskGuard or lot size', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
      const ledger = new PaperTradeLedger();
      const account = createInitialAccount();
      const broker = new PaperBroker({ initialAccount: account });
      const engine = new PaperExecutionEngine({ ledger });

      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 50, // Odd lot: will round down to 0 and reject
      });

      const rec: InvestmentRecommendation = {
        symbol: 'HPG',
        strategy: 'GROWTH',
        signal: 'BUY',
        score: 85,
        confidence: 'HIGH',
        entryPrice: 28500,
        targetPrice: 32000,
        stopLoss: 26500,
        riskReward: 2.1,
        expectedReturn: 12,
        holdingPeriod: 30,
        reasons: ['Breakout'],
        warnings: [],
        currency: 'VND',
        generatedAt: snapshot.capturedAt,
        asOfDate: snapshot.market.tradingDate,
        scoreBreakdown: { technical: null, fundamental: null, momentum: null, moneyFlow: null, valuation: null, risk: null },
        evidence: [],
      };

      const result = engine.execute({
        recommendation: rec,
        marketData: {
          symbol: 'HPG',
          price: 28500,
          timestamp: new Date(snapshot.quote.timestamp).getTime(),
          dataSource: 'SSI',
        },
        broker,
        account,
        customQuantity: 50,
        policy: { skipSessionValidation: true, maxStaleTimeMs: Number.MAX_SAFE_INTEGER },
        executionContext: binding.executionContext,
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('REJECTED');
      expect(result.auditEntry.marketDataSnapshotId).toBe(snapshot.snapshotId);
      expect(result.auditEntry.recommendationId).toBe('REC-HPG-20260330-01');
      expect(result.auditEntry.strategyVersion).toBe('v2.1.0');
      expect(result.auditEntry.riskPolicyVersion).toBe('v1.4.0');
    });
  });

  // =========================================================================
  // 2. PRE-REPLAY VALIDATION & FAIL-CLOSED GUARDS
  // =========================================================================
  describe('2. Pre-Replay Validation & Fail-Closed Guards', () => {
    it('accepts a pristine, valid snapshot and valid context binding', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 1000,
      });

      const validation = ReplayValidator.validate({
        snapshot,
        executionContext: binding.executionContext,
        orderIntent: binding.orderIntent,
      });

      expect(validation.isValid).toBe(true);
      expect(validation.mismatches).toHaveLength(0);
    });

    it('rejects tampered snapshot quote with SNAPSHOT_HASH_INVALID', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 1000,
      });

      // Tamper quote price without recalculating hash
      const tamperedSnapshot = {
        ...snapshot,
        quote: {
          ...snapshot.quote,
          last: 35000, // Altered price
        },
      };

      const replayResult = ReplayEngine.replay({
        snapshot: tamperedSnapshot as any,
        executionContext: binding.executionContext,
        orderIntent: binding.orderIntent,
      });

      expect(replayResult.status).toBe('REPLAY_INVALID');
      expect(replayResult.mismatches.some(m => m.code === 'SNAPSHOT_HASH_INVALID')).toBe(true);
    });

    it('rejects tampered snapshotId with SNAPSHOT_ID_MISMATCH and ORDER_SNAPSHOT_MISMATCH', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 1000,
      });

      const tamperedSnapshot = {
        ...snapshot,
        snapshotId: 'SNAP_FAKE_ID_12345678',
      };

      const replayResult = ReplayEngine.replay({
        snapshot: tamperedSnapshot as any,
        executionContext: binding.executionContext,
        orderIntent: binding.orderIntent,
      });

      expect(replayResult.status).toBe('REPLAY_INVALID');
      expect(replayResult.mismatches.some(m => m.code === 'SNAPSHOT_ID_MISMATCH')).toBe(true);
    });

    it('rejects missing or null snapshot with SNAPSHOT_NOT_FOUND', () => {
      const replayResult = ReplayEngine.replay({
        snapshot: null as any,
        executionContext: { marketDataSnapshotId: 'TEST' },
        orderIntent: { symbol: 'HPG', side: 'BUY', quantity: 100 },
      });

      expect(replayResult.status).toBe('REPLAY_INVALID');
      expect(replayResult.mismatches.some(m => m.code === 'SNAPSHOT_NOT_FOUND')).toBe(true);
    });

    it('rejects mismatched snapshotId between execution context and snapshot', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
      const replayResult = ReplayEngine.replay({
        snapshot,
        executionContext: { marketDataSnapshotId: 'DIFFERENT_SNAPSHOT_ID' },
        orderIntent: { symbol: 'HPG', side: 'BUY', quantity: 100 },
      });

      expect(replayResult.status).toBe('REPLAY_INVALID');
      expect(replayResult.mismatches.some(m => m.code === 'ORDER_SNAPSHOT_MISMATCH')).toBe(true);
    });

    it('rejects mismatched strategyVersion with STRATEGY_VERSION_MISMATCH', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
      const replayResult = ReplayEngine.replay({
        snapshot,
        executionContext: {
          marketDataSnapshotId: snapshot.snapshotId,
          strategyVersion: 'v9.9.9_DIVERGED', // Snapshot has v2.1.0
        },
        orderIntent: { symbol: 'HPG', side: 'BUY', quantity: 100 },
      });

      expect(replayResult.status).toBe('REPLAY_INVALID');
      expect(replayResult.mismatches.some(m => m.code === 'STRATEGY_VERSION_MISMATCH')).toBe(true);
    });

    it('rejects mismatched riskPolicyVersion with RISK_POLICY_VERSION_MISMATCH', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
      const replayResult = ReplayEngine.replay({
        snapshot,
        executionContext: {
          marketDataSnapshotId: snapshot.snapshotId,
          riskPolicyVersion: 'v9.9.9_MODIFIED', // Snapshot has v1.4.0
        },
        orderIntent: { symbol: 'HPG', side: 'BUY', quantity: 100 },
      });

      expect(replayResult.status).toBe('REPLAY_INVALID');
      expect(replayResult.mismatches.some(m => m.code === 'RISK_POLICY_VERSION_MISMATCH')).toBe(true);
    });

    it('rejects mismatched recommendationId with RECOMMENDATION_MISMATCH', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
      const replayResult = ReplayEngine.replay({
        snapshot,
        executionContext: {
          marketDataSnapshotId: snapshot.snapshotId,
          recommendationId: 'DIFFERENT_REC_ID',
        },
        orderIntent: { symbol: 'HPG', side: 'BUY', quantity: 100 },
      });

      expect(replayResult.status).toBe('REPLAY_INVALID');
      expect(replayResult.mismatches.some(m => m.code === 'RECOMMENDATION_MISMATCH')).toBe(true);
    });

    it('rejects mismatched ticker symbol with INPUT_INVALID', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput); // Symbol: HPG
      const replayResult = ReplayEngine.replay({
        snapshot,
        executionContext: { marketDataSnapshotId: snapshot.snapshotId },
        orderIntent: { symbol: 'VNM', side: 'BUY', quantity: 100 }, // Symbol: VNM
      });

      expect(replayResult.status).toBe('REPLAY_INVALID');
      expect(replayResult.mismatches.some(m => m.field === 'orderIntent.symbol')).toBe(true);
    });
  });

  // =========================================================================
  // 3. DETERMINISTIC REPLAY & PARITY
  // =========================================================================
  describe('3. Deterministic Replay & Parity Verification', () => {
    it('reproduces identical execution results given identical snapshot and inputs', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 2000,
      });

      // Run live engine once to get original execution
      const ledger = new PaperTradeLedger();
      const account = createInitialAccount(500_000_000);
      const broker = new PaperBroker({ initialAccount: account });
      const liveEngine = new PaperExecutionEngine({ ledger });

      const originalResult = liveEngine.execute({
        recommendation: {
          symbol: 'HPG',
          strategy: 'GROWTH',
          signal: 'BUY',
          score: 85,
          confidence: 'HIGH',
          entryPrice: 28500,
          targetPrice: 32000,
          stopLoss: 26500,
          riskReward: 2.14,
          expectedReturn: 12,
          holdingPeriod: 30,
          reasons: ['Replay test'],
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
        broker,
        account,
        customQuantity: 2000,
        policy: { skipSessionValidation: true, maxStaleTimeMs: Number.MAX_SAFE_INTEGER },
        executionContext: binding.executionContext,
      });

      expect(originalResult.success).toBe(true);

      // Now run deterministic ReplayEngine
      const replayResult = ReplayEngine.replay({
        snapshot,
        executionContext: binding.executionContext,
        orderIntent: binding.orderIntent,
        originalExecution: originalResult,
        initialAccount: createInitialAccount(500_000_000),
      });

      expect(replayResult.status).toBe('REPLAYED');
      expect(replayResult.deterministic).toBe(true);
      expect(replayResult.mismatches).toHaveLength(0);
      expect(replayResult.replayExecution?.status).toBe('FILLED');
      expect(replayResult.replayExecution?.executedQuantity).toBe(2000);
      expect(replayResult.replayExecution?.executedPrice).toBe(28500);
      expect(replayResult.replayExecution?.fee).toBe(originalResult.fee);
      expect(replayResult.replayExecution?.tax).toBe(originalResult.tax);
      expect(replayResult.replayExecution?.slippage).toBe(originalResult.slippage);
    });

    it('repeated replays are 100% deterministic (replaying N times produces identical outputs)', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 1500,
      });

      const replay1 = ReplayEngine.replay({
        snapshot,
        executionContext: binding.executionContext,
        orderIntent: binding.orderIntent,
        initialAccount: createInitialAccount(300_000_000),
      });

      const replay2 = ReplayEngine.replay({
        snapshot,
        executionContext: binding.executionContext,
        orderIntent: binding.orderIntent,
        initialAccount: createInitialAccount(300_000_000),
      });

      expect(replay1.status).toBe('REPLAYED');
      expect(replay2.status).toBe('REPLAYED');
      expect(replay1.replayExecution).toEqual(replay2.replayExecution);
    });

    it('deterministically reproduces rejections (e.g. insufficient cash rejection)', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 100_000, // Requires ~2.85 billion VND
      });

      // Original execution with 10 million VND cash -> should reject with INSUFFICIENT_CASH
      const account = createInitialAccount(10_000_000);
      const broker = new PaperBroker({ initialAccount: account });
      const liveEngine = new PaperExecutionEngine();

      const originalResult = liveEngine.execute({
        recommendation: {
          symbol: 'HPG',
          strategy: 'GROWTH',
          signal: 'BUY',
          score: 85,
          confidence: 'HIGH',
          entryPrice: 28500,
          targetPrice: 32000,
          stopLoss: 26500,
          riskReward: 2.14,
          expectedReturn: 12,
          holdingPeriod: 30,
          reasons: ['Big buy'],
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
        broker,
        account,
        customQuantity: 100_000,
        policy: { skipSessionValidation: true, maxStaleTimeMs: Number.MAX_SAFE_INTEGER },
        executionContext: binding.executionContext,
      });

      expect(originalResult.success).toBe(false);
      expect(originalResult.status).toBe('REJECTED');
      expect(originalResult.code).toBe('INSUFFICIENT_CASH');

      // Replay should also reject with identical status and quantities
      const replayResult = ReplayEngine.replay({
        snapshot,
        executionContext: binding.executionContext,
        orderIntent: binding.orderIntent,
        originalExecution: originalResult,
        initialAccount: createInitialAccount(10_000_000),
      });

      expect(replayResult.status).toBe('REPLAYED');
      expect(replayResult.replayExecution?.status).toBe('REJECTED');
      expect(replayResult.replayExecution?.executedQuantity).toBe(0);
      expect(replayResult.mismatches).toHaveLength(0);
    });
  });

  // =========================================================================
  // 4. SENSITIVITY & DIVERGENCE DETECTION
  // =========================================================================
  describe('4. Divergence & Mismatch Detection', () => {
    it('detects price divergence between original execution and replayed snapshot', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput); // Quote last: 28500
      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 1000,
      });

      const fakeOriginal = {
        status: 'FILLED' as const,
        side: 'BUY' as const,
        symbol: 'HPG',
        requestedQuantity: 1000,
        executedQuantity: 1000,
        requestedPrice: 28000,
        executedPrice: 28000, // Original executed at 28000, but replay uses 28500
        fee: 42000,
        tax: 0,
        slippage: 0,
        code: 'EXECUTED',
        success: true,
      };

      const replayResult = ReplayEngine.replay({
        snapshot,
        executionContext: binding.executionContext,
        orderIntent: binding.orderIntent,
        originalExecution: fakeOriginal,
      });

      expect(replayResult.status).toBe('REPLAY_MISMATCH');
      expect(replayResult.mismatches.some(m => m.field === 'executedPrice')).toBe(true);
    });

    it('detects quantity divergence between original execution and replayed execution', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 1000, // Replay will execute 1000
      });

      const fakeOriginal = {
        status: 'FILLED' as const,
        side: 'BUY' as const,
        symbol: 'HPG',
        requestedQuantity: 500,
        executedQuantity: 500, // Original was 500
        requestedPrice: 28500,
        executedPrice: 28500,
        fee: 21375,
        tax: 0,
        slippage: 0,
        code: 'EXECUTED',
        success: true,
      };

      const replayResult = ReplayEngine.replay({
        snapshot,
        executionContext: binding.executionContext,
        orderIntent: binding.orderIntent,
        originalExecution: fakeOriginal,
      });

      expect(replayResult.status).toBe('REPLAY_MISMATCH');
      expect(replayResult.mismatches.some(m => m.field === 'executedQuantity')).toBe(true);
    });

    it('detects fee discrepancy between original and replay', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 1000,
      });

      const fakeOriginal = {
        status: 'FILLED' as const,
        side: 'BUY' as const,
        symbol: 'HPG',
        requestedQuantity: 1000,
        executedQuantity: 1000,
        requestedPrice: 28500,
        executedPrice: 28500,
        fee: 99999, // Altered fee
        tax: 0,
        slippage: 0,
        code: 'EXECUTED',
        success: true,
      };

      const replayResult = ReplayEngine.replay({
        snapshot,
        executionContext: binding.executionContext,
        orderIntent: binding.orderIntent,
        originalExecution: fakeOriginal,
      });

      expect(replayResult.status).toBe('REPLAY_MISMATCH');
      expect(replayResult.mismatches.some(m => m.field === 'fee')).toBe(true);
    });

    it('detects status discrepancy (original was REJECTED, but replay FILLED)', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 1000,
      });

      const fakeOriginal = {
        status: 'REJECTED' as const,
        side: 'BUY' as const,
        symbol: 'HPG',
        requestedQuantity: 1000,
        executedQuantity: 0,
        requestedPrice: 28500,
        executedPrice: null,
        fee: 0,
        tax: 0,
        slippage: 0,
        code: 'INSUFFICIENT_CASH',
        success: false,
      };

      const replayResult = ReplayEngine.replay({
        snapshot,
        executionContext: binding.executionContext,
        orderIntent: binding.orderIntent,
        originalExecution: fakeOriginal,
        initialAccount: createInitialAccount(500_000_000), // Replay has cash, so it will fill
      });

      expect(replayResult.status).toBe('REPLAY_MISMATCH');
      expect(replayResult.mismatches.some(m => m.field === 'status')).toBe(true);
    });
  });

  // =========================================================================
  // 5. PURITY, ISOLATION & NON-MUTATION
  // =========================================================================
  describe('5. Purity, Isolation & Non-Mutation Guarantees', () => {
    it('does not mutate the passed MarketSnapshot (remains frozen and intact)', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
      expect(Object.isFrozen(snapshot)).toBe(true);

      const snapshotBefore = JSON.stringify(snapshot);

      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 1000,
      });

      ReplayEngine.replay({
        snapshot,
        executionContext: binding.executionContext,
        orderIntent: binding.orderIntent,
      });

      const snapshotAfter = JSON.stringify(snapshot);
      expect(snapshotAfter).toBe(snapshotBefore);
      expect(Object.isFrozen(snapshot)).toBe(true);
    });

    it('does not mutate the passed initialAccount object in caller scope', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
      const account = createInitialAccount(200_000_000);
      const accountBefore = JSON.stringify(account);

      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 1000,
      });

      ReplayEngine.replay({
        snapshot,
        executionContext: binding.executionContext,
        orderIntent: binding.orderIntent,
        initialAccount: account,
      });

      const accountAfter = JSON.stringify(account);
      expect(accountAfter).toBe(accountBefore);
      expect(account.cash).toBe(200_000_000);
    });

    it('does not mutate the passed OrderIntent object', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 1000,
      });

      const intentBefore = JSON.stringify(binding.orderIntent);

      ReplayEngine.replay({
        snapshot,
        executionContext: binding.executionContext,
        orderIntent: binding.orderIntent,
      });

      const intentAfter = JSON.stringify(binding.orderIntent);
      expect(intentAfter).toBe(intentBefore);
    });
  });

  // =========================================================================
  // 6. FINANCIAL EXECUTION PARITY (BOARD LOT, FEES, TAX, NO-SHORT)
  // =========================================================================
  describe('6. Financial Execution Parity', () => {
    it('respects Vietnam board lot rule (rounds down odd shares to 100 multiple)', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 1250, // Should execute 1200 shares
      });

      const replayResult = ReplayEngine.replay({
        snapshot,
        executionContext: binding.executionContext,
        orderIntent: binding.orderIntent,
      });

      console.log('REPLAY MISMATCHES:', JSON.stringify(replayResult.mismatches), replayResult.error);
      expect(replayResult.status).toBe('REPLAYED');
      expect(replayResult.replayExecution?.requestedQuantity).toBe(1200);
      expect(replayResult.replayExecution?.executedQuantity).toBe(1200);
    });

    it('calculates statutory 0.10% tax and brokerage fee on SELL replay', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput); // 28500 VND
      const initialAccount: BrokerAccount = {
        ...createInitialAccount(100_000_000),
        positions: [
          {
            symbol: 'HPG',
            quantity: 2000,
            availableQuantity: 2000,
            averageBuyPrice: 25000,
            currentPrice: 28500,
            marketValue: 57000000,
            unrealizedPnL: 7000000,
            unrealizedPnLPercent: 14.0,
            lastUpdated: '2026-03-30T10:00:00.000Z',
          },
        ],
      };

      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'SELL',
        quantity: 1000, // 1000 shares * 28500 = 28,500,000 VND
      });

      const replayResult = ReplayEngine.replay({
        snapshot,
        executionContext: binding.executionContext,
        orderIntent: binding.orderIntent,
        initialAccount,
      });

      expect(replayResult.status).toBe('REPLAYED');
      expect(replayResult.replayExecution?.status).toBe('FILLED');
      expect(replayResult.replayExecution?.side).toBe('SELL');
      expect(replayResult.replayExecution?.executedQuantity).toBe(1000);

      // Fee: 28,500,000 * 0.0015 = 42,750 VND
      expect(replayResult.replayExecution?.fee).toBe(42750);
      // Tax: 28,500,000 * 0.0010 = 28,500 VND
      expect(replayResult.replayExecution?.tax).toBe(28500);
      // Realized PnL: (28500 - 25000) * 1000 - 42750 - 28500 = 3,500,000 - 71,250 = 3,428,750 VND
      expect(replayResult.replayExecution?.realizedPnL).toBe(3428750);
    });

    it('enforces Vietnam no-short rule on SELL replay (rejects when position insufficient)', () => {
      const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
      const initialAccount = createInitialAccount(100_000_000); // 0 HPG shares

      const binding = ReplayEngine.bindOrderIntent(snapshot, {
        symbol: 'HPG',
        side: 'SELL',
        quantity: 500,
      });

      const replayResult = ReplayEngine.replay({
        snapshot,
        executionContext: binding.executionContext,
        orderIntent: binding.orderIntent,
        initialAccount,
      });

      expect(replayResult.status).toBe('REPLAYED');
      expect(replayResult.replayExecution?.status).toBe('REJECTED');
      expect(replayResult.replayExecution?.executedQuantity).toBe(0);
      expect(replayResult.replayExecution?.code).toBe('INSUFFICIENT_POSITION');
    });
  });
});

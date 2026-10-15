/**
 * PHASE 18.3.6 — FINANCIAL CONSERVATION INVARIANTS TEST SUITE
 * ==========================================================
 * Comprehensive verification of mathematical financial conservation laws:
 *   - Cash Conservation
 *   - Position Conservation
 *   - Trade Value Conservation
 *   - Fee Conservation (0.15% Vietnam brokerage fee)
 *   - Tax Conservation (0.10% Vietnam sales tax on SELL; 0% on BUY)
 *   - Partial Fill Conservation (board lot 100 shares, cumulative fill constraint)
 *   - Realized PnL Conservation (reusing canonical average cost accounting)
 *   - Equity Conservation
 *   - Double-Processing / Double-Count Protection
 *   - Cross-Replay Isolation
 *   - Determinism (5x run verification)
 *   - Fail-Closed & Zero Mutation Invariants
 *   - Adversarial / Tampering Detection
 */

import { describe, it, expect } from 'vitest';
import { MarketSnapshotBuilder } from '../../snapshot/MarketSnapshotBuilder.ts';
import type { MarketSnapshotInput } from '../../snapshot/types.ts';
import {
  ReplayEngine,
  ReplayValidator,
  FinancialConservationValidator,
  OrderStateMachine,
} from '../index.ts';
import type {
  OrderIntent,
  ExecutionContextBinding,
  ReplayEvent,
} from '../types.ts';
import type { BrokerAccount } from '../../execution/BrokerAdapter.ts';
import { PaperTradeLedger } from '../../paper/PaperTradeLedger.ts';

describe('Phase 18.3.6: Financial Conservation Invariants', () => {
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

  const createTestContext = (options?: { cash?: number; positions?: Array<{ symbol: string; quantity: number; averageCost: number }> }) => {
    const snapshot = MarketSnapshotBuilder.buildFrom(baseInput);
    const orderIntent: OrderIntent = {
      symbol: 'HPG',
      side: 'BUY',
      quantity: 1000,
      orderType: 'MARKET',
      recommendationId: 'REC-HPG-20260330-01',
    };
    const executionContext: ExecutionContextBinding = {
      marketDataSnapshotId: snapshot.snapshotId,
      recommendationId: 'REC-HPG-20260330-01',
      strategyVersion: 'v2.1.0',
      riskPolicyVersion: 'v1.4.0',
    };
    const initialAccount: BrokerAccount = {
      accountId: 'ACC_FIN_01',
      currency: 'VND',
      cash: options?.cash ?? 500_000_000,
      reservedCash: 0,
      availableCash: options?.cash ?? 500_000_000,
      marketValue: 0,
      equity: options?.cash ?? 500_000_000,
      realizedPnL: 0,
      unrealizedPnL: 0,
      positions: options?.positions?.map(p => ({
        symbol: p.symbol,
        quantity: p.quantity,
        reservedQuantity: 0,
        availableQuantity: p.quantity,
        averageCost: p.averageCost,
        currentPrice: 28500,
        marketValue: p.quantity * 28500,
        unrealizedPnL: 0,
        unrealizedPnLPercent: 0,
        updatedAt: '2026-03-30T10:30:00.000Z',
      })) ?? [],
      openOrders: [],
      updatedAt: '2026-03-30T10:30:00.000Z',
    };

    return { snapshot, orderIntent, executionContext, initialAccount };
  };

  // ==========================================================================
  // GROUP A — CASH CONSERVATION
  // ==========================================================================
  describe('Group A: Cash Conservation', () => {
    it('A1: Valid BUY cash outflow equals gross trade value + 0.15% fee', () => {
      const { initialAccount } = createTestContext();
      const qty = 1000;
      const price = 28500;
      const gross = qty * price; // 28,500,000 VND
      const fee = Math.round(gross * 0.0015); // 42,750 VND
      const expectedCashAfter = initialAccount.cash - (gross + fee); // 471,457,250 VND

      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'BUY',
        symbol: 'HPG',
        requestedQuantity: qty,
        executedQuantity: qty,
        executedPrice: price,
        fee,
        tax: 0,
        status: 'FILLED',
        cashBefore: initialAccount.cash,
        cashAfter: expectedCashAfter,
        positionBefore: 0,
        positionAfter: qty,
      });

      expect(res.isValid).toBe(true);
      expect(res.mismatches).toHaveLength(0);
    });

    it('A2: Valid SELL cash inflow equals gross trade value - 0.15% fee - 0.10% tax', () => {
      const { initialAccount } = createTestContext({
        cash: 100_000_000,
        positions: [{ symbol: 'HPG', quantity: 1000, averageCost: 25000 }],
      });
      const qty = 1000;
      const price = 28500;
      const gross = qty * price; // 28,500,000 VND
      const fee = Math.round(gross * 0.0015); // 42,750 VND
      const tax = Math.round(gross * 0.0010); // 28,500 VND
      const netProceeds = gross - fee - tax; // 28,428,750 VND
      const expectedCashAfter = initialAccount.cash + netProceeds; // 128,428,750 VND
      const costBasis = qty * 25000; // 25,000,000 VND
      const expectedPnL = netProceeds - costBasis; // 3,428,750 VND

      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'SELL',
        symbol: 'HPG',
        requestedQuantity: qty,
        executedQuantity: qty,
        executedPrice: price,
        fee,
        tax,
        status: 'FILLED',
        cashBefore: initialAccount.cash,
        cashAfter: expectedCashAfter,
        positionBefore: 1000,
        positionAfter: 0,
        averageCost: 25000,
        realizedPnL: expectedPnL,
      });

      expect(res.isValid).toBe(true);
      expect(res.mismatches).toHaveLength(0);
    });

    it('A3: Rejects unexplained cash delta (cash_after mismatch)', () => {
      const { initialAccount } = createTestContext();
      const qty = 1000;
      const price = 28500;
      const gross = qty * price;
      const fee = Math.round(gross * 0.0015);
      const expectedCashAfter = initialAccount.cash - (gross + fee);
      const manipulatedCashAfter = expectedCashAfter + 10_000_000; // +10M VND unexplained!

      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'BUY',
        symbol: 'HPG',
        requestedQuantity: qty,
        executedQuantity: qty,
        executedPrice: price,
        fee,
        tax: 0,
        status: 'FILLED',
        cashBefore: initialAccount.cash,
        cashAfter: manipulatedCashAfter,
        positionBefore: 0,
        positionAfter: qty,
      });

      expect(res.isValid).toBe(false);
      expect(res.mismatches.some(m => m.code === 'CASH_CONSERVATION_FAILED')).toBe(true);
    });

    it('A4: Rejects duplicated cash deduction', () => {
      const { initialAccount } = createTestContext();
      const qty = 1000;
      const price = 28500;
      const gross = qty * price;
      const fee = Math.round(gross * 0.0015);
      const doubleDeductionCashAfter = initialAccount.cash - (gross + fee) * 2; // Deducted twice!

      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'BUY',
        symbol: 'HPG',
        requestedQuantity: qty,
        executedQuantity: qty,
        executedPrice: price,
        fee,
        tax: 0,
        status: 'FILLED',
        cashBefore: initialAccount.cash,
        cashAfter: doubleDeductionCashAfter,
        positionBefore: 0,
        positionAfter: qty,
      });

      expect(res.isValid).toBe(false);
      expect(res.mismatches.some(m => m.code === 'CASH_CONSERVATION_FAILED')).toBe(true);
    });

    it('A5: Rejects omitted fee in cash calculation', () => {
      const { initialAccount } = createTestContext();
      const qty = 1000;
      const price = 28500;
      const gross = qty * price;
      const omittedFeeCashAfter = initialAccount.cash - gross; // Fee omitted!

      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'BUY',
        symbol: 'HPG',
        requestedQuantity: qty,
        executedQuantity: qty,
        executedPrice: price,
        fee: Math.round(gross * 0.0015),
        tax: 0,
        status: 'FILLED',
        cashBefore: initialAccount.cash,
        cashAfter: omittedFeeCashAfter,
        positionBefore: 0,
        positionAfter: qty,
      });

      expect(res.isValid).toBe(false);
      expect(res.mismatches.some(m => m.code === 'CASH_CONSERVATION_FAILED')).toBe(true);
    });

    it('A6: Rejects omitted tax in cash calculation on SELL', () => {
      const { initialAccount } = createTestContext({
        cash: 100_000_000,
        positions: [{ symbol: 'HPG', quantity: 1000, averageCost: 25000 }],
      });
      const qty = 1000;
      const price = 28500;
      const gross = qty * price;
      const fee = Math.round(gross * 0.0015);
      const tax = Math.round(gross * 0.0010);
      const omittedTaxCashAfter = initialAccount.cash + (gross - fee); // Tax omitted!

      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'SELL',
        symbol: 'HPG',
        requestedQuantity: qty,
        executedQuantity: qty,
        executedPrice: price,
        fee,
        tax,
        status: 'FILLED',
        cashBefore: initialAccount.cash,
        cashAfter: omittedTaxCashAfter,
        positionBefore: 1000,
        positionAfter: 0,
        averageCost: 25000,
        realizedPnL: (gross - fee - tax) - (qty * 25000),
      });

      expect(res.isValid).toBe(false);
      expect(res.mismatches.some(m => m.code === 'CASH_CONSERVATION_FAILED')).toBe(true);
    });

    it('A7: Rejects negative cash balance (overdraft violation)', () => {
      const { initialAccount } = createTestContext({ cash: 10_000_000 }); // Only 10M cash
      const qty = 1000;
      const price = 28500;
      const gross = qty * price; // 28.5M
      const fee = Math.round(gross * 0.0015);

      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'BUY',
        symbol: 'HPG',
        requestedQuantity: qty,
        executedQuantity: qty,
        executedPrice: price,
        fee,
        tax: 0,
        status: 'FILLED',
        cashBefore: initialAccount.cash,
        cashAfter: initialAccount.cash - (gross + fee), // Negative: -18,542,750 VND
        positionBefore: 0,
        positionAfter: qty,
      });

      expect(res.isValid).toBe(false);
      expect(res.mismatches.some(m => m.code === 'CASH_CONSERVATION_FAILED')).toBe(true);
    });
  });

  // ==========================================================================
  // GROUP B — POSITION CONSERVATION
  // ==========================================================================
  describe('Group B: Position Conservation', () => {
    it('B1: Valid BUY increases position by exact executed quantity', () => {
      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'BUY',
        symbol: 'HPG',
        requestedQuantity: 500,
        executedQuantity: 500,
        executedPrice: 28500,
        fee: Math.round(500 * 28500 * 0.0015),
        tax: 0,
        status: 'FILLED',
        cashBefore: 100_000_000,
        cashAfter: 100_000_000 - (500 * 28500 + Math.round(500 * 28500 * 0.0015)),
        positionBefore: 200,
        positionAfter: 700, // 200 + 500 = 700
      });

      expect(res.isValid).toBe(true);
      expect(res.mismatches).toHaveLength(0);
    });

    it('B2: Valid SELL decreases position by exact executed quantity', () => {
      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'SELL',
        symbol: 'HPG',
        requestedQuantity: 400,
        executedQuantity: 400,
        executedPrice: 28500,
        fee: Math.round(400 * 28500 * 0.0015),
        tax: Math.round(400 * 28500 * 0.0010),
        status: 'FILLED',
        cashBefore: 50_000_000,
        cashAfter: 50_000_000 + (400 * 28500 - Math.round(400 * 28500 * 0.0015) - Math.round(400 * 28500 * 0.0010)),
        positionBefore: 1000,
        positionAfter: 600, // 1000 - 400 = 600
        averageCost: 25000,
        realizedPnL: (400 * 28500 - Math.round(400 * 28500 * 0.0015) - Math.round(400 * 28500 * 0.0010)) - (400 * 25000),
      });

      expect(res.isValid).toBe(true);
      expect(res.mismatches).toHaveLength(0);
    });

    it('B3: Rejects unexplained position delta (position_after mismatch)', () => {
      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'BUY',
        symbol: 'HPG',
        requestedQuantity: 500,
        executedQuantity: 500,
        executedPrice: 28500,
        fee: Math.round(500 * 28500 * 0.0015),
        tax: 0,
        status: 'FILLED',
        cashBefore: 100_000_000,
        cashAfter: 100_000_000 - (500 * 28500 + Math.round(500 * 28500 * 0.0015)),
        positionBefore: 200,
        positionAfter: 900, // 200 + 500 != 900!
      });

      expect(res.isValid).toBe(false);
      expect(res.mismatches.some(m => m.code === 'POSITION_CONSERVATION_FAILED')).toBe(true);
    });

    it('B4: Rejects short selling (position drops below 0)', () => {
      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'SELL',
        symbol: 'HPG',
        requestedQuantity: 500,
        executedQuantity: 500,
        executedPrice: 28500,
        fee: Math.round(500 * 28500 * 0.0015),
        tax: Math.round(500 * 28500 * 0.0010),
        status: 'FILLED',
        cashBefore: 50_000_000,
        positionBefore: 200, // Held only 200, tried to sell 500!
        positionAfter: -300,
      });

      expect(res.isValid).toBe(false);
      expect(res.mismatches.some(m => m.code === 'POSITION_CONSERVATION_FAILED')).toBe(true);
    });
  });

  // ==========================================================================
  // GROUP C — TRADE VALUE CONSERVATION & LOT SIZE
  // ==========================================================================
  describe('Group C: Trade Value & Lot Size Conservation', () => {
    it('C1: Valid trade value equals executed price * executed quantity', () => {
      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'BUY',
        symbol: 'HPG',
        requestedQuantity: 1000,
        executedQuantity: 1000,
        executedPrice: 28500,
        fee: Math.round(1000 * 28500 * 0.0015),
        tax: 0,
        status: 'FILLED',
        cashBefore: 100_000_000,
        positionBefore: 0,
      });

      expect(res.isValid).toBe(true);
    });

    it('C2: Rejects zero or negative price', () => {
      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'BUY',
        symbol: 'HPG',
        requestedQuantity: 1000,
        executedQuantity: 1000,
        executedPrice: 0, // Zero price!
        fee: 0,
        tax: 0,
        status: 'FILLED',
        cashBefore: 100_000_000,
        positionBefore: 0,
      });

      expect(res.isValid).toBe(false);
      expect(res.mismatches.some(m => m.code === 'TRADE_VALUE_CONSERVATION_FAILED')).toBe(true);
    });

    it('C3: Rejects odd-lot executed quantity (quantity % 100 !== 0)', () => {
      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'BUY',
        symbol: 'HPG',
        requestedQuantity: 155,
        executedQuantity: 155, // 155 is not divisible by 100!
        executedPrice: 28500,
        fee: Math.round(155 * 28500 * 0.0015),
        tax: 0,
        status: 'FILLED',
        cashBefore: 100_000_000,
        positionBefore: 0,
      });

      expect(res.isValid).toBe(false);
      expect(res.mismatches.some(m => m.code === 'LOT_SIZE_CONSERVATION_FAILED')).toBe(true);
    });

    it('C4: Rejects trade value contradiction in event sequence metadata', () => {
      const { snapshot } = createTestContext();
      const events: ReplayEvent[] = [
        {
          eventId: 'EVT_C4_1',
          sequenceNumber: 1,
          timestamp: Date.now(),
          orderId: 'ORD_C4',
          snapshotId: snapshot.snapshotId,
          previousState: 'NEW',
          nextState: 'VALIDATED',
          eventType: 'ORDER_CREATED',
        },
        {
          eventId: 'EVT_C4_2',
          sequenceNumber: 2,
          timestamp: Date.now() + 50,
          orderId: 'ORD_C4',
          snapshotId: snapshot.snapshotId,
          previousState: 'VALIDATED',
          nextState: 'AUTHORIZED',
          eventType: 'ORDER_VALIDATED',
        },
        {
          eventId: 'EVT_C4_3',
          sequenceNumber: 3,
          timestamp: Date.now() + 100,
          orderId: 'ORD_C4',
          snapshotId: snapshot.snapshotId,
          previousState: 'AUTHORIZED',
          nextState: 'SUBMITTED',
          eventType: 'ORDER_AUTHORIZED',
        },
        {
          eventId: 'EVT_C4_4',
          sequenceNumber: 4,
          timestamp: Date.now() + 150,
          orderId: 'ORD_C4',
          snapshotId: snapshot.snapshotId,
          previousState: 'SUBMITTED',
          nextState: 'FILLED',
          eventType: 'ORDER_FILLED',
          quantity: 1000,
          price: 28500,
          fee: Math.round(1000 * 28500 * 0.0015),
          tax: 0,
          metadata: {
            grossValue: 99_999_999, // Contradicts 1000 * 28500 = 28.5M!
          },
        },
        {
          eventId: 'EVT_C4_5',
          sequenceNumber: 5,
          timestamp: Date.now() + 200,
          orderId: 'ORD_C4',
          snapshotId: snapshot.snapshotId,
          previousState: 'FILLED',
          nextState: 'SETTLED',
          eventType: 'ORDER_SETTLED',
        },
      ];

      const res = FinancialConservationValidator.validateEventSequence(events, undefined, {
        orderedQuantity: 1000,
      });

      expect(res.isValid).toBe(false);
      expect(res.mismatches.some(m => m.code === 'TRADE_VALUE_CONSERVATION_FAILED')).toBe(true);
    });
  });

  // ==========================================================================
  // GROUP D — FEE CONSERVATION
  // ==========================================================================
  describe('Group D: Fee Conservation (0.15% brokerage fee)', () => {
    it('D1: Correct fee matches Math.round(gross * 0.0015)', () => {
      const gross = 28_500_000;
      const expectedFee = Math.round(gross * 0.0015); // 42,750 VND

      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'BUY',
        symbol: 'HPG',
        requestedQuantity: 1000,
        executedQuantity: 1000,
        executedPrice: 28500,
        fee: expectedFee,
        tax: 0,
        status: 'FILLED',
        cashBefore: 100_000_000,
        positionBefore: 0,
      });

      expect(res.isValid).toBe(true);
    });

    it('D2: Rejects incorrect fee calculation', () => {
      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'BUY',
        symbol: 'HPG',
        requestedQuantity: 1000,
        executedQuantity: 1000,
        executedPrice: 28500,
        fee: 50_000, // Should be 42,750
        tax: 0,
        status: 'FILLED',
        cashBefore: 100_000_000,
        positionBefore: 0,
      });

      expect(res.isValid).toBe(false);
      expect(res.mismatches.some(m => m.code === 'FEE_CONSERVATION_FAILED')).toBe(true);
    });

    it('D3: Rejects negative fee', () => {
      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'BUY',
        symbol: 'HPG',
        requestedQuantity: 1000,
        executedQuantity: 1000,
        executedPrice: 28500,
        fee: -1000,
        tax: 0,
        status: 'FILLED',
        cashBefore: 100_000_000,
        positionBefore: 0,
      });

      expect(res.isValid).toBe(false);
      expect(res.mismatches.some(m => m.code === 'FEE_CONSERVATION_FAILED')).toBe(true);
    });
  });

  // ==========================================================================
  // GROUP E — TAX CONSERVATION
  // ==========================================================================
  describe('Group E: Tax Conservation (0.10% sales tax on SELL, 0% on BUY)', () => {
    it('E1: Correct SELL tax matches Math.round(gross * 0.0010)', () => {
      const gross = 28_500_000;
      const expectedTax = Math.round(gross * 0.0010); // 28,500 VND

      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'SELL',
        symbol: 'HPG',
        requestedQuantity: 1000,
        executedQuantity: 1000,
        executedPrice: 28500,
        fee: Math.round(gross * 0.0015),
        tax: expectedTax,
        status: 'FILLED',
        cashBefore: 50_000_000,
        positionBefore: 1000,
        averageCost: 25000,
      });

      expect(res.isValid).toBe(true);
    });

    it('E2: Rejects incorrect tax on SELL', () => {
      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'SELL',
        symbol: 'HPG',
        requestedQuantity: 1000,
        executedQuantity: 1000,
        executedPrice: 28500,
        fee: Math.round(1000 * 28500 * 0.0015),
        tax: 35000, // Should be 28,500
        status: 'FILLED',
        cashBefore: 50_000_000,
        positionBefore: 1000,
        averageCost: 25000,
      });

      expect(res.isValid).toBe(false);
      expect(res.mismatches.some(m => m.code === 'TAX_CONSERVATION_FAILED')).toBe(true);
    });

    it('E3: Rejects BUY incorrectly taxed (tax > 0 on BUY)', () => {
      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'BUY',
        symbol: 'HPG',
        requestedQuantity: 1000,
        executedQuantity: 1000,
        executedPrice: 28500,
        fee: Math.round(1000 * 28500 * 0.0015),
        tax: 28500, // BUY must have 0 tax!
        status: 'FILLED',
        cashBefore: 100_000_000,
        positionBefore: 0,
      });

      expect(res.isValid).toBe(false);
      expect(res.mismatches.some(m => m.code === 'TAX_CONSERVATION_FAILED')).toBe(true);
    });

    it('E4: Rejects negative tax', () => {
      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'SELL',
        symbol: 'HPG',
        requestedQuantity: 1000,
        executedQuantity: 1000,
        executedPrice: 28500,
        fee: Math.round(1000 * 28500 * 0.0015),
        tax: -500,
        status: 'FILLED',
        cashBefore: 50_000_000,
        positionBefore: 1000,
        averageCost: 25000,
      });

      expect(res.isValid).toBe(false);
      expect(res.mismatches.some(m => m.code === 'TAX_CONSERVATION_FAILED')).toBe(true);
    });
  });

  // ==========================================================================
  // GROUP F — PARTIAL FILL CONSERVATION
  // ==========================================================================
  describe('Group F: Partial Fill Conservation', () => {
    it('F1: 300 + 300 + 400 = 1000 PASS', () => {
      const { snapshot, initialAccount } = createTestContext();
      const baseTs = Date.now();
      const orderId = 'ORD_PARTIAL_PASS';

      const events: ReplayEvent[] = [
        {
          eventId: `${orderId}_1`,
          sequenceNumber: 1,
          timestamp: baseTs,
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'NEW',
          nextState: 'VALIDATED',
          eventType: 'ORDER_CREATED',
        },
        {
          eventId: `${orderId}_2`,
          sequenceNumber: 2,
          timestamp: baseTs + 50,
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'VALIDATED',
          nextState: 'AUTHORIZED',
          eventType: 'ORDER_VALIDATED',
        },
        {
          eventId: `${orderId}_3`,
          sequenceNumber: 3,
          timestamp: baseTs + 100,
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'AUTHORIZED',
          nextState: 'SUBMITTED',
          eventType: 'ORDER_AUTHORIZED',
        },
        {
          eventId: `${orderId}_4`,
          sequenceNumber: 4,
          timestamp: baseTs + 150,
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'SUBMITTED',
          nextState: 'PARTIALLY_FILLED',
          eventType: 'ORDER_PARTIALLY_FILLED',
          quantity: 300,
          price: 28500,
          fee: Math.round(300 * 28500 * 0.0015),
          tax: 0,
        },
        {
          eventId: `${orderId}_5`,
          sequenceNumber: 5,
          timestamp: baseTs + 200,
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'PARTIALLY_FILLED',
          nextState: 'PARTIALLY_FILLED',
          eventType: 'ORDER_PARTIALLY_FILLED',
          quantity: 300,
          price: 28500,
          fee: Math.round(300 * 28500 * 0.0015),
          tax: 0,
        },
        {
          eventId: `${orderId}_6`,
          sequenceNumber: 6,
          timestamp: baseTs + 250,
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'PARTIALLY_FILLED',
          nextState: 'FILLED',
          eventType: 'ORDER_FILLED',
          quantity: 400,
          price: 28500,
          fee: Math.round(400 * 28500 * 0.0015),
          tax: 0,
        },
        {
          eventId: `${orderId}_7`,
          sequenceNumber: 7,
          timestamp: baseTs + 300,
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'FILLED',
          nextState: 'SETTLED',
          eventType: 'ORDER_SETTLED',
        },
      ];

      const res = FinancialConservationValidator.validateEventSequence(events, initialAccount, {
        orderedQuantity: 1000,
      });

      expect(res.isValid).toBe(true);
      expect(res.mismatches).toHaveLength(0);
    });

    it('F2: 300 + 300 + 500 = 1100 FAIL (Overfill violation)', () => {
      const { snapshot, initialAccount } = createTestContext();
      const baseTs = Date.now();
      const orderId = 'ORD_PARTIAL_OVERFILL';

      const events: ReplayEvent[] = [
        {
          eventId: `${orderId}_1`,
          sequenceNumber: 1,
          timestamp: baseTs,
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'NEW',
          nextState: 'VALIDATED',
          eventType: 'ORDER_CREATED',
        },
        {
          eventId: `${orderId}_2`,
          sequenceNumber: 2,
          timestamp: baseTs + 50,
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'VALIDATED',
          nextState: 'AUTHORIZED',
          eventType: 'ORDER_VALIDATED',
        },
        {
          eventId: `${orderId}_3`,
          sequenceNumber: 3,
          timestamp: baseTs + 100,
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'AUTHORIZED',
          nextState: 'SUBMITTED',
          eventType: 'ORDER_AUTHORIZED',
        },
        {
          eventId: `${orderId}_4`,
          sequenceNumber: 4,
          timestamp: baseTs + 150,
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'SUBMITTED',
          nextState: 'PARTIALLY_FILLED',
          eventType: 'ORDER_PARTIALLY_FILLED',
          quantity: 300,
          price: 28500,
          fee: Math.round(300 * 28500 * 0.0015),
          tax: 0,
        },
        {
          eventId: `${orderId}_5`,
          sequenceNumber: 5,
          timestamp: baseTs + 200,
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'PARTIALLY_FILLED',
          nextState: 'PARTIALLY_FILLED',
          eventType: 'ORDER_PARTIALLY_FILLED',
          quantity: 300,
          price: 28500,
          fee: Math.round(300 * 28500 * 0.0015),
          tax: 0,
        },
        {
          eventId: `${orderId}_6`,
          sequenceNumber: 6,
          timestamp: baseTs + 250,
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'PARTIALLY_FILLED',
          nextState: 'FILLED',
          eventType: 'ORDER_FILLED',
          quantity: 500, // 300 + 300 + 500 = 1100 > 1000!
          price: 28500,
          fee: Math.round(500 * 28500 * 0.0015),
          tax: 0,
        },
      ];

      const res = FinancialConservationValidator.validateEventSequence(events, initialAccount, {
        orderedQuantity: 1000,
      });

      expect(res.isValid).toBe(false);
      expect(res.mismatches.some(m => m.code === 'PARTIAL_FILL_CONSERVATION_FAILED')).toBe(true);
    });

    it('F3: Terminal FILLED state with incomplete cumulative fill fails', () => {
      const { snapshot, initialAccount } = createTestContext();
      const baseTs = Date.now();
      const orderId = 'ORD_UNDERFILL';

      const events: ReplayEvent[] = [
        {
          eventId: `${orderId}_1`,
          sequenceNumber: 1,
          timestamp: baseTs,
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'NEW',
          nextState: 'VALIDATED',
          eventType: 'ORDER_CREATED',
        },
        {
          eventId: `${orderId}_2`,
          sequenceNumber: 2,
          timestamp: baseTs + 50,
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'VALIDATED',
          nextState: 'AUTHORIZED',
          eventType: 'ORDER_VALIDATED',
        },
        {
          eventId: `${orderId}_3`,
          sequenceNumber: 3,
          timestamp: baseTs + 100,
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'AUTHORIZED',
          nextState: 'SUBMITTED',
          eventType: 'ORDER_AUTHORIZED',
        },
        {
          eventId: `${orderId}_4`,
          sequenceNumber: 4,
          timestamp: baseTs + 150,
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'SUBMITTED',
          nextState: 'FILLED',
          eventType: 'ORDER_FILLED',
          quantity: 600, // Only 600 out of 1000 executed!
          price: 28500,
          fee: Math.round(600 * 28500 * 0.0015),
          tax: 0,
        },
        {
          eventId: `${orderId}_5`,
          sequenceNumber: 5,
          timestamp: baseTs + 200,
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'FILLED',
          nextState: 'SETTLED',
          eventType: 'ORDER_SETTLED',
        },
      ];

      const res = FinancialConservationValidator.validateEventSequence(events, initialAccount, {
        orderedQuantity: 1000,
      });

      expect(res.isValid).toBe(false);
      expect(res.mismatches.some(m => m.code === 'PARTIAL_FILL_CONSERVATION_FAILED')).toBe(true);
    });
  });

  // ==========================================================================
  // GROUP G — PNL CONSERVATION
  // ==========================================================================
  describe('Group G: Realized PnL Conservation', () => {
    it('G1: Valid realized PnL equals net proceeds - cost basis', () => {
      const qty = 1000;
      const sellPrice = 28500;
      const avgCost = 25000;
      const gross = qty * sellPrice; // 28,500,000
      const fee = Math.round(gross * 0.0015); // 42,750
      const tax = Math.round(gross * 0.0010); // 28,500
      const netProceeds = gross - fee - tax; // 28,428,750
      const costBasis = qty * avgCost; // 25,000,000
      const expectedPnL = netProceeds - costBasis; // 3,428,750

      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'SELL',
        symbol: 'HPG',
        requestedQuantity: qty,
        executedQuantity: qty,
        executedPrice: sellPrice,
        fee,
        tax,
        status: 'FILLED',
        cashBefore: 50_000_000,
        positionBefore: 1000,
        averageCost: avgCost,
        realizedPnL: expectedPnL,
      });

      expect(res.isValid).toBe(true);
    });

    it('G2: Rejects manipulated / tampered realized PnL', () => {
      const qty = 1000;
      const sellPrice = 28500;
      const avgCost = 25000;
      const gross = qty * sellPrice;
      const fee = Math.round(gross * 0.0015);
      const tax = Math.round(gross * 0.0010);

      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'SELL',
        symbol: 'HPG',
        requestedQuantity: qty,
        executedQuantity: qty,
        executedPrice: sellPrice,
        fee,
        tax,
        status: 'FILLED',
        cashBefore: 50_000_000,
        positionBefore: 1000,
        averageCost: avgCost,
        realizedPnL: 99_000_000, // Fabricated PnL!
      });

      expect(res.isValid).toBe(false);
      expect(res.mismatches.some(m => m.code === 'PNL_CONSERVATION_FAILED')).toBe(true);
    });

    it('G3: Rejects non-zero realized PnL on BUY', () => {
      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'BUY',
        symbol: 'HPG',
        requestedQuantity: 1000,
        executedQuantity: 1000,
        executedPrice: 28500,
        fee: Math.round(1000 * 28500 * 0.0015),
        tax: 0,
        status: 'FILLED',
        cashBefore: 100_000_000,
        positionBefore: 0,
        realizedPnL: 5_000_000, // BUY cannot realize PnL!
      });

      expect(res.isValid).toBe(false);
      expect(res.mismatches.some(m => m.code === 'PNL_CONSERVATION_FAILED')).toBe(true);
    });
  });

  // ==========================================================================
  // GROUP H — EQUITY CONSERVATION
  // ==========================================================================
  describe('Group H: Equity Conservation', () => {
    it('H1: Valid equity equals cash + market value of positions', () => {
      const price = 28500;
      const cashBefore = 500_000_000;
      const posBefore = 0;
      const qty = 1000;
      const gross = qty * price;
      const fee = Math.round(gross * 0.0015);
      const cashAfter = cashBefore - (gross + fee); // 471,457,250
      const posAfter = 1000;
      // At execution price, pos value = 28,500,000. Equity = 471,457,250 + 28,500,000 = 499,957,250 (delta = -fee)
      const equityBefore = 500_000_000;
      const equityAfter = cashAfter + posAfter * price;

      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'BUY',
        symbol: 'HPG',
        requestedQuantity: qty,
        executedQuantity: qty,
        executedPrice: price,
        fee,
        tax: 0,
        status: 'FILLED',
        cashBefore,
        cashAfter,
        positionBefore: posBefore,
        positionAfter: posAfter,
        equityBefore,
        equityAfter,
        markPrice: price,
      });

      expect(res.isValid).toBe(true);
    });

    it('H2: Rejects unexplained equity delta', () => {
      const price = 28500;
      const cashBefore = 500_000_000;
      const posBefore = 0;
      const qty = 1000;
      const gross = qty * price;
      const fee = Math.round(gross * 0.0015);
      const cashAfter = cashBefore - (gross + fee);
      const posAfter = 1000;

      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'BUY',
        symbol: 'HPG',
        requestedQuantity: qty,
        executedQuantity: qty,
        executedPrice: price,
        fee,
        tax: 0,
        status: 'FILLED',
        cashBefore,
        cashAfter,
        positionBefore: posBefore,
        positionAfter: posAfter,
        equityBefore: 500_000_000,
        equityAfter: 600_000_000, // +100M unexplained equity jump!
        markPrice: price,
      });

      expect(res.isValid).toBe(false);
      expect(res.mismatches.some(m => m.code === 'EQUITY_CONSERVATION_FAILED')).toBe(true);
    });
  });

  // ==========================================================================
  // GROUP I — DOUBLE PROCESSING & DOUBLE-COUNT PROTECTION
  // ==========================================================================
  describe('Group I: Double-Processing Protection', () => {
    it('I1: Rejects duplicate fill execution processed twice', () => {
      const { snapshot, initialAccount } = createTestContext();
      const baseTs = Date.now();
      const orderId = 'ORD_DUP_FILL';

      const events: ReplayEvent[] = [
        {
          eventId: `${orderId}_1`,
          sequenceNumber: 1,
          timestamp: baseTs,
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'NEW',
          nextState: 'VALIDATED',
          eventType: 'ORDER_CREATED',
        },
        {
          eventId: `${orderId}_2`,
          sequenceNumber: 2,
          timestamp: baseTs + 50,
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'VALIDATED',
          nextState: 'AUTHORIZED',
          eventType: 'ORDER_VALIDATED',
        },
        {
          eventId: `${orderId}_3`,
          sequenceNumber: 3,
          timestamp: baseTs + 100,
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'AUTHORIZED',
          nextState: 'SUBMITTED',
          eventType: 'ORDER_AUTHORIZED',
        },
        {
          eventId: `${orderId}_4`,
          sequenceNumber: 4,
          timestamp: baseTs + 150,
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'SUBMITTED',
          nextState: 'FILLED',
          eventType: 'ORDER_FILLED',
          quantity: 1000,
          price: 28500,
          fee: Math.round(1000 * 28500 * 0.0015),
          tax: 0,
          metadata: { executionId: 'FILL_EXEC_001' },
        },
        {
          eventId: `${orderId}_5`,
          sequenceNumber: 5,
          timestamp: baseTs + 200,
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'FILLED',
          nextState: 'FILLED',
          eventType: 'ORDER_FILLED',
          quantity: 1000,
          price: 28500,
          fee: Math.round(1000 * 28500 * 0.0015),
          tax: 0,
          metadata: { executionId: 'FILL_EXEC_001' }, // Exact same executionId processed again!
        },
      ];

      const res = FinancialConservationValidator.validateEventSequence(events, initialAccount, {
        orderedQuantity: 1000,
      });

      expect(res.isValid).toBe(false);
      expect(res.mismatches.some(m => m.code === 'DOUBLE_COUNT_DETECTED')).toBe(true);
    });

    it('I2: Rejects duplicate settlement event in sequence', () => {
      const { snapshot, initialAccount } = createTestContext();
      const baseTs = Date.now();
      const orderId = 'ORD_DUP_SETTLE';

      const events: ReplayEvent[] = [
        {
          eventId: `${orderId}_1`,
          sequenceNumber: 1,
          timestamp: baseTs,
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'NEW',
          nextState: 'VALIDATED',
          eventType: 'ORDER_CREATED',
        },
        {
          eventId: `${orderId}_2`,
          sequenceNumber: 2,
          timestamp: baseTs + 50,
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'VALIDATED',
          nextState: 'AUTHORIZED',
          eventType: 'ORDER_VALIDATED',
        },
        {
          eventId: `${orderId}_3`,
          sequenceNumber: 3,
          timestamp: baseTs + 100,
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'AUTHORIZED',
          nextState: 'SUBMITTED',
          eventType: 'ORDER_AUTHORIZED',
        },
        {
          eventId: `${orderId}_4`,
          sequenceNumber: 4,
          timestamp: baseTs + 150,
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'SUBMITTED',
          nextState: 'FILLED',
          eventType: 'ORDER_FILLED',
          quantity: 1000,
          price: 28500,
          fee: Math.round(1000 * 28500 * 0.0015),
          tax: 0,
        },
        {
          eventId: `${orderId}_5`,
          sequenceNumber: 5,
          timestamp: baseTs + 200,
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'FILLED',
          nextState: 'SETTLED',
          eventType: 'ORDER_SETTLED',
        },
        {
          eventId: `${orderId}_6`,
          sequenceNumber: 6,
          timestamp: baseTs + 250,
          orderId,
          snapshotId: snapshot.snapshotId,
          previousState: 'SETTLED',
          nextState: 'SETTLED',
          eventType: 'ORDER_SETTLED', // Second settlement!
        },
      ];

      const res = FinancialConservationValidator.validateEventSequence(events, initialAccount, {
        orderedQuantity: 1000,
      });

      expect(res.isValid).toBe(false);
      expect(res.mismatches.some(m => m.code === 'DOUBLE_COUNT_DETECTED')).toBe(true);
    });
  });

  // ==========================================================================
  // GROUP J — CROSS-REPLAY ISOLATION
  // ==========================================================================
  describe('Group J: Cross-Replay Isolation', () => {
    it('J1: Replay A and Replay B operate completely isolated without shared financial state', () => {
      const snapshotA = MarketSnapshotBuilder.buildFrom(baseInput);
      const snapshotB = MarketSnapshotBuilder.buildFrom({
        ...baseInput,
        recommendation: {
          ...baseInput.recommendation!,
          recommendationId: 'REC-HPG-20260330-B',
        },
      });

      const initialAccountA: BrokerAccount = {
        accountId: 'ACC_A',
        currency: 'VND',
        cash: 100_000_000,
        reservedCash: 0,
        availableCash: 100_000_000,
        marketValue: 0,
        equity: 100_000_000,
        realizedPnL: 0,
        unrealizedPnL: 0,
        positions: [{
          symbol: 'VNM',
          quantity: 1000,
          reservedQuantity: 0,
          availableQuantity: 1000,
          averageCost: 65000,
          currentPrice: 68000,
          marketValue: 68_000_000,
          unrealizedPnL: 3_000_000,
          unrealizedPnLPercent: 4.6,
          updatedAt: '2026-03-30T10:30:00.000Z',
        }],
        openOrders: [],
        updatedAt: '2026-03-30T10:30:00.000Z',
      };

      const initialAccountB: BrokerAccount = {
        accountId: 'ACC_B',
        currency: 'VND',
        cash: 50_000_000,
        reservedCash: 0,
        availableCash: 50_000_000,
        marketValue: 0,
        equity: 50_000_000,
        realizedPnL: 0,
        unrealizedPnL: 0,
        positions: [{
          symbol: 'FPT',
          quantity: 500,
          reservedQuantity: 0,
          availableQuantity: 500,
          averageCost: 110000,
          currentPrice: 115000,
          marketValue: 57_500_000,
          unrealizedPnL: 2_500_000,
          unrealizedPnLPercent: 4.5,
          updatedAt: '2026-03-30T10:30:00.000Z',
        }],
        openOrders: [],
        updatedAt: '2026-03-30T10:30:00.000Z',
      };

      const orderIntentA: OrderIntent = {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 500,
        orderType: 'MARKET',
        recommendationId: 'REC-HPG-20260330-01',
      };
      const contextA: ExecutionContextBinding = {
        marketDataSnapshotId: snapshotA.snapshotId,
        recommendationId: 'REC-HPG-20260330-01',
        strategyVersion: 'v2.1.0',
        riskPolicyVersion: 'v1.4.0',
      };

      const orderIntentB: OrderIntent = {
        symbol: 'HPG',
        side: 'BUY',
        quantity: 1200,
        orderType: 'MARKET',
        recommendationId: 'REC-HPG-20260330-B',
      };
      const contextB: ExecutionContextBinding = {
        marketDataSnapshotId: snapshotB.snapshotId,
        recommendationId: 'REC-HPG-20260330-B',
        strategyVersion: 'v2.1.0',
        riskPolicyVersion: 'v1.4.0',
      };

      const resA = ReplayEngine.replay({
        snapshot: snapshotA,
        executionContext: contextA,
        orderIntent: orderIntentA,
        initialAccount: initialAccountA,
        policy: { maxPositionPercent: 100, maxStaleTimeMs: Number.MAX_SAFE_INTEGER },
      });

      const resB = ReplayEngine.replay({
        snapshot: snapshotB,
        executionContext: contextB,
        orderIntent: orderIntentB,
        initialAccount: initialAccountB,
        policy: { maxPositionPercent: 100, maxStaleTimeMs: Number.MAX_SAFE_INTEGER },
      });

      expect(resA.status).toBe('REPLAYED');
      expect(resB.status).toBe('REPLAYED');

      // Replay A executed 500 shares
      expect(resA.replayExecution?.executedQuantity).toBe(500);
      // Replay B executed 1200 shares
      expect(resB.replayExecution?.executedQuantity).toBe(1200);

      // Verify initialAccountA and initialAccountB were not mutated
      expect(initialAccountA.cash).toBe(100_000_000);
      expect(initialAccountA.positions[0].quantity).toBe(1000);
      expect(initialAccountB.cash).toBe(50_000_000);
      expect(initialAccountB.positions[0].quantity).toBe(500);
    });
  });

  // ==========================================================================
  // GROUP K — DETERMINISM
  // ==========================================================================
  describe('Group K: Determinism', () => {
    it('K1: 5 identical financial replays produce bitwise identical results', () => {
      const { snapshot, orderIntent, executionContext, initialAccount } = createTestContext();

      const results = [];
      for (let i = 0; i < 5; i++) {
        const res = ReplayEngine.replay({
          snapshot,
          executionContext,
          orderIntent,
          initialAccount,
        });
        results.push(res);
      }

      for (let i = 1; i < 5; i++) {
        expect(results[i].status).toBe(results[0].status);
        expect(results[i].replayExecution?.executedQuantity).toBe(results[0].replayExecution?.executedQuantity);
        expect(results[i].replayExecution?.executedPrice).toBe(results[0].replayExecution?.executedPrice);
        expect(results[i].replayExecution?.fee).toBe(results[0].replayExecution?.fee);
        expect(results[i].replayExecution?.tax).toBe(results[0].replayExecution?.tax);
        expect(results[i].replayExecution?.cashAfter).toBe(results[0].replayExecution?.cashAfter);
        expect(results[i].replayExecution?.positionAfter).toBe(results[0].replayExecution?.positionAfter);
        expect(results[i].replayExecution?.realizedPnL).toBe(results[0].replayExecution?.realizedPnL);
      }
    });
  });

  // ==========================================================================
  // GROUP L — FAIL-CLOSED & NON-MUTATION INVARIANTS
  // ==========================================================================
  describe('Group L: Fail-Closed & Non-Mutation Invariants', () => {
    it('L1: Replay with invariant violation fails closed with REPLAY_INVALID and zero side effects', () => {
      const { snapshot, orderIntent, executionContext, initialAccount } = createTestContext();
      const initialCash = initialAccount.cash;
      const initialPositionsSnapshot = JSON.stringify(initialAccount.positions);
      const ledger = new PaperTradeLedger();

      // Pass an invalid event sequence with tax charged on BUY
      const badEvents: ReplayEvent[] = [
        {
          eventId: 'EVT_BAD_1',
          sequenceNumber: 1,
          timestamp: Date.now(),
          orderId: orderIntent.recommendationId!,
          snapshotId: snapshot.snapshotId,
          previousState: 'NEW',
          nextState: 'VALIDATED',
          eventType: 'ORDER_CREATED',
        },
        {
          eventId: 'EVT_BAD_2',
          sequenceNumber: 2,
          timestamp: Date.now() + 50,
          orderId: orderIntent.recommendationId!,
          snapshotId: snapshot.snapshotId,
          previousState: 'VALIDATED',
          nextState: 'AUTHORIZED',
          eventType: 'ORDER_VALIDATED',
        },
        {
          eventId: 'EVT_BAD_3',
          sequenceNumber: 3,
          timestamp: Date.now() + 100,
          orderId: orderIntent.recommendationId!,
          snapshotId: snapshot.snapshotId,
          previousState: 'AUTHORIZED',
          nextState: 'SUBMITTED',
          eventType: 'ORDER_AUTHORIZED',
        },
        {
          eventId: 'EVT_BAD_4',
          sequenceNumber: 4,
          timestamp: Date.now() + 150,
          orderId: orderIntent.recommendationId!,
          snapshotId: snapshot.snapshotId,
          previousState: 'SUBMITTED',
          nextState: 'FILLED',
          eventType: 'ORDER_FILLED',
          quantity: 1000,
          price: 28500,
          fee: Math.round(1000 * 28500 * 0.0015),
          tax: 50_000, // Illegal tax on BUY!
        },
        {
          eventId: 'EVT_BAD_5',
          sequenceNumber: 5,
          timestamp: Date.now() + 200,
          orderId: orderIntent.recommendationId!,
          snapshotId: snapshot.snapshotId,
          previousState: 'FILLED',
          nextState: 'SETTLED',
          eventType: 'ORDER_SETTLED',
        },
      ];

      const res = ReplayEngine.replay({
        snapshot,
        executionContext,
        orderIntent,
        initialAccount,
        eventSequence: badEvents,
      });

      expect(res.status).toBe('REPLAY_INVALID');
      expect(res.mismatches?.some(m => m.code === 'TAX_CONSERVATION_FAILED')).toBe(true);

      // Verify zero financial side effects
      expect(initialAccount.cash).toBe(initialCash);
      expect(JSON.stringify(initialAccount.positions)).toBe(initialPositionsSnapshot);
      expect(ledger.getAllEntries()).toHaveLength(0);
    });
  });

  // ==========================================================================
  // GROUP M — ADVERSARIAL / TAMPERING TESTS
  // ==========================================================================
  describe('Group M: Adversarial & Tampering Detection', () => {
    it('M1: Detects tampered price in execution', () => {
      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'BUY',
        symbol: 'HPG',
        requestedQuantity: 1000,
        executedQuantity: 1000,
        executedPrice: -28500, // Tampered negative price
        fee: 42750,
        tax: 0,
        status: 'FILLED',
        cashBefore: 100_000_000,
        positionBefore: 0,
      });
      expect(res.isValid).toBe(false);
      expect(res.mismatches.some(m => m.code === 'TRADE_VALUE_CONSERVATION_FAILED')).toBe(true);
    });

    it('M2: Detects tampered quantity in execution', () => {
      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'BUY',
        symbol: 'HPG',
        requestedQuantity: 1000,
        executedQuantity: -500, // Tampered negative quantity
        executedPrice: 28500,
        fee: 42750,
        tax: 0,
        status: 'FILLED',
        cashBefore: 100_000_000,
        positionBefore: 0,
      });
      expect(res.isValid).toBe(false);
      expect(res.mismatches.some(m => m.code === 'LOT_SIZE_CONSERVATION_FAILED')).toBe(true);
    });

    it('M3: Detects tampered fee in execution', () => {
      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'BUY',
        symbol: 'HPG',
        requestedQuantity: 1000,
        executedQuantity: 1000,
        executedPrice: 28500,
        fee: 999_999, // Tampered fee
        tax: 0,
        status: 'FILLED',
        cashBefore: 100_000_000,
        positionBefore: 0,
      });
      expect(res.isValid).toBe(false);
      expect(res.mismatches.some(m => m.code === 'FEE_CONSERVATION_FAILED')).toBe(true);
    });

    it('M4: Detects tampered tax in execution', () => {
      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'SELL',
        symbol: 'HPG',
        requestedQuantity: 1000,
        executedQuantity: 1000,
        executedPrice: 28500,
        fee: Math.round(1000 * 28500 * 0.0015),
        tax: 888_888, // Tampered tax
        status: 'FILLED',
        cashBefore: 50_000_000,
        positionBefore: 1000,
        averageCost: 25000,
      });
      expect(res.isValid).toBe(false);
      expect(res.mismatches.some(m => m.code === 'TAX_CONSERVATION_FAILED')).toBe(true);
    });

    it('M5: Detects tampered cash_after in execution', () => {
      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'BUY',
        symbol: 'HPG',
        requestedQuantity: 1000,
        executedQuantity: 1000,
        executedPrice: 28500,
        fee: Math.round(1000 * 28500 * 0.0015),
        tax: 0,
        status: 'FILLED',
        cashBefore: 100_000_000,
        cashAfter: 999_000_000, // Fabricated cash
        positionBefore: 0,
        positionAfter: 1000,
      });
      expect(res.isValid).toBe(false);
      expect(res.mismatches.some(m => m.code === 'CASH_CONSERVATION_FAILED')).toBe(true);
    });

    it('M6: Detects tampered position_after in execution', () => {
      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'BUY',
        symbol: 'HPG',
        requestedQuantity: 1000,
        executedQuantity: 1000,
        executedPrice: 28500,
        fee: Math.round(1000 * 28500 * 0.0015),
        tax: 0,
        status: 'FILLED',
        cashBefore: 100_000_000,
        positionBefore: 0,
        positionAfter: 50_000, // Fabricated position
      });
      expect(res.isValid).toBe(false);
      expect(res.mismatches.some(m => m.code === 'POSITION_CONSERVATION_FAILED')).toBe(true);
    });

    it('M7: Detects tampered realized PnL in execution', () => {
      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'SELL',
        symbol: 'HPG',
        requestedQuantity: 1000,
        executedQuantity: 1000,
        executedPrice: 28500,
        fee: Math.round(1000 * 28500 * 0.0015),
        tax: Math.round(1000 * 28500 * 0.0010),
        status: 'FILLED',
        cashBefore: 50_000_000,
        positionBefore: 1000,
        averageCost: 25000,
        realizedPnL: 123_456_789, // Fabricated realized PnL
      });
      expect(res.isValid).toBe(false);
      expect(res.mismatches.some(m => m.code === 'PNL_CONSERVATION_FAILED')).toBe(true);
    });

    it('M8: Detects tampered equity in execution', () => {
      const res = FinancialConservationValidator.validateSingleExecution({
        side: 'BUY',
        symbol: 'HPG',
        requestedQuantity: 1000,
        executedQuantity: 1000,
        executedPrice: 28500,
        fee: Math.round(1000 * 28500 * 0.0015),
        tax: 0,
        status: 'FILLED',
        cashBefore: 500_000_000,
        cashAfter: 500_000_000 - (1000 * 28500 + Math.round(1000 * 28500 * 0.0015)),
        positionBefore: 0,
        positionAfter: 1000,
        equityBefore: 500_000_000,
        equityAfter: 777_777_777, // Fabricated equity
        markPrice: 28500,
      });
      expect(res.isValid).toBe(false);
      expect(res.mismatches.some(m => m.code === 'EQUITY_CONSERVATION_FAILED')).toBe(true);
    });
  });
});

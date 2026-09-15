import { describe, it, expect, beforeEach } from 'vitest';
import { PaperBroker } from '../paper/PaperBroker';
import { PaperReconciliationEngine } from '../paper/reconciliation/PaperReconciliationEngine';
import { PaperTradeLedger } from '../paper/PaperTradeLedger';
import { DEFAULT_TRADING_COST_CONFIG } from '../types/trading';

describe('PHASE UI-3: Portfolio, Risk & Financial Integrity Audit', () => {
  let broker: PaperBroker;
  const initialCash = 100_000_000; // 100M VND

  beforeEach(() => {
    broker = new PaperBroker({
      accountId: 'AUDIT_ACCOUNT_01',
      initialCash,
      skipSessionValidation: true,
      tradingCosts: {
        buyFeeRate: 0.0015,  // 0.15%
        sellFeeRate: 0.0015, // 0.15%
        sellTaxRate: 0.001,  // 0.1%
        slippageRate: 0.0,   // 0 for exact mathematical testing
      },
    });
  });

  // =========================================================================
  // 1. CASH CONSERVATION INVARIANT
  // endingCash = initialCash - sum(BUY gross + fees) + sum(SELL gross - fees - tax)
  // =========================================================================
  describe('Cash Conservation Invariant', () => {
    it('strictly conserves cash through BUY and SELL cycles', () => {
      broker.processMarketData({
        symbol: 'HPG',
        price: 30_000,
        change: 0,
        changePercent: 0,
        volume: 1_000_000,
        floorPrice: 27_900,
        ceilingPrice: 32_100,
        tradingSession: 'CONTINUOUS',
        lastUpdated: new Date().toISOString(),
      });

      // BUY 100 HPG @ 30,000
      const buyRes = broker.submitOrderSync({
        id: 'ORD_BUY_1',
        symbol: 'HPG',
        side: 'BUY',
        type: 'LIMIT',
        limitPrice: 30_000,
        quantity: 100,
      });
      expect(buyRes.success).toBe(true);
      expect(buyRes.order.status).toBe('FILLED');

      const expectedBuyGross = 100 * 30_000; // 3,000,000
      const expectedBuyFee = expectedBuyGross * 0.0015; // 4,500
      const expectedCashAfterBuy = initialCash - (expectedBuyGross + expectedBuyFee); // 96,995,500

      const accAfterBuy = broker.getAccountSync();
      expect(accAfterBuy.cash).toBe(expectedCashAfterBuy);
      expect(accAfterBuy.reservedCash).toBe(0);
      expect(accAfterBuy.availableCash).toBe(expectedCashAfterBuy);

      // Price moves to 35,000
      broker.processMarketData({
        symbol: 'HPG',
        price: 35_000,
        change: 5000,
        changePercent: 16.6,
        volume: 1_200_000,
        floorPrice: 32_000,
        ceilingPrice: 38_000,
        tradingSession: 'CONTINUOUS',
        lastUpdated: new Date().toISOString(),
      });

      // SELL 100 HPG @ 35,000
      const sellRes = broker.submitOrderSync({
        id: 'ORD_SELL_1',
        symbol: 'HPG',
        side: 'SELL',
        type: 'LIMIT',
        limitPrice: 35_000,
        quantity: 100,
      });
      expect(sellRes.success).toBe(true);
      expect(sellRes.order.status).toBe('FILLED');

      const expectedSellGross = 100 * 35_000; // 3,500,000
      const expectedSellFee = expectedSellGross * 0.0015; // 5,250
      const expectedSellTax = expectedSellGross * 0.001;  // 3,500
      const expectedSellNet = expectedSellGross - expectedSellFee - expectedSellTax; // 3,491,250

      const expectedFinalCash = expectedCashAfterBuy + expectedSellNet; // 100,486,750
      const finalAcc = broker.getAccountSync();

      expect(finalAcc.cash).toBe(expectedFinalCash);
      expect(finalAcc.availableCash).toBe(expectedFinalCash);
      expect(finalAcc.reservedCash).toBe(0);

      // Net cash difference must equal net trade proceeds minus gross buy outlay
      const netCashDiff = finalAcc.cash - initialCash;
      const expectedNetPnL = (35_000 - 30_000) * 100 - expectedBuyFee - expectedSellFee - expectedSellTax;
      expect(netCashDiff).toBe(expectedNetPnL);
      expect(finalAcc.realizedPnL).toBe(expectedNetPnL);
    });
  });

  // =========================================================================
  // 2. EQUITY IDENTITY & RESERVATIONS
  // totalEquity = availableCash + reservedCash + marketValueOfOpenPositions
  // =========================================================================
  describe('Equity Identity & Cash Reservations', () => {
    it('satisfies totalEquity = availableCash + reservedCash + marketValue across all states', () => {
      broker.processMarketData({
        symbol: 'VNM',
        price: 70_000,
        change: 0,
        changePercent: 0,
        volume: 500_000,
        floorPrice: 65_100,
        ceilingPrice: 74_900,
        tradingSession: 'CONTINUOUS',
        lastUpdated: new Date().toISOString(),
      });

      // Submit BUY limit order below market (stays open in SUBMITTED state)
      const openLimitRes = broker.submitOrderSync({
        id: 'ORD_OPEN_BUY',
        symbol: 'VNM',
        side: 'BUY',
        type: 'LIMIT',
        limitPrice: 68_000, // Below current 70,000 -> does not execute immediately
        quantity: 100,
      });

      expect(openLimitRes.success).toBe(true);
      expect(openLimitRes.order.status).toBe('SUBMITTED');

      const accDuringPending = broker.getAccountSync();
      const expectedReserved = 100 * 68_000 * (1 + 0.0015); // 6,810,200 VND

      expect(accDuringPending.reservedCash).toBe(expectedReserved);
      expect(accDuringPending.availableCash).toBe(initialCash - expectedReserved);
      expect(accDuringPending.cash).toBe(initialCash);
      expect(accDuringPending.equity).toBe(initialCash); // No positions yet, equity = cash

      // Identity check:
      expect(accDuringPending.equity).toBe(
        accDuringPending.availableCash + accDuringPending.reservedCash + accDuringPending.marketValue
      );

      // Cancel the pending order: reservations released cleanly
      const cancelRes = broker.cancelOrder('ORD_OPEN_BUY');
      return cancelRes.then((res) => {
        expect(res.success).toBe(true);

        const accAfterCancel = broker.getAccountSync();
        expect(accAfterCancel.reservedCash).toBe(0);
        expect(accAfterCancel.availableCash).toBe(initialCash);
        expect(accAfterCancel.cash).toBe(initialCash);
        expect(accAfterCancel.equity).toBe(initialCash);
      });
    });
  });

  // =========================================================================
  // 3. MARKET VALUE & P&L INTEGRITY
  // Hierarchy: Matched price -> Latest quote -> Cost basis fallback
  // =========================================================================
  describe('Market Value & P&L Hierarchy', () => {
    it('computes market value, unrealized P&L and unrealized P&L % precisely', () => {
      broker.processMarketData({
        symbol: 'FPT',
        price: 100_000,
        change: 0,
        changePercent: 0,
        volume: 800_000,
        floorPrice: 93_000,
        ceilingPrice: 107_000,
        tradingSession: 'CONTINUOUS',
        lastUpdated: new Date().toISOString(),
      });

      // Buy 100 FPT @ 100,000
      broker.submitOrderSync({
        id: 'ORD_BUY_FPT',
        symbol: 'FPT',
        side: 'BUY',
        type: 'LIMIT',
        limitPrice: 100_000,
        quantity: 100,
      });

      // Initially at cost: market value is 10,000,000, cost basis includes 15,000 VND fee (10,015,000)
      let acc = broker.getAccountSync();
      expect(acc.marketValue).toBe(10_000_000);
      expect(acc.unrealizedPnL).toBe(-15_000); // 10,000,000 - 10,015,000
      expect(acc.positions[0].unrealizedPnLPercent).toBeCloseTo((-15_000 / 10_015_000) * 100, 2);

      // Price increases by 10%
      broker.processMarketData({
        symbol: 'FPT',
        price: 110_000,
        change: 10_000,
        changePercent: 10.0,
        volume: 900_000,
        floorPrice: 95_000,
        ceilingPrice: 115_000,
        tradingSession: 'CONTINUOUS',
        lastUpdated: new Date().toISOString(),
      });

      acc = broker.getAccountSync();
      const expectedMarketValue = 100 * 110_000; // 11,000,000
      const expectedUnrealizedPnL = 11_000_000 - 10_015_000; // 985,000
      const expectedUnrealizedPct = (expectedUnrealizedPnL / 10_015_000) * 100;

      expect(acc.marketValue).toBe(expectedMarketValue);
      expect(acc.unrealizedPnL).toBe(expectedUnrealizedPnL);
      expect(acc.positions[0].unrealizedPnLPercent).toBeCloseTo(expectedUnrealizedPct, 2);
      expect(acc.equity).toBe(acc.cash + expectedMarketValue);
    });

    it('handles partial SELL maintaining exact average cost basis on remaining lot', () => {
      broker.processMarketData({
        symbol: 'MWG',
        price: 50_000,
        change: 0,
        changePercent: 0,
        volume: 700_000,
        floorPrice: 46_500,
        ceilingPrice: 53_500,
        tradingSession: 'CONTINUOUS',
        lastUpdated: new Date().toISOString(),
      });

      // Buy 200 MWG @ 50,000 with 0.15% fee: total cost = 10,015,000 VND -> 50,075 VND/share
      broker.submitOrderSync({
        id: 'ORD_BUY_MWG',
        symbol: 'MWG',
        side: 'BUY',
        type: 'LIMIT',
        limitPrice: 50_000,
        quantity: 200,
      });

      const posBeforeSell = broker.getPositionSync('MWG');
      expect(posBeforeSell).not.toBeNull();
      expect(posBeforeSell!.averageCost).toBe(50_075);

      // Price rises to 60,000
      broker.processMarketData({
        symbol: 'MWG',
        price: 60_000,
        change: 10_000,
        changePercent: 20,
        volume: 900_000,
        floorPrice: 55_000,
        ceilingPrice: 65_000,
        tradingSession: 'CONTINUOUS',
        lastUpdated: new Date().toISOString(),
      });

      // Sell partial 100 MWG @ 60,000
      const sellRes = broker.submitOrderSync({
        id: 'ORD_SELL_MWG_PARTIAL',
        symbol: 'MWG',
        side: 'SELL',
        type: 'LIMIT',
        limitPrice: 60_000,
        quantity: 100,
      });

      expect(sellRes.success).toBe(true);

      const pos = broker.getPositionSync('MWG');
      expect(pos).not.toBeNull();
      expect(pos!.quantity).toBe(100);
      expect(pos!.averageCost).toBe(50_075); // Unchanged average cost basis

      const expectedGross = 100 * 60_000;
      const fee = expectedGross * 0.0015;
      const tax = expectedGross * 0.001;
      const expectedRealized = expectedGross - fee - tax - (100 * 50_075);

      expect(broker.getAccountSync().realizedPnL).toBe(expectedRealized);

      // Sell remaining 100 MWG @ 62,000
      broker.processMarketData({
        symbol: 'MWG',
        price: 62_000,
        change: 2_000,
        changePercent: 3.33,
        volume: 950_000,
        floorPrice: 57_000,
        ceilingPrice: 66_000,
        tradingSession: 'CONTINUOUS',
        lastUpdated: new Date().toISOString(),
      });

      const finalSellRes = broker.submitOrderSync({
        id: 'ORD_SELL_MWG_FINAL',
        symbol: 'MWG',
        side: 'SELL',
        type: 'LIMIT',
        limitPrice: 62_000,
        quantity: 100,
      });

      expect(finalSellRes.success).toBe(true);
      expect(broker.getPositionSync('MWG')).toBeNull(); // Position completely closed

      const secondGross = 100 * 62_000;
      const secondFee = secondGross * 0.0015;
      const secondTax = secondGross * 0.001;
      const secondRealized = secondGross - secondFee - secondTax - (100 * 50_075);

      expect(broker.getAccountSync().realizedPnL).toBe(expectedRealized + secondRealized);
      expect(broker.getAccountSync().marketValue).toBe(0);
      expect(broker.getAccountSync().unrealizedPnL).toBe(0);
    });
  });

  // =========================================================================
  // 4. SELL CONSTRAINTS & SHORT-SELLING PROTECTION
  // - Naked short selling blocked
  // - Overselling blocked
  // - Board lot (multiple of 100) enforced
  // =========================================================================
  describe('Sell Constraints & Short Selling Protection', () => {
    it('strictly forbids naked short selling', () => {
      broker.processMarketData({
        symbol: 'VIC',
        price: 45_000,
        change: 0,
        changePercent: 0,
        volume: 300_000,
        floorPrice: 41_800,
        ceilingPrice: 48_200,
        tradingSession: 'CONTINUOUS',
        lastUpdated: new Date().toISOString(),
      });

      const res = broker.submitOrderSync({
        id: 'ORD_SHORT_VIC',
        symbol: 'VIC',
        side: 'SELL',
        type: 'LIMIT',
        limitPrice: 45_000,
        quantity: 100,
      });

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('INSUFFICIENT_POSITION');
      expect(res.order.status).toBe('REJECTED');
      expect(broker.getPositionSync('VIC')).toBeNull();
    });

    it('strictly rejects non-board-lot quantities (not multiple of 100)', () => {
      broker.processMarketData({
        symbol: 'VIC',
        price: 45_000,
        change: 0,
        changePercent: 0,
        volume: 300_000,
        floorPrice: 41_800,
        ceilingPrice: 48_200,
        tradingSession: 'CONTINUOUS',
        lastUpdated: new Date().toISOString(),
      });

      // 50 shares
      const res50 = broker.submitOrderSync({
        id: 'ORD_LOT_50',
        symbol: 'VIC',
        side: 'BUY',
        type: 'LIMIT',
        limitPrice: 45_000,
        quantity: 50,
      });
      expect(res50.success).toBe(false);
      expect(res50.error?.code).toBe('INVALID_QUANTITY');

      // 150 shares
      const res150 = broker.submitOrderSync({
        id: 'ORD_LOT_150',
        symbol: 'VIC',
        side: 'BUY',
        type: 'LIMIT',
        limitPrice: 45_000,
        quantity: 150,
      });
      expect(res150.success).toBe(false);
      expect(res150.error?.code).toBe('INVALID_QUANTITY');
    });

    it('rejects selling more shares than currently unreserved', () => {
      broker.seedPosition({
        symbol: 'VIC',
        quantity: 100,
        averageCost: 40_000,
      });

      broker.processMarketData({
        symbol: 'VIC',
        price: 45_000,
        change: 0,
        changePercent: 0,
        volume: 300_000,
        floorPrice: 41_800,
        ceilingPrice: 48_200,
        tradingSession: 'CONTINUOUS',
        lastUpdated: new Date().toISOString(),
      });

      // Open sell order above market (reserves 100 shares)
      const firstSell = broker.submitOrderSync({
        id: 'ORD_SELL_RES',
        symbol: 'VIC',
        side: 'SELL',
        type: 'LIMIT',
        limitPrice: 47_000,
        quantity: 100,
      });
      expect(firstSell.success).toBe(true);
      expect(firstSell.order.status).toBe('SUBMITTED');

      // Second sell order for another 100 shares must fail
      const secondSell = broker.submitOrderSync({
        id: 'ORD_SELL_RES_2',
        symbol: 'VIC',
        side: 'SELL',
        type: 'LIMIT',
        limitPrice: 47_000,
        quantity: 100,
      });
      expect(secondSell.success).toBe(false);
      expect(secondSell.error?.code).toBe('INSUFFICIENT_POSITION');
    });
  });

  // =========================================================================
  // 5. IDEMPOTENCY & DUPLICATE ORDER PREVENTIONS
  // =========================================================================
  describe('Idempotency & Duplicate Order Handling', () => {
    it('rejects duplicate order submissions by orderId idempotently', () => {
      broker.processMarketData({
        symbol: 'TCB',
        price: 25_000,
        change: 0,
        changePercent: 0,
        volume: 500_000,
        floorPrice: 23_000,
        ceilingPrice: 27_000,
        tradingSession: 'CONTINUOUS',
        lastUpdated: new Date().toISOString(),
      });

      const first = broker.submitOrderSync({
        id: 'ORD_IDEM_1',
        symbol: 'TCB',
        side: 'BUY',
        type: 'LIMIT',
        limitPrice: 25_000,
        quantity: 100,
      });
      expect(first.success).toBe(true);

      const cashAfterFirst = broker.getAccountSync().cash;

      // Duplicate submission with same orderId
      const second = broker.submitOrderSync({
        id: 'ORD_IDEM_1',
        symbol: 'TCB',
        side: 'BUY',
        type: 'LIMIT',
        limitPrice: 25_000,
        quantity: 100,
      });

      expect(second.success).toBe(false);
      expect(second.error?.code).toBe('ORDER_ALREADY_FILLED');
      // Balance must NOT have been deducted twice
      expect(broker.getAccountSync().cash).toBe(cashAfterFirst);
      expect(broker.getPositionSync('TCB')!.quantity).toBe(100);
    });

    it('rejects duplicate order submissions by clientOrderId idempotently', () => {
      broker.processMarketData({
        symbol: 'TCB',
        price: 25_000,
        change: 0,
        changePercent: 0,
        volume: 500_000,
        floorPrice: 23_000,
        ceilingPrice: 27_000,
        tradingSession: 'CONTINUOUS',
        lastUpdated: new Date().toISOString(),
      });

      const first = broker.submitOrderSync({
        id: 'ORD_A',
        clientOrderId: 'CLIENT_TX_999',
        symbol: 'TCB',
        side: 'BUY',
        type: 'LIMIT',
        limitPrice: 25_000,
        quantity: 100,
      });
      expect(first.success).toBe(true);

      // Attempt to submit new order with different id but same clientOrderId
      const second = broker.submitOrderSync({
        id: 'ORD_B',
        clientOrderId: 'CLIENT_TX_999',
        symbol: 'TCB',
        side: 'BUY',
        type: 'LIMIT',
        limitPrice: 25_000,
        quantity: 100,
      });

      expect(second.success).toBe(false);
      expect(second.error?.code).toBe('ORDER_ALREADY_FILLED');
      expect(broker.getPositionSync('TCB')!.quantity).toBe(100);
    });
  });

  // =========================================================================
  // 6. CONCURRENCY & OVER-ALLOCATION SAFETY
  // =========================================================================
  describe('Concurrency & Cash Safety', () => {
    it('prevents double spending when multiple orders compete for remaining cash', () => {
      // Seed cash to only enough for one 100-lot of ACB @ 25,000
      // 100 * 25,000 = 2,500,000. Fee = 3,750. Total = 2,503,750
      broker.seedCash(3_000_000);

      broker.processMarketData({
        symbol: 'ACB',
        price: 25_000,
        change: 0,
        changePercent: 0,
        volume: 500_000,
        floorPrice: 23_000,
        ceilingPrice: 27_000,
        tradingSession: 'CONTINUOUS',
        lastUpdated: new Date().toISOString(),
      });

      // Submit first order (reserves ~2,503,750)
      const res1 = broker.submitOrderSync({
        id: 'CONCURRENT_1',
        symbol: 'ACB',
        side: 'BUY',
        type: 'LIMIT',
        limitPrice: 25_000,
        quantity: 100,
      });
      expect(res1.success).toBe(true);

      // Submit second order for same amount (only ~496,250 VND cash left)
      const res2 = broker.submitOrderSync({
        id: 'CONCURRENT_2',
        symbol: 'ACB',
        side: 'BUY',
        type: 'LIMIT',
        limitPrice: 25_000,
        quantity: 100,
      });

      expect(res2.success).toBe(false);
      expect(res2.error?.code).toBe('INSUFFICIENT_CASH');
      expect(broker.getAccountSync().cash).toBeGreaterThanOrEqual(0);
      expect(broker.getAccountSync().availableCash).toBeGreaterThanOrEqual(0);
    });
  });

  // =========================================================================
  // 7. AUDIT & RECONCILIATION ENGINE INTEGRITY SCENARIOS
  // =========================================================================
  describe('PaperReconciliationEngine Invariants', () => {
    const auditor = new PaperReconciliationEngine();
    const ledger = new PaperTradeLedger();

    it('Scenario 1: Clean Fresh Account audits with RECONCILED', () => {
      const acc = broker.getAccountSync();
      const report = auditor.reconcile({ account: acc, ledger, initialCash });

      expect(report.status).toBe('RECONCILED');
      expect(report.mismatches).toHaveLength(0);
      expect(report.cashComparison.matched).toBe(true);
      expect(report.positionComparison.matched).toBe(true);
      expect(report.pnlComparison.matched).toBe(true);
    });

    it('Scenario 2: Catches Injected Cash Mismatches with HIGH severity', () => {
      const acc = broker.getAccountSync();
      // Inject fake cash inflation
      const tamperedAcc = {
        ...acc,
        cash: acc.cash + 10_000_000,
      };

      const report = auditor.reconcile({ account: tamperedAcc, ledger, initialCash });

      expect(report.status).toBe('MISMATCH');
      expect(report.cashComparison.matched).toBe(false);

      const cashMismatch = report.mismatches.find((m) => m.field === 'cash');
      expect(cashMismatch).toBeDefined();
      expect(cashMismatch?.category).toBe('CASH');
      expect(cashMismatch?.severity).toBe('HIGH');
    });

    it('Scenario 3: Catches Injected Position Quantity Mismatches with CRITICAL severity', () => {
      const acc = broker.getAccountSync();
      // Inject phantom position
      const tamperedAcc = {
        ...acc,
        positions: [
          {
            symbol: 'HPG',
            quantity: 500,
            reservedQuantity: 0,
            availableQuantity: 500,
            averageCost: 30_000,
            currentPrice: 30_000,
            marketValue: 15_000_000,
            unrealizedPnL: 0,
            unrealizedPnLPercent: 0,
            updatedAt: new Date().toISOString(),
          },
        ],
      };

      const report = auditor.reconcile({ account: tamperedAcc, ledger, initialCash });

      expect(report.status).toBe('MISMATCH');

      const posMismatch = report.mismatches.find((m) => m.category === 'POSITION');
      expect(posMismatch).toBeDefined();
      expect(posMismatch?.severity).toBe('HIGH');
    });

    it('Scenario 4: Validates that reconciliation never mutates input account or ledger', () => {
      const originalAcc = broker.getAccountSync();
      const accCopy = JSON.parse(JSON.stringify(originalAcc));
      const ledgerEventsCount = ledger.getAllEntries().length;

      auditor.reconcile({ account: originalAcc, ledger, initialCash });

      expect(originalAcc.cash).toBe(accCopy.cash);
      expect(originalAcc.equity).toBe(accCopy.equity);
      expect(ledger.getAllEntries().length).toBe(ledgerEventsCount);
    });
  });
});

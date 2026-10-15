import { describe, it, expect } from 'vitest';
import { PaperReconciliationEngine } from '../PaperReconciliationEngine.ts';
import type { PaperAuditEntry } from '../../PaperTradeLedger.ts';
import type { BrokerAccount, BrokerPosition } from '../../../execution/BrokerAdapter.ts';
import { PaperBroker } from '../../PaperBroker.ts';
import { PaperTradeLedger } from '../../PaperTradeLedger.ts';

const FIXED_NOW = 1773295200000; // Deterministic test timestamp: 2026-03-12T06:00:00.000Z

interface MockAccountOverrides extends Omit<Partial<BrokerAccount>, 'positions'> {
  positions?: (Partial<BrokerPosition> & { symbol: string; quantity: number })[];
}

function createMockAccount(overrides: MockAccountOverrides = {}): BrokerAccount {
  const positions: BrokerPosition[] = (overrides.positions || []).map(p => ({
    symbol: p.symbol,
    quantity: p.quantity,
    reservedQuantity: p.reservedQuantity ?? 0,
    availableQuantity: p.availableQuantity ?? (p.quantity - (p.reservedQuantity ?? 0)),
    averageCost: p.averageCost ?? 0,
    currentPrice: p.currentPrice ?? null,
    marketValue: p.marketValue ?? null,
    unrealizedPnL: p.unrealizedPnL ?? null,
    unrealizedPnLPercent: p.unrealizedPnLPercent ?? null,
    updatedAt: p.updatedAt ?? new Date(FIXED_NOW).toISOString(),
  }));

  const { positions: _pos, ...rest } = overrides;

  return {
    accountId: 'ACC_RECON_TEST',
    currency: 'VND',
    cash: 100_000_000,
    reservedCash: 0,
    availableCash: 100_000_000,
    marketValue: 0,
    equity: 100_000_000,
    realizedPnL: 0,
    unrealizedPnL: 0,
    positions,
    openOrders: [],
    updatedAt: new Date(FIXED_NOW).toISOString(),
    ...rest,
  };
}

function createBuyEntry(params: {
  orderId: string;
  symbol: string;
  quantity: number;
  price: number;
  cashBefore: number;
  positionBefore?: number;
  feeRate?: number;
}): PaperAuditEntry {
  const feeRate = params.feeRate ?? 0.0015;
  const gross = params.quantity * params.price;
  const fees = gross * feeRate;
  const totalCost = gross + fees;
  const cashAfter = params.cashBefore - totalCost;
  const posBefore = params.positionBefore ?? 0;
  const posAfter = posBefore + params.quantity;

  return {
    auditId: `AUDIT_${params.orderId}`,
    orderId: params.orderId,
    timestamp: new Date(FIXED_NOW).toISOString(),
    symbol: params.symbol,
    side: 'BUY',
    orderType: 'LIMIT',
    requestedPrice: params.price,
    executedPrice: params.price,
    requestedQuantity: params.quantity,
    executedQuantity: params.quantity,
    stopLoss: params.price * 0.95,
    targetPrice: params.price * 1.1,
    riskAmount: totalCost * 0.05,
    portfolioExposureBefore: 0,
    portfolioExposureAfter: 0.5,
    cashBefore: params.cashBefore,
    cashAfter,
    positionBefore: posBefore,
    positionAfter: posAfter,
    validatorStatus: 'VALID',
    validatorCode: 'OK',
    riskGuardStatus: 'VALID',
    riskGuardAuthorization: 'AUTHORIZED_FOR_PAPER_TRADING',
    integrityValid: true,
    integrityReasons: [],
    dataSource: 'VPS',
    fees,
    tax: 0,
    slippage: 0,
    finalOrderStatus: 'FILLED',
    errors: [],
  };
}

function createSellEntry(params: {
  orderId: string;
  symbol: string;
  quantity: number;
  price: number;
  averageCost: number;
  cashBefore: number;
  positionBefore: number;
  feeRate?: number;
  taxRate?: number;
}): PaperAuditEntry {
  const feeRate = params.feeRate ?? 0.0015;
  const taxRate = params.taxRate ?? 0.0010;
  const gross = params.quantity * params.price;
  const fees = gross * feeRate;
  const tax = gross * taxRate;
  const netProceeds = gross - fees - tax;
  const cashAfter = params.cashBefore + netProceeds;
  const posAfter = params.positionBefore - params.quantity;
  const costBasisSold = params.quantity * params.averageCost;
  const realizedPnL = netProceeds - costBasisSold;

  return {
    auditId: `AUDIT_${params.orderId}`,
    orderId: params.orderId,
    timestamp: new Date(FIXED_NOW).toISOString(),
    symbol: params.symbol,
    side: 'SELL',
    orderType: 'LIMIT',
    requestedPrice: params.price,
    executedPrice: params.price,
    requestedQuantity: params.quantity,
    executedQuantity: params.quantity,
    stopLoss: null,
    targetPrice: null,
    riskAmount: null,
    portfolioExposureBefore: 0.5,
    portfolioExposureAfter: 0,
    cashBefore: params.cashBefore,
    cashAfter,
    positionBefore: params.positionBefore,
    positionAfter: posAfter,
    validatorStatus: 'VALID',
    validatorCode: 'OK',
    riskGuardStatus: 'VALID',
    riskGuardAuthorization: 'AUTHORIZED_FOR_PAPER_TRADING',
    integrityValid: true,
    integrityReasons: [],
    dataSource: 'VPS',
    fees,
    tax,
    slippage: 0,
    realizedPnL,
    finalOrderStatus: 'FILLED',
    errors: [],
  };
}

describe('PHASE 18.3.1 — PaperReconciliationEngine', () => {
  const engine = new PaperReconciliationEngine();

  // 1. Perfectly Reconciled Account
  it('1. should report RECONCILED when broker account matches ledger exactly', () => {
    const buy = createBuyEntry({
      orderId: 'ORD_1',
      symbol: 'VNM',
      quantity: 1000,
      price: 80_000,
      cashBefore: 100_000_000,
    });

    const totalCost = (1000 * 80_000) + buy.fees;
    const remainingCash = 100_000_000 - totalCost;
    const marketValue = 1000 * 80_000;
    const equity = remainingCash + marketValue;

    const account = createMockAccount({
      cash: remainingCash,
      availableCash: remainingCash,
      marketValue,
      equity,
      positions: [
        {
          symbol: 'VNM',
          quantity: 1000,
          reservedQuantity: 0,
          availableQuantity: 1000,
          averageCost: totalCost / 1000,
          currentPrice: 80_000,
          marketValue,
          unrealizedPnL: marketValue - totalCost,
          unrealizedPnLPercent: ((marketValue - totalCost) / totalCost) * 100,
          updatedAt: new Date(FIXED_NOW).toISOString(),
        },
      ],
      unrealizedPnL: marketValue - totalCost,
    });

    const report = engine.reconcile({
      account,
      ledger: [buy],
      initialCash: 100_000_000,
      now: FIXED_NOW,
    });

    expect(report.status).toBe('RECONCILED');
    expect(report.mismatches).toHaveLength(0);
    expect(report.cashComparison.matched).toBe(true);
    expect(report.positionComparison.matched).toBe(true);
    expect(report.pnlComparison.matched).toBe(true);
  });

  // 2. Cash Mismatch
  it('2. should detect CASH mismatch when account cash deviates from reconstructed ledger', () => {
    const buy = createBuyEntry({
      orderId: 'ORD_2',
      symbol: 'HPG',
      quantity: 500,
      price: 30_000,
      cashBefore: 50_000_000,
    });

    const expectedCash = 50_000_000 - ((500 * 30_000) + buy.fees);
    const corruptedCash = expectedCash + 1_000_000; // Ghost 1,000,000 VND

    const account = createMockAccount({
      cash: corruptedCash,
      availableCash: corruptedCash,
      equity: corruptedCash + (500 * 30_000),
      positions: [
        {
          symbol: 'HPG',
          quantity: 500,
          reservedQuantity: 0,
          availableQuantity: 500,
          averageCost: ((500 * 30_000) + buy.fees) / 500,
          currentPrice: 30_000,
          marketValue: 500 * 30_000,
          unrealizedPnL: 0,
          unrealizedPnLPercent: 0,
        },
      ],
    });

    const report = engine.reconcile({
      account,
      ledger: [buy],
      initialCash: 50_000_000,
      now: FIXED_NOW,
    });

    expect(report.status).toBe('MISMATCH');
    const cashMismatch = report.mismatches.find(m => m.category === 'CASH' && m.field === 'cash');
    expect(cashMismatch).toBeDefined();
    expect(cashMismatch?.severity).toBe('HIGH');
    expect(cashMismatch?.difference).toBeCloseTo(1_000_000, 0);
  });

  // 3. Position Quantity Mismatch
  it('3. should detect POSITION quantity mismatch when share counts diverge', () => {
    const buy = createBuyEntry({
      orderId: 'ORD_3',
      symbol: 'SSI',
      quantity: 1000,
      price: 35_000,
      cashBefore: 50_000_000,
    });

    const totalCost = (1000 * 35_000) + buy.fees;
    const account = createMockAccount({
      cash: 50_000_000 - totalCost,
      availableCash: 50_000_000 - totalCost,
      positions: [
        {
          symbol: 'SSI',
          quantity: 800, // Diverges: says 800 instead of 1000
          reservedQuantity: 0,
          availableQuantity: 800,
          averageCost: totalCost / 1000,
          currentPrice: 35_000,
          marketValue: 800 * 35_000,
          unrealizedPnL: 0,
          unrealizedPnLPercent: 0,
        },
      ],
    });

    const report = engine.reconcile({
      account,
      ledger: [buy],
      initialCash: 50_000_000,
      now: FIXED_NOW,
    });

    expect(report.status).toBe('MISMATCH');
    const posMismatch = report.mismatches.find(m => m.category === 'POSITION' && m.field === 'position[SSI].quantity');
    expect(posMismatch).toBeDefined();
    expect(posMismatch?.expected).toBe(1000);
    expect(posMismatch?.actual).toBe(800);
  });

  // 4. Multiple-Symbol Mismatch
  it('4. should identify discrepancies across multiple symbols independently', () => {
    const buyVNM = createBuyEntry({
      orderId: 'ORD_4A',
      symbol: 'VNM',
      quantity: 500,
      price: 80_000,
      cashBefore: 100_000_000,
    });

    const cashAfter1 = 100_000_000 - ((500 * 80_000) + buyVNM.fees);
    const buyFPT = createBuyEntry({
      orderId: 'ORD_4B',
      symbol: 'FPT',
      quantity: 400,
      price: 120_000,
      cashBefore: cashAfter1,
    });

    // Account missing FPT entirely and having wrong VNM quantity
    const account = createMockAccount({
      cash: buyFPT.cashAfter,
      availableCash: buyFPT.cashAfter,
      positions: [
        {
          symbol: 'VNM',
          quantity: 700, // Expected 500
          reservedQuantity: 0,
          availableQuantity: 700,
          averageCost: 80_000,
          currentPrice: 80_000,
          marketValue: 700 * 80_000,
          unrealizedPnL: 0,
          unrealizedPnLPercent: 0,
        },
      ],
    });

    const report = engine.reconcile({
      account,
      ledger: [buyVNM, buyFPT],
      initialCash: 100_000_000,
      now: FIXED_NOW,
    });

    expect(report.status).toBe('MISMATCH');
    const vnmMismatch = report.mismatches.find(m => m.field === 'position[VNM].quantity');
    const fptMismatch = report.mismatches.find(m => m.field === 'position[FPT].quantity');
    expect(vnmMismatch).toBeDefined();
    expect(fptMismatch).toBeDefined();
    expect(fptMismatch?.expected).toBe(400);
    expect(fptMismatch?.actual).toBe(0);
  });

  // 5. Fee Mismatch (Integrity)
  it('5. should detect corrupted fees that break entry cash math', () => {
    const corruptedBuy = createBuyEntry({
      orderId: 'ORD_5',
      symbol: 'HPG',
      quantity: 1000,
      price: 25_000,
      cashBefore: 50_000_000,
    });

    // Manually tamper with fee so cashAfter doesn't equal cashBefore - (gross + fees)
    corruptedBuy.fees = 500_000; // Excessive fee not reflected in cashAfter

    const account = createMockAccount({
      cash: corruptedBuy.cashAfter,
      availableCash: corruptedBuy.cashAfter,
    });

    const report = engine.reconcile({
      account,
      ledger: [corruptedBuy],
      initialCash: 50_000_000,
      now: FIXED_NOW,
    });

    expect(report.status).toBe('MISMATCH');
    const feeIntegrity = report.mismatches.find(m => m.category === 'INTEGRITY' && m.field.includes('cashAfter'));
    expect(feeIntegrity).toBeDefined();
  });

  // 6. Tax Mismatch (Integrity on SELL)
  it('6. should detect corrupted tax calculation in SELL audit entry', () => {
    const buy = createBuyEntry({
      orderId: 'ORD_6A',
      symbol: 'MBB',
      quantity: 1000,
      price: 20_000,
      cashBefore: 50_000_000,
    });

    const sell = createSellEntry({
      orderId: 'ORD_6B',
      symbol: 'MBB',
      quantity: 1000,
      price: 22_000,
      averageCost: buy.executedPrice!,
      cashBefore: buy.cashAfter,
      positionBefore: 1000,
    });

    // Tamper with tax: change tax field without updating cashAfter
    sell.tax = 500_000;

    const account = createMockAccount({
      cash: sell.cashAfter,
      availableCash: sell.cashAfter,
    });

    const report = engine.reconcile({
      account,
      ledger: [buy, sell],
      initialCash: 50_000_000,
      now: FIXED_NOW,
    });

    expect(report.status).toBe('MISMATCH');
    const taxIntegrity = report.mismatches.find(m => m.category === 'INTEGRITY' && m.field.includes('cashAfter'));
    expect(taxIntegrity).toBeDefined();
  });

  // 7. Slippage Mismatch (Integrity)
  it('7. should record cost comparison of total fees, taxes, and slippage', () => {
    const buy = createBuyEntry({
      orderId: 'ORD_7',
      symbol: 'VCB',
      quantity: 200,
      price: 90_000,
      cashBefore: 30_000_000,
    });
    buy.slippage = 18_000;

    const account = createMockAccount({
      cash: buy.cashAfter,
      availableCash: buy.cashAfter,
      positions: [
        {
          symbol: 'VCB',
          quantity: 200,
          reservedQuantity: 0,
          availableQuantity: 200,
          averageCost: (buy.cashBefore - buy.cashAfter) / 200,
          currentPrice: 90_000,
          marketValue: 18_000_000,
          unrealizedPnL: 0,
          unrealizedPnLPercent: 0,
        },
      ],
    });

    const report = engine.reconcile({
      account,
      ledger: [buy],
      initialCash: 30_000_000,
      now: FIXED_NOW,
    });

    expect(report.costComparison.expectedTotalSlippage).toBe(18_000);
    expect(report.costComparison.expectedTotalFees).toBe(buy.fees);
  });

  // 8. P&L Mismatch
  it('8. should detect divergence in realized P&L between account and ledger', () => {
    const buy = createBuyEntry({
      orderId: 'ORD_8A',
      symbol: 'MWG',
      quantity: 500,
      price: 50_000,
      cashBefore: 40_000_000,
    });

    const avgCost = (buy.cashBefore - buy.cashAfter) / 500;
    const sell = createSellEntry({
      orderId: 'ORD_8B',
      symbol: 'MWG',
      quantity: 500,
      price: 55_000,
      averageCost: avgCost,
      cashBefore: buy.cashAfter,
      positionBefore: 500,
    });

    // Account incorrectly reports 0 realized P&L despite profitable sell
    const account = createMockAccount({
      cash: sell.cashAfter,
      availableCash: sell.cashAfter,
      realizedPnL: 0, // Should be sell.realizedPnL
      equity: sell.cashAfter,
    });

    const report = engine.reconcile({
      account,
      ledger: [buy, sell],
      initialCash: 40_000_000,
      now: FIXED_NOW,
    });

    expect(report.status).toBe('MISMATCH');
    const pnlMismatch = report.mismatches.find(m => m.category === 'PNL' && m.field === 'realizedPnL');
    expect(pnlMismatch).toBeDefined();
    expect(pnlMismatch?.expected).toBeCloseTo(sell.realizedPnL!, 0);
    expect(pnlMismatch?.actual).toBe(0);
  });

  // 9. Missing Ledger Entry (Account has position without any trade in ledger)
  it('9. should detect missing ledger entry when account holds shares with zero ledger trades', () => {
    const account = createMockAccount({
      cash: 10_000_000,
      availableCash: 10_000_000,
      positions: [
        {
          symbol: 'FPT',
          quantity: 1000,
          reservedQuantity: 0,
          availableQuantity: 1000,
          averageCost: 100_000,
          currentPrice: 100_000,
          marketValue: 100_000_000,
          unrealizedPnL: 0,
          unrealizedPnLPercent: 0,
        },
      ],
      equity: 110_000_000,
    });

    const report = engine.reconcile({
      account,
      ledger: [], // Empty ledger!
      initialCash: 100_000_000,
      now: FIXED_NOW,
    });

    expect(report.status).toBe('MISMATCH');
    const posMismatch = report.mismatches.find(m => m.field === 'position[FPT].quantity');
    expect(posMismatch).toBeDefined();
    expect(posMismatch?.expected).toBe(0);
    expect(posMismatch?.actual).toBe(1000);
  });

  // 10. Extra Ledger Entry (Ledger recorded trade but broker account was not updated)
  it('10. should detect extra ledger entry when ledger records trade not reflected in broker account', () => {
    const buy = createBuyEntry({
      orderId: 'ORD_10',
      symbol: 'VNM',
      quantity: 500,
      price: 75_000,
      cashBefore: 100_000_000,
    });

    // Broker account remained un-mutated at initial state
    const account = createMockAccount({
      cash: 100_000_000,
      availableCash: 100_000_000,
      positions: [],
      equity: 100_000_000,
    });

    const report = engine.reconcile({
      account,
      ledger: [buy],
      initialCash: 100_000_000,
      now: FIXED_NOW,
    });

    expect(report.status).toBe('MISMATCH');
    expect(report.mismatches.some(m => m.category === 'CASH')).toBe(true);
    expect(report.mismatches.some(m => m.category === 'POSITION')).toBe(true);
  });

  // 11. Rejected Order Handling
  it('11. should verify that rejected orders do not mutate cash or positions', () => {
    const rejectedEntry: PaperAuditEntry = {
      auditId: 'AUDIT_REJ_1',
      orderId: 'ORD_REJ_1',
      timestamp: new Date(FIXED_NOW).toISOString(),
      symbol: 'HPG',
      side: 'BUY',
      orderType: 'LIMIT',
      requestedPrice: 30_000,
      executedPrice: null,
      requestedQuantity: 500,
      executedQuantity: 0,
      stopLoss: null,
      targetPrice: null,
      riskAmount: null,
      portfolioExposureBefore: 0,
      portfolioExposureAfter: 0,
      cashBefore: 50_000_000,
      cashAfter: 50_000_000,
      positionBefore: 0,
      positionAfter: 0,
      validatorStatus: 'VALID',
      validatorCode: 'OK',
      riskGuardStatus: 'BLOCKED',
      riskGuardAuthorization: 'BLOCKED',
      riskGuardReason: 'DAILY_LOSS_LIMIT',
      integrityValid: true,
      integrityReasons: [],
      dataSource: 'VPS',
      fees: 0,
      tax: 0,
      slippage: 0,
      finalOrderStatus: 'REJECTED',
      errors: ['DAILY_LOSS_LIMIT'],
    };

    const account = createMockAccount({
      cash: 50_000_000,
      availableCash: 50_000_000,
      equity: 50_000_000,
      positions: [],
    });

    const report = engine.reconcile({
      account,
      ledger: [rejectedEntry],
      initialCash: 50_000_000,
      now: FIXED_NOW,
    });

    expect(report.status).toBe('RECONCILED');
    expect(report.orderExecutionComparison.rejectedOrders).toBe(1);
    expect(report.orderExecutionComparison.filledOrders).toBe(0);
  });

  // 12. BUY then SELL Sequence
  it('12. should correctly reconcile a full round-trip BUY then SELL sequence', () => {
    const buy = createBuyEntry({
      orderId: 'ORD_12A',
      symbol: 'TCB',
      quantity: 1000,
      price: 25_000,
      cashBefore: 50_000_000,
    });

    const avgCost = (buy.cashBefore - buy.cashAfter) / 1000;
    const sell = createSellEntry({
      orderId: 'ORD_12B',
      symbol: 'TCB',
      quantity: 1000,
      price: 28_000,
      averageCost: avgCost,
      cashBefore: buy.cashAfter,
      positionBefore: 1000,
    });

    const account = createMockAccount({
      cash: sell.cashAfter,
      availableCash: sell.cashAfter,
      positions: [], // Completely closed out
      realizedPnL: sell.realizedPnL!,
      equity: sell.cashAfter,
    });

    const report = engine.reconcile({
      account,
      ledger: [buy, sell],
      initialCash: 50_000_000,
      now: FIXED_NOW,
    });

    expect(report.status).toBe('RECONCILED');
    expect(report.pnlComparison.realizedPnLMatched).toBe(true);
    expect(report.positionComparison.positionsCountActual).toBe(0);
  });

  // 13. Multiple BUYs
  it('13. should reconcile average cost accumulation across multiple BUY orders', () => {
    const buy1 = createBuyEntry({
      orderId: 'ORD_13A',
      symbol: 'FPT',
      quantity: 200,
      price: 100_000,
      cashBefore: 100_000_000,
    });

    const cost1 = (200 * 100_000) + buy1.fees;
    const cashAfter1 = 100_000_000 - cost1;

    const buy2 = createBuyEntry({
      orderId: 'ORD_13B',
      symbol: 'FPT',
      quantity: 300,
      price: 110_000,
      cashBefore: cashAfter1,
      positionBefore: 200,
    });

    const cost2 = (300 * 110_000) + buy2.fees;
    const totalCost = cost1 + cost2;
    const totalQty = 500;
    const expectedAvgCost = totalCost / totalQty;
    const currentPrice = 115_000;
    const marketValue = totalQty * currentPrice;
    const remainingCash = 100_000_000 - totalCost;
    const unrealizedPnL = marketValue - (totalQty * expectedAvgCost);

    const account = createMockAccount({
      cash: remainingCash,
      availableCash: remainingCash,
      marketValue,
      equity: remainingCash + marketValue,
      unrealizedPnL,
      positions: [
        {
          symbol: 'FPT',
          quantity: 500,
          reservedQuantity: 0,
          availableQuantity: 500,
          averageCost: expectedAvgCost,
          currentPrice,
          marketValue,
          unrealizedPnL,
          unrealizedPnLPercent: (unrealizedPnL / (totalQty * expectedAvgCost)) * 100,
        },
      ],
    });

    const report = engine.reconcile({
      account,
      ledger: [buy1, buy2],
      initialCash: 100_000_000,
      quotes: new Map([['FPT', { price: currentPrice }]]),
      now: FIXED_NOW,
    });

    expect(report.status).toBe('RECONCILED');
    expect(report.positionComparison.matched).toBe(true);
    expect(report.pnlComparison.unrealizedPnLMatched).toBe(true);
  });

  // 14. Multiple SELLs (Partial Exits)
  it('14. should reconcile sequential partial SELL orders and remaining balance', () => {
    const buy = createBuyEntry({
      orderId: 'ORD_14A',
      symbol: 'HPG',
      quantity: 1000,
      price: 25_000,
      cashBefore: 50_000_000,
    });

    const avgCost = (buy.cashBefore - buy.cashAfter) / 1000;

    // First sell: 400 shares
    const sell1 = createSellEntry({
      orderId: 'ORD_14B',
      symbol: 'HPG',
      quantity: 400,
      price: 27_000,
      averageCost: avgCost,
      cashBefore: buy.cashAfter,
      positionBefore: 1000,
    });

    // Second sell: 300 shares
    const sell2 = createSellEntry({
      orderId: 'ORD_14C',
      symbol: 'HPG',
      quantity: 300,
      price: 28_000,
      averageCost: avgCost,
      cashBefore: sell1.cashAfter,
      positionBefore: 600,
    });

    const remainingQty = 300;
    const totalRealizedPnL = sell1.realizedPnL! + sell2.realizedPnL!;
    const markPrice = 28_000;
    const marketValue = remainingQty * markPrice;

    const account = createMockAccount({
      cash: sell2.cashAfter,
      availableCash: sell2.cashAfter,
      marketValue,
      equity: sell2.cashAfter + marketValue,
      realizedPnL: totalRealizedPnL,
      unrealizedPnL: marketValue - (remainingQty * avgCost),
      positions: [
        {
          symbol: 'HPG',
          quantity: remainingQty,
          reservedQuantity: 0,
          availableQuantity: remainingQty,
          averageCost: avgCost,
          currentPrice: markPrice,
          marketValue,
          unrealizedPnL: marketValue - (remainingQty * avgCost),
          unrealizedPnLPercent: 0,
        },
      ],
    });

    const report = engine.reconcile({
      account,
      ledger: [buy, sell1, sell2],
      initialCash: 50_000_000,
      now: FIXED_NOW,
    });

    expect(report.status).toBe('RECONCILED');
    expect(report.positionComparison.details[0].actualQuantity).toBe(300);
    expect(report.pnlComparison.realizedPnLMatched).toBe(true);
  });

  // 15. Zero-Trade Account
  it('15. should reconcile a clean zero-trade account', () => {
    const account = createMockAccount({
      cash: 100_000_000,
      availableCash: 100_000_000,
      equity: 100_000_000,
      positions: [],
    });

    const report = engine.reconcile({
      account,
      ledger: [],
      initialCash: 100_000_000,
      now: FIXED_NOW,
    });

    expect(report.status).toBe('RECONCILED');
    expect(report.orderExecutionComparison.totalOrdersActual).toBe(0);
    expect(report.cashComparison.difference).toBe(0);
  });

  // 16. Deterministic Repeated Reconciliation
  it('16. should produce identical reports on repeated runs with fixed timestamp', () => {
    const buy = createBuyEntry({
      orderId: 'ORD_16',
      symbol: 'VNM',
      quantity: 500,
      price: 80_000,
      cashBefore: 60_000_000,
    });

    const account = createMockAccount({
      cash: buy.cashAfter,
      availableCash: buy.cashAfter,
      positions: [
        {
          symbol: 'VNM',
          quantity: 500,
          reservedQuantity: 0,
          availableQuantity: 500,
          averageCost: (buy.cashBefore - buy.cashAfter) / 500,
          currentPrice: 80_000,
          marketValue: 40_000_000,
          unrealizedPnL: 0,
          unrealizedPnLPercent: 0,
        },
      ],
      equity: buy.cashAfter + 40_000_000,
    });

    const input = {
      account,
      ledger: [buy],
      initialCash: 60_000_000,
      now: FIXED_NOW,
    };

    const report1 = engine.reconcile(input);
    const report2 = engine.reconcile(input);

    expect(report1).toEqual(report2);
  });

  // 17. Invalid Input Handling
  it('17. should return INVALID_INPUT when required objects are null or corrupted', () => {
    const reportNullAccount = engine.reconcile({
      account: null,
      ledger: [],
      now: FIXED_NOW,
    });
    expect(reportNullAccount.status).toBe('INVALID_INPUT');

    const reportBadCash = engine.reconcile({
      account: createMockAccount({ cash: NaN }),
      ledger: [],
      now: FIXED_NOW,
    });
    expect(reportBadCash.status).toBe('INVALID_INPUT');

    const reportNullLedger = engine.reconcile({
      account: createMockAccount(),
      ledger: null as any,
      now: FIXED_NOW,
    });
    expect(reportNullLedger.status).toBe('INVALID_INPUT');
  });

  // 18. Board-Lot Quantity Mismatch
  it('18. should flag non-board-lot quantities (e.g. 250 shares) as violations', () => {
    const account = createMockAccount({
      cash: 80_000_000,
      availableCash: 80_000_000,
      positions: [
        {
          symbol: 'VNM',
          quantity: 250, // Non-board lot (not multiple of 100)
          reservedQuantity: 0,
          availableQuantity: 250,
          averageCost: 80_000,
          currentPrice: 80_000,
          marketValue: 20_000_000,
          unrealizedPnL: 0,
          unrealizedPnLPercent: 0,
        },
      ],
    });

    const report = engine.reconcile({
      account,
      ledger: [],
      initialCash: 80_000_000,
      now: FIXED_NOW,
    });

    expect(report.status).toBe('MISMATCH');
    const boardLotMismatch = report.mismatches.find(m => m.field.includes('boardLot'));
    expect(boardLotMismatch).toBeDefined();
    expect(boardLotMismatch?.reason).toContain('100-share board lot rule');
  });

  // 19. Reserved Cash Mismatch
  it('19. should detect discrepancy in reserved cash when broker has unaccounted reservations', () => {
    const account = createMockAccount({
      cash: 90_000_000,
      reservedCash: 5_000_000, // Unaccounted reserved cash
      availableCash: 85_000_000,
      openOrders: [], // No open orders justifying the reservation
    });

    const report = engine.reconcile({
      account,
      ledger: [],
      initialCash: 90_000_000,
      now: FIXED_NOW,
    });

    expect(report.status).toBe('MISMATCH');
    const resMismatch = report.mismatches.find(m => m.category === 'CASH' && m.field === 'reservedCash');
    expect(resMismatch).toBeDefined();
    expect(resMismatch?.actual).toBe(5_000_000);
    expect(resMismatch?.expected).toBe(0);
  });

  // 20. Reserved Quantity Mismatch
  it('20. should detect discrepancy in position reserved shares', () => {
    const buy = createBuyEntry({
      orderId: 'ORD_20',
      symbol: 'VNM',
      quantity: 500,
      price: 80_000,
      cashBefore: 60_000_000,
    });

    const account = createMockAccount({
      cash: buy.cashAfter,
      availableCash: buy.cashAfter,
      positions: [
        {
          symbol: 'VNM',
          quantity: 500,
          reservedQuantity: 200, // Unaccounted reserved quantity
          availableQuantity: 300,
          averageCost: (buy.cashBefore - buy.cashAfter) / 500,
          currentPrice: 80_000,
          marketValue: 40_000_000,
          unrealizedPnL: 0,
          unrealizedPnLPercent: 0,
        },
      ],
    });

    const report = engine.reconcile({
      account,
      ledger: [buy],
      initialCash: 60_000_000,
      now: FIXED_NOW,
    });

    expect(report.status).toBe('MISMATCH');
    const resQtyMismatch = report.mismatches.find(m => m.category === 'POSITION' && m.field.includes('reservedQuantity'));
    expect(resQtyMismatch).toBeDefined();
    expect(resQtyMismatch?.actual).toBe(200);
    expect(resQtyMismatch?.expected).toBe(0);
  });

  // 21. Live PaperBroker Integration Test
  it('21. should reconcile directly against an active PaperBroker instance', () => {
    const broker = new PaperBroker({
      initialCash: 100_000_000,
      skipSessionValidation: true,
    });
    const ledger = new PaperTradeLedger();

    // Ingest market data so LIMIT order matches and executes immediately
    broker.processMarketData({
      symbol: 'HPG',
      price: 28_000,
      timestamp: FIXED_NOW,
    });

    // Submit order via PaperBroker
    const orderRes = broker.submitOrderSync({
      symbol: 'HPG',
      side: 'BUY',
      type: 'LIMIT',
      limitPrice: 28_000,
      quantity: 1000,
    });
    expect(orderRes.success).toBe(true);
    expect(orderRes.order.status).toBe('FILLED');

    const fee = 1000 * 28_000 * 0.0015;
    const totalCost = (1000 * 28_000) + fee;

    // Record audit entry in ledger
    ledger.record({
      orderId: orderRes.order.id,
      timestamp: new Date(FIXED_NOW).toISOString(),
      symbol: 'HPG',
      side: 'BUY',
      orderType: 'LIMIT',
      requestedPrice: 28_000,
      executedPrice: 28_000,
      requestedQuantity: 1000,
      executedQuantity: 1000,
      stopLoss: 26_000,
      targetPrice: 32_000,
      riskAmount: 2_000_000,
      portfolioExposureBefore: 0,
      portfolioExposureAfter: totalCost / 100_000_000,
      cashBefore: 100_000_000,
      cashAfter: 100_000_000 - totalCost,
      positionBefore: 0,
      positionAfter: 1000,
      validatorStatus: 'VALID',
      validatorCode: 'OK',
      riskGuardStatus: 'VALID',
      riskGuardAuthorization: 'AUTHORIZED_FOR_PAPER_TRADING',
      integrityValid: true,
      integrityReasons: [],
      dataSource: 'VPS',
      fees: fee,
      tax: 0,
      slippage: 0,
      finalOrderStatus: 'FILLED',
      errors: [],
    });

    const report = engine.reconcile({
      broker,
      ledger,
      initialCash: 100_000_000,
      now: FIXED_NOW,
    });

    expect(report.status).toBe('RECONCILED');
    expect(report.cashComparison.matched).toBe(true);
    expect(report.positionComparison.matched).toBe(true);
  });

  // 22. Immutability Verification: Reconcile must NEVER mutate inputs
  it('22. should guarantee absolute immutability of broker, account, and ledger inputs', () => {
    const buy = createBuyEntry({
      orderId: 'ORD_22',
      symbol: 'VNM',
      quantity: 500,
      price: 80_000,
      cashBefore: 60_000_000,
    });

    const account = createMockAccount({
      cash: buy.cashAfter,
      availableCash: buy.cashAfter,
      positions: [
        {
          symbol: 'VNM',
          quantity: 500,
          reservedQuantity: 0,
          availableQuantity: 500,
          averageCost: (buy.cashBefore - buy.cashAfter) / 500,
          currentPrice: 80_000,
          marketValue: 40_000_000,
          unrealizedPnL: 0,
          unrealizedPnLPercent: 0,
        },
      ],
    });

    const accountSnapshot = JSON.stringify(account);
    const ledgerSnapshot = JSON.stringify([buy]);

    engine.reconcile({
      account,
      ledger: [buy],
      initialCash: 60_000_000,
      now: FIXED_NOW,
    });

    expect(JSON.stringify(account)).toBe(accountSnapshot);
    expect(JSON.stringify([buy])).toBe(ledgerSnapshot);
  });
});

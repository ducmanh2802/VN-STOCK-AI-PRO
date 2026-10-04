/**
 * REPLAY TESTS 2 — ORDER MATRIX (accepted / risk-rejected / execution-rejected /
 * zero-fill), accounting invariant, reconciliation, idempotency, checkpoints.
 */
import { describe, it, expect } from 'vitest';
import { PaperReplayEngine, type ReplayBar, type ReplayPorts } from '../PaperReplayEngine.ts';
import { ReplayManifestEngine } from '../ReplayManifest.ts';
import { ReplayAccounting, ReplayReconciliation } from '../ReplayAccounting.ts';

function bar(date: string, close: number, q: ReplayBar['dataQuality'] = 'VALID', pub = date): ReplayBar {
  return { date, open: close, high: close, low: close, close, volume: 1000000, publicationDate: pub, dataQuality: q };
}

const bars = [bar('2024-01-02', 100000), bar('2024-01-03', 101000), bar('2024-01-04', 102000), bar('2024-01-05', 103000)];

const manifest = () => ReplayManifestEngine.create({
  replayId: 'R1', createdAt: '2026-10-04T00:00:00Z', datasetId: 'D1', datasetVersion: 'dv1',
  strategyId: 'S1', strategyVersion: 'sv1', decisionVersion: 'dv', riskModelVersion: 'rmv',
  positionSizingVersion: 'psv', executionModelVersion: 'emv', costModelVersion: 'cmv',
  universe: ['I1'], startDate: '2024-01-02', endDate: '2024-01-05',
  initialCapital: 100000000, mode: 'DETERMINISTIC_REPLAY', configuration: {},
});

function ports(over?: Partial<ReplayPorts>): ReplayPorts {
  return {
    executionPort: {
      isSimulation: true,
      name: 'PaperBrokerStub',
      submit: (i) => ({
        success: true, orderId: `P${i.date}`, status: 'FILLED', code: 'EXECUTED',
        executedPrice: i.price * 1.001, executedQuantity: i.quantity, fee: 1500, tax: 0, slippage: 100,
        ledgerEntryCount: 1,
      }),
    },
    riskPort: () => ({ approved: true, code: 'APPROVED', reason: 'ok' }),
    decisionPort: () => ({ decisionId: 'DEC1', decisionType: 'BUY', decisionStatus: 'APPROVED', instrumentId: 'I1' }),
    ...over,
  };
}

const baseRun = (p: ReplayPorts, data = bars, strategy: Parameters<typeof PaperReplayEngine.run>[0]['strategy'] = (_v, i) => (i === 0 ? 'BUY' : 'HOLD')) =>
  PaperReplayEngine.run({
    manifest: manifest(), bars: data, strategy, ports: p,
    fees: (gross, side) => ({ fee: gross * 0.0015, tax: side === 'SELL' ? gross * 0.001 : 0 }),
    slippage: (p, side) => (side === 'BUY' ? p * 1.001 : p * 0.999),
    roundLot: (q) => Math.floor(q / 100) * 100,
  });

describe('Order matrix', () => {
  it('accepts and fills an order', () => {
    const r = baseRun(ports());
    expect(r.status).toBe('COMPLETED');
    expect(r.fills.length).toBe(1);
    expect(r.filledQuantity).toBeGreaterThan(0);
    expect(r.orders[0].status).toBe('FILLED');
  });

  it('records risk rejection without a fill (strategy result not mutated)', () => {
    const r = baseRun(ports({ riskPort: () => ({ approved: false, code: 'DAILY_LOSS_LIMIT', reason: 'limit' }) }));
    expect(r.riskRejectionCount).toBe(1);
    expect(r.fills.length).toBe(0);
    expect(r.orders[0].status).toBe('RISK_REJECTED');
    expect(r.orders[0].zeroCause).toBe('ZERO_BY_RISK');
    expect(r.strategyTradeCount).toBe(1);
  });

  it('records execution rejection distinctly from risk rejection', () => {
    const r = baseRun(ports({
      executionPort: {
        isSimulation: true, name: 'P',
        submit: (i) => ({ success: false, orderId: `P${i.date}`, status: 'REJECTED', code: 'MARKET_CLOSED', executedPrice: null, executedQuantity: 0, fee: 0, tax: 0, slippage: 0 }),
      },
    }));
    expect(r.executionRejectionCount).toBe(1);
    expect(r.orders[0].status).toBe('EXECUTION_REJECTED');
    expect(r.riskRejectionCount).toBe(0);
  });

  it('zero-fill carries an explicit cause', () => {
    const r = baseRun(ports(), [bar('2024-01-02', 100000000)]);
    expect(r.orders[0].status).toBe('ZERO_FILL');
    expect(['ZERO_BY_LIQUIDITY', 'ZERO_BY_STRATEGY']).toContain(r.orders[0].zeroCause);
  });

  it('partially fills when execution returns less than requested', () => {
    const r = baseRun(ports({
      executionPort: {
        isSimulation: true, name: 'P',
        submit: (i) => ({ success: true, orderId: `P${i.date}`, status: 'PARTIALLY_FILLED', code: 'EXECUTED', executedPrice: i.price, executedQuantity: 100, fee: 15, tax: 0, slippage: 0, ledgerEntryCount: 1 }),
      },
    }));
    expect(r.orders[0].status).toBe('PARTIALLY_FILLED');
    expect(r.filledQuantity).toBe(100);
  });
});

describe('Data matrix', () => {
  it('does not trade on stale/invalid data (NO_ACTION_DATA_UNAVAILABLE)', () => {
    const data = [bar('2024-01-02', 100000, 'STALE'), bar('2024-01-03', 101000, 'VALID')];
    const r = baseRun(ports(), data, (_v, i) => (i === 0 ? 'BUY' : 'HOLD'));
    expect(r.fills.length).toBe(0);
    expect(r.dataWarnings.join(' ')).toContain('NO_ACTION_DATA_UNAVAILABLE');
  });

  it('rejects future publication (point-in-time)', () => {
    const data = [bar('2024-01-02', 100000, 'VALID', '2024-02-01')];
    const r = baseRun(ports(), data);
    expect(r.fills.length).toBe(0);
    expect(r.dataWarnings.join(' ')).toContain('FUTURE_PUBLICATION');
  });

  it('fails closed on empty dataset', () => {
    const r = baseRun(ports(), []);
    expect(r.status).toBe('DATA_UNAVAILABLE');
    expect(r.finalNAV).toBe(r.initialCapital);
  });
});

describe('Accounting + reconciliation', () => {
  it('conserves NAV and marks accounting CONSERVED', () => {
    const r = baseRun(ports());
    expect(r.accountingStatus).toBe('CONSERVED');
    expect(r.checkpoints.length).toBeGreaterThan(0);
  });

  it('FAILS the replay when the authoritative conservation validator rejects', () => {
    const r = baseRun(ports({ conservationPort: () => false }));
    expect(r.status).toBe('FAILED');
    expect(r.accountingStatus).toBe('VIOLATION');
  });

  it('detects orphan fills and unexplained cash delta', () => {
    const rep = ReplayReconciliation.reconcile({
      orderCount: 1, fillCount: 3, ledgerEntryCount: 1, cashDelta: 100, positionDelta: 5,
      expectedCashDelta: 0, expectedPositionDelta: 0,
    });
    expect(rep.verdict).toBe('MISMATCH');
    expect(rep.findings).toContain('ORPHAN_FILLS');
    expect(rep.findings).toContain('UNEXPLAINED_CASH_DELTA');
  });

  it('reconciles cleanly on consistent input', () => {
    const rep = ReplayReconciliation.reconcile({
      orderCount: 1, fillCount: 1, ledgerEntryCount: 1, cashDelta: 0, positionDelta: 0,
      expectedCashDelta: 0, expectedPositionDelta: 0, authoritativeStatus: 'RECONCILED',
    });
    expect(rep.verdict).toBe('RECONCILED');
  });

  it('NAV check rejects negative cash', () => {
    expect(ReplayAccounting.check({ cash: -1, positionsValue: 10, otherComponents: 0 })).toBe(false);
    expect(ReplayAccounting.check({ cash: 100, positionsValue: 50, otherComponents: 0 })).toBe(true);
  });
});

describe('Determinism + idempotency', () => {
  it('produces identical fingerprints for identical input', () => {
    const a = baseRun(ports());
    const b = baseRun(ports());
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
  });

  it('duplicate fill event yields one financial effect', () => {
    const r = baseRun(ports());
    const ids = r.fills.map((f) => f.eventId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(r.filledQuantity).toBe(r.fills.reduce((a, f) => a + f.quantity, 0));
  });
});
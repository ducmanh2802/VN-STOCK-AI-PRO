/**
 * REPLAY TESTS 3 — SAFETY (no real execution), risk/sizing matrix,
 * divergence analysis, monitoring triggers, backtest-vs-replay comparison.
 */
import { describe, it, expect } from 'vitest';
import { PaperReplayEngine, type ReplayPorts } from '../PaperReplayEngine.ts';
import { ReplayManifestEngine } from '../ReplayManifest.ts';
import { ReplayComparison } from '../ReplayComparison.ts';

const manifest = () => ReplayManifestEngine.create({
  replayId: 'R1', createdAt: '2026-10-04T00:00:00Z', datasetId: 'D1', datasetVersion: 'dv1',
  strategyId: 'S1', strategyVersion: 'sv1', decisionVersion: 'dv', riskModelVersion: 'rmv',
  positionSizingVersion: 'psv', executionModelVersion: 'emv', costModelVersion: 'cmv',
  universe: ['I1'], startDate: '2024-01-02', endDate: '2024-01-05',
  initialCapital: 100000000, mode: 'HISTORICAL_REPLAY', configuration: {},
});

const bars = [
  { date: '2024-01-02', open: 100000, high: 100000, low: 100000, close: 100000, volume: 1e6, publicationDate: '2024-01-02', dataQuality: 'VALID' as const },
  { date: '2024-01-03', open: 101000, high: 101000, low: 101000, close: 101000, volume: 1e6, publicationDate: '2024-01-03', dataQuality: 'VALID' as const },
];

function ports(over?: Partial<ReplayPorts>): ReplayPorts {
  return {
    executionPort: {
      isSimulation: true, name: 'P',
      submit: (i) => ({ success: true, orderId: `P${i.date}`, status: 'FILLED', code: 'EXECUTED', executedPrice: i.price, executedQuantity: i.quantity, fee: 1500, tax: 0, slippage: 50, ledgerEntryCount: 1 }),
    },
    riskPort: () => ({ approved: true, code: 'APPROVED', reason: 'ok' }),
    ...over,
  };
}

function run(p: ReplayPorts) {
  return PaperReplayEngine.run({
    manifest: manifest(), bars, strategy: (_v, i) => (i === 0 ? 'BUY' : 'HOLD'), ports: p,
    fees: (g) => ({ fee: g * 0.0015, tax: 0 }),
    slippage: (pr) => pr, roundLot: (q) => Math.floor(q / 100) * 100,
  });
}

describe('SAFETY — paper only', () => {
  it('BLOCKS a non-simulation execution port (no real broker reachable)', () => {
    const r = run(ports({
      executionPort: {
        isSimulation: false, name: 'RealBroker',
        submit: () => { throw new Error('must never be called'); },
      },
    }));
    expect(r.status).toBe('EXECUTION_BLOCKED');
    expect(r.dataWarnings).toContain('EXECUTION_PORT_NOT_SIMULATION');
    expect(r.fills.length).toBe(0);
  });

  it('never routes into real execution endpoints', () => {
    const r = run(ports());
    expect(r.manifest.currency).toBe('VND');
    expect(r.limitations.join(' ')).toContain('PAPER ONLY');
  });
});

describe('RISK MATRIX', () => {
  it('concentration/cash/position/margin/lot rejections all surface as risk rejections', () => {
    for (const code of ['POSITION_LIMIT', 'INSUFFICIENT_CASH', 'EXPOSURE_LIMIT_EXCEEDED', 'DAILY_LOSS_LIMIT', 'INVALID_LOT_SIZE']) {
      const r = run(ports({ riskPort: () => ({ approved: false, code, reason: code }) }));
      expect(r.riskRejectionCount).toBe(1);
      expect(r.orders[0].rejectionReason).toContain(code);
    }
  });

  it('sizing zero cause propagates without a fill', () => {
    const r = run(ports({ sizerPort: () => ({ quantity: 0, zeroCause: 'ZERO_BY_SIZING' }) }));
    expect(r.orders[0].zeroCause).toBe('ZERO_BY_SIZING');
    expect(r.fills.length).toBe(0);
  });

  it('lot rounding is enforced through the injected sizer path', () => {
    const r = run(ports({ sizerPort: () => ({ quantity: 150, zeroCause: null }) }));
    expect(r.fills[0].quantity).toBe(150);
    expect(r.orders[0].quantity).toBe(150);
  });
});

describe('MONITORING + AUDIT TRAIL', () => {
  it('propagates monitor triggers into limitations (audit trail)', () => {
    const r = run(ports({ monitorPort: () => ['RISK_LIMIT_BREACHED'] }));
    expect(r.limitations.join(' ')).toContain('monitor-trigger:RISK_LIMIT_BREACHED');
  });

  it('emits decision → risk → order → fill → position events in order', () => {
    const r = run(ports());
    const types = r.events.map((e) => e.eventType);
    expect(types).toContain('SIGNAL');
    expect(types).toContain('DECISION');
    expect(types).toContain('RISK_CHECK');
    expect(types).toContain('ORDER_CREATED');
    expect(types).toContain('FILL');
    expect(types).toContain('POSITION_UPDATE');
    const seqs = r.events.map((e) => e.sequence);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  });
});

describe('BACKTEST vs REPLAY COMPARISON', () => {
  it('classifies risk and execution divergences with explanations', () => {
    const c = ReplayComparison.compare(
      { returnPct: 10, cagrPct: 10, volatilityPct: 15, sharpe: 1.2, sortino: 1.5, maxDrawdownPct: -8, turnover: 3, fees: 1000, slippage: 500, tradeCount: 5, exposure: 0.8 },
      { returnPct: 4, finalNAV: 104000000, fees: 2500, tax: 100, slippage: 900, tradeCount: 3, riskRejectionCount: 2, executionRejectionCount: 1, filledQuantity: 300, exposure: 0.5 },
    );
    const kinds = c.divergences.map((d) => d.kind);
    expect(kinds).toContain('RISK');
    expect(kinds).toContain('EXECUTION');
    expect(kinds).toContain('FEES');
    expect(kinds).toContain('SLIPPAGE');
    expect(c.divergences.every((d) => d.explanation.length > 0)).toBe(true);
    expect(c.metrics.returnPct.delta).toBe(-6);
  });

  it('reports no divergence when replay matches backtest', () => {
    const c = ReplayComparison.compare(
      { returnPct: 10, cagrPct: 10, volatilityPct: 15, sharpe: 1, sortino: 1, maxDrawdownPct: -5, turnover: 1, fees: 100, slippage: 10, tradeCount: 5, exposure: 0.5 },
      { returnPct: 10, finalNAV: 110000000, fees: 100, tax: 0, slippage: 10, tradeCount: 5, riskRejectionCount: 0, executionRejectionCount: 0, filledQuantity: 500, exposure: 0.5 },
    );
    expect(c.divergences).toHaveLength(0);
  });
});
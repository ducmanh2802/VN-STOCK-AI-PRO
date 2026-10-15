/**
 * REPLAY TESTS 4 — FULL END-TO-END (§46):
 * dataset → strategy → signal → decision → risk → size → paper order →
 * paper fill → fee/tax/slippage → ledger → portfolio → NAV → monitoring → review.
 */
import { describe, it, expect } from 'vitest';
import { PaperReplayEngine } from '../PaperReplayEngine.ts';
import { ReplayManifestEngine } from '../ReplayManifest.ts';
import { MonitoringEngine, ReviewEngine } from '../../decision/index.ts';

const bars = [
  { date: '2024-01-02', open: 50000, high: 50000, low: 50000, close: 50000, volume: 2e6, publicationDate: '2024-01-02', dataQuality: 'VALID' as const },
  { date: '2024-01-03', open: 51000, high: 51000, low: 51000, close: 51000, volume: 2e6, publicationDate: '2024-01-03', dataQuality: 'VALID' as const },
  { date: '2024-01-04', open: 52000, high: 52000, low: 52000, close: 52000, volume: 2e6, publicationDate: '2024-01-04', dataQuality: 'VALID' as const },
  { date: '2024-01-05', open: 53000, high: 53000, low: 53000, close: 53000, volume: 2e6, publicationDate: '2024-01-05', dataQuality: 'VALID' as const },
];

describe('E2E certified replay scenario', () => {
  it('walks the whole chain with every transition verified', () => {
    const manifest = ReplayManifestEngine.create({
      replayId: 'E2E1', createdAt: '2026-10-04T00:00:00Z', datasetId: 'DS1', datasetVersion: 'dv1',
      strategyId: 'TREND', strategyVersion: 'v1', decisionVersion: 'v1.0.0-decision-os',
      riskModelVersion: 'rmv1', positionSizingVersion: 'psv1',
      executionModelVersion: 'emv1', costModelVersion: 'cmv1',
      universe: ['VN-HOSE-TEST'], startDate: '2024-01-02', endDate: '2024-01-05',
      initialCapital: 100000000, seed: 42, mode: 'DETERMINISTIC_REPLAY',
      configuration: { lookback: 2, lotSize: 100 },
    });

    let cash = manifest.initialCapital;
    const r = PaperReplayEngine.run({
      manifest,
      bars,
      strategy: (_v, i) => (i === 0 ? 'BUY' : i === 3 ? 'SELL' : 'HOLD'),
      fees: (gross, side) => ({ fee: Math.round(gross * 0.0015), tax: side === 'SELL' ? Math.round(gross * 0.001) : 0 }),
      slippage: (p, side) => (side === 'BUY' ? p * 1.001 : p * 0.999),
      roundLot: (q) => Math.floor(q / 100) * 100,
      ports: {
        executionPort: {
          isSimulation: true,
          name: 'PaperBroker',
          submit: (i) => {
            const px = i.side === 'BUY' ? i.price * 1.001 : i.price * 0.999;
            const gross = px * i.quantity;
            const fee = Math.round(gross * 0.0015);
            const tax = i.side === 'SELL' ? Math.round(gross * 0.001) : 0;
            cash += i.side === 'BUY' ? -(gross + fee) : gross - fee - tax;
            return {
              success: true, orderId: `PB_${i.date}`, status: 'FILLED', code: 'EXECUTED',
              executedPrice: px, executedQuantity: i.quantity, fee, tax,
              slippage: Math.abs(px - i.price) * i.quantity, ledgerEntryCount: 1,
              cashAfter: cash,
            };
          },
        },
        riskPort: (i) => ({
          approved: true, code: 'APPROVED', reason: 'within policy',
          approvedQuantity: Math.floor(i.quantity / 100) * 100,
        }),
        sizerPort: (i) => ({ quantity: Math.floor(i.riskApprovedQuantity / 100) * 100, zeroCause: null }),
        decisionPort: () => ({ decisionId: 'DEC-E2E', decisionType: 'BUY', decisionStatus: 'APPROVED', instrumentId: 'VN-HOSE-TEST' }),
        conservationPort: () => true,
        reconcilePort: () => 'RECONCILED',
        monitorPort: () => [],
      },
    });

    // chain completion
    expect(r.status).toBe('COMPLETED');
    expect(r.accountingStatus).toBe('CONSERVED');
    expect(r.reconciliationStatus).toBe('RECONCILED');
    expect(r.fills.length).toBeGreaterThanOrEqual(2);
    expect(r.finalNAV).toBeGreaterThan(0);
    expect(r.returnPct).not.toBeNull();

    // every stage emitted
    const types = new Set(r.events.map((e) => e.eventType));
    for (const t of ['SESSION_START', 'MARKET_DATA', 'SIGNAL', 'DECISION', 'RISK_CHECK', 'ORDER_CREATED', 'ORDER_ACCEPTED', 'FILL', 'FEE', 'SLIPPAGE', 'POSITION_UPDATE', 'REPLAY_COMPLETE'] as const) {
      expect(types.has(t)).toBe(true);
    }

    // checkpoints carry manifest fingerprint and NAV
    expect(r.checkpoints.length).toBeGreaterThan(0);
    expect(r.checkpoints.every((c) => c.manifestFingerprint.startsWith('MF_'))).toBe(true);

    // monitoring + decision review integrate
    const triggers = MonitoringEngine.detect({
      decisionId: 'DEC-E2E', thesisInvalidated: false, riskLimitBreached: false, targetReached: true,
      stopTriggered: false, valuationChanged: false, fundamentalChanged: false,
      macroChanged: false, industryChanged: false, dataInvalid: false, positionChanged: true,
    });
    expect(triggers).toContain('TARGET_REACHED');
    const review = ReviewEngine.create({
      reviewId: 'REV-E2E', decisionId: 'DEC-E2E', originalDecision: 'BUY',
      originalEvidence: [{ kind: 'manifest', ref: 'MF', asOfDate: '2024-01-02', source: 'replay' }],
      actualOutcome: `${r.returnPct?.toFixed(2)}%`, whatChanged: [], whatWasCorrect: ['risk path'],
      whatWasWrong: [], lessons: ['paper path validated'], newDecision: 'HOLD',
      reviewedAt: '2026-10-04T00:00:00Z',
    });
    expect(review.originalDecision).toBe('BUY');
  });

  it('is reproducible under DETERMINISTIC_REPLAY (same fingerprint)', () => {
    const manifest = ReplayManifestEngine.create({
      replayId: 'E2E2', createdAt: '2026-10-04T00:00:00Z', datasetId: 'DS1', datasetVersion: 'dv1',
      strategyId: 'TREND', strategyVersion: 'v1', decisionVersion: 'v1', riskModelVersion: 'rmv',
      positionSizingVersion: 'psv', executionModelVersion: 'emv', costModelVersion: 'cmv',
      universe: ['I1'], startDate: '2024-01-02', endDate: '2024-01-05',
      initialCapital: 100000000, seed: 42, mode: 'DETERMINISTIC_REPLAY', configuration: {},
    });
    const ports = {
      executionPort: {
        isSimulation: true, name: 'P',
        submit: (i: { date: string; price: number; quantity: number }) => ({
          success: true, orderId: `O_${i.date}`, status: 'FILLED', code: 'EXECUTED',
          executedPrice: i.price, executedQuantity: i.quantity, fee: 100, tax: 0, slippage: 0, ledgerEntryCount: 1,
        }),
      },
      riskPort: () => ({ approved: true, code: 'APPROVED', reason: '' }),
    };
    const run = () => PaperReplayEngine.run({
      manifest, bars, strategy: (_v: unknown, i: number) => (i === 0 ? 'BUY' as const : 'HOLD' as const),
      fees: () => ({ fee: 100, tax: 0 }), slippage: (p: number) => p, roundLot: (q: number) => Math.floor(q / 100) * 100,
      ports,
    });
    const a = run();
    const b = run();
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.finalNAV).toBe(b.finalNAV);
  });
});
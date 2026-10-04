import { describe, expect, it } from 'vitest';
import { AlertEngine, type AlertRule, type Observation } from '../AlertEngine.ts';

const now = '2026-10-04T00:00:00.000Z';
const obs = (o: Partial<Observation> = {}): Observation => ({
  instrumentId: 'HPG',
  price: 25000,
  previousPrice: 24000,
  asOf: '2026-10-03',
  dataValid: true,
  ...o,
});
const rule = (o: Partial<AlertRule> = {}): AlertRule =>
  AlertEngine.createRule({ id: 'r1', instrumentId: 'hpg', kind: 'PRICE_ABOVE', threshold: 30000, severity: 'WARNING', dataIndependent: false, createdAt: now, ...o });

describe('alert rules', () => {
  it('normalizes instrument id; disabled rules never fire', () => {
    expect(rule().instrumentId).toBe('HPG');
    const alerts = AlertEngine.evaluateRules([rule({ enabled: false })], obs());
    expect(alerts).toHaveLength(0);
  });
  it('rules for other instruments are ignored', () => {
    expect(AlertEngine.evaluateRules([rule({ instrumentId: 'FPT' })], obs())).toHaveLength(0);
  });
  it('rejects malformed rules at creation (fail-closed)', () => {
    expect(() => rule({ id: '  ' })).toThrow('ALERT_RULE_ID_REQUIRED');
    expect(() => rule({ instrumentId: ' ' })).toThrow('ALERT_INSTRUMENT_REQUIRED');
    expect(() => rule({ threshold: null })).toThrow('ALERT_THRESHOLD_REQUIRED');
    expect(() => rule({ threshold: -5 })).toThrow('ALERT_THRESHOLD_MUST_BE_POSITIVE');
    expect(() => rule({ kind: 'PRICE_CHANGE_PCT', threshold: 0 })).toThrow('ALERT_THRESHOLD_MUST_BE_POSITIVE');
  });
});

describe('evaluation against supplied observations', () => {
  it('fires strictly above/below and stamps the observation time', () => {
    const up = AlertEngine.evaluateRules([rule({ threshold: 24000 })], obs({ price: 25000 }));
    expect(up).toHaveLength(1);
    expect(up[0].observationAsOf).toBe('2026-10-03');
    expect(AlertEngine.evaluateRules([rule({ threshold: 25000 })], obs({ price: 25000 }))).toHaveLength(0); // boundary is not a breach
    const down = AlertEngine.evaluateRules([rule({ kind: 'PRICE_BELOW', threshold: 30000, severity: 'CRITICAL' })], obs());
    expect(down[0].severity).toBe('CRITICAL');
  });
  it('percentage move uses |move| >= |threshold| and needs a previous price', () => {
    const r = rule({ kind: 'PRICE_CHANGE_PCT', threshold: 0.05 });
    expect(AlertEngine.evaluateRules([r], obs({ price: 25300, previousPrice: 24000 }))).toHaveLength(1); // +5.42%
    expect(AlertEngine.evaluateRules([r], obs({ price: 25100, previousPrice: 24000 }))).toHaveLength(0); // +4.58% below threshold
    expect(AlertEngine.evaluateRules([r], obs({ price: 22700, previousPrice: 24000 }))).toHaveLength(1); // -5.42% down
    const noPrev = AlertEngine.evaluateRules([r], obs({ previousPrice: null }));
    expect(noPrev[0].message).toContain('Previous price unavailable');
  });
  it('missing price yields NOT_EVALUATED info, never a fabricated breach', () => {
    const alerts = AlertEngine.evaluateRules([rule()], obs({ price: null }));
    expect(alerts[0].severity).toBe('INFO');
    expect(alerts[0].message).toContain('not evaluated');
  });
});

describe('false-trigger guard', () => {
  it('invalid data suppresses breach alerts unless the rule is data-independent', () => {
    const suppressed = AlertEngine.evaluateRules([rule({ threshold: 24000 })], obs({ dataValid: false }));
    expect(suppressed[0].suppressed).toBe(true);
    expect(suppressed[0].suppressionReason).toBe('DATA_INVALID');
    expect(AlertEngine.criticalCount(suppressed)).toBe(0);
    const forced = AlertEngine.evaluateRules(
      [rule({ threshold: 24000, dataIndependent: true, severity: 'CRITICAL' })],
      obs({ dataValid: false }),
    );
    expect(forced[0].suppressed).toBe(false);
    expect(AlertEngine.criticalCount(forced)).toBe(1);
  });
});

describe('decision trigger mapping (reuses certified MonitoringEngine)', () => {
  const state = (o: Partial<Parameters<typeof AlertEngine.fromTriggers>[0]['state']> = {}) => ({
    decisionId: 'd1',
    thesisInvalidated: false,
    riskLimitBreached: false,
    targetReached: false,
    stopTriggered: false,
    valuationChanged: false,
    fundamentalChanged: false,
    macroChanged: false,
    industryChanged: false,
    dataInvalid: false,
    positionChanged: false,
    ...o,
  });
  it('maps triggers to severity-ranked alerts', () => {
    const alerts = AlertEngine.fromTriggers({ decisionId: 'd1', instrumentId: 'hpg', state: state({ thesisInvalidated: true, valuationChanged: true }), asOf: '2026-10-03' });
    expect(alerts.map((a) => a.severity)).toEqual(['CRITICAL', 'WARNING']);
    expect(alerts[0].instrumentId).toBe('HPG');
    expect(AlertEngine.criticalCount(alerts)).toBe(1);
  });
  it('DATA_INVALID suppresses other triggers (certified guard reused)', () => {
    const alerts = AlertEngine.fromTriggers({ decisionId: 'd1', instrumentId: 'HPG', state: state({ dataInvalid: true, valuationChanged: true, thesisInvalidated: true }), asOf: '2026-10-03' });
    const suppressed = alerts.filter((a) => a.suppressed).map((a) => a.ruleId);
    expect(suppressed).toEqual(expect.arrayContaining(['trigger:VALUATION_CHANGED', 'trigger:THESIS_INVALIDATED']));
    expect(AlertEngine.criticalCount(alerts)).toBe(0);
  });
  it('deterministic and idempotent', () => {
    const i = { decisionId: 'd1', instrumentId: 'HPG', state: state({ macroChanged: true }), asOf: '2026-10-03' };
    expect(AlertEngine.fromTriggers(i)).toEqual(AlertEngine.fromTriggers(i));
  });
});
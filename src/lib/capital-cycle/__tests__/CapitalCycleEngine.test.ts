import { describe, it, expect } from 'vitest';
import { CapitalCycleEngine } from '../CapitalCycleEngine.ts';
import { makeTestDrivers } from './fixtures.ts';

describe('Phase 26 — CapitalCycleEngine', () => {
  it('classifies EXPANDING stage when capex is expanding with positive margins and ROIC', () => {
    const drivers = makeTestDrivers({
      privateCapexTrend: 'EXPANDING',
      averageGrossMarginTrend: 'EXPANDING',
      roicVsWaccSpreadPercent: 4.0,
    });

    const result = CapitalCycleEngine.classifyStage(drivers);
    expect(result.stage).toBe('EXPANDING');
    expect(result.cycleScore).toBe(85);
  });

  it('classifies CAPITAL_DESTRUCTION when ROIC is deeply negative and margins compressing', () => {
    const drivers = makeTestDrivers({
      privateCapexTrend: 'CONTRACTING',
      averageGrossMarginTrend: 'COMPRESSING',
      roicVsWaccSpreadPercent: -5.0,
    });

    const result = CapitalCycleEngine.classifyStage(drivers);
    expect(result.stage).toBe('CAPITAL_DESTRUCTION');
    expect(result.cycleScore).toBe(15);
  });

  it('classifies PEAKING stage under peak capacity utilization and heavy capex', () => {
    const drivers = makeTestDrivers({
      industryCapacityUtilizationPercent: 92,
      privateCapexTrend: 'EXPANDING',
      averageGrossMarginTrend: 'STABLE',
    });

    const result = CapitalCycleEngine.classifyStage(drivers);
    expect(result.stage).toBe('PEAKING');
    expect(result.cycleScore).toBe(65);
  });

  it('generates a complete IndustryCapitalCycleSnapshot with explainability', () => {
    const drivers = makeTestDrivers();
    const snapshot = CapitalCycleEngine.evaluateSnapshot({
      sectorId: 'materials',
      sectorName: 'Vật liệu xây dựng',
      drivers,
    });

    expect(snapshot.sectorId).toBe('materials');
    expect(snapshot.cycleScore).toBeGreaterThan(0);
    expect(snapshot.keyObservations.length).toBeGreaterThan(0);
    expect(snapshot.confidence).toBe('MEDIUM');
  });
});

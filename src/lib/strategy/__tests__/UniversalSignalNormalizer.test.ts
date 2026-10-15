import { describe, it, expect } from 'vitest';
import { UniversalSignalNormalizer } from '../UniversalSignalNormalizer.ts';
import type { StrategySignalLineage } from '../types.ts';

describe('Phase 25 — UniversalSignalNormalizer', () => {
  const dummyLineage: StrategySignalLineage = {
    strategyId: 'TEST_STRAT',
    strategyVersion: '25.0.0-PROD',
    engine: 'StrategyFactory',
    evaluatedAt: '2026-10-01T15:00:00.000Z',
    asOfDate: '2026-10-01',
    assetClass: 'EQUITY',
    sourceSnapshots: {},
  };

  it('clamps conviction to [0, 100] interval and handles NaN / Infinity', () => {
    expect(UniversalSignalNormalizer.normalizeConviction(85.5)).toBe(85.5);
    expect(UniversalSignalNormalizer.normalizeConviction(120)).toBe(100);
    expect(UniversalSignalNormalizer.normalizeConviction(-15)).toBe(0);
    expect(UniversalSignalNormalizer.normalizeConviction(NaN)).toBe(0);
    expect(UniversalSignalNormalizer.normalizeConviction(Infinity)).toBe(0);
    expect(UniversalSignalNormalizer.normalizeConviction(-Infinity)).toBe(0);
    expect(UniversalSignalNormalizer.normalizeConviction(null)).toBe(0);
    expect(UniversalSignalNormalizer.normalizeConviction(undefined)).toBe(0);
  });

  it('derives categorical strength correctly', () => {
    expect(UniversalSignalNormalizer.deriveStrength(95)).toBe('STRONG');
    expect(UniversalSignalNormalizer.deriveStrength(80)).toBe('STRONG');
    expect(UniversalSignalNormalizer.deriveStrength(79)).toBe('MODERATE');
    expect(UniversalSignalNormalizer.deriveStrength(50)).toBe('MODERATE');
    expect(UniversalSignalNormalizer.deriveStrength(49)).toBe('WEAK');
    expect(UniversalSignalNormalizer.deriveStrength(1)).toBe('WEAK');
    expect(UniversalSignalNormalizer.deriveStrength(0)).toBe('NEUTRAL');
  });

  it('normalizes targetPrice and stopLoss safely', () => {
    expect(UniversalSignalNormalizer.normalizePrice(28500.5)).toBe(28500.5);
    expect(UniversalSignalNormalizer.normalizePrice(-100)).toBeNull();
    expect(UniversalSignalNormalizer.normalizePrice(0)).toBeNull();
    expect(UniversalSignalNormalizer.normalizePrice(NaN)).toBeNull();
    expect(UniversalSignalNormalizer.normalizePrice(Infinity)).toBeNull();
  });

  it('forces fail-closed behavior when dataFreshness is UNAVAILABLE or INVALID', () => {
    const signalUnavailable = UniversalSignalNormalizer.normalize({
      strategyId: 'TEST_STRAT',
      assetClass: 'EQUITY',
      symbol: 'hpg',
      direction: 'LONG',
      conviction: 90,
      targetPrice: 35000,
      stopLoss: 25000,
      dataFreshness: 'UNAVAILABLE',
      reasonCode: 'REQUIRED_DATA_MISSING',
      lineage: dummyLineage,
    });

    expect(signalUnavailable.direction).toBe('HOLD');
    expect(signalUnavailable.conviction).toBe(0);
    expect(signalUnavailable.strength).toBe('NEUTRAL');
    expect(signalUnavailable.targetPrice).toBeNull();
    expect(signalUnavailable.stopLoss).toBeNull();
    expect(signalUnavailable.dataFreshness).toBe('UNAVAILABLE');
    expect(signalUnavailable.symbol).toBe('HPG');

    const derivativeSignal = UniversalSignalNormalizer.normalize({
      strategyId: 'TEST_STRAT',
      assetClass: 'DERIVATIVE',
      symbol: 'vn30f1m',
      direction: 'SHORT',
      conviction: 85,
      dataFreshness: 'INVALID',
      lineage: { ...dummyLineage, assetClass: 'DERIVATIVE' },
    });

    expect(derivativeSignal.direction).toBe('FLAT');
    expect(derivativeSignal.conviction).toBe(0);
    expect(derivativeSignal.dataFreshness).toBe('INVALID');
  });

  it('normalizes zero conviction to neutral direction', () => {
    const signal = UniversalSignalNormalizer.normalize({
      strategyId: 'TEST_STRAT',
      assetClass: 'EQUITY',
      symbol: 'VNM',
      direction: 'LONG',
      conviction: 0,
      lineage: dummyLineage,
    });

    expect(signal.direction).toBe('HOLD');
    expect(signal.conviction).toBe(0);
    expect(signal.strength).toBe('NEUTRAL');
  });
});

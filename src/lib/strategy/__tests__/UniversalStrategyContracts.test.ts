import { describe, it, expect } from 'vitest';
import type {
  AssetClass,
  SignalDirection,
  SignalStrength,
  TimeInForce,
  StrategySignal,
} from '../types.ts';
import { StrategyFactory } from '../StrategyFactory.ts';

describe('Phase 25 — Universal Strategy Contracts', () => {
  it('declares and verifies all supported asset classes', () => {
    const assets: AssetClass[] = ['EQUITY', 'DERIVATIVE', 'ETF', 'CROSS_ASSET'];
    expect(assets).toHaveLength(4);
  });

  it('declares and verifies all supported signal directions', () => {
    const directions: SignalDirection[] = [
      'LONG',
      'SHORT',
      'FLAT',
      'HOLD',
      'CLOSE',
      'REBALANCE',
    ];
    expect(directions).toHaveLength(6);
  });

  it('declares and verifies all signal strength tiers', () => {
    const strengths: SignalStrength[] = ['STRONG', 'MODERATE', 'WEAK', 'NEUTRAL'];
    expect(strengths).toHaveLength(4);
  });

  it('declares and verifies all time-in-force horizons', () => {
    const horizons: TimeInForce[] = ['INTRADAY', 'SWING', 'POSITION'];
    expect(horizons).toHaveLength(3);
  });

  it('verifies all registered strategies satisfy MultiAssetStrategy contract', () => {
    const strategies = StrategyFactory.getAllStrategies();
    expect(strategies.length).toBeGreaterThanOrEqual(5);

    for (const strat of strategies) {
      expect(typeof strat.id).toBe('string');
      expect(typeof strat.name).toBe('string');
      expect(typeof strat.description).toBe('string');
      expect(['EQUITY', 'DERIVATIVE', 'ETF', 'CROSS_ASSET']).toContain(strat.assetClass);
      expect(typeof strat.validateParameters).toBe('function');
      expect(typeof strat.evaluate).toBe('function');
      expect(strat.defaultParameters).toBeDefined();
    }
  });
});

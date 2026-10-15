import { describe, it, expect } from 'vitest';
import { PortfolioRiskMetrics } from '../PortfolioRiskMetrics.ts';
import type { BrokerAccount, BrokerPosition } from '../../execution/BrokerAdapter.ts';

function makeAccount(partial: Partial<BrokerAccount> = {}, positions: BrokerPosition[] = []): BrokerAccount {
  const defaults: BrokerAccount = {
    accountId: 'ACC_1',
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
    updatedAt: '1970-01-01T00:00:00.000Z',
  };
  return { ...defaults, ...partial };
}

function pos(symbol: string, quantity: number, avgCost: number, currentPrice: number | null = avgCost): BrokerPosition {
  return {
    symbol,
    quantity,
    reservedQuantity: 0,
    availableQuantity: quantity,
    averageCost: avgCost,
    currentPrice,
    marketValue: quantity * (currentPrice ?? avgCost),
    unrealizedPnL: 0,
    unrealizedPnLPercent: 0,
    updatedAt: '1970-01-01T00:00:00.000Z',
  };
}

const SHOCKS = { mild: 0.03, moderate: 0.06, severe: 0.1 };
const NOW = '2026-01-01T00:00:00.000Z';

describe('Phase UI-3 — PortfolioRiskMetrics (server-authoritative)', () => {
  describe('empty portfolio (no equity exposure)', () => {
    it('reports genuine zeros (not missing data) and fail-closed nulls for missing inputs', () => {
      const acc = makeAccount();
      const r = PortfolioRiskMetrics.compute({ account: acc, stressShocks: SHOCKS, now: NOW });

      expect(r.equity).toBe(100_000_000);
      expect(r.exposure.value).toBe(0);
      expect(r.exposure.status).toBe('OK');
      expect(r.concentration.value).toBe(0);
      expect(r.cashUtilization.value).toBeCloseTo(100);
      expect(r.var.value).toBe(0);
      expect(r.var.status).toBe('OK');
      expect(r.stressLoss.value).toBe(0);
      expect(r.stressLoss.status).toBe('OK');
      expect(r.drawdown.value).toBeNull();
      expect(r.drawdown.status).toBe('INSUFFICIENT_DATA');
      expect(r.dailyLoss.value).toBeNull();
      expect(r.dailyLoss.status).toBe('DATA_UNAVAILABLE');
    });
  });

  describe('one position', () => {
    it('computes exposure, concentration, VaR from real returns, and risk-approved capital', () => {
      const acc = makeAccount(
        { marketValue: 10_000_000, equity: 100_000_000, cash: 90_000_000, availableCash: 90_000_000 },
        [pos('HPG', 100, 100_000, 100_000)]
      );
      const returns = Array.from({ length: 60 }, (_, i) => -((i % 11) - 5) / 1000);
      const r = PortfolioRiskMetrics.compute({
        account: acc,
        historicalReturns: { HPG: returns },
        stressShocks: SHOCKS,
        minReturnsForVar: 30,
        now: NOW,
      });

      expect(r.exposure.status).toBe('OK');
      expect(r.exposure.value).toBeCloseTo(10, 5);
      expect(r.concentration.value).toBeCloseTo(10, 5);
      expect(r.var.status).toBe('OK');
      expect(r.var.value).toBeGreaterThan(0);
      expect(r.var.units).toBe('VND');
      expect(r.var.confidence).toContain('95%');
      expect(r.stressLoss.value).toBe(1_000_000);
      expect((r.stressLoss.details?.scenarios as Record<string, number>).severe).toBe(1_000_000);
      expect(r.riskApprovedCapital.value).toBe(70_000_000);
    });
  });

  describe('VaR missing / insufficient data safety', () => {
    it('returns INSUFFICIENT_DATA with null value when returns are absent for a non-empty portfolio', () => {
      const acc = makeAccount(
        { marketValue: 10_000_000, equity: 100_000_000 },
        [pos('HPG', 100, 100_000, 100_000)]
      );
      const r = PortfolioRiskMetrics.compute({ account: acc, stressShocks: SHOCKS, minReturnsForVar: 30, now: NOW });
      expect(r.var.value).toBeNull();
      expect(r.var.status).toBe('INSUFFICIENT_DATA');
    });

    it('returns INSUFFICIENT_DATA for a single historical return (insufficient history)', () => {
      const acc = makeAccount(
        { marketValue: 10_000_000, equity: 100_000_000 },
        [pos('HPG', 100, 100_000, 100_000)]
      );
      const r = PortfolioRiskMetrics.compute({
        account: acc,
        historicalReturns: { HPG: [0.01] },
        minReturnsForVar: 30,
        now: NOW,
      });
      expect(r.var.value).toBeNull();
      expect(r.var.status).toBe('INSUFFICIENT_DATA');
    });

    it('rejects NaN / Infinity returns and does not fabricate a VaR', () => {
      const acc = makeAccount(
        { marketValue: 10_000_000, equity: 100_000_000 },
        [pos('HPG', 100, 100_000, 100_000)]
      );
      const bad = Array.from({ length: 40 }, () => Number.NaN);
      const r = PortfolioRiskMetrics.compute({ account: acc, historicalReturns: { HPG: bad }, minReturnsForVar: 30, now: NOW });
      expect(r.var.value).toBeNull();
      expect(r.var.status).toBe('INSUFFICIENT_DATA');
    });

    it('handles identical returns deterministically (no NaN/Infinity)', () => {
      const acc = makeAccount(
        { marketValue: 10_000_000, equity: 100_000_000 },
        [pos('HPG', 100, 100_000, 100_000)]
      );
      const identical = Array.from({ length: 40 }, () => -0.02);
      const r = PortfolioRiskMetrics.compute({ account: acc, historicalReturns: { HPG: identical }, minReturnsForVar: 30, now: NOW });
      expect(r.var.status).toBe('OK');
      expect(Number.isFinite(r.var.value)).toBe(true);
      expect(r.var.value).toBe(2_000_000);
    });

    it('clamps VaR to >= 0 for an all-gain series (large gain boundary)', () => {
      const acc = makeAccount(
        { marketValue: 10_000_000, equity: 100_000_000 },
        [pos('HPG', 100, 100_000, 100_000)]
      );
      const gains = Array.from({ length: 40 }, () => 0.01);
      const r = PortfolioRiskMetrics.compute({ account: acc, historicalReturns: { HPG: gains }, minReturnsForVar: 30, now: NOW });
      expect(r.var.status).toBe('OK');
      expect(r.var.value).toBe(0);
    });
describe('missing / unavailable quote data', () => {
    it('labels exposure STALE (preserves last valid value) when quote is unavailable', () => {
      const acc = makeAccount(
        { marketValue: 10_000_000, equity: 100_000_000 },
        [pos('HPG', 100, 100_000, null)]
      );
      const r = PortfolioRiskMetrics.compute({
        account: acc,
        quoteStatus: { HPG: 'UNAVAILABLE' },
        stressShocks: SHOCKS,
        now: NOW,
      });
      expect(r.exposure.value).not.toBeNull();
      expect(r.exposure.status).toBe('STALE');
      expect(r.concentration.value).toBeNull();
      expect(r.concentration.status).toBe('DATA_UNAVAILABLE');
    });
  });

  describe('stress test safety', () => {
    it('returns DATA_UNAVAILABLE with null value when no shocks are configured', () => {
      const acc = makeAccount(
        { marketValue: 10_000_000, equity: 100_000_000 },
        [pos('HPG', 100, 100_000, 100_000)]
      );
      const r = PortfolioRiskMetrics.compute({ account: acc, stressShocks: {}, now: NOW });
      expect(r.stressLoss.value).toBeNull();
      expect(r.stressLoss.status).toBe('DATA_UNAVAILABLE');
    });

    it('returns DATA_UNAVAILABLE for impossible / negative shock rates', () => {
      const acc = makeAccount(
        { marketValue: 10_000_000, equity: 100_000_000 },
        [pos('HPG', 100, 100_000, 100_000)]
      );
      const r = PortfolioRiskMetrics.compute({ account: acc, stressShocks: { bad: -0.05 }, now: NOW });
      expect(r.stressLoss.status).toBe('DATA_UNAVAILABLE');
      expect(r.stressLoss.value).toBeNull();
    });
  });

  describe('invalid position / NaN rejection', () => {
    it('returns DATA_UNAVAILABLE for exposure on a negative-quantity position', () => {
      const acc = makeAccount(
        { marketValue: -5_000, equity: 99_995_000 },
        [pos('HPG', -5, 100_000, 100_000)]
      );
      const r = PortfolioRiskMetrics.compute({ account: acc, stressShocks: SHOCKS, now: NOW });
      expect(r.exposure.value).toBeNull();
      expect(r.exposure.status).toBe('DATA_UNAVAILABLE');
    });
  });

  describe('max drawdown boundaries', () => {
    it('computes correct peak-to-trough drawdown', () => {
      const acc = makeAccount();
      const r = PortfolioRiskMetrics.compute({ account: acc, equityHistory: [100, 90, 110, 85], now: NOW });
      expect(r.drawdown.status).toBe('OK');
      expect(r.drawdown.value).toBeCloseTo(22.73, 1);
    });

    it('reports 0 drawdown for a monotonically increasing series', () => {
      const acc = makeAccount();
      const r = PortfolioRiskMetrics.compute({ account: acc, equityHistory: [100, 110, 120], now: NOW });
      expect(r.drawdown.value).toBe(0);
      expect(r.drawdown.status).toBe('OK');
    });

    it('rejects invalid (non-finite) equity history', () => {
      const acc = makeAccount();
      const r = PortfolioRiskMetrics.compute({ account: acc, equityHistory: [100, Number.NaN, 90], now: NOW });
      expect(r.drawdown.value).toBeNull();
      expect(r.drawdown.status).toBe('DATA_UNAVAILABLE');
    });
  });

  describe('determinism', () => {
    it('produces identical reports for identical input', () => {
      const acc = makeAccount(
        { marketValue: 10_000_000, equity: 100_000_000 },
        [pos('HPG', 100, 100_000, 100_000)]
      );
      const input = {
        account: acc,
        historicalReturns: { HPG: Array.from({ length: 35 }, (_, i) => -((i % 7) - 3) / 100) },
        stressShocks: SHOCKS,
        minReturnsForVar: 30,
        now: NOW,
      };
      const a = PortfolioRiskMetrics.compute(input);
      const b = PortfolioRiskMetrics.compute(input);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
  });
  });
});
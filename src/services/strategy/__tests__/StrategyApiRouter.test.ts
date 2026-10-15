import { describe, expect, it, vi, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { createStrategyApiRouter } from '../StrategyApiRouter.ts';
import { StrategyIntelligenceService } from '../StrategyIntelligenceService.ts';
import type { StrategySignal } from '../../../lib/strategy/types.ts';

const mockSignal: StrategySignal = {
  strategyId: 'STRATEGY_EQUITY_EARNINGS_MOMENTUM',
  assetClass: 'EQUITY',
  symbol: 'HPG',
  direction: 'LONG',
  conviction: 82,
  strength: 'STRONG',
  targetPrice: 30000,
  stopLoss: 25000,
  timeInForce: 'SWING',
  dataFreshness: 'CURRENT',
  notes: ['deterministic mock signal for router test'],
  lineage: {
    strategyId: 'STRATEGY_EQUITY_EARNINGS_MOMENTUM',
    strategyVersion: '25.0.0-PROD',
    engine: 'StrategyIntelligenceService',
    evaluatedAt: '2026-10-01T00:00:00.000Z',
    asOfDate: '2026-10-01',
    assetClass: 'EQUITY',
    sourceSnapshots: {},
  },
};

async function createTestApp() {
  const router = createStrategyApiRouter();
  const app = express();
  app.use(express.json());
  app.use('/api/strategy', router);

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}/api/strategy`;

  return {
    baseUrl,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe('Strategy API — GET /list', () => {
  it('returns the registered strategy generators with their metadata', async () => {
    const harness = await createTestApp();
    try {
      const res = await fetch(`${harness.baseUrl}/list`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.count).toBeGreaterThan(0);
      expect(json.strategies.some((s: { id: string }) => s.id === 'STRATEGY_EQUITY_EARNINGS_MOMENTUM')).toBe(true);
      for (const s of json.strategies) {
        expect(s.id).toBeTruthy();
        expect(s.name).toBeTruthy();
        expect(s.assetClass).toBeTruthy();
      }
    } finally {
      await harness.close();
    }
  });
});

describe('Strategy API — POST /signal', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('evaluates a valid request and returns a fail-closed advisory signal', async () => {
    const spy = vi
      .spyOn(StrategyIntelligenceService, 'evaluateSignal')
      .mockResolvedValue(mockSignal);

    const harness = await createTestApp();
    try {
      const res = await fetch(`${harness.baseUrl}/signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategyId: 'STRATEGY_EQUITY_EARNINGS_MOMENTUM',
          symbol: 'hpg',
          asOfDate: '2026-10-01',
          currentPrice: 28500,
          parameters: { minRevenueGrowthYoY: 10 },
        }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.advisoryOnly).toBe(true);
      expect(json.signal).toEqual(mockSignal);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0].symbol).toBe('HPG');
      expect(spy.mock.calls[0][0].strategyId).toBe('STRATEGY_EQUITY_EARNINGS_MOMENTUM');
    } finally {
      await harness.close();
    }
  });

  it('rejects a missing strategyId with 400', async () => {
    const harness = await createTestApp();
    try {
      const res = await fetch(`${harness.baseUrl}/signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: 'HPG' }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('MISSING_FIELD');
    } finally {
      await harness.close();
    }
  });

  it('rejects an invalid symbol format with 400', async () => {
    const harness = await createTestApp();
    try {
      const res = await fetch(`${harness.baseUrl}/signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyId: 'ANY', symbol: '>>><<<' }),
      });
      expect(res.status).toBe(400);
    } finally {
      await harness.close();
    }
  });

  it('rejects a malformed asOfDate with 400', async () => {
    const harness = await createTestApp();
    try {
      const res = await fetch(`${harness.baseUrl}/signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyId: 'ANY', symbol: 'HPG', asOfDate: '01/10/2026' }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('INVALID_DATE');
    } finally {
      await harness.close();
    }
  });

  it('rejects an unsupported assetClass with 400', async () => {
    const harness = await createTestApp();
    try {
      const res = await fetch(`${harness.baseUrl}/signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyId: 'ANY', symbol: 'HPG', assetClass: 'BOND' }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('INVALID_ASSET_CLASS');
    } finally {
      await harness.close();
    }
  });

  it('rejects non-object parameters with 400', async () => {
    const harness = await createTestApp();
    try {
      const res = await fetch(`${harness.baseUrl}/signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyId: 'ANY', symbol: 'HPG', parameters: [1, 2, 3] }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('INVALID_PARAMETERS');
    } finally {
      await harness.close();
    }
  });

  it('answers a service failure with a typed 500 that stays advisory-only', async () => {
    vi.spyOn(StrategyIntelligenceService, 'evaluateSignal').mockRejectedValue(
      new Error('upstream exploded')
    );

    const harness = await createTestApp();
    try {
      const res = await fetch(`${harness.baseUrl}/signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyId: 'ANY', symbol: 'HPG' }),
      });
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('STRATEGY_EVALUATION_FAILED');
      expect(json.advisoryOnly).toBe(true);
    } finally {
      await harness.close();
    }
  });

  it('normalizes an unregistered strategy id into a fail-closed signal, not an error', async () => {
    vi.spyOn(StrategyIntelligenceService, 'evaluateSignal').mockImplementation(async () => ({
      ...mockSignal,
      direction: 'HOLD',
      conviction: 0,
      strength: 'NEUTRAL',
      dataFreshness: 'INVALID',
      reasonCode: 'INVALID_STRATEGY_ID',
    }));

    const harness = await createTestApp();
    try {
      const res = await fetch(`${harness.baseUrl}/signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyId: 'BOGUS_STRATEGY', symbol: 'HPG' }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.signal.direction).toBe('HOLD');
      expect(json.signal.reasonCode).toBe('INVALID_STRATEGY_ID');
    } finally {
      await harness.close();
    }
  });
});
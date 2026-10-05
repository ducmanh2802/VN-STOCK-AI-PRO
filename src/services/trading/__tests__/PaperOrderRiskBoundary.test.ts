/**
 * P0-01 REGRESSION SUITE — HTTP ORDER PATH MUST TRAVERSE THE FULL RISK CHAIN
 * ======================================================================
 * Proves, at the HTTP boundary, for every accepted or rejected order:
 *   - RiskGuard, RiskManager and PositionSizer are actually invoked;
 *   - PaperBroker.submitOrder is invoked ONLY after every safety gate passed;
 *   - a rejected decision produces NO broker submission;
 *   - a zero sizing result is attributable to one of exactly four causes;
 *   - a non-simulation broker fails closed BEFORE any submission.
 */
import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { createTradingApiRouter } from '../../../lib/trading/api/TradingApiRouter.ts';
import { TradingEngine } from '../../../lib/trading/engine/TradingEngine.ts';
import { PaperBroker } from '../../../lib/trading/paper/PaperBroker.ts';
import { classifyZeroCause } from '../PaperOrderRiskBoundary.ts';
import {
  type RealtimeQuote,
  MarketDataUnavailableError,
} from '../../market/realMarketDataService.ts';

/** HPG quote: entry 28 500, band 26 050 – 29 950. */
const QUOTE_TS = '2026-04-10T02:00:00.000Z';
function makeQuote(overrides: Record<string, unknown> = {}, quoteOverrides: Record<string, unknown> = {}): RealtimeQuote {
  const nowIso = new Date().toISOString();
  return {
    symbol: 'HPG',
    source: 'VPS',
    dataStatus: 'OK',
    retrievedAt: nowIso,
    crossCheck: {
      benchmarkSource: 'KBS',
      kbsDate: '2026-04-10',
      kbsClose: 28400,
      deviationPercent: 0.35,
      status: 'OK',
      detail: 'VPS and KBS close within 0.35%',
    },
    quote: {
      symbol: 'HPG',
      source: 'VPS',
      lastPrice: 28500,
      openPrice: 28100,
      highPrice: 28600,
      lowPrice: 28000,
      averagePrice: 28350,
      referencePrice: 28000,
      ceilingPrice: 29950,
      floorPrice: 26050,
      change: 500,
      changePercent: 1.79,
      matchedVolumeShares: 15000000,
      foreignBuyVolumeShares: 1000000,
      foreignBuyValueVnd: 28500000000,
      foreignSellVolumeShares: 500000,
      foreignSellValueVnd: 14250000000,
      foreignRoomShares: 50000000,
      fetchedAt: nowIso,
      ...quoteOverrides,
    },
    ...overrides,
  } as RealtimeQuote;
}

interface HarnessOptions {
  brokerConfig?: Record<string, unknown>;
  quote?: RealtimeQuote | null;
  /** Simulates a connected adapter that is NOT a simulation. */
  nonSimulation?: boolean;
  initialCash?: number;
}

async function createHarness(opts: HarnessOptions = {}) {
  const paperBroker = new PaperBroker({
    initialCash: opts.initialCash ?? 1_000_000_000,
    skipSessionValidation: true,
    ...(opts.brokerConfig ?? {}),
  });

  // Spy proves whether the broker was ever reached.
  const submitSpy = vi.spyOn(paperBroker, 'submitOrder');

  const broker = opts.nonSimulation
    ? (Object.create(paperBroker, {
        isSimulation: { value: false },
        submitOrder: { value: submitSpy.getMockImplementation() ? undefined : undefined },
      }) as PaperBroker)
    : paperBroker;

  const engine = new TradingEngine({
    broker: opts.nonSimulation ? ({ ...paperBroker, isSimulation: false } as unknown as PaperBroker) : paperBroker,
    skipSessionValidation: true,
  });

  const router = createTradingApiRouter(engine, {
    getQuoteFn: async (sym: string) => {
      if (opts.quote === null) throw new MarketDataUnavailableError('VPS', `${sym} unavailable`);
      return opts.quote ?? makeQuote();
    },
  });

  const app = express();
  app.use(express.json());
  app.use('/api/trading', router);
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address() as { port: number };

  return {
    baseUrl: `http://127.0.0.1:${port}/api/trading`,
    engine,
    broker: paperBroker,
    submitSpy,
    close: () => new Promise<void>((res) => server.close(() => res())),
  };
}

const BUY = { symbol: 'HPG', side: 'BUY', quantity: 100, orderType: 'MARKET', stopLoss: 27000, targetPrice: 31500 };

function post(baseUrl: string, body: unknown) {
  return fetch(`${baseUrl}/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('P0-01 — approved order traverses the whole risk chain', () => {
  it('invokes RiskGuard, RiskManager and PositionSizer before PaperBroker', async () => {
    const h = await createHarness();
    try {
      const res = await post(h.baseUrl, BUY);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.riskTrace.simulationOnly).toBe(true);
      expect(json.riskTrace.gates).toEqual({
        riskGuard: true,
        riskManager: true,
        positionSizer: true,
        paperBroker: true,
      });
      expect(h.submitSpy).toHaveBeenCalledTimes(1);
      expect(json.data.status).toBe('FILLED');
    } finally {
      await h.close();
    }
  });

  it('confirms isSimulation === true on the connected adapter for paper paths', async () => {
    const h = await createHarness();
    try {
      const statusRes = await fetch(`${h.baseUrl}/status`);
      const statusJson = await statusRes.json();
      expect(statusJson.data.isSimulation).toBe(true);
      const res = await post(h.baseUrl, BUY);
      const json = await res.json();
      expect(json.riskTrace.simulationOnly).toBe(true);
    } finally {
      await h.close();
    }
  });
});

describe('P0-01 — rejected decisions never reach the broker', () => {
  it('risk rejected: emergency stop blocks before PaperBroker.submitOrder', async () => {
    const h = await createHarness();
    try {
      await h.engine.setEmergencyStop(true);
      const res = await post(h.baseUrl, BUY);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.code).toBe('EMERGENCY_STOP');
      expect(json.data.riskTrace.gates.riskGuard).toBe(true);
      expect(json.data.riskTrace.gates.paperBroker).toBe(false);
      expect(h.submitSpy).not.toHaveBeenCalled();
    } finally {
      await h.close();
    }
  });

  it('risk rejected: BUY without an explicit risk envelope is refused, never synthesized', async () => {
    const h = await createHarness();
    try {
      const res = await post(h.baseUrl, { symbol: 'HPG', side: 'BUY', quantity: 100, orderType: 'MARKET' });
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.error.code).toBe('RISK_PARAMETERS_REQUIRED');
      expect(json.data.riskTrace.zeroCause).toBe('ZERO_BY_RISK');
      expect(json.data.riskTrace.gates.paperBroker).toBe(false);
      expect(h.submitSpy).not.toHaveBeenCalled();
    } finally {
      await h.close();
    }
  });

  it('risk rejected: BUY with a sub-minimum risk/reward ratio is blocked', async () => {
    const h = await createHarness();
    try {
      const res = await post(h.baseUrl, { ...BUY, stopLoss: 28000, targetPrice: 29000 });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(['INVALID_RISK_REWARD', 'INVALID_LOT_SIZE']).toContain(json.error.code);
      expect(json.data.riskTrace.gates.paperBroker).toBe(false);
      expect(h.submitSpy).not.toHaveBeenCalled();
    } finally {
      await h.close();
    }
  });

  it('risk rejected: anti-pyramiding blocks a second BUY on an open symbol', async () => {
    const h = await createHarness();
    try {
      const first = await post(h.baseUrl, BUY);
      expect(first.status).toBe(201);
      h.submitSpy.mockClear();

      const second = await post(h.baseUrl, BUY);
      expect(second.status).toBe(409);
      const json = await second.json();
      expect(json.error.code).toBe('POSITION_LIMIT_EXCEEDED');
      expect(json.data.riskTrace.zeroCause).toBe('ZERO_BY_RISK');
      expect(json.data.riskTrace.gates.riskGuard).toBe(true);
      expect(json.data.riskTrace.gates.paperBroker).toBe(false);
      expect(h.submitSpy).not.toHaveBeenCalled();
    } finally {
      await h.close();
    }
  });
});

describe('P0-01 — position sizing outcomes', () => {
  it('position size reduced: submits less than requested when risk approves less', async () => {
    const h = await createHarness();
    try {
      // 1 % of 1 bn equity = 10 m risk budget; risk/share = 1 500 => 6 600 shares approved.
      const res = await post(h.baseUrl, { ...BUY, quantity: 20000 });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.riskTrace.requestedQuantity).toBe(20000);
      expect(json.riskTrace.positionSizeReduced).toBe(true);
      expect(json.riskTrace.submittedQuantity).toBeLessThan(20000);
      expect(json.riskTrace.submittedQuantity).toBe(json.riskTrace.riskApprovedQuantity);
      expect(json.data.quantity).toBe(json.riskTrace.submittedQuantity);
      expect(json.data.quantity % 100).toBe(0);
      expect(json.riskTrace.zeroCause).toBeNull();
    } finally {
      await h.close();
    }
  });

  it('position size zero: risk budget cannot fund one board lot => ZERO_BY_SIZING', async () => {
    // A high-priced instrument is required: with a 1 % risk budget the only way to
    // fall below one 100-share lot is risk/share > budget/100.
    const quote = makeQuote({}, {
      lastPrice: 5_000_000,
      ceilingPrice: 5_250_000,
      floorPrice: 4_750_000,
      referencePrice: 4_900_000,
    });
    const h = await createHarness({ quote });
    try {
      // risk/share 4 900 000 against a 10 m budget => ~2 shares => zero tradable size.
      // target 14 800 000 keeps R:R at exactly 2.0 so the sizing gate is what fails.
      const res = await post(h.baseUrl, { ...BUY, stopLoss: 100_000, targetPrice: 14_800_000 });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.code).toBe('INVALID_LOT_SIZE');
      expect(json.data.riskTrace.zeroCause).toBe('ZERO_BY_SIZING');
      expect(json.data.riskTrace.submittedQuantity).toBe(0);
      expect(json.data.riskTrace.gates.paperBroker).toBe(false);
      expect(h.submitSpy).not.toHaveBeenCalled();
    } finally {
      await h.close();
    }
  });

  it('liquidity zero: insufficient cash => ZERO_BY_LIQUIDITY', async () => {
    const h = await createHarness({ initialCash: 1_000_000 });
    try {
      const res = await post(h.baseUrl, BUY);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.code).toBe('INSUFFICIENT_CASH');
      expect(json.data.riskTrace.zeroCause).toBe('ZERO_BY_LIQUIDITY');
      expect(json.data.riskTrace.gates.paperBroker).toBe(false);
      expect(h.submitSpy).not.toHaveBeenCalled();
    } finally {
      await h.close();
    }
  });
});

describe('P0-01 — market data fail-closed paths', () => {
  it('data unavailable: provider failure => ZERO_BY_DATA, no broker submission', async () => {
    const h = await createHarness({ quote: null });
    try {
      const res = await post(h.baseUrl, BUY);
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.error.code).toBe('DATA_UNAVAILABLE');
      expect(json.data.riskTrace.zeroCause).toBe('ZERO_BY_DATA');
      expect(h.submitSpy).not.toHaveBeenCalled();
    } finally {
      await h.close();
    }
  });

  it('missing source timestamp: cannot compute freshness => ZERO_BY_DATA', async () => {
    const h = await createHarness({ quote: makeQuote({}, { fetchedAt: 'not-a-timestamp' }) });
    try {
      const res = await post(h.baseUrl, BUY);
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.error.code).toBe('DATA_UNAVAILABLE');
      expect(json.data.riskTrace.zeroCause).toBe('ZERO_BY_DATA');
      expect(h.submitSpy).not.toHaveBeenCalled();
    } finally {
      await h.close();
    }
  });

  it('stale data: source timestamp beyond maxStaleTimeMs => ZERO_BY_DATA', async () => {
    const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const h = await createHarness({ quote: makeQuote({}, { fetchedAt: stale }) });
    try {
      const res = await post(h.baseUrl, BUY);
      // Stale upstream market data is surfaced as 503, never as an accepted order.
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.error.code).toBe('STALE_DATA');
      expect(json.data.riskTrace.zeroCause).toBe('ZERO_BY_DATA');
      expect(h.submitSpy).not.toHaveBeenCalled();
    } finally {
      await h.close();
    }
  });

  it('future data: source timestamp beyond clock-skew tolerance => ZERO_BY_DATA', async () => {
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const h = await createHarness({ quote: makeQuote({}, { fetchedAt: future }) });
    try {
      const res = await post(h.baseUrl, BUY);
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.error.code).toBe('STALE_DATA');
      expect(json.data.riskTrace.zeroCause).toBe('ZERO_BY_DATA');
      expect(h.submitSpy).not.toHaveBeenCalled();
    } finally {
      await h.close();
    }
  });

  it('invalid data: non-positive market price => ZERO_BY_DATA', async () => {
    const h = await createHarness({ quote: makeQuote({}, { lastPrice: 0 }) });
    try {
      const res = await post(h.baseUrl, BUY);
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.error.code).toBe('INVALID_MARKET_DATA');
      expect(json.data.riskTrace.zeroCause).toBe('ZERO_BY_DATA');
      expect(h.submitSpy).not.toHaveBeenCalled();
    } finally {
      await h.close();
    }
  });
});

describe('P0-01 — invalid order input never reaches any engine', () => {
  it('invalid order: malformed payloads are rejected at the edge', async () => {
    const h = await createHarness();
    try {
      for (const body of [
        { symbol: '', side: 'BUY', quantity: 100, orderType: 'MARKET' },
        { symbol: 'HPG', side: 'HOLD', quantity: 100, orderType: 'MARKET' },
        { symbol: 'HPG', side: 'BUY', quantity: 99, orderType: 'MARKET' },
        { symbol: 'HPG', side: 'BUY', quantity: 100, orderType: 'STOP' },
        { symbol: 'HPG', side: 'BUY', quantity: 100, orderType: 'LIMIT' },
        { symbol: 'HPG', side: 'BUY', quantity: 100, orderType: 'MARKET', stopLoss: -1, targetPrice: 1 },
      ]) {
        const res = await post(h.baseUrl, body);
        expect(res.status).toBe(400);
      }
      expect(h.submitSpy).not.toHaveBeenCalled();
    } finally {
      await h.close();
    }
  });

  it('invalid order: short selling is blocked when no position exists', async () => {
    const h = await createHarness();
    try {
      const res = await post(h.baseUrl, { symbol: 'HPG', side: 'SELL', quantity: 100, orderType: 'MARKET' });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.code).toBe('INSUFFICIENT_POSITION');
      expect(json.data.riskTrace.gates.riskGuard).toBe(true);
      expect(json.data.riskTrace.gates.paperBroker).toBe(false);
      expect(h.submitSpy).not.toHaveBeenCalled();
    } finally {
      await h.close();
    }
  });

  it('duplicate clientOrderId is not re-submitted to the broker', async () => {
    const h = await createHarness();
    try {
      const first = await post(h.baseUrl, { ...BUY, clientOrderId: 'order-abc' });
      expect(first.status).toBe(201);
      expect(h.submitSpy).toHaveBeenCalledTimes(1);

      const second = await post(h.baseUrl, { ...BUY, clientOrderId: 'order-abc' });
      expect(second.status).toBe(409);
      const json = await second.json();
      expect(json.error.code).toBe('ORDER_ALREADY_FILLED');
      expect(h.submitSpy).toHaveBeenCalledTimes(1);
    } finally {
      await h.close();
    }
  });
});

describe('P0-01 — real-execution boundary', () => {
  it('a non-simulation adapter fails closed BEFORE any risk evaluation or submission', async () => {
    const paperBroker = new PaperBroker({ initialCash: 1_000_000_000, skipSessionValidation: true });
    const submitSpy = vi.spyOn(paperBroker, 'submitOrder');

    const liveLooking = Object.assign(Object.create(Object.getPrototypeOf(paperBroker)), paperBroker, {
      isSimulation: false,
    }) as PaperBroker;

    const engine = new TradingEngine({ broker: liveLooking, skipSessionValidation: true });
    const app = express();
    app.use(express.json());
    app.use('/api/trading', createTradingApiRouter(engine, { getQuoteFn: async () => makeQuote() }));
    const server: Server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const { port } = server.address() as { port: number };

    try {
      const res = await post(`http://127.0.0.1:${port}/api/trading`, BUY);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.code).toBe('REAL_EXECUTION_REFUSED');
      expect(json.data.riskTrace.simulationOnly).toBe(false);
      expect(json.data.riskTrace.gates).toEqual({
        riskGuard: false,
        riskManager: false,
        positionSizer: false,
        paperBroker: false,
      });
      expect(json.data.riskTrace.zeroCause).toBe('ZERO_BY_RISK');
      expect(submitSpy).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((res) => server.close(() => res()));
    }
  });
});

describe('P0-01 — zero-cause taxonomy is exhaustive and distinguishable', () => {
  it('classifies every documented cause', () => {
    expect(classifyZeroCause('EMERGENCY_STOP')).toBe('ZERO_BY_RISK');
    expect(classifyZeroCause('POSITION_LIMIT')).toBe('ZERO_BY_RISK');
    expect(classifyZeroCause('RISK_PARAMETERS_REQUIRED')).toBe('ZERO_BY_RISK');

    expect(classifyZeroCause('INSUFFICIENT_CASH')).toBe('ZERO_BY_LIQUIDITY');
    expect(classifyZeroCause('EXPOSURE_LIMIT_EXCEEDED')).toBe('ZERO_BY_LIQUIDITY');
    expect(classifyZeroCause('EXCESSIVE_EXPOSURE')).toBe('ZERO_BY_LIQUIDITY');

    expect(classifyZeroCause('DATA_UNAVAILABLE')).toBe('ZERO_BY_DATA');
    expect(classifyZeroCause('STALE_DATA')).toBe('ZERO_BY_DATA');
    expect(classifyZeroCause('INVALID_MARKET_DATA')).toBe('ZERO_BY_DATA');

    expect(classifyZeroCause('INVALID_LOT_SIZE')).toBe('ZERO_BY_SIZING');
    expect(classifyZeroCause('INVALID_CAPITAL')).toBe('ZERO_BY_SIZING');
    expect(classifyZeroCause('EXCESSIVE_RISK')).toBe('ZERO_BY_SIZING');
  });

  it('never collapses an unknown code into a liquidity or data verdict', () => {
    expect(classifyZeroCause('SOMETHING_NEW')).toBe('ZERO_BY_RISK');
  });
});
/**
 * P1 CONCENTRATION-CAP REGRESSION SUITE
 * ======================================================================
 * `DEFAULT_RISK_GUARD_POLICY.maxPositionPercent` (20 %) is a governance rule: no single
 * position may exceed 20 % of portfolio equity. RiskGuard already down-scales
 * `approvedQuantity` to that cap (RiskGuard.ts, single-position allocation check), but the
 * boundary used to submit `Math.min(requestedQuantity, sizing.quantity)` — where `sizing`
 * comes from PositionSizer, which has no `maxPositionRate` parameter at all. The capped
 * `guardResult.metrics.approvedQuantity` was computed and then thrown away, so the only
 * concentration limit actually reaching the broker was the 80 % portfolio-exposure cap.
 *
 * These tests pin the real contract:
 *   1. the submitted quantity may never exceed the 20 % single-position cap;
 *   2. the capital/exposure checks must be evaluated against the quantity that is
 *      actually approved (a tight stop must not make a legal order look unaffordable).
 */
describe('P1 — single-position concentration cap is enforced on the submitted quantity', () => {
  // Equity 1 000 000 000, entry 28 500 => 20 % cap = 200 000 000 => 7 000 shares (70 lots).
  const CAP_SHARES = 7_000;

  it('never submits more shares than the 20 % single-position cap allows', async () => {
    const h = await createHarness();
    try {
      // risk/share 1 000 (stop 27 500) against a 10 m risk budget => 10 000 shares by risk,
      // which is ABOVE the 7 000-share concentration cap, so the cap must be what binds.
      const res = await post(h.baseUrl, { symbol: 'HPG', side: 'BUY', quantity: 20000, orderType: 'MARKET', stopLoss: 27500, targetPrice: 30600 });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);

      expect(json.riskTrace.submittedQuantity).toBeLessThanOrEqual(CAP_SHARES);
      expect(json.data.quantity).toBe(json.riskTrace.submittedQuantity);
      expect(json.data.quantity).toBeLessThanOrEqual(CAP_SHARES);
      // The concentration cap must be the binding constraint, and it must be visible.
      expect(json.riskTrace.submittedQuantity).toBe(CAP_SHARES);
      expect(json.riskTrace.positionSizeReduced).toBe(true);
    } finally {
      await h.close();
    }
  });

  it('reports the real concentration percentage, not the pre-clamp one', async () => {
    const h = await createHarness();
    try {
      const res = await post(h.baseUrl, { symbol: 'HPG', side: 'BUY', quantity: 20000, orderType: 'MARKET', stopLoss: 27500, targetPrice: 30600 });
      expect(res.status).toBe(201);
      const json = await res.json();
      const filled = json.data.quantity;
      const concentrationPercent = (filled * 28_500 * 1.0015) / 1_000_000_000 * 100;
      expect(concentrationPercent).toBeLessThanOrEqual(20);
    } finally {
      await h.close();
    }
  });

  it('a tight stop does not make an affordable order look like INSUFFICIENT_CASH', async () => {
    // risk/share 100 (stop 28 400) => risk sizing 100 000 shares. The cash check must be
    // evaluated against the CAPPED quantity (7 000 shares = ~199.5 m), not the pre-clamp
    // 100 000 shares (= 2.85 bn), otherwise every tight-stop order is wrongly rejected.
    const h = await createHarness();
    try {
      const res = await post(h.baseUrl, { symbol: 'HPG', side: 'BUY', quantity: CAP_SHARES, orderType: 'MARKET', stopLoss: 28400, targetPrice: 28700 });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.quantity).toBe(CAP_SHARES);
    } finally {
      await h.close();
    }
  });
});

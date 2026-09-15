import { describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { validateTradingOrder, createTradingApiRouter } from '../api/TradingApiRouter.ts';
import { TradingEngine } from '../engine/TradingEngine.ts';
import { PaperBroker } from '../paper/PaperBroker.ts';
import {
  type RealtimeQuote,
  MarketDataUnavailableError,
} from '../../../services/market/realMarketDataService.ts';

describe('Trading API request validation', () => {
  it('accepts a valid paper-market order intent', () => {
    expect(validateTradingOrder({ symbol: 'HPG', side: 'BUY', quantity: 100, orderType: 'MARKET' })).toBeNull();
  });

  it('rejects invalid symbol, side, type, and board-lot quantity without reaching the engine', () => {
    expect(validateTradingOrder({ symbol: '', side: 'BUY', quantity: 100, orderType: 'MARKET' })?.code).toBe('INVALID_SYMBOL');
    expect(validateTradingOrder({ symbol: 'HPG', side: 'HOLD', quantity: 100, orderType: 'MARKET' })?.code).toBe('INVALID_ORDER');
    expect(validateTradingOrder({ symbol: 'HPG', side: 'BUY', quantity: 99, orderType: 'MARKET' })?.code).toBe('INVALID_QUANTITY');
    expect(validateTradingOrder({ symbol: 'HPG', side: 'BUY', quantity: 100, orderType: 'STOP' })?.code).toBe('INVALID_ORDER');
  });

  it('validates limitPrice for LIMIT orders', () => {
    expect(validateTradingOrder({ symbol: 'HPG', side: 'BUY', quantity: 100, orderType: 'LIMIT' })?.code).toBe('INVALID_PRICE');
    expect(validateTradingOrder({ symbol: 'HPG', side: 'BUY', quantity: 100, orderType: 'LIMIT', limitPrice: -1000 })?.code).toBe('INVALID_PRICE');
    expect(validateTradingOrder({ symbol: 'HPG', side: 'BUY', quantity: 100, orderType: 'LIMIT', limitPrice: 28500 })).toBeNull();
  });
});

describe('Trading API Router HTTP Endpoints', () => {
  const mockQuote: RealtimeQuote = {
    symbol: 'HPG',
    source: 'VPS',
    dataStatus: 'OK',
    retrievedAt: new Date().toISOString(),
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
      fetchedAt: new Date().toISOString(),
    },
  };

  async function createTestApp(brokerConfig = {}) {
    const broker = new PaperBroker({
      initialCash: 100_000_000,
      skipSessionValidation: true,
      ...brokerConfig,
    });
    const engine = new TradingEngine({
      broker,
      skipSessionValidation: true,
    });

    const router = createTradingApiRouter(engine, {
      getQuoteFn: async (sym: string) => {
        if (sym === 'HPG') return mockQuote;
        throw new MarketDataUnavailableError('VPS', `Symbol ${sym} not found`);
      },
    });

    const app = express();
    app.use(express.json());
    app.use('/api/trading', router);

    const server: Server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const address = server.address() as { port: number };
    const baseUrl = `http://127.0.0.1:${address.port}/api/trading`;

    return {
      baseUrl,
      engine,
      broker,
      close: () => new Promise<void>((res) => server.close(() => res())),
    };
  }

  it('GET /status reports simulation and master safety state', async () => {
    const harness = await createTestApp();
    try {
      const res = await fetch(`${harness.baseUrl}/status`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.brokerMode).toBe('PAPER');
      expect(json.data.isSimulation).toBe(true);
      expect(json.data.paperTradingOnly).toBe(true);
      expect(json.data.tradingEnabled).toBe(true);
      expect(json.data.emergencyStop).toBe(false);
    } finally {
      await harness.close();
    }
  });

  it('GET /portfolio and GET /positions return authoritative broker data', async () => {
    const harness = await createTestApp();
    try {
      const pRes = await fetch(`${harness.baseUrl}/portfolio`);
      const pJson = await pRes.json();
      expect(pJson.success).toBe(true);
      expect(pJson.data.cash).toBe(100_000_000);
      expect(pJson.data.availableCash).toBe(100_000_000);

      const posRes = await fetch(`${harness.baseUrl}/positions`);
      const posJson = await posRes.json();
      expect(posJson.success).toBe(true);
      expect(Array.isArray(posJson.data)).toBe(true);
    } finally {
      await harness.close();
    }
  });

  it('POST /order rejects when Emergency Stop is activated (409 Conflict)', async () => {
    const harness = await createTestApp();
    try {
      await harness.engine.setEmergencyStop(true);
      const res = await fetch(`${harness.baseUrl}/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: 'HPG', side: 'BUY', quantity: 100, orderType: 'MARKET' }),
      });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('EMERGENCY_STOP');
    } finally {
      await harness.close();
    }
  });

  it('POST /order fails closed when real market data is unavailable (503 Service Unavailable)', async () => {
    const harness = await createTestApp();
    try {
      const res = await fetch(`${harness.baseUrl}/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: 'UNKNOWN', side: 'BUY', quantity: 100, orderType: 'MARKET' }),
      });
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('DATA_UNAVAILABLE');
    } finally {
      await harness.close();
    }
  });

  it('POST /order blocks unauthorized short selling (409 Conflict)', async () => {
    const harness = await createTestApp();
    try {
      const res = await fetch(`${harness.baseUrl}/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: 'HPG', side: 'SELL', quantity: 100, orderType: 'MARKET' }),
      });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('INSUFFICIENT_POSITION');
    } finally {
      await harness.close();
    }
  });

  it('POST /order places and executes valid BUY order with board-lot and conservation', async () => {
    const harness = await createTestApp();
    try {
      const res = await fetch(`${harness.baseUrl}/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: 'HPG', side: 'BUY', quantity: 100, orderType: 'MARKET' }),
      });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.symbol).toBe('HPG');
      expect(json.data.side).toBe('BUY');
      expect(json.data.status).toBe('FILLED');
      expect(json.data.quantity).toBe(100);

      // Verify broker account updated
      const pRes = await fetch(`${harness.baseUrl}/portfolio`);
      const pJson = await pRes.json();
      expect(pJson.data.availableCash).toBeLessThan(100_000_000);

      // Verify position exists
      const posRes = await fetch(`${harness.baseUrl}/positions`);
      const posJson = await posRes.json();
      const hpgPos = posJson.data.find((p: any) => p.symbol === 'HPG');
      expect(hpgPos).toBeDefined();
      expect(hpgPos.quantity).toBe(100);
    } finally {
      await harness.close();
    }
  });
});


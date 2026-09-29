import { describe, it, expect } from 'vitest';
import { StockSummarySchema, DataFreshnessStatusSchema } from '../stockSchema';
import { StockSummary, DataFreshnessStatus } from '../../types/stock';
import { MarketDataIntegrityGuard } from '../../lib/trading/integrity/MarketDataIntegrityGuard';
import { TradingDataValidator } from '../../lib/trading/validation/TradingDataValidator';
import { RiskGuard } from '../../lib/trading/risk/RiskGuard';
import { StrategyScorer } from '../../lib/analysis/strategy/StrategyScorer';
import { SignalEngine } from '../../lib/analysis/strategy/SignalEngine';
import { RecommendationEngine } from '../../lib/analysis/strategy/RecommendationEngine';

const BASE_STOCK: StockSummary = {
  symbol: 'TCB',
  companyName: 'Techcombank',
  exchange: 'HOSE',
  sector: 'Ngân hàng',
  price: 24500,
  change: 400,
  changePercent: 1.66,
  volume: 12500000,
  tradingValue: 306.25,
  open: 24200,
  high: 24600,
  low: 24100,
  refPrice: 24100,
  ceilingPrice: 25750,
  floorPrice: 22450,
  marketCap: 172000,
  pe: 6.8,
  pb: 1.1,
  roe: 17.5,
  rsi: 54.2,
  trend: 'UPTREND',
  aiScore: 72,
  fairValue: 31000,
  sparkline: [24100, 24200, 24400, 24600, 24350, 24500],
  isDemo: false,
  dataStatus: 'AVAILABLE',
  dataFreshness: 'CURRENT',
  fetchedAt: new Date().toISOString(),
  sourceTimestamp: null,
};

describe('PR-01D: Data Freshness & Availability Integrity Audit Suite', () => {
  // -------------------------------------------------------------------------
  // 1. DataFreshnessStatus Zod Contract
  // -------------------------------------------------------------------------
  describe('1. DataFreshnessStatus Contract & StockSummarySchema', () => {
    it('accepts valid DataFreshnessStatus values: CURRENT, STALE, UNAVAILABLE, INVALID', () => {
      const statuses: DataFreshnessStatus[] = ['CURRENT', 'STALE', 'UNAVAILABLE', 'INVALID'];
      for (const st of statuses) {
        expect(DataFreshnessStatusSchema.parse(st)).toBe(st);
        const parsed = StockSummarySchema.parse({
          ...BASE_STOCK,
          dataFreshness: st,
        });
        expect(parsed.dataFreshness).toBe(st);
      }
    });

    it('rejects invalid freshness enum strings', () => {
      expect(() => DataFreshnessStatusSchema.parse('FRESH')).toThrow();
      expect(() => DataFreshnessStatusSchema.parse('EXPIRED')).toThrow();
      expect(() => DataFreshnessStatusSchema.parse('')).toThrow();
    });

    it('preserves fetchedAt and sourceTimestamp metadata without mutation', () => {
      const now = new Date().toISOString();
      const parsed = StockSummarySchema.parse({
        ...BASE_STOCK,
        fetchedAt: now,
        sourceTimestamp: 1711680000000,
      });
      expect(parsed.fetchedAt).toBe(now);
      expect(parsed.sourceTimestamp).toBe(1711680000000);
    });

    it('accepts null sourceTimestamp when upstream provider has no packet timestamp', () => {
      const parsed = StockSummarySchema.parse({
        ...BASE_STOCK,
        sourceTimestamp: null,
      });
      expect(parsed.sourceTimestamp).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 2. Realtime Quote Freshness & TTL Guard
  // -------------------------------------------------------------------------
  describe('2. Quote Freshness & Staleness Detection', () => {
    it('passes fresh quote within maxStaleTimeMs limit', () => {
      const now = 1710000000000;
      const res = MarketDataIntegrityGuard.validate(
        {
          symbol: 'TCB',
          price: 24500,
          timestamp: now - 30_000, // 30s old (limit is 120s)
          open: 24200,
          high: 24600,
          low: 24100,
          close: 24500,
          volume: 100000,
        },
        { now, maxStaleTimeMs: 120_000 }
      );
      expect(res.valid).toBe(true);
      expect(res.code).toBe('OK');
    });

    it('fails closed when quote age exceeds maxStaleTimeMs', () => {
      const now = 1710000000000;
      const res = MarketDataIntegrityGuard.validate(
        {
          symbol: 'TCB',
          price: 24500,
          timestamp: now - 150_000, // 150s old (limit is 120s)
          open: 24200,
          high: 24600,
          low: 24100,
          close: 24500,
          volume: 100000,
        },
        { now, maxStaleTimeMs: 120_000 }
      );
      expect(res.valid).toBe(false);
      expect(res.code).toBe('STALE_DATA');
      expect(res.reasons).toContain('STALE_DATA');
    });

    it('fails closed on future quote timestamp beyond clock skew tolerance', () => {
      const now = 1710000000000;
      const res = MarketDataIntegrityGuard.validate(
        {
          symbol: 'TCB',
          price: 24500,
          timestamp: now + 30_000, // 30s in future
          open: 24200,
          high: 24600,
          low: 24100,
          close: 24500,
          volume: 100000,
        },
        { now, maxFutureSkewMs: 5_000 }
      );
      expect(res.valid).toBe(false);
      expect(res.code).toBe('INVALID_MARKET_DATA');
      expect(res.reasons).toContain('FUTURE_TIMESTAMP');
    });

    it('TradingDataValidator flags stale data as fail-closed', () => {
      const now = 1710000000000;
      const val = TradingDataValidator.validateMarketData(
        {
          symbol: 'TCB',
          price: 24500,
          timestamp: now - 200_000,
          volume: 100000,
        },
        { now, maxStaleTimeMs: 120_000 }
      );
      expect(val.isValid).toBe(false);
      expect(val.code).toBe('STALE_DATA');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Historical Data Freshness & Trading Session Semantics
  // -------------------------------------------------------------------------
  describe('3. Historical Candles & OHLC Integrity', () => {
    it('detects duplicate sequential candles in historical series', () => {
      const current = {
        symbol: 'TCB',
        price: 24500,
        volume: 100000,
        timestamp: 1710000000000,
      };
      const prev = {
        symbol: 'TCB',
        price: 24500,
        volume: 100000,
        timestamp: 1710000000000,
      };
      const check = MarketDataIntegrityGuard.checkDuplicateCandle(current, prev);
      expect(check.isDuplicate).toBe(true);
    });

    it('passes non-duplicate sequential candles', () => {
      const current = {
        symbol: 'TCB',
        price: 24600,
        volume: 120000,
        timestamp: 1710086400000,
      };
      const prev = {
        symbol: 'TCB',
        price: 24500,
        volume: 100000,
        timestamp: 1710000000000,
      };
      const check = MarketDataIntegrityGuard.checkDuplicateCandle(current, prev);
      expect(check.isDuplicate).toBe(false);
    });

    it('rejects candle where Low exceeds High', () => {
      const res = MarketDataIntegrityGuard.validate({
        symbol: 'TCB',
        price: 24500,
        open: 24200,
        high: 24000,
        low: 24800, // Low > High
        close: 24500,
      });
      expect(res.valid).toBe(false);
      expect(res.reasons).toContain('INVALID_OHLC');
    });
  });

  // -------------------------------------------------------------------------
  // 4. AI Score & Strategy Scoring on Stale/Missing Inputs
  // -------------------------------------------------------------------------
  describe('4. AI Score & Strategy Scoring Availability Semantics', () => {
    it('returns score = null when all component engines have unavailable data', () => {
      const result = StrategyScorer.score(
        {
          technicalScore: null,
          fundamentalScore: null,
          momentumScore: null,
          moneyFlowScore: null,
          valuationScore: null,
          riskScore: null,
        },
        'SHORT_TERM'
      );
      expect(result.score).toBeNull();
      expect(result.availableComponents).toBe(0);
    });

    it('does not penalize or inflate score with zero when optional component is missing', () => {
      const resultPartial = StrategyScorer.score(
        {
          technicalScore: 80,
          fundamentalScore: null, // missing fundamentals
          momentumScore: 80,
          moneyFlowScore: 80,
          valuationScore: null,
          riskScore: null,
        },
        'SHORT_TERM'
      );
      // Renormalizes available components without defaulting null to 0
      expect(resultPartial.score).toBe(80);
      expect(resultPartial.availableComponents).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Recommendation Engine Fail-Closed on Invalid/Stale Scores
  // -------------------------------------------------------------------------
  describe('5. Recommendation Engine Signal Availability', () => {
    it('marks signal as invalid when composite score is null (insufficient data)', () => {
      const res = SignalEngine.generate({
        strategy: 'SHORT_TERM',
        score: null,
      });
      expect(res.isValid).toBe(false);
      expect(res.score).toBeNull();
      expect(res.signal).toBe('SELL'); // Conservative fallback stance
      expect(res.reason).toContain('insufficient data');
    });

    it('RecommendationEngine sets confidence to LOW when components are insufficient', () => {
      const rec = RecommendationEngine.generate({
        symbol: 'TCB',
        strategy: 'SHORT_TERM',
        currentPrice: 24500,
        scores: {
          technicalScore: 70,
          fundamentalScore: null,
          momentumScore: null,
          moneyFlowScore: null,
          valuationScore: null,
          riskScore: null,
        },
      });
      expect(rec.confidence).toBe('LOW');
    });
  });

  // -------------------------------------------------------------------------
  // 6. RiskGuard & Paper Trading Execution Gatekeeper
  // -------------------------------------------------------------------------
  describe('6. RiskGuard & Paper Trading Execution Gatekeeper', () => {
    it('rejects order when live price is missing or non-positive', () => {
      const guard = new RiskGuard();
      const res = guard.evaluate({
        symbol: 'TCB',
        signal: 'BUY',
        confidence: 'HIGH',
        score: 80,
        entryPrice: 0, // Invalid entry price
        stopLoss: 23000,
        targetPrice: 28000,
        accountEquity: 100_000_000,
        availableCash: 50_000_000,
        currentExposure: 0,
      });
      expect(res.approved).toBe(false);
      expect(res.status).toBe('INVALID');
    });

    it('rejects order when stop loss is absent or invalid on BUY order', () => {
      const guard = new RiskGuard();
      const res = guard.evaluate({
        symbol: 'TCB',
        signal: 'BUY',
        confidence: 'HIGH',
        score: 80,
        entryPrice: 24500,
        stopLoss: 0, // Stop loss not positive
        targetPrice: 28000,
        accountEquity: 100_000_000,
        availableCash: 50_000_000,
        currentExposure: 0,
      });
      expect(res.approved).toBe(false);
      expect(res.status).toBe('INVALID');
    });

    it('rejects order when price exceeds exchange ceiling or breaches floor', () => {
      const guard = new RiskGuard();
      const resCeil = guard.evaluate({
        symbol: 'TCB',
        signal: 'BUY',
        confidence: 'HIGH',
        score: 80,
        entryPrice: 26000,
        stopLoss: 23000,
        targetPrice: 28000,
        ceilingPrice: 25750, // Entry > Ceiling
        floorPrice: 22450,
        accountEquity: 100_000_000,
        availableCash: 50_000_000,
        currentExposure: 0,
      });
      expect(resCeil.approved).toBe(false);
      expect(resCeil.code).toBe('PRICE_LIMIT_VIOLATION');
    });

    it('rejects order when signal entry price deviates excessively from live quote', () => {
      const guard = new RiskGuard();
      const resDev = guard.evaluate({
        symbol: 'TCB',
        signal: 'BUY',
        confidence: 'HIGH',
        score: 80,
        entryPrice: 26000,
        currentPrice: 24500, // ~6.1% deviation (limit is 3.0%)
        stopLoss: 23000,
        targetPrice: 28000,
        accountEquity: 100_000_000,
        availableCash: 50_000_000,
        currentExposure: 0,
      });
      expect(resDev.approved).toBe(false);
      expect(resDev.status).toBe('BLOCKED');
    });
  });
});

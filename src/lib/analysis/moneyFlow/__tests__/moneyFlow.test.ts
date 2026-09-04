import { describe, it, expect } from 'vitest';
import {
  MoneyFlowEngine,
  calculateMoneyFlowMultiplier,
  calculateCMF,
  evaluatePriceVolume,
} from '../MoneyFlowEngine.ts';
import { CandleInput } from '../../common/types.ts';

describe('Money Flow Analysis Suite', () => {
  // Helper to generate synthetic candlestick series
  const generateCandles = (
    count: number,
    basePrice: number = 100000,
    baseVol: number = 1000000,
    trend: 'UP' | 'DOWN' | 'FLAT' = 'UP'
  ): CandleInput[] => {
    const candles: CandleInput[] = [];
    let price = basePrice;

    for (let i = 0; i < count; i++) {
      const delta = trend === 'UP' ? 1000 : trend === 'DOWN' ? -1000 : 0;
      const open = price;
      price += delta;
      const high = Math.max(open, price) + 500;
      const low = Math.min(open, price) - 500;
      const close = price;
      const volume = baseVol + (i % 3) * 50000;

      candles.push({
        time: `2025-01-${String(i + 1).padStart(2, '0')}`,
        open,
        high,
        low,
        close,
        volume,
      });
    }

    return candles;
  };

  describe('Isolated Money Flow Formulas', () => {
    it('calculates Money Flow Multiplier accurately within [-1, 1]', () => {
      // Close at high -> multiplier = +1.0
      const bullCandle: CandleInput = {
        open: 50000,
        high: 55000,
        low: 49000,
        close: 55000,
        volume: 100000,
      };
      expect(calculateMoneyFlowMultiplier(bullCandle)).toBe(1.0);

      // Close at low -> multiplier = -1.0
      const bearCandle: CandleInput = {
        open: 54000,
        high: 55000,
        low: 49000,
        close: 49000,
        volume: 100000,
      };
      expect(calculateMoneyFlowMultiplier(bearCandle)).toBe(-1.0);

      // Flat candle high === low -> multiplier = 0
      const flatCandle: CandleInput = {
        open: 50000,
        high: 50000,
        low: 50000,
        close: 50000,
        volume: 100000,
      };
      expect(calculateMoneyFlowMultiplier(flatCandle)).toBe(0);
    });

    it('calculates Chaikin Money Flow (CMF) over 20 periods', () => {
      const candles = generateCandles(25, 100000, 1000000, 'UP');
      const cmf = calculateCMF(candles, 20);

      expect(cmf).not.toBeNull();
      expect(cmf!).toBeGreaterThanOrEqual(-1.0);
      expect(cmf!).toBeLessThanOrEqual(1.0);

      // Under 20 periods should return null
      const shortCandles = generateCandles(10);
      expect(calculateCMF(shortCandles, 20)).toBeNull();
    });

    it('evaluates Price-Volume relationship correctly', () => {
      const prev: CandleInput = {
        open: 100000,
        high: 101000,
        low: 99000,
        close: 100000,
        volume: 1000000,
      };

      // Bullish confirmation: Price UP significantly + High volume ratio (>= 1.25)
      const bullSurge: CandleInput = {
        open: 101000,
        high: 106000,
        low: 100500,
        close: 105000, // +5%
        volume: 2500000,
      };
      const bullRes = evaluatePriceVolume(bullSurge, prev, 2.5);
      expect(bullRes.pattern).toBe('BULLISH_CONFIRMATION');

      // Bearish distribution: Price DOWN + High volume ratio
      const bearDump: CandleInput = {
        open: 99000,
        high: 100000,
        low: 94000,
        close: 95000, // -5%
        volume: 2200000,
      };
      const bearRes = evaluatePriceVolume(bearDump, prev, 2.2);
      expect(bearRes.pattern).toBe('BEARISH_DISTRIBUTION');

      // Bullish divergence: Price down with volume drying up (< 0.8)
      const dryPullback: CandleInput = {
        open: 99000,
        high: 100000,
        low: 97500,
        close: 98000, // -2%
        volume: 500000,
      };
      const dryRes = evaluatePriceVolume(dryPullback, prev, 0.5);
      expect(dryRes.pattern).toBe('BULLISH_DIVERGENCE');
    });
  });

  describe('MoneyFlowEngine Comprehensive Evaluation', () => {
    it('returns score normalized between 0 and 100 with all required metrics', () => {
      const candles = generateCandles(25, 120000, 1500000, 'UP');

      const result = MoneyFlowEngine.evaluate({
        candles,
        foreignTrading: {
          foreignBuyVolume: 500000,
          foreignSellVolume: 200000,
          foreignNetVolume: 300000,
          foreignBuyValue: 60000000000,
          foreignSellValue: 24000000000,
          foreignNetValue: 36000000000,
        },
      });

      // 1. Assert normalized score (0 - 100)
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);

      // 2. Trend
      expect(result.trend).toBeDefined();
      expect(['STRONG_INFLOW', 'INFLOW', 'NEUTRAL', 'OUTFLOW', 'STRONG_OUTFLOW']).toContain(result.trend);

      // 3. Foreign flow (Foreign buy, Foreign sell, Foreign net)
      expect(result.foreignFlow.buy).toBe(500000);
      expect(result.foreignFlow.sell).toBe(200000);
      expect(result.foreignFlow.net).toBe(300000);
      expect(result.foreignFlow.foreignBuy).toBe(500000);
      expect(result.foreignFlow.foreignSell).toBe(200000);
      expect(result.foreignFlow.foreignNet).toBe(300000);
      expect(result.foreignFlow.signal).toBe('NET_BUY');
      expect(result.foreignFlow.buyValue).toBe(60000000000);
      expect(result.foreignFlow.sellValue).toBe(24000000000);
      expect(result.foreignFlow.netValue).toBe(36000000000);

      // 4. Volume ratio & Volume signal
      expect(result.volumeSignal.currentVolume).toBeGreaterThan(0);
      expect(result.volumeSignal.volumeSMA20).not.toBeNull();
      expect(result.volumeSignal.volumeRatio).not.toBeNull();
      expect(typeof result.volumeSignal.volumeRatio).toBe('number');

      // 5. Accumulation/distribution signal
      expect(result.accumulationSignal.status).toBeDefined();
      expect(['ACCUMULATION', 'DISTRIBUTION', 'NEUTRAL']).toContain(result.accumulationSignal.status);
      expect(result.accumulationSignal.moneyFlowMultiplier).not.toBeNull();
      expect(result.accumulationSignal.adTrend).toBeDefined();
      expect(result.accumulationSignal.cmf20).not.toBeNull();

      // 6. Price-volume relationship
      expect(result.priceVolumeRelationship.pattern).toBeDefined();
      expect(result.priceVolumeRelationship.priceChangePct).toBeDefined();
      expect(result.priceVolumeRelationship.volumeRatio).toBe(result.volumeSignal.volumeRatio);

      // 7. Trading value in VND
      expect(result.tradingValue).toBeGreaterThan(0);

      // 8. Reasons
      expect(Array.isArray(result.reasons)).toBe(true);
      expect(result.reasons.length).toBeGreaterThan(0);
    });

    it('strictly does not infer institutional or foreign activity when data is absent', () => {
      const candles = generateCandles(22, 50000, 800000, 'FLAT');

      // No foreignTrading or institutionalTrading provided
      const result = MoneyFlowEngine.evaluate({
        candles,
      });

      expect(result.foreignFlow.signal).toBe('NO_DATA');
      expect(result.foreignFlow.buy).toBeNull();
      expect(result.foreignFlow.sell).toBeNull();
      expect(result.foreignFlow.net).toBeNull();
      expect(result.foreignFlow.foreignBuy).toBeNull();
      expect(result.foreignFlow.foreignSell).toBeNull();
      expect(result.foreignFlow.foreignNet).toBeNull();
      expect(result.foreignFlow.description).toContain('không suy đoán');

      // Institutional flow data flag
      expect(result.institutionalFlow.hasData).toBe(false);
      expect(result.institutionalFlow.largeOrdersBuy).toBeNull();
      expect(result.institutionalFlow.largeOrdersSell).toBeNull();
      expect(result.institutionalFlow.netBigMoney).toBeNull();

      // Verify reasons do NOT contain institutional or foreign claims
      const hasFabricatedClaims = result.reasons.some(
        (r) => r.toLowerCase().includes('khối ngoại mua ròng') || r.toLowerCase().includes('cá mập') || r.toLowerCase().includes('tổ chức')
      );
      expect(hasFabricatedClaims).toBe(false);

      // Score should still be validly computed and normalized 0 - 100
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('reports institutional trading only when actual data exists', () => {
      const candles = generateCandles(22, 50000, 800000, 'UP');

      const result = MoneyFlowEngine.evaluate({
        candles,
        institutionalTrading: {
          largeOrderBuyValue: 35000000000,
          largeOrderSellValue: 15000000000,
          largeOrderNetValue: 20000000000,
        },
      });

      expect(result.institutionalFlow.hasData).toBe(true);
      expect(result.institutionalFlow.largeOrdersBuy).toBe(35000000000);
      expect(result.institutionalFlow.largeOrdersSell).toBe(15000000000);
      expect(result.institutionalFlow.netBigMoney).toBe(20000000000);

      const hasInstReason = result.reasons.some((r) => r.includes('Cá mập/Tổ chức'));
      expect(hasInstReason).toBe(true);
    });

    it('detects strong distribution and out-flow when price plunges on heavy volume and foreign selling', () => {
      const candles = generateCandles(25, 100000, 1000000, 'DOWN');
      // Force the latest candle to crash below prev with massive volume
      const prev = candles[candles.length - 2];
      const latest = candles[candles.length - 1];
      latest.open = prev.close;
      latest.high = prev.close;
      latest.low = prev.close - 5000;
      latest.close = prev.close - 5000; // Close at bottom (-6%+)
      latest.volume = 3000000; // 3x volume

      const result = MoneyFlowEngine.evaluate({
        candles,
        foreignTrading: {
          foreignBuyVolume: 50000,
          foreignSellVolume: 1200000,
          foreignNetVolume: -1150000,
          foreignNetValue: -95000000000,
        },
      });

      expect(result.score).toBeLessThan(40);
      expect(['OUTFLOW', 'STRONG_OUTFLOW']).toContain(result.trend);
      expect(result.foreignFlow.signal).toBe('NET_SELL');
      expect(result.accumulationSignal.status).toBe('DISTRIBUTION');
      expect(result.priceVolumeRelationship.pattern).toBe('BEARISH_DISTRIBUTION');
    });

    it('handles empty candle array gracefully', () => {
      const result = MoneyFlowEngine.evaluate({
        candles: [],
      });

      expect(result.score).toBe(50);
      expect(result.trend).toBe('NEUTRAL');
      expect(result.tradingValue).toBe(0);
      expect(result.foreignFlow.signal).toBe('NO_DATA');
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});

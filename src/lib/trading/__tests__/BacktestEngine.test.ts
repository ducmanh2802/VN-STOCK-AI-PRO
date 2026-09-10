import { describe, it, expect } from 'vitest';
import { BacktestEngine } from '../backtest/BacktestEngine.ts';
import { BacktestDataProvider } from '../backtest/BacktestDataProvider.ts';
import { BacktestCandle, BacktestDataError } from '../backtest/BacktestTypes.ts';
import type { TradingSignal } from '../types/trading.ts';

function createValidCandleSeries(
  length: number,
  basePrice = 25_000,
  startDate = '2026-01-01'
): BacktestCandle[] {
  const candles: BacktestCandle[] = [];
  const start = new Date(startDate);

  for (let i = 0; i < length; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];

    const open = basePrice + i * 50;
    const high = open + 500;
    const low = open - 400;
    const close = open + 100;

    candles.push({
      timestamp: dateStr,
      open,
      high,
      low,
      close,
      volume: 1_000_000,
      referencePrice: open,
      ceilingPrice: Math.round(open * 1.07),
      floorPrice: Math.round(open * 0.93),
    });
  }

  return candles;
}

describe('BacktestEngine — Critical Specifications', () => {
  describe('Anti-Lookahead Bias Protection', () => {
    it('executes BUY strictly at OPEN[t+1] after signal at CLOSE[t], never at candle t', async () => {
      const candles = createValidCandleSeries(10, 20_000);
      let signalGeneratedAt = -1;

      const engine = new BacktestEngine({
        symbol: 'HPG',
        initialCapital: 100_000_000,
        lotSize: 100,
        slippageRate: 0.001,
        minWarmupBars: 2,
        strategy: ({ currentIndex, currentCandle }) => {
          if (currentIndex === 3) {
            signalGeneratedAt = 3;
            return {
              symbol: 'HPG',
              signal: 'BUY',
              entryPrice: currentCandle.close,
              targetPrice: currentCandle.close * 1.15,
              stopLoss: currentCandle.close * 0.95,
              riskReward: 3.0,
            };
          }
          return null;
        },
      });

      const result = await engine.run(candles);

      expect(signalGeneratedAt).toBe(3);
      expect(result.tradeHistory.length).toBeGreaterThanOrEqual(1);

      const buyTrade = result.tradeHistory[0];
      // Assert signal was at candle 3, but execution was at candle 4 (t+1)
      expect(buyTrade.signalTimestamp).toBe(candles[3].timestamp);
      expect(buyTrade.executionTimestamp).toBe(candles[4].timestamp);
      // Execution price must be based on OPEN of candle 4 (with slippage)
      const expectedExecutionPrice = Number((candles[4].open * 1.001).toFixed(2));
      expect(buyTrade.executionPrice).toBe(expectedExecutionPrice);
      // Assert it did NOT execute at candle 3's close or open
      expect(buyTrade.executionPrice).not.toBe(candles[3].close);
      expect(buyTrade.executionPrice).not.toBe(candles[3].open);
    });

    it('produces NO_EXECUTION if signal occurs at final candle of dataset', async () => {
      const candles = createValidCandleSeries(6, 20_000);

      const engine = new BacktestEngine({
        symbol: 'HPG',
        initialCapital: 100_000_000,
        minWarmupBars: 2,
        strategy: ({ currentIndex, currentCandle }) => {
          // Attempt to trigger signal on the very last candle (index 5)
          if (currentIndex === 5) {
            return {
              symbol: 'HPG',
              signal: 'BUY',
              entryPrice: currentCandle.close,
              targetPrice: currentCandle.close * 1.1,
              stopLoss: currentCandle.close * 0.95,
              riskReward: 2.0,
            };
          }
          return null;
        },
      });

      const result = await engine.run(candles);

      // Must be strictly 0 trades: no execution without t+1 candle
      expect(result.totalTrades).toBe(0);
      expect(result.tradeHistory.length).toBe(0);
      expect(result.finalEquity).toBe(100_000_000);
    });
  });

  describe('VN Board Lot Sizing & Fractional Shares Prevention', () => {
    it('strictly enforces VN board lot (rejection below 100, truncation of odd lots)', async () => {
      // Test 1: Equity too small to buy minimum 100 shares -> Rejected
      const smallCapitalEngine = new BacktestEngine({
        symbol: 'HPG',
        initialCapital: 500_000, // Not enough to buy 100 shares @ 25,000 VND
        minWarmupBars: 1,
        strategy: ({ currentIndex, currentCandle }) => {
          if (currentIndex === 1) {
            return {
              symbol: 'HPG',
              signal: 'BUY',
              entryPrice: currentCandle.close,
              targetPrice: currentCandle.close * 1.15,
              stopLoss: currentCandle.close * 0.95,
              riskReward: 3.0,
            };
          }
          return null;
        },
      });

      const candles = createValidCandleSeries(5, 25_000);
      const smallResult = await smallCapitalEngine.run(candles);
      expect(smallResult.totalTrades).toBe(0);
      expect(smallResult.tradeHistory.length).toBe(0);

      // Test 2: Standard capital sizing truncates odd lots to standard 100 multiple
      const normalEngine = new BacktestEngine({
        symbol: 'HPG',
        initialCapital: 100_000_000,
        minWarmupBars: 1,
        strategy: ({ currentIndex, currentCandle }) => {
          if (currentIndex === 1) {
            return {
              symbol: 'HPG',
              signal: 'BUY',
              entryPrice: currentCandle.close,
              targetPrice: currentCandle.close * 1.15,
              stopLoss: currentCandle.close * 0.95,
              riskReward: 3.0,
            };
          }
          return null;
        },
      });

      const normalResult = await normalEngine.run(candles);
      expect(normalResult.tradeHistory.length).toBeGreaterThanOrEqual(1);
      const buyTrade = normalResult.tradeHistory[0];
      // Quantity must be a clean multiple of 100 and >= 100
      expect(buyTrade.quantity % 100).toBe(0);
      expect(buyTrade.quantity).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Fees and Taxes', () => {
    it('applies exact 0.15% BUY fee and 0.10% SELL tax', async () => {
      const candles: BacktestCandle[] = [
        { timestamp: '2026-01-01', open: 20_000, high: 20_500, low: 19_500, close: 20_000, volume: 1000 },
        { timestamp: '2026-01-02', open: 20_000, high: 20_500, low: 19_500, close: 20_000, volume: 1000 },
        { timestamp: '2026-01-03', open: 20_000, high: 20_500, low: 19_500, close: 20_000, volume: 1000 },
        { timestamp: '2026-01-04', open: 22_000, high: 22_500, low: 21_500, close: 22_000, volume: 1000 },
      ];

      const engine = new BacktestEngine({
        symbol: 'HPG',
        initialCapital: 100_000_000,
        commissionRate: 0.0015, // 0.15%
        taxRate: 0.0010, // 0.10%
        sellFeeRate: 0.0015, // 0.15%
        slippageRate: 0, // 0 to test exact fee calculations
        minWarmupBars: 0,
        strategy: ({ currentIndex, currentCandle }) => {
          if (currentIndex === 1) {
            return {
              symbol: 'HPG',
              signal: 'BUY',
              entryPrice: currentCandle.close,
              targetPrice: 25_000,
              stopLoss: 18_000,
              riskReward: 2.5,
            };
          }
          if (currentIndex === 2) {
            return {
              symbol: 'HPG',
              signal: 'SELL',
              entryPrice: currentCandle.close,
              targetPrice: 25_000,
              stopLoss: 18_000,
              riskReward: 2.5,
            };
          }
          return null;
        },
      });

      const result = await engine.run(candles);
      expect(result.tradeHistory.length).toBe(2);

      const buyTrade = result.tradeHistory[0];
      const sellTrade = result.tradeHistory[1];

      // BUY Fee: 0.15% of grossValue
      const expectedBuyFee = Number((buyTrade.grossValue * 0.0015).toFixed(2));
      expect(buyTrade.fees).toBe(expectedBuyFee);
      expect(buyTrade.tax).toBe(0);

      // SELL Tax: 0.10% of grossValue
      const expectedSellTax = Number((sellTrade.grossValue * 0.0010).toFixed(2));
      expect(sellTrade.tax).toBe(expectedSellTax);

      // SELL Fee: 0.15% of grossValue
      const expectedSellFee = Number((sellTrade.grossValue * 0.0015).toFixed(2));
      expect(sellTrade.fees).toBe(expectedSellFee);
    });
  });

  describe('Slippage Modeling', () => {
    it('increases BUY execution price and decreases SELL execution price', async () => {
      const candles: BacktestCandle[] = [
        { timestamp: '2026-01-01', open: 20_000, high: 20_500, low: 19_500, close: 20_000, volume: 1000 },
        { timestamp: '2026-01-02', open: 20_000, high: 20_500, low: 19_500, close: 20_000, volume: 1000 },
        { timestamp: '2026-01-03', open: 20_000, high: 20_500, low: 19_500, close: 20_000, volume: 1000 },
        { timestamp: '2026-01-04', open: 20_000, high: 20_500, low: 19_500, close: 20_000, volume: 1000 },
      ];

      const slippageRate = 0.002; // 0.20%
      const engine = new BacktestEngine({
        symbol: 'HPG',
        initialCapital: 100_000_000,
        slippageRate,
        minWarmupBars: 0,
        strategy: ({ currentIndex, currentCandle }) => {
          if (currentIndex === 1) {
            return {
              symbol: 'HPG',
              signal: 'BUY',
              entryPrice: currentCandle.close,
              targetPrice: 25_000,
              stopLoss: 18_000,
              riskReward: 2.5,
            };
          }
          if (currentIndex === 2) {
            return {
              symbol: 'HPG',
              signal: 'SELL',
              entryPrice: currentCandle.close,
              targetPrice: 25_000,
              stopLoss: 18_000,
              riskReward: 2.5,
            };
          }
          return null;
        },
      });

      const result = await engine.run(candles);
      const buyTrade = result.tradeHistory[0];
      const sellTrade = result.tradeHistory[1];

      // BUY execution price: nextOpen * (1 + slippage)
      const openPriceAtBuy = candles[2].open;
      const expectedBuyPrice = Number((openPriceAtBuy * (1 + slippageRate)).toFixed(2));
      expect(buyTrade.executionPrice).toBe(expectedBuyPrice);
      expect(buyTrade.executionPrice).toBeGreaterThan(openPriceAtBuy);

      // SELL execution price: nextOpen * (1 - slippage)
      const openPriceAtSell = candles[3].open;
      const expectedSellPrice = Number((openPriceAtSell * (1 - slippageRate)).toFixed(2));
      expect(sellTrade.executionPrice).toBe(expectedSellPrice);
      expect(sellTrade.executionPrice).toBeLessThan(openPriceAtSell);
    });
  });

  describe('Intrabar Stop Loss and Target Monitoring', () => {
    it('triggers STOP_LOSS when candle low <= stopLoss', async () => {
      const candles: BacktestCandle[] = [
        { timestamp: '2026-01-01', open: 20_000, high: 20_500, low: 19_500, close: 20_000, volume: 1000 },
        { timestamp: '2026-01-02', open: 20_000, high: 20_500, low: 19_500, close: 20_000, volume: 1000 },
        // Bar 3: Buy executed at open 20,000. StopLoss set to 19,000, Target set to 23,000
        { timestamp: '2026-01-03', open: 20_000, high: 20_500, low: 19_800, close: 20_200, volume: 1000 },
        // Bar 4: Low drops to 18,500 <= stopLoss (19,000)
        { timestamp: '2026-01-04', open: 20_100, high: 20_300, low: 18_500, close: 18_800, volume: 1000 },
      ];

      const engine = new BacktestEngine({
        symbol: 'HPG',
        initialCapital: 100_000_000,
        minWarmupBars: 0,
        slippageRate: 0,
        strategy: ({ currentIndex }) => {
          if (currentIndex === 1) {
            return {
              symbol: 'HPG',
              signal: 'BUY',
              entryPrice: 20_000,
              targetPrice: 23_000,
              stopLoss: 19_000,
              riskReward: 3.0,
            };
          }
          return null;
        },
      });

      const result = await engine.run(candles);
      const sellTrade = result.tradeHistory.find((t) => t.side === 'SELL');

      expect(sellTrade).toBeDefined();
      expect(sellTrade?.exitReason).toBe('STOP_LOSS');
      expect(sellTrade?.executionPrice).toBe(19_000);
      expect(sellTrade?.realizedPnL).toBeLessThan(0);
    });

    it('triggers TARGET when candle high >= targetPrice', async () => {
      const candles: BacktestCandle[] = [
        { timestamp: '2026-01-01', open: 20_000, high: 20_500, low: 19_500, close: 20_000, volume: 1000 },
        { timestamp: '2026-01-02', open: 20_000, high: 20_500, low: 19_500, close: 20_000, volume: 1000 },
        // Bar 3: Buy executed at open 20,000. StopLoss 19,000, Target 22,000
        { timestamp: '2026-01-03', open: 20_000, high: 20_500, low: 19_800, close: 20_200, volume: 1000 },
        // Bar 4: High surges to 22,500 >= target (22,000), low stays at 20,000
        { timestamp: '2026-01-04', open: 20_200, high: 22_500, low: 20_000, close: 22_200, volume: 1000 },
      ];

      const engine = new BacktestEngine({
        symbol: 'HPG',
        initialCapital: 100_000_000,
        minWarmupBars: 0,
        slippageRate: 0,
        strategy: ({ currentIndex }) => {
          if (currentIndex === 1) {
            return {
              symbol: 'HPG',
              signal: 'BUY',
              entryPrice: 20_000,
              targetPrice: 22_000,
              stopLoss: 19_000,
              riskReward: 2.0,
            };
          }
          return null;
        },
      });

      const result = await engine.run(candles);
      const sellTrade = result.tradeHistory.find((t) => t.side === 'SELL');

      expect(sellTrade).toBeDefined();
      expect(sellTrade?.exitReason).toBe('TARGET');
      expect(sellTrade?.executionPrice).toBe(22_000);
      expect(sellTrade?.realizedPnL).toBeGreaterThan(0);
    });

    it('conservative conflict rule: strictly chooses STOP_LOSS when same candle touches both Stop and Target', async () => {
      const candles: BacktestCandle[] = [
        { timestamp: '2026-01-01', open: 20_000, high: 20_500, low: 19_500, close: 20_000, volume: 1000 },
        { timestamp: '2026-01-02', open: 20_000, high: 20_500, low: 19_500, close: 20_000, volume: 1000 },
        // Bar 3: Buy executed. StopLoss = 19,000, TargetPrice = 22,000
        { timestamp: '2026-01-03', open: 20_000, high: 20_500, low: 19_800, close: 20_200, volume: 1000 },
        // Bar 4: Wild volatility candle: High is 23,000 (>= target) AND Low is 18,000 (<= stop)
        { timestamp: '2026-01-04', open: 20_200, high: 23_000, low: 18_000, close: 21_000, volume: 1000 },
      ];

      const engine = new BacktestEngine({
        symbol: 'HPG',
        initialCapital: 100_000_000,
        minWarmupBars: 0,
        slippageRate: 0,
        strategy: ({ currentIndex }) => {
          if (currentIndex === 1) {
            return {
              symbol: 'HPG',
              signal: 'BUY',
              entryPrice: 20_000,
              targetPrice: 22_000,
              stopLoss: 19_000,
              riskReward: 2.0,
            };
          }
          return null;
        },
      });

      const result = await engine.run(candles);
      const sellTrade = result.tradeHistory.find((t) => t.side === 'SELL');

      expect(sellTrade).toBeDefined();
      // Must strictly be STOP_LOSS, not TARGET
      expect(sellTrade?.exitReason).toBe('STOP_LOSS');
      expect(sellTrade?.executionPrice).toBe(19_000);
    });
  });

  describe('Risk Manager Integration & Constraint Enforcements', () => {
    it('blocks trade if emergencyStop is active', async () => {
      const candles = createValidCandleSeries(6, 20_000);

      const engine = new BacktestEngine({
        symbol: 'HPG',
        initialCapital: 100_000_000,
        minWarmupBars: 1,
        emergencyStop: true, // Master kill switch active
        strategy: ({ currentIndex, currentCandle }) => {
          if (currentIndex === 2) {
            return {
              symbol: 'HPG',
              signal: 'BUY',
              entryPrice: currentCandle.close,
              targetPrice: currentCandle.close * 1.15,
              stopLoss: currentCandle.close * 0.95,
              riskReward: 3.0,
            };
          }
          return null;
        },
      });

      const result = await engine.run(candles);
      expect(result.totalTrades).toBe(0);
      expect(result.tradeHistory.length).toBe(0);
    });

    it('rejects candidate with invalid Risk/Reward < 2.0', async () => {
      const candles = createValidCandleSeries(6, 20_000);

      const engine = new BacktestEngine({
        symbol: 'HPG',
        initialCapital: 100_000_000,
        minWarmupBars: 1,
        strategy: ({ currentIndex, currentCandle }) => {
          if (currentIndex === 2) {
            return {
              symbol: 'HPG',
              signal: 'BUY',
              entryPrice: 20_000,
              targetPrice: 21_000, // Reward = 1000
              stopLoss: 19_000, // Risk = 1000 -> R:R = 1.0 < 2.0
              riskReward: 1.0,
            };
          }
          return null;
        },
      });

      const result = await engine.run(candles);
      expect(result.totalTrades).toBe(0);
    });

    it('rejects execution when price violates ceiling or floor limits', async () => {
      const candles: BacktestCandle[] = [
        { timestamp: '2026-01-01', open: 20_000, high: 20_500, low: 19_500, close: 20_000, volume: 1000 },
        { timestamp: '2026-01-02', open: 20_000, high: 20_500, low: 19_500, close: 20_000, volume: 1000 },
        // Next candle open exceeds ceilingPrice (20,100 vs 20,000 ceiling)
        {
          timestamp: '2026-01-03',
          open: 20_500,
          high: 21_000,
          low: 20_000,
          close: 20_800,
          volume: 1000,
          ceilingPrice: 20_000, // Ceiling set lower than open
          floorPrice: 18_000,
        },
      ];

      const engine = new BacktestEngine({
        symbol: 'HPG',
        initialCapital: 100_000_000,
        minWarmupBars: 0,
        strategy: ({ currentIndex }) => {
          if (currentIndex === 1) {
            return {
              symbol: 'HPG',
              signal: 'BUY',
              entryPrice: 20_000,
              targetPrice: 25_000,
              stopLoss: 18_000,
              riskReward: 2.5,
            };
          }
          return null;
        },
      });

      const result = await engine.run(candles);
      // Trade must not execute due to ceiling price limit violation
      expect(result.totalTrades).toBe(0);
    });
  });

  describe('Data Integrity & Fail-Closed Validation', () => {
    it('throws BacktestDataError on empty or null candles array', () => {
      expect(() => BacktestDataProvider.validateCandles([])).toThrowError(BacktestDataError);
    });

    it('throws BacktestDataError on zero or negative price', () => {
      const badCandles: BacktestCandle[] = [
        { timestamp: '2026-01-01', open: 0, high: 10, low: 0, close: 5, volume: 100 },
      ];
      expect(() => BacktestDataProvider.validateCandles(badCandles)).toThrowError(
        /zero, negative, or non-finite price/
      );
    });

    it('throws BacktestDataError on inconsistent OHLC (high < open or low > close)', () => {
      const badHigh: BacktestCandle[] = [
        { timestamp: '2026-01-01', open: 20_000, high: 19_000, low: 18_000, close: 19_500, volume: 100 },
      ];
      expect(() => BacktestDataProvider.validateCandles(badHigh)).toThrowError(
        /high .* is lower than max/
      );

      const badLow: BacktestCandle[] = [
        { timestamp: '2026-01-01', open: 20_000, high: 21_000, low: 20_500, close: 20_200, volume: 100 },
      ];
      expect(() => BacktestDataProvider.validateCandles(badLow)).toThrowError(
        /low .* is higher than min/
      );
    });

    it('throws BacktestDataError on duplicate timestamps', () => {
      const duplicateCandles: BacktestCandle[] = [
        { timestamp: '2026-01-01', open: 20, high: 25, low: 18, close: 22, volume: 100 },
        { timestamp: '2026-01-01', open: 22, high: 26, low: 20, close: 24, volume: 100 },
      ];
      expect(() => BacktestDataProvider.validateCandles(duplicateCandles)).toThrowError(
        /Duplicate timestamp detected/
      );
    });

    it('throws BacktestDataError on non-monotonic timestamps', () => {
      const nonMonotonicCandles: BacktestCandle[] = [
        { timestamp: '2026-01-05', open: 20, high: 25, low: 18, close: 22, volume: 100 },
        { timestamp: '2026-01-02', open: 22, high: 26, low: 20, close: 24, volume: 100 },
      ];
      expect(() => BacktestDataProvider.validateCandles(nonMonotonicCandles)).toThrowError(
        /Non-monotonic timestamp detected/
      );
    });
  });
});

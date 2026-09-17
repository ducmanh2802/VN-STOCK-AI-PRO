import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StockPriceSummary } from '../StockPriceSummary.tsx';
import { StockTechnicalIndicators } from '../StockTechnicalIndicators.tsx';
import { StockRiskReward } from '../StockRiskReward.tsx';
import { StockFundamentals } from '../StockFundamentals.tsx';
import { StockSupportResistance } from '../StockSupportResistance.tsx';
import { StockAISignalCard } from '../StockAISignalCard.tsx';
import type { RiskRewardData, FundamentalMetrics, SupportResistanceLevels, StockAISignalData } from '../../../types/stockDetail';
import type { IndicatorSnapshot } from '../../../lib/indicators/types';

describe('Stock Component Hardening & Fail-Closed Integrity', () => {
  describe('StockPriceSummary', () => {
    it('fails closed when price is invalid, non-finite, or <= 0', () => {
      const html = renderToStaticMarkup(
        <StockPriceSummary
          price={NaN}
          change={100}
          changePercent={0.5}
          refPrice={20000}
          volume={100000}
          tradingValue={2}
        />
      );
      expect(html).toContain('Dữ liệu thị giá chưa sẵn sàng');
      expect(html).not.toContain('NaN');
    });

    it('renders placeholder dashes for missing ceiling, floor, or session extremes', () => {
      const html = renderToStaticMarkup(
        <StockPriceSummary
          price={25000}
          change={500}
          changePercent={2.04}
          volume={500000}
          tradingValue={12.5}
        />
      );
      expect(html).toContain('25.000');
      expect(html).toContain('+500');
      expect(html).toContain('—'); // For undefined ceiling/floor/open/high/low
      expect(html).not.toContain('NaN');
    });

    it('handles negative or missing change cleanly without fabricating 0%', () => {
      const html = renderToStaticMarkup(
        <StockPriceSummary
          price={25000}
          change={Number.NaN}
          changePercent={Number.NaN}
          volume={0}
          tradingValue={0}
        />
      );
      expect(html).toContain('--');
      expect(html).not.toContain('NaN');
    });
  });

  describe('StockTechnicalIndicators', () => {
    it('renders unavailable message when snapshot is null', () => {
      const html = renderToStaticMarkup(
        <StockTechnicalIndicators snapshot={null} currentPrice={28000} />
      );
      expect(html).toContain('dữ liệu chỉ báo kỹ thuật');
    });

    it('handles non-finite values in technical indicators gracefully without crashing', () => {
      const brokenSnapshot = {
        symbol: 'HPG',
        date: '2026-09-16',
        rsi: { value: Number.NaN, status: 'NEUTRAL', label: 'RSI vùng tích lũy' },
        macd: { macd: Number.NaN, signal: 0, histogram: Number.NaN, trend: 'NEUTRAL', label: 'MACD đi ngang' },
        bollinger: { upper: Number.NaN, middle: Number.NaN, lower: Number.NaN, bandwidth: Number.NaN, status: 'NORMAL', label: 'Dải hẹp' },
        sma20: { value: Number.NaN, diffPercent: Number.NaN, status: 'ABOVE' },
        sma50: { value: Number.NaN, diffPercent: Number.NaN, status: 'ABOVE' },
        sma200: { value: Number.NaN, diffPercent: Number.NaN, status: 'ABOVE' },
        volume: { current: 100000, ma20: Number.NaN, ratioToMA: Number.NaN },
      } as unknown as IndicatorSnapshot;

      const html = renderToStaticMarkup(
        <StockTechnicalIndicators snapshot={brokenSnapshot} currentPrice={28000} />
      );
      expect(html).not.toContain('NaN');
      expect(html).toContain('--');
    });
  });

  describe('StockRiskReward', () => {
    const mockRiskReward: RiskRewardData = {
      entryPrice: 28000,
      stopLossPrice: 26000,
      targetPrice1: 31000,
      targetPrice2: 34000,
      riskRewardRatio: '1:2.5',
      riskAmount: 2000,
      rewardAmount: 5000,
      maxRiskPercent: 7.1,
      potentialGainPercent: 17.8,
    };

    it('calculates position sizing accurately when inputs are valid', () => {
      const html = renderToStaticMarkup(
        <StockRiskReward riskReward={mockRiskReward} currentPrice={28000} />
      );
      expect(html).toContain('R:R = 1:2.5');
      expect(html).toContain('Số cổ phiếu khuyến nghị:');
      expect(html).not.toContain('NaN');
    });

    it('fails closed when stopLoss is higher than currentPrice or missing', () => {
      const brokenRiskReward: RiskRewardData = {
        ...mockRiskReward,
        stopLossPrice: 30000, // Invalid: stop loss above current price
      };
      const html = renderToStaticMarkup(
        <StockRiskReward riskReward={brokenRiskReward} currentPrice={28000} />
      );
      expect(html).toContain('Chưa đủ điều kiện tính quy mô vị thế');
      expect(html).not.toContain('NaN');
    });
  });

  describe('StockFundamentals & SupportResistance', () => {
    it('StockFundamentals renders fallback dashes when metrics are NaN or missing', () => {
      const emptyFundamentals: FundamentalMetrics = {
        pe: Number.NaN,
        pb: Number.NaN,
        eps: Number.NaN,
        roe: Number.NaN,
        roa: Number.NaN,
        dividendYield: Number.NaN,
        revenueGrowthYoY: Number.NaN,
        profitGrowthYoY: Number.NaN,
        debtToEquity: Number.NaN,
        netMargin: Number.NaN,
        grossMargin: Number.NaN,
        sharesOutstanding: Number.NaN,
        marketCapBillion: Number.NaN,
      };
      const html = renderToStaticMarkup(
        <StockFundamentals fundamentals={emptyFundamentals} />
      );
      expect(html).not.toContain('NaN');
      expect(html).toContain('--');
    });

    it('StockSupportResistance renders fallback dashes when levels are NaN', () => {
      const emptyLevels: SupportResistanceLevels = {
        nearestSupport: Number.NaN,
        nearestResistance: Number.NaN,
        supportDistancePercent: Number.NaN,
        resistanceDistancePercent: Number.NaN,
        r3: Number.NaN,
        r2: Number.NaN,
        r1: Number.NaN,
        pivot: Number.NaN,
        s1: Number.NaN,
        s2: Number.NaN,
        s3: Number.NaN,
        ma20Level: Number.NaN,
        ma50Level: Number.NaN,
        ma200Level: Number.NaN,
      };
      const html = renderToStaticMarkup(
        <StockSupportResistance levels={emptyLevels} currentPrice={28000} />
      );
      expect(html).not.toContain('NaN');
      expect(html).toContain('--');
    });

    it('StockAISignalCard renders fallback values when scores are missing or invalid', () => {
      const brokenSignal: StockAISignalData = {
        signalType: 'HOLD',
        signalLabel: 'THEO DÕI',
        aiScore: Number.NaN,
        confidence: Number.NaN,
        targetPrice: Number.NaN,
        stopLossPrice: Number.NaN,
        riskRewardRatio: '',
        upsidePercent: Number.NaN,
        timeframe: 'Ngắn hạn',
        catalysts: [],
        riskWarnings: [],
        updatedAt: '',
        technicalSummary: '',
      };
      const html = renderToStaticMarkup(
        <StockAISignalCard signal={brokenSignal} currentPrice={28000} />
      );
      expect(html).not.toContain('NaN');
      expect(html).toContain('--');
    });
  });
});

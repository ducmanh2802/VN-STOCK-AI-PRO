import { describe, it, expect } from 'vitest';
import { DerivativesDataProvider } from '../DerivativesDataProvider.ts';
import { DerivativesIntelligenceService } from '../DerivativesIntelligenceService.ts';
import type { VpsRawQuote } from '../../market/providers/vps/types.ts';

describe('Phase 21.2 & 21.6 — Derivatives Service & Provider Normalization', () => {
  describe('DerivativesDataProvider Normalization', () => {
    it('normalizes raw VPS futures quote directly into index points without equity multiplier', () => {
      const raw: VpsRawQuote = {
        sym: 'VN30F1M',
        lastPrice: '1324.5',
        openPrice: '1320.0',
        highPrice: '1328.0',
        lowPrice: '1318.5',
        r: '1320.0',
        c: '1412.4',
        f: '1227.6',
        lot: 154200,
        changePc: '0.34',
        openInterest: 43500,
      };

      const quote = DerivativesDataProvider.normalizeFuturesQuote('VN30F1M', raw, 'VN30');

      expect(quote.symbol).toBe('VN30F1M');
      expect(quote.price).toBe(1324.5); // Index points, NOT 1,324,500
      expect(quote.open).toBe(1320.0);
      expect(quote.referencePrice).toBe(1320.0);
      expect(quote.change).toBe(4.5);
      expect(quote.changePercent).toBe(0.34);
      expect(quote.volume).toBe(154200);
      expect(quote.openInterest).toBe(43500);
      expect(quote.dataFreshness).toBe('CURRENT');
    });

    it('fails closed when raw payload is null or empty', () => {
      const quote = DerivativesDataProvider.normalizeFuturesQuote('VN30F1M', null, 'VN30');
      expect(quote.price).toBeNull();
      expect(quote.dataFreshness).toBe('UNAVAILABLE');
    });

    it('normalizes raw spot index quote accurately', () => {
      const raw: VpsRawQuote = {
        sym: 'VN30',
        lastPrice: '1315.8',
        r: '1310.0',
        changePc: '0.44',
      };

      const spot = DerivativesDataProvider.normalizeSpotQuote('VN30', raw);
      expect(spot.symbol).toBe('VN30');
      expect(spot.price).toBe(1315.8);
      expect(spot.change).toBe(5.8);
      expect(spot.dataFreshness).toBe('CURRENT');
    });
  });

  describe('DerivativesIntelligenceService', () => {
    it('builds continuous series using buildContinuousSeries helper', () => {
      const series = DerivativesIntelligenceService.buildContinuousSeries(
        'VN30',
        'UNADJUSTED',
        {}
      );
      expect(series.underlying).toBe('VN30');
      expect(series.method).toBe('UNADJUSTED');
      expect(series.bars).toEqual([]);
    });
  });
});

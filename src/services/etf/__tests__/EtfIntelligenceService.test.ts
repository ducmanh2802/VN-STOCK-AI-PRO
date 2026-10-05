import { describe, it, expect } from 'vitest';
import { EtfDataProvider } from '../EtfDataProvider.ts';
import { EtfIntelligenceService } from '../EtfIntelligenceService.ts';
import type { VpsRawQuote } from '../../market/providers/vps/types.ts';

describe('Phase 22.2 & 22.6 — ETF Provider Normalization & Service', () => {
  describe('EtfDataProvider Normalization', () => {
    it('normalizes raw VPS ETF quote properly into VND equity units', () => {
      const raw: VpsRawQuote = {
        sym: 'E1VFVN30',
        lastPrice: '34.55', // 34.55 kVND -> 34,550 VND
        openPrice: '34.20',
        highPrice: '34.80',
        lowPrice: '34.10',
        r: '34.20',
        c: '36.59',
        f: '31.81',
        lot: 24270, // 242,700 shares
        changePc: '1.02',
        fBVol: '1000',
        fSVolume: '500',
        fRoom: '5000000',
      };

      const quote = EtfDataProvider.normalizeQuote('E1VFVN30', raw, '2026-09-30T10:00:00.000Z');

      expect(quote.symbol).toBe('E1VFVN30');
      expect(quote.price).toBe(34_550);
      expect(quote.referencePrice).toBe(34_200);
      expect(quote.ceilingPrice).toBe(36_590);
      expect(quote.floorPrice).toBe(31_810);
      expect(quote.change).toBe(350); // 34550 - 34200
      expect(quote.changePercent).toBe(1.02);
      expect(quote.volume).toBe(242_700);
      expect(quote.foreignBuyVolume).toBe(10_000);
      expect(quote.foreignSellVolume).toBe(5_000);
      expect(quote.foreignRoom).toBe(5_000_000);
      // P0-02: the freshness label is COMPUTED from the observation instant, not
      // asserted. This fixture's observation is 2026-09-30T10:00Z, which is well
      // beyond the 120 s quote TTL relative to the reference clock, so the honest
      // label is STALE. A "fresh" observation yields CURRENT — asserted below.
      expect(quote.sourceTimestamp).toBe(Date.parse('2026-09-30T10:00:00.000Z'));
      expect(quote.dataFreshness).toBe('STALE');
      expect(quote.dataFreshness).not.toBe('CURRENT');

      const freshQuote = EtfDataProvider.normalizeQuote(
        'E1VFVN30',
        raw,
        new Date().toISOString()
      );
      expect(freshQuote.dataFreshness).toBe('CURRENT');
    });

    it('fails closed when raw payload is null or price is missing', () => {
      const q1 = EtfDataProvider.normalizeQuote('E1VFVN30', null);
      expect(q1.price).toBeNull();
      expect(q1.dataFreshness).toBe('UNAVAILABLE');

      const q2 = EtfDataProvider.normalizeQuote('E1VFVN30', { sym: 'E1VFVN30', lastPrice: '0' });
      expect(q2.price).toBeNull();
      expect(q2.dataFreshness).toBe('UNAVAILABLE');
    });
  });

  describe('EtfIntelligenceService Fail-Closed Invariants', () => {
    it('returns fail-closed snapshot for an unknown or unregistered symbol', async () => {
      const snapshot = await EtfIntelligenceService.getSnapshot({
        symbol: 'UNKNOWN_TICKER_XYZ',
        forceRefresh: true,
      });

      expect(snapshot.dataFreshness).toBe('UNAVAILABLE');
      expect(snapshot.specification.status).toBe('DELISTED');
      expect(snapshot.quote.price).toBeNull();
      expect(snapshot.premiumDiscount.status).toBe('DATA_UNAVAILABLE');
      expect(snapshot.tracking.status).toBe('DATA_UNAVAILABLE');
      expect(snapshot.performance.status).toBe('DATA_UNAVAILABLE');
      expect(snapshot.warnings.some((w) => w.includes('not a registered ETF'))).toBe(true);
    });
  });
});

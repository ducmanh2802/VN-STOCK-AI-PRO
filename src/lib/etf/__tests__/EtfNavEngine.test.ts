import { describe, it, expect } from 'vitest';
import { EtfNavEngine } from '../EtfNavEngine.ts';

describe('Phase 22.3 — ETF NAV & Premium/Discount Engine', () => {
  describe('Official NAV Changes', () => {
    it('computes daily NAV change and percentage change correctly', () => {
      const res = EtfNavEngine.computeOfficialNavChange(34_500, 34_000);
      expect(res.change).toBe(500);
      expect(res.changePercent).toBeCloseTo(1.47, 2);
    });

    it('fails closed when NAV or previous NAV is non-positive or null', () => {
      expect(EtfNavEngine.computeOfficialNavChange(null, 34_000)).toEqual({
        change: null,
        changePercent: null,
      });
      expect(EtfNavEngine.computeOfficialNavChange(34_500, 0)).toEqual({
        change: null,
        changePercent: null,
      });
    });
  });

  describe('iNAV (Intraday Indicative NAV)', () => {
    it('computes iNAV accurately from a complete constituent basket and cash component', () => {
      const constituents = [
        { symbol: 'HPG', sharesInBasket: 10_000, marketPrice: 28_000 }, // 280,000,000
        { symbol: 'FPT', sharesInBasket: 5_000, marketPrice: 130_000 }, // 650,000,000
        { symbol: 'VNM', sharesInBasket: 8_000, marketPrice: 65_000 }, // 520,000,000
      ];
      // Total basket equity = 1,450,000,000
      // Cash = 50,000,000
      // Total creation unit = 1,500,000,000
      // Creation shares = 100,000
      // Expected iNAV = 1,500,000,000 / 100,000 = 15,000 VND

      const res = EtfNavEngine.calculateINav({
        symbol: 'TEST_ETF',
        constituents,
        cashComponentVnd: 50_000_000,
        creationUnitShares: 100_000,
      });

      expect(res.status).toBe('COMPUTED');
      expect(res.inavPerShare).toBe(15_000);
      expect(res.basketMarketValue).toBe(1_450_000_000);
      expect(res.cashComponent).toBe(50_000_000);
    });

    it('fails closed to DATA_UNAVAILABLE if ANY constituent price is null or zero', () => {
      const constituents = [
        { symbol: 'HPG', sharesInBasket: 10_000, marketPrice: 28_000 },
        { symbol: 'FPT', sharesInBasket: 5_000, marketPrice: null }, // Missing price!
      ];

      const res = EtfNavEngine.calculateINav({
        symbol: 'TEST_ETF',
        constituents,
        cashComponentVnd: 10_000_000,
        creationUnitShares: 100_000,
      });

      expect(res.status).toBe('DATA_UNAVAILABLE');
      expect(res.inavPerShare).toBeNull();
      expect(res.warnings.some((w) => w.includes('FPT'))).toBe(true);
    });

    it('fails closed when constituents list is empty or creationUnitShares is invalid', () => {
      const res = EtfNavEngine.calculateINav({
        symbol: 'TEST_ETF',
        constituents: [],
        cashComponentVnd: 0,
        creationUnitShares: 100_000,
      });
      expect(res.status).toBe('DATA_UNAVAILABLE');
      expect(res.inavPerShare).toBeNull();
    });
  });

  describe('Premium / Discount to NAV', () => {
    it('classifies PREMIUM when market price exceeds NAV by > +0.20%', () => {
      // Market: 35,000, NAV: 34,500
      // Points: +500
      // Percent: (500 / 34,500) * 100 = +1.45%
      const res = EtfNavEngine.calculatePremiumDiscount({
        symbol: 'E1VFVN30',
        marketPrice: 35_000,
        referenceNav: 34_500,
        referenceNavType: 'OFFICIAL_EOD',
      });

      expect(res.status).toBe('LIVE');
      expect(res.premiumDiscountPoints).toBe(500);
      expect(res.premiumDiscountPercent).toBeCloseTo(1.45, 2);
      expect(res.regime).toBe('PREMIUM');
    });

    it('classifies DISCOUNT when market price is below NAV by < -0.20%', () => {
      // Market: 34,000, NAV: 34,500
      // Points: -500
      // Percent: (-500 / 34,500) * 100 = -1.45%
      const res = EtfNavEngine.calculatePremiumDiscount({
        symbol: 'E1VFVN30',
        marketPrice: 34_000,
        referenceNav: 34_500,
        referenceNavType: 'OFFICIAL_EOD',
      });

      expect(res.status).toBe('LIVE');
      expect(res.premiumDiscountPoints).toBe(-500);
      expect(res.premiumDiscountPercent).toBeCloseTo(-1.45, 2);
      expect(res.regime).toBe('DISCOUNT');
    });

    it('classifies PAR when spread is within [-0.20%, +0.20%]', () => {
      // Market: 34,530, NAV: 34,500
      // Percent: (30 / 34,500) * 100 = +0.087%
      const res = EtfNavEngine.calculatePremiumDiscount({
        symbol: 'E1VFVN30',
        marketPrice: 34_530,
        referenceNav: 34_500,
        referenceNavType: 'OFFICIAL_EOD',
      });

      expect(res.regime).toBe('PAR');
      expect(res.premiumDiscountPoints).toBe(30);
    });

    it('fails closed when market price or reference NAV is null or non-positive', () => {
      const r1 = EtfNavEngine.calculatePremiumDiscount({
        symbol: 'E1VFVN30',
        marketPrice: null,
        referenceNav: 34_500,
        referenceNavType: 'OFFICIAL_EOD',
      });
      expect(r1.status).toBe('DATA_UNAVAILABLE');
      expect(r1.premiumDiscountPercent).toBeNull();
      expect(r1.regime).toBe('DATA_UNAVAILABLE');

      const r2 = EtfNavEngine.calculatePremiumDiscount({
        symbol: 'E1VFVN30',
        marketPrice: 34_500,
        referenceNav: 0, // Zero NAV division guard!
        referenceNavType: 'OFFICIAL_EOD',
      });
      expect(r2.status).toBe('DATA_UNAVAILABLE');
      expect(r2.premiumDiscountPercent).toBeNull();
    });

    it('flags STALE when market timestamp and iNAV timestamp diverge by > 5 minutes', () => {
      const now = Date.now();
      const tenMinutesAgo = now - 600_000;

      const res = EtfNavEngine.calculatePremiumDiscount({
        symbol: 'E1VFVN30',
        marketPrice: 34_600,
        referenceNav: 34_500,
        referenceNavType: 'INTRADAY_INAV',
        marketTimestamp: now,
        navTimestamp: tenMinutesAgo,
        maxTimestampDeltaMs: 300_000,
      });

      expect(res.status).toBe('STALE');
      expect(res.warnings.some((w) => w.includes('diverge'))).toBe(true);
    });
  });
});

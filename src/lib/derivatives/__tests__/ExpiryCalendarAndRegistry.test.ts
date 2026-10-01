import { describe, it, expect } from 'vitest';
import { ExpiryCalendarEngine } from '../ExpiryCalendarEngine.ts';
import { VietnamDerivativesRegistry } from '../VietnamDerivativesRegistry.ts';
import { ContractResolver } from '../ContractResolver.ts';

describe('Phase 21.1 — Expiry Calendar & Contract Registry', () => {
  describe('1. Third Thursday Expiration Calculation', () => {
    it('accurately calculates raw third Thursday for standard months', () => {
      // 2026-04: Thursdays are 2, 9, 16, 23, 30. 3rd is 16.
      expect(ExpiryCalendarEngine.getRawThirdThursday(2026, 4)).toBe('2026-04-16');

      // 2026-01: Thursdays are 1, 8, 15, 22, 29. 3rd is 15.
      expect(ExpiryCalendarEngine.getRawThirdThursday(2026, 1)).toBe('2026-01-15');

      // 2026-05: Thursdays are 7, 14, 21, 28. 3rd is 21.
      expect(ExpiryCalendarEngine.getRawThirdThursday(2026, 5)).toBe('2026-05-21');
    });

    it('handles year boundary and leap years correctly', () => {
      // 2024 (leap year) Feb: Thursdays are 1, 8, 15, 22, 29. 3rd is 15.
      expect(ExpiryCalendarEngine.getRawThirdThursday(2024, 2)).toBe('2024-02-15');
      // 2025 Dec: Thursdays are 4, 11, 18, 25. 3rd is 18.
      expect(ExpiryCalendarEngine.getRawThirdThursday(2025, 12)).toBe('2025-12-18');
    });

    it('throws on invalid month numbers', () => {
      expect(() => ExpiryCalendarEngine.getRawThirdThursday(2026, 0)).toThrow();
      expect(() => ExpiryCalendarEngine.getRawThirdThursday(2026, 13)).toThrow();
    });
  });

  describe('2. Holiday & Weekend Adjustments', () => {
    it('adjusts third Thursday to preceding business day if on a public holiday', () => {
      // Example: If a third Thursday falls on a holiday (e.g. 2024-04-18 is Hung Kings commemoration)
      const expiry = ExpiryCalendarEngine.getExpiryInfo(2024, 4);
      expect(expiry.rawThirdThursday).toBe('2024-04-18');
      expect(expiry.isHolidayAdjusted).toBe(true);
      expect(expiry.adjustedExpiryDate).toBe('2024-04-17'); // Wednesday preceding
    });

    it('calculates days to expiry accurately', () => {
      expect(ExpiryCalendarEngine.calculateDaysToExpiry('2026-04-10', '2026-04-16')).toBe(6);
      expect(ExpiryCalendarEngine.calculateDaysToExpiry('2026-04-16', '2026-04-16')).toBe(0);
      expect(ExpiryCalendarEngine.calculateDaysToExpiry('2026-04-20', '2026-04-16')).toBe(0);
    });

    it('identifies contract expiration state at settlement boundary', () => {
      expect(ExpiryCalendarEngine.isContractExpired('2026-04-16', '2026-04-10T10:00:00+07:00')).toBe(false);
      expect(ExpiryCalendarEngine.isContractExpired('2026-04-16', '2026-04-16T14:46:00+07:00')).toBe(true);
      expect(ExpiryCalendarEngine.isContractExpired('2026-04-16', '2026-04-17T09:00:00+07:00')).toBe(true);
    });
  });

  describe('3. Vietnam Derivatives Registry', () => {
    it('returns exact specifications for VN30 and VN100 futures', () => {
      const vn30 = VietnamDerivativesRegistry.getUnderlyingSpec('VN30');
      expect(vn30.multiplier).toBe(100_000);
      expect(vn30.tickSize).toBe(0.1);
      expect(vn30.exchange).toBe('HNX');

      const vn100 = VietnamDerivativesRegistry.getUnderlyingSpec('VN100');
      expect(vn100.multiplier).toBe(100_000);
      expect(vn100.tickSize).toBe(0.1);
    });

    it('formats contract codes according to exchange conventions', () => {
      expect(VietnamDerivativesRegistry.formatContractCode('VN30', 2026, 4)).toBe('VN30F2604');
      expect(VietnamDerivativesRegistry.formatContractCode('VN100', 2026, 12)).toBe('VN100F2612');
    });

    it('parses valid contract symbols and rejects malformed symbols', () => {
      const p1 = VietnamDerivativesRegistry.parseContractSymbol('VN30F2604');
      expect(p1).toEqual({ underlying: 'VN30', year: 2026, month: 4 });

      const p2 = VietnamDerivativesRegistry.parseContractSymbol('VN100F1M');
      expect(p2).toEqual({ underlying: 'VN100', tenorAlias: '1M' });

      expect(VietnamDerivativesRegistry.parseContractSymbol('INVALID_XYZ')).toBeNull();
      expect(VietnamDerivativesRegistry.parseContractSymbol('VN30F2615')).toBeNull(); // Month 15 invalid
    });
  });

  describe('4. Active Contract Resolver & Rollover', () => {
    it('resolves active universe before expiry day', () => {
      // On 2026-04-10 (before 2026-04-16 expiry):
      // 1M = 2026-04
      // 2M = 2026-05
      // 1Q = 2026-06 (quarter end)
      // 2Q = 2026-09 (quarter end)
      const universe = ContractResolver.resolveActiveUniverse('VN30', '2026-04-10');
      expect(universe.frontMonth.contractCode).toBe('VN30F2604');
      expect(universe.nextMonth.contractCode).toBe('VN30F2605');
      expect(universe.quarter1.contractCode).toBe('VN30F2606');
      expect(universe.quarter2.contractCode).toBe('VN30F2609');
    });

    it('rolls over active universe after front month expires', () => {
      // On 2026-04-17 (day after 2026-04-16 expiry):
      // Rollover occurred:
      // 1M = 2026-05
      // 2M = 2026-06
      // 1Q = 2026-09
      // 2Q = 2026-12
      const universe = ContractResolver.resolveActiveUniverse('VN30', '2026-04-17');
      expect(universe.frontMonth.contractCode).toBe('VN30F2605');
      expect(universe.nextMonth.contractCode).toBe('VN30F2606');
      expect(universe.quarter1.contractCode).toBe('VN30F2609');
      expect(universe.quarter2.contractCode).toBe('VN30F2612');
    });

    it('resolves contract alias like VN30F1M and VN30F2M dynamically', () => {
      const c1 = ContractResolver.resolveContract('VN30F1M', '2026-04-10');
      expect(c1?.contractCode).toBe('VN30F2604');

      const c2 = ContractResolver.resolveContract('VN30F2M', '2026-04-10');
      expect(c2?.contractCode).toBe('VN30F2605');
    });
  });
});

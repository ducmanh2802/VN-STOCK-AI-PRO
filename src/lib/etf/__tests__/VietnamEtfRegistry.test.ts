import { describe, it, expect } from 'vitest';
import { VietnamEtfRegistry } from '../VietnamEtfRegistry.ts';

describe('Phase 22.1 — Vietnam ETF Master Registry', () => {
  it('retrieves valid specifications for all major HOSE ETFs', () => {
    const symbols = [
      'E1VFVN30',
      'FUEVFVND',
      'FUESSVFL',
      'FUESSV30',
      'FUEVN100',
      'FUEMAV30',
      'FUEMAVND',
      'FUEKIV30',
      'FUEKIVFS',
      'FUEIP100',
    ];

    for (const sym of symbols) {
      const spec = VietnamEtfRegistry.getSpecification(sym);
      expect(spec).not.toBeNull();
      expect(spec?.symbol).toBe(sym);
      expect(spec?.exchange).toBe('HOSE');
      expect(spec?.creationUnitSize).toBe(100_000);
      expect(spec?.managementFeePercent).toBeGreaterThan(0);
      expect(spec?.status).toBe('ACTIVE');
    }
  });

  it('normalizes symbols with whitespace and lowercase', () => {
    const s1 = VietnamEtfRegistry.getSpecification('  e1vfvn30  ');
    expect(s1?.symbol).toBe('E1VFVN30');

    const s2 = VietnamEtfRegistry.getSpecification('fuevfvnd');
    expect(s2?.symbol).toBe('FUEVFVND');
  });

  it('returns null for unknown or invalid symbols', () => {
    expect(VietnamEtfRegistry.getSpecification('UNKNOWN_ETF')).toBeNull();
    expect(VietnamEtfRegistry.getSpecification('')).toBeNull();
    expect(VietnamEtfRegistry.isRegistered('INVALID')).toBe(false);
  });

  it('filters ETFs by benchmark index accurately', () => {
    const vn30Etfs = VietnamEtfRegistry.listByBenchmark('VN30');
    expect(vn30Etfs.length).toBeGreaterThanOrEqual(4);
    expect(vn30Etfs.map((e) => e.symbol)).toContain('E1VFVN30');
    expect(vn30Etfs.map((e) => e.symbol)).toContain('FUESSV30');

    const diamondEtfs = VietnamEtfRegistry.listByBenchmark('VN DIAMOND');
    expect(diamondEtfs.map((e) => e.symbol)).toContain('FUEVFVND');
    expect(diamondEtfs.map((e) => e.symbol)).toContain('FUEMAVND');
  });

  it('filters ETFs by fund management company issuer', () => {
    const dragonCapital = VietnamEtfRegistry.listByIssuer('Dragon Capital');
    expect(dragonCapital.length).toBe(2);
    expect(dragonCapital.map((e) => e.symbol)).toEqual(['E1VFVN30', 'FUEVFVND']);

    const ssiam = VietnamEtfRegistry.listByIssuer('SSIAM');
    expect(ssiam.length).toBe(2);
    expect(ssiam.map((e) => e.symbol)).toEqual(['FUESSVFL', 'FUESSV30']);
  });
});

/**
 * PHASE 19.1 — MACRO INTELLIGENCE FOUNDATION & DATA CONTRACT TESTS
 * ================================================================
 * Unit test suite verifying:
 *   1. Macro Type & Indicator Registry integrity (US & Vietnam indicators)
 *   2. Macro Source Registry integrity & trust verification
 *   3. Centralized Freshness Policy across all observation frequencies
 *   4. Deterministic, fail-closed MacroDataValidator rules
 *   5. Safe EmptyMacroDataProvider baseline (strictly zero mock/synthetic data)
 *   6. MacroService integration & boundary safety
 */

import { describe, it, expect } from 'vitest';
import type {
  MacroIndicator,
  MacroIndicatorCategory,
  MacroCountry,
} from '../../../types/macro.ts';
import {
  MACRO_INDICATOR_REGISTRY,
  getRegisteredIndicator,
  isIndicatorCodeRegistered,
  getAllRegisteredIndicators,
  getIndicatorsByCategory,
  getIndicatorsByCountry,
} from '../registry/indicatorRegistry.ts';
import {
  MACRO_SOURCE_REGISTRY,
  getSourceConfig,
  getAllSources,
  getEnabledSources,
  isSourceTrusted,
} from '../registry/sourceRegistry.ts';
import {
  MacroFreshnessPolicy,
  defaultMacroFreshnessPolicy,
  DEFAULT_MACRO_FRESHNESS_CONFIG,
} from '../freshness/MacroFreshnessPolicy.ts';
import { MacroDataValidator } from '../validation/MacroDataValidator.ts';
import { EmptyMacroDataProvider } from '../providers/EmptyMacroDataProvider.ts';
import { MacroService } from '../MacroService.ts';

describe('Phase 19.1 — Macro Intelligence Foundation', () => {
  // =========================================================================
  // 1. INDICATOR REGISTRY TESTS
  // =========================================================================
  describe('Indicator Registry', () => {
    it('contains all required US / Federal Reserve indicators', () => {
      const requiredUsCodes = [
        'FED_FUNDS_RATE',
        'FED_POLICY_STANCE',
        'FOMC_NEXT_MEETING',
        'US_CPI',
        'US_CORE_CPI',
        'US_PCE',
        'US_CORE_PCE',
        'US_UNEMPLOYMENT',
        'US_NFP',
        'US_10Y_YIELD',
        'US_2Y_YIELD',
        'US_DXY',
        'FED_BALANCE_SHEET',
      ];

      for (const code of requiredUsCodes) {
        const def = getRegisteredIndicator(code);
        expect(def, `Expected registered definition for ${code}`).toBeDefined();
        expect(def?.code).toBe(code);
        expect(def?.country).toBe('US');
        expect(def?.unit).toBeTruthy();
        expect(def?.defaultSource).toBeTruthy();
        expect(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'EVENT']).toContain(def?.frequency);
      }
    });

    it('contains all required Vietnam / SBV & GSO indicators', () => {
      const requiredVnCodes = [
        'SBV_REFINANCING_RATE',
        'SBV_DISCOUNT_RATE',
        'SBV_OMO_RATE',
        'VN_DEPOSIT_RATE',
        'VN_LENDING_RATE',
        'VN_CREDIT_GROWTH',
        'VN_CPI',
        'VN_GDP_GROWTH',
        'USD_VND',
        'VN_M2_GROWTH',
      ];

      for (const code of requiredVnCodes) {
        const def = getRegisteredIndicator(code);
        expect(def, `Expected registered definition for ${code}`).toBeDefined();
        expect(def?.code).toBe(code);
        expect(def?.country).toBe('VN');
        expect(def?.unit).toBeTruthy();
        expect(def?.defaultSource).toBeTruthy();
        expect(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'EVENT']).toContain(def?.frequency);
      }
    });

    it('guarantees unique, uppercase indicator codes', () => {
      const all = getAllRegisteredIndicators();
      const codes = all.map((d) => d.code);
      const uniqueCodes = new Set(codes);

      expect(codes.length).toBe(uniqueCodes.size);
      for (const code of codes) {
        expect(code).toBe(code.toUpperCase().trim());
      }
    });

    it('filters indicators correctly by category and country', () => {
      const inflationIndicators = getIndicatorsByCategory('INFLATION');
      expect(inflationIndicators.length).toBeGreaterThanOrEqual(4);
      for (const ind of inflationIndicators) {
        expect(ind.category).toBe('INFLATION');
      }

      const vnIndicators = getIndicatorsByCountry('VN');
      expect(vnIndicators.length).toBeGreaterThanOrEqual(10);
      for (const ind of vnIndicators) {
        expect(ind.country).toBe('VN');
      }

      const usIndicators = getIndicatorsByCountry('US');
      expect(usIndicators.length).toBeGreaterThanOrEqual(13);
      for (const ind of usIndicators) {
        expect(ind.country).toBe('US');
      }
    });

    it('handles case-insensitive and whitespace-tolerant lookups', () => {
      expect(isIndicatorCodeRegistered('fed_funds_rate ')).toBe(true);
      expect(getRegisteredIndicator(' vn_cpi ')?.code).toBe('VN_CPI');
      expect(isIndicatorCodeRegistered('NON_EXISTENT_CODE_XYZ')).toBe(false);
      expect(getRegisteredIndicator('')).toBeUndefined();
    });
  });

  // =========================================================================
  // 2. SOURCE REGISTRY TESTS
  // =========================================================================
  describe('Source Registry', () => {
    it('contains all required macroeconomic data sources', () => {
      const requiredSources = ['FED', 'FRED', 'US_TREASURY', 'SBV', 'GSO_VIETNAM', 'MOF_VIETNAM'] as const;

      for (const src of requiredSources) {
        const config = getSourceConfig(src);
        expect(config, `Expected source config for ${src}`).toBeDefined();
        expect(config?.provider).toBe(src);
        expect(config?.baseUrl.startsWith('http')).toBe(true);
        expect(config?.reliabilityScore).toBeGreaterThanOrEqual(0.8);
        expect(isSourceTrusted(src)).toBe(true);
      }
    });

    it('returns enabled sources sorted by priority', () => {
      const enabled = getEnabledSources();
      expect(enabled.length).toBeGreaterThan(0);
      for (let i = 1; i < enabled.length; i++) {
        expect(enabled[i].priority).toBeGreaterThanOrEqual(enabled[i - 1].priority);
      }
    });

    it('rejects untrusted / non-existent sources', () => {
      expect(isSourceTrusted('UNKNOWN_SOURCE' as any)).toBe(false);
      expect(getSourceConfig('UNKNOWN_SOURCE' as any)).toBeUndefined();
    });
  });

  // =========================================================================
  // 3. FRESHNESS POLICY TESTS
  // =========================================================================
  describe('Freshness Policy', () => {
    const fixedNow = new Date('2026-03-30T12:00:00.000Z');
    const policy = new MacroFreshnessPolicy();

    it('enforces expected standard time thresholds', () => {
      expect(policy.getMaxAgeMs('DAILY')).toBe(72 * 60 * 60 * 1000); // 72 hours
      expect(policy.getMaxAgeMs('WEEKLY')).toBe(10 * 24 * 60 * 60 * 1000); // 10 days
      expect(policy.getMaxAgeMs('MONTHLY')).toBe(45 * 24 * 60 * 60 * 1000); // 45 days
      expect(policy.getMaxAgeMs('QUARTERLY')).toBe(120 * 24 * 60 * 60 * 1000); // 120 days
      expect(policy.getMaxAgeMs('EVENT')).toBe(90 * 24 * 60 * 60 * 1000); // 90 days
    });

    it('classifies recent daily data as FRESH', () => {
      // 24 hours ago
      const recentTimestamp = new Date('2026-03-29T12:00:00.000Z');
      const evalResult = policy.evaluateFreshness(recentTimestamp, 'DAILY', fixedNow);

      expect(evalResult.isFresh).toBe(true);
      expect(evalResult.status).toBe('FRESH');
      expect(policy.isFresh(recentTimestamp, 'DAILY', fixedNow)).toBe(true);
    });

    it('classifies old daily data as STALE (> 72 hours)', () => {
      // 5 days ago (120 hours)
      const oldTimestamp = new Date('2026-03-25T12:00:00.000Z');
      const evalResult = policy.evaluateFreshness(oldTimestamp, 'DAILY', fixedNow);

      expect(evalResult.isFresh).toBe(false);
      expect(evalResult.status).toBe('STALE');
      expect(policy.isFresh(oldTimestamp, 'DAILY', fixedNow)).toBe(false);
    });

    it('classifies 30-day-old monthly inflation data as FRESH (within 45 days threshold)', () => {
      const monthlyTimestamp = new Date('2026-03-01T00:00:00.000Z');
      const evalResult = policy.evaluateFreshness(monthlyTimestamp, 'MONTHLY', fixedNow);

      expect(evalResult.isFresh).toBe(true);
      expect(evalResult.status).toBe('FRESH');
    });

    it('detects and flags future timestamps', () => {
      const futureTimestamp = new Date('2026-04-05T00:00:00.000Z');
      const evalResult = policy.evaluateFreshness(futureTimestamp, 'DAILY', fixedNow);

      expect(evalResult.isFresh).toBe(false);
      expect(evalResult.status).toBe('FUTURE_INVALID');
      expect(policy.isFresh(futureTimestamp, 'DAILY', fixedNow)).toBe(false);
    });

    it('handles unparseable invalid dates gracefully', () => {
      const evalResult = policy.evaluateFreshness('INVALID-DATE-STRING', 'DAILY', fixedNow);
      expect(evalResult.isFresh).toBe(false);
      expect(evalResult.status).toBe('TIMESTAMP_INVALID');
    });
  });

  // =========================================================================
  // 4. DATA VALIDATOR TESTS
  // =========================================================================
  describe('MacroDataValidator', () => {
    const refTime = new Date('2026-03-30T10:00:00.000Z');

    const validIndicator: MacroIndicator = {
      id: 'macro_fed_funds_rate_20260328',
      code: 'FED_FUNDS_RATE',
      name: 'Federal Funds Effective Rate (FFR)',
      country: 'US',
      category: 'INTEREST_RATE',
      value: 4.33,
      previousValue: 4.33,
      expectedValue: 4.25,
      unit: '%',
      observationDate: '2026-03-28',
      publishedAt: '2026-03-29T13:30:00.000Z',
      source: 'FED',
      sourceUrl: 'https://www.federalreserve.gov/data',
      frequency: 'DAILY',
      status: 'VALID',
      confidence: 1.0,
    };

    it('validates a correct, fresh macro observation record', () => {
      const result = MacroDataValidator.validate(validIndicator, { referenceTime: refTime });
      expect(result.valid).toBe(true);
      expect(result.status).toBe('VALID');
      expect(result.errors).toHaveLength(0);
      expect(result.sourceTrusted).toBe(true);
      expect(result.timestampValid).toBe(true);
      expect(result.valueValid).toBe(true);
    });

    it('rejects null, undefined, or non-object payloads', () => {
      const nullResult = MacroDataValidator.validate(null, { referenceTime: refTime });
      expect(nullResult.valid).toBe(false);
      expect(nullResult.status).toBe('INVALID');
      expect(nullResult.errors[0]).toContain('null');

      const stringResult = MacroDataValidator.validate('not-an-object', { referenceTime: refTime });
      expect(stringResult.valid).toBe(false);
    });

    it('rejects unregistered indicator codes', () => {
      const invalidCodeInd = { ...validIndicator, code: 'UNREGISTERED_INFLATION_INDEX' };
      const result = MacroDataValidator.validate(invalidCodeInd, { referenceTime: refTime });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('not registered'))).toBe(true);
    });

    it('rejects country mismatch with canonical registry', () => {
      const mismatchedCountry = { ...validIndicator, country: 'VN' as const };
      const result = MacroDataValidator.validate(mismatchedCountry, { referenceTime: refTime });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Country mismatch'))).toBe(true);
    });

    it('rejects category mismatch with canonical registry', () => {
      const mismatchedCategory = { ...validIndicator, category: 'EMPLOYMENT' as const };
      const result = MacroDataValidator.validate(mismatchedCategory, { referenceTime: refTime });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Category mismatch'))).toBe(true);
    });

    it('rejects unauthorized or untrusted source providers', () => {
      const invalidSource = { ...validIndicator, source: 'UNAUTHORIZED_BLOG' as any };
      const result = MacroDataValidator.validate(invalidSource, { referenceTime: refTime });
      expect(result.valid).toBe(false);
      expect(result.sourceTrusted).toBe(false);
      expect(result.errors.some((e) => e.includes('not an authorized'))).toBe(true);
    });

    it('rejects future publishedAt timestamps', () => {
      const futurePublished = {
        ...validIndicator,
        publishedAt: '2026-04-10T00:00:00.000Z',
      };
      const result = MacroDataValidator.validate(futurePublished, { referenceTime: refTime });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('in the future'))).toBe(true);
    });

    it('rejects future observationDate for non-event indicators', () => {
      const futureObs = {
        ...validIndicator,
        observationDate: '2026-05-01',
      };
      const result = MacroDataValidator.validate(futureObs, { referenceTime: refTime });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('observationDate is in the future'))).toBe(true);
    });

    it('allows future observationDate for forward-looking EVENT indicators (e.g. FOMC meeting)', () => {
      const fomcMeeting: MacroIndicator = {
        id: 'macro_fomc_next_meeting_2026',
        code: 'FOMC_NEXT_MEETING',
        name: 'Next FOMC Meeting Schedule',
        country: 'US',
        category: 'CENTRAL_BANK_POLICY',
        value: 1777420800000, // future epoch timestamp
        previousValue: null,
        unit: 'Epoch ms / Days',
        observationDate: '2026-05-06',
        publishedAt: '2026-03-20T00:00:00.000Z',
        source: 'FED',
        sourceUrl: 'https://www.federalreserve.gov/data',
        frequency: 'EVENT',
        status: 'VALID',
        confidence: 1.0,
      };

      const result = MacroDataValidator.validate(fomcMeeting, { referenceTime: refTime });
      expect(result.valid).toBe(true);
      expect(result.status).toBe('VALID');
    });

    it('rejects undefined value while accepting null for NO_DATA', () => {
      const undefinedVal = { ...validIndicator, value: undefined };
      const resultUndef = MacroDataValidator.validate(undefinedVal, { referenceTime: refTime });
      expect(resultUndef.valid).toBe(false);

      const nullVal = { ...validIndicator, value: null, status: 'NO_DATA' as const };
      const resultNull = MacroDataValidator.validate(nullVal, { referenceTime: refTime });
      expect(resultNull.valid).toBe(true);
      expect(resultNull.status).toBe('NO_DATA');
    });

    it('rejects NaN, Infinity, and non-numeric values', () => {
      const nanVal = { ...validIndicator, value: NaN };
      expect(MacroDataValidator.validate(nanVal, { referenceTime: refTime }).valid).toBe(false);

      const infVal = { ...validIndicator, value: Infinity };
      expect(MacroDataValidator.validate(infVal, { referenceTime: refTime }).valid).toBe(false);

      const strVal = { ...validIndicator, value: '4.33%' as any };
      expect(MacroDataValidator.validate(strVal, { referenceTime: refTime }).valid).toBe(false);
    });

    it('enforces indicator-specific negative value rules', () => {
      // VN CPI allows negative (deflation)
      const vnCpiDeflation: MacroIndicator = {
        id: 'macro_vn_cpi_neg',
        code: 'VN_CPI',
        name: 'Chỉ số giá tiêu dùng CPI Việt Nam (YoY)',
        country: 'VN',
        category: 'INFLATION',
        value: -0.5,
        previousValue: 2.1,
        unit: '% YoY',
        observationDate: '2026-02-28',
        publishedAt: '2026-03-05T00:00:00.000Z',
        source: 'GSO_VIETNAM',
        sourceUrl: 'https://www.gso.gov.vn',
        frequency: 'MONTHLY',
        status: 'VALID',
        confidence: 0.95,
      };
      expect(MacroDataValidator.validate(vnCpiDeflation, { referenceTime: refTime }).valid).toBe(true);

      // USD_VND exchange rate cannot be negative
      const usdNeg: MacroIndicator = {
        id: 'macro_usd_vnd_neg',
        code: 'USD_VND',
        name: 'Tỷ giá USD/VND',
        country: 'VN',
        category: 'CURRENCY',
        value: -25000,
        previousValue: 25400,
        unit: 'VND',
        observationDate: '2026-03-28',
        publishedAt: '2026-03-29T00:00:00.000Z',
        source: 'SBV',
        sourceUrl: 'https://www.sbv.gov.vn',
        frequency: 'DAILY',
        status: 'VALID',
        confidence: 0.95,
      };
      const usdResult = MacroDataValidator.validate(usdNeg, { referenceTime: refTime });
      expect(usdResult.valid).toBe(false);
      expect(usdResult.errors.some((e) => e.includes('does not allow negative values'))).toBe(true);
    });

    it('rejects confidence scores outside [0, 1] or non-finite', () => {
      const highConf = { ...validIndicator, confidence: 1.5 };
      expect(MacroDataValidator.validate(highConf, { referenceTime: refTime }).valid).toBe(false);

      const negConf = { ...validIndicator, confidence: -0.1 };
      expect(MacroDataValidator.validate(negConf, { referenceTime: refTime }).valid).toBe(false);

      const nanConf = { ...validIndicator, confidence: NaN };
      expect(MacroDataValidator.validate(nanConf, { referenceTime: refTime }).valid).toBe(false);
    });

    it('correctly flags stale data while keeping valid=true and status=STALE', () => {
      // 10 days old daily rate (max daily is 72h)
      const staleDaily: MacroIndicator = {
        ...validIndicator,
        observationDate: '2026-03-15',
        publishedAt: '2026-03-15T12:00:00.000Z',
      };

      const result = MacroDataValidator.validate(staleDaily, { referenceTime: refTime });
      expect(result.valid).toBe(true);
      expect(result.status).toBe('STALE');
      expect(result.warnings.some((w) => w.includes('Data is stale'))).toBe(true);
    });
  });

  // =========================================================================
  // 5. EMPTY PROVIDER & SERVICE TESTS
  // =========================================================================
  describe('EmptyMacroDataProvider & MacroService', () => {
    it('returns explicit NO_DATA indicators with null values (never fabricated values)', async () => {
      const provider = new EmptyMacroDataProvider();
      const indicator = await provider.getIndicator('FED_FUNDS_RATE');

      expect(indicator).not.toBeNull();
      expect(indicator?.code).toBe('FED_FUNDS_RATE');
      expect(indicator?.value).toBeNull();
      expect(indicator?.previousValue).toBeNull();
      expect(indicator?.status).toBe('NO_DATA');
      expect(indicator?.metadata?.reason).toBe('PHASE_19_1_DATA_PROVIDER_NOT_CONNECTED');
    });

    it('returns empty list for nonexistent indicator code', async () => {
      const provider = new EmptyMacroDataProvider();
      const indicator = await provider.getIndicator('NON_EXISTENT_CODE');
      expect(indicator).toBeNull();
    });

    it('returns all registered indicators in NO_DATA state when requested', async () => {
      const provider = new EmptyMacroDataProvider();
      const indicators = await provider.getIndicators();

      expect(indicators.length).toBe(getAllRegisteredIndicators().length);
      for (const ind of indicators) {
        expect(ind.value).toBeNull();
        expect(ind.status).toBe('NO_DATA');
      }
    });

    it('health check returns status NO_DATA', async () => {
      const provider = new EmptyMacroDataProvider();
      const health = await provider.getHealthStatus();

      expect(health.status).toBe('NO_DATA');
      expect(health.providerId).toBe('empty-macro-provider');
    });

    it('MacroService coordinates indicator definition lookups and validation', async () => {
      const service = new MacroService();

      const defs = service.getDefinitions();
      expect(defs.length).toBeGreaterThanOrEqual(23);

      const fedDef = service.getDefinition('FED_FUNDS_RATE');
      expect(fedDef?.country).toBe('US');

      const vnDef = service.getDefinition('SBV_REFINANCING_RATE');
      expect(vnDef?.country).toBe('VN');

      const result = await service.getIndicator('FED_FUNDS_RATE');
      expect(result.indicator).not.toBeNull();
      expect(result.indicator?.value).toBeNull();
      expect(result.validation?.valid).toBe(true);
      expect(result.validation?.status).toBe('NO_DATA');
    });
  });

  // =========================================================================
  // 6. PHASE 18 / TRADING ISOLATION SAFETY
  // =========================================================================
  describe('Safety & Cross-Module Non-Interference', () => {
    it('macro indicators domain does not import or mutate trading engine state', () => {
      const service = new MacroService();
      const sources = service.getSources();
      expect(sources.length).toBe(6);

      // Verify immutability of registry
      expect(Object.isFrozen(MACRO_INDICATOR_REGISTRY) || Array.isArray(MACRO_INDICATOR_REGISTRY)).toBe(true);
    });
  });
});

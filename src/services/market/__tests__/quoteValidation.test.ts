/**
 * Regression suite: a quote with an unresolved material conflict must never be OK,
 * while prices inside the applicable exchange rules stay usable.
 *
 * Calendar facts used below: 2026-04-09 Thu, 2026-04-10 Fri, 2026-04-13 Mon;
 * Tết 2026 closes the market 2026-02-16..20 (2026-02-13 Fri -> 2026-02-23 Mon).
 */
import { describe, it, expect } from 'vitest';
import {
  validatePriceLimits,
  validateRealtimeQuote,
  type BenchmarkBar,
  type QuotePriceFields,
} from '../quoteValidation.ts';
import type { VnExchange } from '../../../lib/data/vnPriceLimits.ts';

/** Friday 2026-04-10, 10:00 in Hanoi — continuous trading. */
const FRI_10AM = new Date('2026-04-10T03:00:00.000Z');

/** HOSE HPG: reference 28,000, standard ±7% band rounded to the 50 VND tick. */
const HOSE_QUOTE: QuotePriceFields = {
  lastPrice: 28_500,
  openPrice: 28_100,
  highPrice: 28_600,
  lowPrice: 28_000,
  referencePrice: 28_000,
  ceilingPrice: 29_950,
  floorPrice: 26_050,
};

const bars = (...pairs: [string, number][]): { bars: BenchmarkBar[] } => ({
  bars: pairs.map(([date, close]) => ({ date, close })),
});

function validate(
  quote: Partial<QuotePriceFields>,
  benchmark: { bars: BenchmarkBar[] } | { error: string },
  opts: { exchange?: VnExchange | null; now?: Date } = {}
) {
  return validateRealtimeQuote({
    quote: { ...HOSE_QUOTE, ...quote },
    exchange: opts.exchange === undefined ? 'HOSE' : opts.exchange,
    benchmark,
    now: opts.now ?? FRI_10AM,
  });
}

describe('valid prices within the applicable rules stay usable', () => {
  it('OK when today’s reference equals the previous KBS close (HOSE)', () => {
    const r = validate({}, bars(['2026-04-08', 27_900], ['2026-04-09', 28_000]));
    expect(r.dataStatus).toBe('OK');
    expect(r.crossCheck.agreement).toBe('AGREE');
    expect(r.crossCheck.status).toBe('OK');
    expect(r.crossCheck.sessionsApart).toBe(1);
    expect(r.crossCheck.deviationPercent).toBeCloseTo(1.79, 2);
    expect(r.priceLimits.basis).toBe('SESSION_METADATA');
    expect(r.priceLimits.bandClassification).toBe('STANDARD');
  });

  it('OK when KBS already has the same session and its close lies inside today’s limits', () => {
    const r = validate({}, bars(['2026-04-10', 28_450]));
    expect(r.dataStatus).toBe('OK');
    expect(r.crossCheck.sessionsApart).toBe(0);
  });

  it('a legitimate UPCoM move beyond the old fixed 10% tolerance is not a false positive', () => {
    // UPCoM: ±15% band; reference is the previous session VWAP, not its close.
    const r = validate(
      { lastPrice: 11_400, openPrice: 10_200, highPrice: 11_450, lowPrice: 10_100, referencePrice: 10_000, ceilingPrice: 11_500, floorPrice: 8_500 },
      bars(['2026-04-09', 10_100]),
      { exchange: 'UPCOM' }
    );
    expect(r.crossCheck.deviationPercent).toBeGreaterThan(10);
    expect(r.dataStatus).toBe('OK');
    expect(r.crossCheck.agreement).toBe('TOLERATED');
  });

  it('HNX limits come from its own ±10% band, not a universal 7%', () => {
    const r = validate(
      { lastPrice: 21_900, openPrice: 20_100, highPrice: 21_900, lowPrice: 20_000, referencePrice: 20_000, ceilingPrice: 22_000, floorPrice: 18_000 },
      bars(['2026-04-09', 20_000]),
      { exchange: 'HNX' }
    );
    expect(r.dataStatus).toBe('OK');
    expect(r.priceLimits.bandClassification).toBe('STANDARD');
  });

  it('the trading calendar skips Tết: Friday before vs Monday after is ONE session', () => {
    const r = validate({}, bars(['2026-02-13', 28_000]), { now: new Date('2026-02-23T03:00:00.000Z') });
    expect(r.crossCheck.sessionsApart).toBe(1);
    expect(r.dataStatus).toBe('OK');
  });

  it('the session date is taken in Asia/Ho_Chi_Minh, not UTC', () => {
    // 18:30 UTC Thursday is 01:30 Friday in Hanoi.
    const r = validate({}, bars(['2026-04-09', 28_000]), { now: new Date('2026-04-09T18:30:00.000Z') });
    expect(r.sessionDate).toBe('2026-04-10');
    expect(r.crossCheck.sessionsApart).toBe(1);
  });

  it('falls back to exchange-rule limits when the source omits ceiling/floor', () => {
    const r = validate({ ceilingPrice: null, floorPrice: null }, bars(['2026-04-09', 28_000]));
    expect(r.priceLimits.basis).toBe('EXCHANGE_RULE');
    expect(r.priceLimits.ceilingPrice).toBe(29_950);
    expect(r.priceLimits.floorPrice).toBe(26_050);
    expect(r.dataStatus).toBe('OK');
  });
});

describe('material discrepancies can never be OK', () => {
  it('a kVND->VND unit error across every field is a cross-source MISMATCH', () => {
    const r = validate(
      { lastPrice: 28.5, openPrice: 28.1, highPrice: 28.6, lowPrice: 28, referencePrice: 28, ceilingPrice: 29.95, floorPrice: 26.05 },
      bars(['2026-04-09', 28_000])
    );
    expect(r.dataStatus).toBe('MISMATCH');
    expect(r.reasonCode).toBe('CROSS_SOURCE_MISMATCH');
  });

  it('a different instrument at a far higher price is a MISMATCH, not a corporate action', () => {
    const r = validate(
      { lastPrice: 99_900, openPrice: 99_000, highPrice: 100_000, lowPrice: 98_500, referencePrice: 99_000, ceilingPrice: 105_900, floorPrice: 92_100 },
      bars(['2026-04-09', 28_000])
    );
    expect(r.dataStatus).toBe('MISMATCH');
  });

  it('a reference ABOVE the previous close on HOSE is a MISMATCH even when the price is reachable', () => {
    const r = validate(
      { referencePrice: 28_500, ceilingPrice: 30_450, floorPrice: 26_550 },
      bars(['2026-04-09', 28_000])
    );
    expect(r.dataStatus).toBe('MISMATCH');
  });

  it('a downward-adjusted reference (possible ex-rights day) is UNVERIFIED, never OK', () => {
    // 30,000 close, then a 20% stock dividend: reference 25,000, band 23,250–26,750.
    const r = validate(
      { lastPrice: 25_500, openPrice: 25_000, highPrice: 25_600, lowPrice: 24_900, referencePrice: 25_000, ceilingPrice: 26_750, floorPrice: 23_250 },
      bars(['2026-04-09', 30_000])
    );
    expect(r.dataStatus).toBe('UNVERIFIED');
    expect(r.reasonCode).toBe('REFERENCE_PRICE_DIVERGES');
  });

  it('a same-session KBS close outside today’s limits is a MISMATCH', () => {
    const r = validate({}, bars(['2026-04-10', 31_000]));
    expect(r.dataStatus).toBe('MISMATCH');
  });

  it('a last price outside the published band is INVALID', () => {
    const r = validate({ lastPrice: 30_500, highPrice: 30_500 }, bars(['2026-04-09', 28_000]));
    expect(r.dataStatus).toBe('INVALID');
    expect(r.reasonCode).toBe('OUTSIDE_PRICE_LIMITS');
  });

  it('a last price outside the session high/low is INVALID', () => {
    const r = validate({ lastPrice: 28_700 }, bars(['2026-04-09', 28_000]));
    expect(r.dataStatus).toBe('INVALID');
  });

  it('unordered limits are INVALID', () => {
    const r = validate({ ceilingPrice: 26_050, floorPrice: 29_950 }, bars(['2026-04-09', 28_000]));
    expect(r.dataStatus).toBe('INVALID');
    expect(r.reasonCode).toBe('INCONSISTENT_PRICE_LIMITS');
  });

  it('a band wider than any legal HOSE band is INVALID', () => {
    const r = validate({ ceilingPrice: 40_000 }, bars(['2026-04-09', 28_000]));
    expect(r.dataStatus).toBe('INVALID');
    expect(r.reasonCode).toBe('INCONSISTENT_PRICE_LIMITS');
  });

  it.each([Number.NaN, 0, -100, Number.POSITIVE_INFINITY])('a non-usable lastPrice (%s) is INVALID', (lastPrice) => {
    const r = validate({ lastPrice }, bars(['2026-04-09', 28_000]));
    expect(r.dataStatus).toBe('INVALID');
    expect(r.reasonCode).toBe('INVALID_PRICE');
    // No arithmetic on an unusable price leaks into the diagnostics.
    expect(r.crossCheck.reasonCode).toBe('INVALID_PRICE');
    expect(r.crossCheck.deviationPercent).toBeNull();
  });

  it('outside rule-derived limits is UNVERIFIED (a special-band session cannot be ruled out)', () => {
    const r = validate(
      { ceilingPrice: null, floorPrice: null, lastPrice: 30_500, highPrice: 30_500 },
      bars(['2026-04-09', 28_000])
    );
    expect(r.dataStatus).toBe('UNVERIFIED');
    expect(r.reasonCode).toBe('OUTSIDE_STANDARD_PRICE_LIMITS');
  });
});

describe('what cannot be verified is UNVERIFIED, never OK', () => {
  it('KBS unavailable', () => {
    const r = validate({}, { error: 'KBS timeout' });
    expect(r.dataStatus).toBe('UNVERIFIED');
    expect(r.reasonCode).toBe('BENCHMARK_UNAVAILABLE');
    expect(r.crossCheck.status).toBe('UNVERIFIED');
  });

  it('KBS returned nothing usable', () => {
    expect(validate({}, bars()).reasonCode).toBe('BENCHMARK_UNAVAILABLE');
    expect(validate({}, bars(['2026-04-09', Number.NaN])).reasonCode).toBe('BENCHMARK_UNAVAILABLE');
  });

  it('a stale benchmark (e.g. a suspended security) is not evidence', () => {
    const r = validate({}, bars(['2026-03-20', 28_000]));
    expect(r.dataStatus).toBe('UNVERIFIED');
    expect(r.reasonCode).toBe('BENCHMARK_STALE');
  });

  it('a benchmark dated after the current session is not trusted', () => {
    const r = validate({}, bars(['2026-04-13', 28_000]));
    expect(r.reasonCode).toBe('BENCHMARK_AHEAD_OF_SESSION');
    expect(r.dataStatus).toBe('UNVERIFIED');
  });

  it('no reference price and no exchange: limits are unavailable', () => {
    const r = validate(
      { referencePrice: null, ceilingPrice: null, floorPrice: null },
      bars(['2026-04-09', 28_000]),
      { exchange: null }
    );
    expect(r.dataStatus).toBe('UNVERIFIED');
    expect(r.reasonCode).toBe('PRICE_LIMITS_UNAVAILABLE');
  });

  it('an unknown exchange cannot bound a multi-session gap', () => {
    const r = validate({}, bars(['2026-04-08', 28_000]), { exchange: null });
    expect(r.reasonCode).toBe('EXCHANGE_UNKNOWN');
  });

  it('a year the holiday calendar does not cover is UNVERIFIED', () => {
    const r = validate({}, bars(['2029-02-28', 28_000]), { now: new Date('2029-03-01T03:00:00.000Z') });
    expect(r.calendarCovered).toBe(false);
    expect(r.dataStatus).toBe('UNVERIFIED');
    expect(r.reasonCode).toBe('CALENDAR_NOT_COVERED');
  });
});

describe('validatePriceLimits', () => {
  it('treats unpopulated session fields as absent, not as violations', () => {
    const v = validatePriceLimits({ ...HOSE_QUOTE, openPrice: null, highPrice: 0, lowPrice: null }, 'HOSE');
    expect(v.status).toBe('WITHIN_LIMITS');
  });

  it('classifies a first-day style band as NON_STANDARD without rejecting it', () => {
    const v = validatePriceLimits(
      { ...HOSE_QUOTE, ceilingPrice: 33_600, floorPrice: 22_400, highPrice: 29_000 },
      'HOSE'
    );
    expect(v.status).toBe('WITHIN_LIMITS');
    expect(v.bandClassification).toBe('NON_STANDARD');
  });

  it('keeps every violation for diagnostics', () => {
    const v = validatePriceLimits({ ...HOSE_QUOTE, lastPrice: 30_500, openPrice: 30_400, highPrice: 30_500 }, 'HOSE');
    expect(v.status).toBe('OUTSIDE_LIMITS');
    expect(v.violations.length).toBeGreaterThanOrEqual(3);
  });
});

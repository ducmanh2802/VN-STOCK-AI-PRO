/**
 * REALTIME QUOTE VALIDATION
 * =========================
 * Decides whether a VPS quote may be exposed as `dataStatus: 'OK'`. Two independent
 * checks, kept separate on purpose:
 *
 * 1. Exchange price limits — is the quote internally consistent with the session's
 *    reference / ceiling / floor? Limits come from the session metadata the source
 *    supplied; the statutory band for the instrument's exchange is only a fallback
 *    when the source omitted them, and a bound on how wide a real band can be.
 *
 * 2. Cross-provider agreement — is the VPS price consistent with the independent KBS
 *    daily close, given how far the market can legally move between the two
 *    observations? The tolerance is derived from the number of trading sessions
 *    between them and the applicable band, never a single fixed percentage.
 *
 * A quote is OK only when both checks pass. Anything that cannot be verified is
 * UNVERIFIED, a proven conflict is MISMATCH, and a self-inconsistent quote is INVALID.
 * Values are never repaired or replaced: the caller keeps the raw source values plus
 * these diagnostics, and must not use the quote unless `dataStatus === 'OK'`.
 */
import {
  equityTickSize,
  MAX_ANY_DAILY_BAND,
  MAX_SPECIAL_DAILY_BAND,
  STANDARD_DAILY_BAND,
  standardLimitsFor,
  type VnExchange,
} from '../../lib/data/vnPriceLimits.ts';
import {
  isCalendarCovered,
  latestTradingDayOnOrBefore,
  tradingSessionsBetween,
  vnLocalParts,
} from '../../lib/data/vnTradingCalendar.ts';

export type QuoteDataStatus = 'OK' | 'MISMATCH' | 'UNVERIFIED' | 'INVALID';

export type QuoteReasonCode =
  | 'VERIFIED'
  | 'INVALID_PRICE'
  | 'INCONSISTENT_PRICE_LIMITS'
  | 'OUTSIDE_PRICE_LIMITS'
  | 'OUTSIDE_STANDARD_PRICE_LIMITS'
  | 'PRICE_LIMITS_UNAVAILABLE'
  | 'BENCHMARK_UNAVAILABLE'
  | 'BENCHMARK_STALE'
  | 'BENCHMARK_AHEAD_OF_SESSION'
  | 'SESSION_DATE_UNKNOWN'
  | 'CALENDAR_NOT_COVERED'
  | 'EXCHANGE_UNKNOWN'
  | 'REFERENCE_PRICE_DIVERGES'
  | 'CROSS_SOURCE_MISMATCH';

/** More than this many sessions between the KBS bar and the quote session = stale benchmark. */
export const MAX_BENCHMARK_LAG_SESSIONS = 2;

/** Smallest adjusted-reference / previous-close ratio still plausible as a corporate action. */
export const MIN_CORPORATE_ACTION_REFERENCE_RATIO = 0.25;

export interface QuotePriceFields {
  readonly lastPrice: number;
  readonly openPrice: number | null;
  readonly highPrice: number | null;
  readonly lowPrice: number | null;
  readonly referencePrice: number | null;
  readonly ceilingPrice: number | null;
  readonly floorPrice: number | null;
}

export interface BenchmarkBar {
  readonly date: string;
  readonly close: number;
}

export interface PriceLimitValidation {
  readonly status: 'WITHIN_LIMITS' | 'OUTSIDE_LIMITS' | 'INCONSISTENT_LIMITS' | 'UNAVAILABLE';
  /** Where the limits came from. EXCHANGE_RULE cannot see special-band sessions. */
  readonly basis: 'SESSION_METADATA' | 'EXCHANGE_RULE' | 'NONE';
  readonly exchange: VnExchange | null;
  readonly referencePrice: number | null;
  readonly floorPrice: number | null;
  readonly ceilingPrice: number | null;
  /** Session band as a fraction of the reference price. */
  readonly bandFraction: number | null;
  readonly bandClassification: 'STANDARD' | 'NON_STANDARD' | 'UNKNOWN';
  readonly violations: readonly string[];
}

export interface QuoteCrossCheck {
  readonly benchmarkSource: 'KBS';
  /** Date of the benchmark KBS bar. */
  readonly kbsDate: string | null;
  /** KBS close in VND for that date. */
  readonly kbsClose: number | null;
  /** (vpsLastPrice - kbsClose) / kbsClose * 100, rounded to 2 decimals. */
  readonly deviationPercent: number | null;
  /** Legacy summary: OK when the sources agree or differ only within legal limits. */
  readonly status: 'OK' | 'MISMATCH' | 'UNVERIFIED';
  readonly agreement: 'AGREE' | 'TOLERATED' | 'MISMATCH' | 'UNVERIFIED';
  readonly reasonCode: QuoteReasonCode;
  /** Trading sessions between the KBS bar and the quote session (0 = same session). */
  readonly sessionsApart: number | null;
  /** Range the VPS price may legally occupy given the KBS close. */
  readonly allowedRange: { readonly lower: number; readonly upper: number } | null;
  readonly detail: string;
}

export interface QuoteValidationResult {
  readonly dataStatus: QuoteDataStatus;
  readonly reasonCode: QuoteReasonCode;
  readonly detail: string;
  /** Exchange-local date of the session the quote belongs to. */
  readonly sessionDate: string | null;
  /** False when the holiday calendar does not cover `sessionDate`'s year. */
  readonly calendarCovered: boolean;
  readonly priceLimits: PriceLimitValidation;
  readonly crossCheck: QuoteCrossCheck;
}

const isPositive = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0;

const round2 = (v: number): number => Math.round(v * 100) / 100;

const tickFor = (exchange: VnExchange | null, price: number): number =>
  exchange ? equityTickSize(exchange, price) : 100;

export function validatePriceLimits(
  quote: QuotePriceFields,
  exchange: VnExchange | null
): PriceLimitValidation {
  const r = quote.referencePrice;
  const c = quote.ceilingPrice;
  const f = quote.floorPrice;

  let basis: PriceLimitValidation['basis'] = 'NONE';
  let floor: number | null = null;
  let ceiling: number | null = null;
  let bandFraction: number | null = null;
  let bandClassification: PriceLimitValidation['bandClassification'] = 'UNKNOWN';

  const unavailable = (): PriceLimitValidation => ({
    status: 'UNAVAILABLE',
    basis: 'NONE',
    exchange,
    referencePrice: isPositive(r) ? r : null,
    floorPrice: null,
    ceilingPrice: null,
    bandFraction: null,
    bandClassification: 'UNKNOWN',
    violations: [],
  });

  if (isPositive(r) && isPositive(c) && isPositive(f)) {
    basis = 'SESSION_METADATA';
    floor = f;
    ceiling = c;
    bandFraction = Math.max((c - r) / r, (r - f) / r);
    const inconsistent = (violation: string): PriceLimitValidation => ({
      status: 'INCONSISTENT_LIMITS',
      basis,
      exchange,
      referencePrice: r,
      floorPrice: f,
      ceilingPrice: c,
      bandFraction,
      bandClassification: 'UNKNOWN',
      violations: [violation],
    });
    if (!(f < c && f <= r && r <= c)) {
      return inconsistent(`limits are not ordered floor <= reference <= ceiling (${f} / ${r} / ${c})`);
    }
    const slack = tickFor(exchange, c) / r;
    const widest = exchange ? MAX_SPECIAL_DAILY_BAND[exchange] : MAX_ANY_DAILY_BAND;
    if (bandFraction > widest + slack) {
      return inconsistent(
        `session band ${(bandFraction * 100).toFixed(2)}% exceeds the widest legal band ${(widest * 100).toFixed(0)}%`
      );
    }
    if (exchange) {
      bandClassification =
        Math.abs(bandFraction - STANDARD_DAILY_BAND[exchange]) <= slack + 1e-9 ? 'STANDARD' : 'NON_STANDARD';
    }
  } else if (isPositive(r) && exchange) {
    basis = 'EXCHANGE_RULE';
    const limits = standardLimitsFor(exchange, r);
    floor = limits.floor;
    ceiling = limits.ceiling;
    bandFraction = STANDARD_DAILY_BAND[exchange];
    bandClassification = 'STANDARD';
  } else {
    return unavailable();
  }

  const violations: string[] = [];
  const priced: readonly (readonly [string, number | null])[] = [
    ['lastPrice', quote.lastPrice],
    ['openPrice', quote.openPrice],
    ['highPrice', quote.highPrice],
    ['lowPrice', quote.lowPrice],
  ];
  for (const [name, value] of priced) {
    // Session fields the source has not populated yet (null / 0 before the first match)
    // are absent, not violations.
    if (!isPositive(value)) continue;
    if (value < floor) violations.push(`${name} ${value} is below the floor ${floor}`);
    if (value > ceiling) violations.push(`${name} ${value} is above the ceiling ${ceiling}`);
  }
  const { highPrice: high, lowPrice: low, lastPrice: last } = quote;
  if (isPositive(high) && isPositive(low) && high < low) violations.push(`highPrice ${high} is below lowPrice ${low}`);
  if (isPositive(high) && last > high) violations.push(`lastPrice ${last} is above the session high ${high}`);
  if (isPositive(low) && last < low) violations.push(`lastPrice ${last} is below the session low ${low}`);

  return {
    status: violations.length > 0 ? 'OUTSIDE_LIMITS' : 'WITHIN_LIMITS',
    basis,
    exchange,
    referencePrice: r,
    floorPrice: floor,
    ceilingPrice: ceiling,
    bandFraction,
    bandClassification,
    violations,
  };
}

function crossCheckAgainstBenchmark(
  quote: QuotePriceFields,
  exchange: VnExchange | null,
  limits: PriceLimitValidation,
  benchmark: { readonly bars: readonly BenchmarkBar[] } | { readonly error: string },
  sessionDate: string | null
): QuoteCrossCheck {
  const base = {
    benchmarkSource: 'KBS' as const,
    kbsDate: null as string | null,
    kbsClose: null as number | null,
    deviationPercent: null as number | null,
    sessionsApart: null as number | null,
    allowedRange: null as QuoteCrossCheck['allowedRange'],
  };
  const unverified = (reasonCode: QuoteReasonCode, detail: string, extra: Partial<typeof base> = {}): QuoteCrossCheck => ({
    ...base,
    ...extra,
    status: 'UNVERIFIED',
    agreement: 'UNVERIFIED',
    reasonCode,
    detail,
  });

  if ('error' in benchmark) {
    return unverified('BENCHMARK_UNAVAILABLE', `KBS cross-check unavailable: ${benchmark.error}`);
  }
  const usable = benchmark.bars.filter((b) => isPositive(b.close) && /^\d{4}-\d{2}-\d{2}$/.test(b.date));
  const last = usable.length > 0 ? usable.reduce((a, b) => (b.date > a.date ? b : a)) : null;
  if (!last) return unverified('BENCHMARK_UNAVAILABLE', 'KBS returned no usable benchmark bar.');

  const C = last.close;
  const L = quote.lastPrice;
  if (!isPositive(L)) {
    return unverified('INVALID_PRICE', 'The VPS quote has no usable price to compare.', { kbsDate: last.date, kbsClose: C });
  }
  const known = {
    kbsDate: last.date,
    kbsClose: C,
    deviationPercent: isPositive(L) ? round2(((L - C) / C) * 100) : null,
  };
  if (!sessionDate) return unverified('SESSION_DATE_UNKNOWN', 'The current trading session could not be determined.', known);
  if (last.date > sessionDate) {
    return unverified(
      'BENCHMARK_AHEAD_OF_SESSION',
      `KBS bar ${last.date} is dated after the current session ${sessionDate}.`,
      known
    );
  }

  const k = tradingSessionsBetween(last.date, sessionDate);
  const withK = { ...known, sessionsApart: k };
  if (k > MAX_BENCHMARK_LAG_SESSIONS) {
    return unverified(
      'BENCHMARK_STALE',
      `Latest KBS bar ${last.date} is ${k} sessions before ${sessionDate} (limit ${MAX_BENCHMARK_LAG_SESSIONS}); possible suspension or provider lag.`,
      withK
    );
  }
  if (limits.status === 'UNAVAILABLE' || limits.floorPrice === null || limits.ceilingPrice === null || limits.bandFraction === null) {
    return unverified('PRICE_LIMITS_UNAVAILABLE', 'No session price limits to bound the comparison.', withK);
  }

  const agree = (detail: string, range: QuoteCrossCheck['allowedRange']): QuoteCrossCheck => ({
    ...base, ...withK, allowedRange: range, status: 'OK', agreement: 'AGREE', reasonCode: 'VERIFIED', detail,
  });
  // A conflict is only PROVEN against limits the exchange actually published. Limits
  // derived from the standard band cannot see special-band sessions, so a breach of
  // them leaves the quote unverified rather than mismatched.
  const mismatch = (detail: string, range: QuoteCrossCheck['allowedRange']): QuoteCrossCheck =>
    limits.basis === 'SESSION_METADATA'
      ? { ...base, ...withK, allowedRange: range, status: 'MISMATCH', agreement: 'MISMATCH', reasonCode: 'CROSS_SOURCE_MISMATCH', detail }
      : unverified('OUTSIDE_STANDARD_PRICE_LIMITS', `${detail} (limits assumed from the standard band)`, { ...withK, allowedRange: range });

  if (k === 0) {
    // Same session: both sources describe today's market, so the KBS close must lie
    // inside today's limits.
    const range = { lower: limits.floorPrice, upper: limits.ceilingPrice };
    return C >= range.lower && C <= range.upper
      ? agree(`KBS close ${C} (${last.date}) lies within the session limits ${range.lower}–${range.upper}.`, range)
      : mismatch(`KBS close ${C} for the same session ${last.date} lies outside the session limits ${range.lower}–${range.upper}.`, range);
  }

  if (k >= 2 && !exchange) {
    return unverified('EXCHANGE_UNKNOWN', 'A multi-session tolerance needs the instrument exchange, which is unknown.', withK);
  }
  // Earlier sessions moved at most the standard band each; the current session at most its own band.
  const bToday = limits.bandFraction;
  const bStd = exchange ? STANDARD_DAILY_BAND[exchange] : 0;
  const slack = tickFor(exchange, C);
  const range = {
    lower: Math.max(0, C * (1 - bToday) * Math.pow(1 - bStd, k - 1) - slack),
    upper: C * (1 + bToday) * Math.pow(1 + bStd, k - 1) + slack,
  };
  const reachable = L >= range.lower && L <= range.upper;

  // On HOSE/HNX today's reference is the previous session's close. UPCoM references the
  // previous session's VWAP instead, so the identity is not expected there. Vietnamese
  // corporate actions (cash/stock dividends, bonus shares, rights) only ever adjust the
  // reference DOWN, so only a downward divergence can be a corporate action; an upward
  // one is a conflict between the sources.
  const r = limits.referencePrice;
  const tick = isPositive(r) ? tickFor(exchange, r) : tickFor(exchange, C);
  const referenceComparable = k === 1 && (exchange === 'HOSE' || exchange === 'HNX') && isPositive(r);
  // Even a 300% stock dividend leaves a quarter of the price; a deeper cut (e.g. a
  // kVND/VND unit slip) is not a corporate action.
  const referenceAdjustedDown = isPositive(r) && C - r > tick && r / C >= MIN_CORPORATE_ACTION_REFERENCE_RATIO;
  const referenceAbove = isPositive(r) && r - C > tick;
  const possibleCorporateAction = (detail: string): QuoteCrossCheck =>
    unverified(
      'REFERENCE_PRICE_DIVERGES',
      `${detail} The session reference ${r} is below that close: possibly a corporate-action adjustment, not reconciled.`,
      { ...withK, allowedRange: range }
    );

  if (!reachable) {
    const detail = `VPS price ${L} cannot be reached from KBS close ${C} (${last.date}) within ${k} session(s) of legal price moves (${Math.round(range.lower)}–${Math.round(range.upper)}).`;
    return referenceAdjustedDown && limits.status === 'WITHIN_LIMITS'
      ? possibleCorporateAction(detail)
      : mismatch(detail, range);
  }
  if (referenceComparable && referenceAbove) {
    return mismatch(
      `Session reference ${r} is above the previous KBS close ${C} (${last.date}); no corporate action raises a reference.`,
      range
    );
  }
  if (referenceComparable && referenceAdjustedDown) {
    return possibleCorporateAction(`Session reference ${r} differs from the previous KBS close ${C} (${last.date}).`);
  }
  if (referenceComparable) {
    return agree(`Session reference ${r} equals the previous KBS close ${C} (${last.date}).`, range);
  }
  return {
    ...base,
    ...withK,
    allowedRange: range,
    status: 'OK',
    agreement: 'TOLERATED',
    reasonCode: 'VERIFIED',
    detail: `VPS price ${L} is within ${Math.round(range.lower)}–${Math.round(range.upper)} reachable from KBS close ${C} (${last.date}) in ${k} session(s).`,
  };
}

export function validateRealtimeQuote(input: {
  readonly quote: QuotePriceFields;
  readonly exchange: VnExchange | null;
  readonly benchmark: { readonly bars: readonly BenchmarkBar[] } | { readonly error: string };
  readonly now: Date;
}): QuoteValidationResult {
  const { quote, exchange } = input;
  const today = vnLocalParts(input.now).date;
  const sessionDate = latestTradingDayOnOrBefore(today);
  const calendarCovered = isCalendarCovered(today);

  const priceLimits = validatePriceLimits(quote, exchange);
  const crossCheck = crossCheckAgainstBenchmark(quote, exchange, priceLimits, input.benchmark, sessionDate);

  const result = (dataStatus: QuoteDataStatus, reasonCode: QuoteReasonCode, detail: string): QuoteValidationResult => ({
    dataStatus,
    reasonCode,
    detail,
    sessionDate,
    calendarCovered,
    priceLimits,
    crossCheck,
  });

  if (!isPositive(quote.lastPrice)) {
    return result('INVALID', 'INVALID_PRICE', `lastPrice is not a positive finite number (${quote.lastPrice}).`);
  }
  if (priceLimits.status === 'INCONSISTENT_LIMITS') {
    return result('INVALID', 'INCONSISTENT_PRICE_LIMITS', priceLimits.violations.join('; '));
  }
  if (priceLimits.status === 'OUTSIDE_LIMITS' && priceLimits.basis === 'SESSION_METADATA') {
    return result('INVALID', 'OUTSIDE_PRICE_LIMITS', priceLimits.violations.join('; '));
  }
  if (crossCheck.agreement === 'MISMATCH') {
    return result('MISMATCH', 'CROSS_SOURCE_MISMATCH', crossCheck.detail);
  }
  if (priceLimits.status === 'OUTSIDE_LIMITS') {
    // Rule-derived limits cannot see first-day or post-suspension bands: unverified, not invalid.
    return result('UNVERIFIED', 'OUTSIDE_STANDARD_PRICE_LIMITS', priceLimits.violations.join('; '));
  }
  if (priceLimits.status === 'UNAVAILABLE') {
    return result('UNVERIFIED', 'PRICE_LIMITS_UNAVAILABLE', 'The source supplied no reference price to derive limits from.');
  }
  if (!calendarCovered) {
    // Without the year's holidays the session arithmetic above is a guess.
    return result('UNVERIFIED', 'CALENDAR_NOT_COVERED', `The holiday calendar does not cover ${today}; extend STATUTORY_VIETNAM_HOLIDAYS.`);
  }
  if (crossCheck.agreement === 'UNVERIFIED') {
    return result('UNVERIFIED', crossCheck.reasonCode, crossCheck.detail);
  }
  return result('OK', 'VERIFIED', crossCheck.detail);
}

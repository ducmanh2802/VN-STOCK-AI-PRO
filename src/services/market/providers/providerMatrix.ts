/**
 * P27 — PROVIDER MATRIX + DETERMINISTIC FALLBACK ENGINE (§6 / §8)
 * ================================================================
 * The matrix is the single place that answers "which vendor may answer this
 * capability, in which order, and is it implemented at all". Before P27 the order
 * was implicit in per-call-site try/catch, which made the priority impossible to
 * audit. Nothing here invents a provider: a capability with no legitimate source
 * is declared UNAVAILABLE and never given a fake implementation (§5).
 *
 * Fallback guarantees (§8):
 *   - ordered PRIMARY → SECONDARY → … → DATA_UNAVAILABLE
 *   - the returned `source` is the vendor that ACTUALLY answered
 *   - every attempted provider and its error code is retained in `attempts`
 *   - no fabrication, no timestamp mixing, no silent swallowing
 */

export type MarketDataCapability =
  | 'quote'
  | 'quotes'
  | 'history'
  | 'index'
  | 'fundamentals'
  | 'breadth'
  | 'foreignFlow'
  | 'marketCap';

export type CapabilityStatus = 'IMPLEMENTED' | 'UNAVAILABLE';

export interface CapabilityRoute {
  readonly capability: MarketDataCapability;
  /** Ordered attempts: index 0 is PRIMARY. */
  readonly providers: readonly string[];
  readonly status: CapabilityStatus;
  /** Why the route looks the way it does — surfaced in the certification doc. */
  readonly note: string;
}

/**
 * Provider matrix, verified against the live vendors on 2026-10-07:
 *
 *   Provider | Quote | History | Index | Fundamentals | Breadth | Foreign flow | Market cap
 *   VPS      |  yes  |    no   |  no   |     yes      |  derived|  per-symbol  |    no
 *   KBS      |  no   |    yes  |  no   |      no      |  derived|     no       |    no
 *
 * "no" means the vendor genuinely does not expose that capability, so the route
 * terminates in DATA_UNAVAILABLE instead of a second, equally empty attempt.
 */
export const PROVIDER_MATRIX: Readonly<Record<MarketDataCapability, CapabilityRoute>> =
  Object.freeze({
    quote: {
      capability: 'quote',
      providers: ['VPS'],
      status: 'IMPLEMENTED',
      note: 'VPS getliststockdata is the only live realtime quote feed; KBS is used as a read-only cross-check, never as a substitute source.',
    },
    quotes: {
      capability: 'quotes',
      providers: ['VPS'],
      status: 'IMPLEMENTED',
      note: 'VPS batch getliststockdata/{A,B,C}.',
    },
    history: {
      capability: 'history',
      providers: ['KBS'],
      status: 'IMPLEMENTED',
      note: 'KBS data_day is the only live daily OHLCV feed.',
    },
    fundamentals: {
      capability: 'fundamentals',
      providers: ['VPS'],
      status: 'IMPLEMENTED',
      note: 'VPS getliststockbaseinfo; period metadata is AMBIGUOUS and is exposed as such.',
    },
    index: {
      capability: 'index',
      providers: [],
      status: 'UNAVAILABLE',
      note: 'Verified 2026-10-07: KBS data_day returns data_day:[] for VNINDEX/VN-INDEX/VN30/HNX/UPCOM and VPS getliststockdata returns [] for VN30/VNINDEX; VPS has no index endpoint (404). No authoritative index level feed is reachable, so every index route terminates in DATA_UNAVAILABLE and the UI renders "--".',
    },
    breadth: {
      capability: 'breadth',
      providers: ['VPS'],
      status: 'IMPLEMENTED',
      note: 'Derived from real constituent quotes; coverage is the covered universe, not the whole exchange, and is reported as coverage metadata.',
    },
    foreignFlow: {
      capability: 'foreignFlow',
      providers: ['VPS'],
      status: 'IMPLEMENTED',
      note: 'Per-symbol foreign buy/sell/room only (fBVol/fSVolume/fRoom). Market-wide foreign flow has no live feed and is UNAVAILABLE.',
    },
    marketCap: {
      capability: 'marketCap',
      providers: [],
      status: 'UNAVAILABLE',
      note: 'No live shares-outstanding or market-cap field exists in either vendor payload, so marketCap is always null (P0-03).',
    },
  });

export function resolveChain(capability: MarketDataCapability): CapabilityRoute {
  return PROVIDER_MATRIX[capability];
}

export interface ProviderAttempt {
  readonly provider: string;
  readonly errorCode: string;
  readonly message: string;
}

/**
 * Terminal error for a capability whose ordered chain is exhausted. Carries the
 * full attempt history so an operator can see *which* vendor failed and why,
 * rather than a bare "no data".
 */
export class DataUnavailableError extends Error {
  readonly code = 'DATA_UNAVAILABLE';
  readonly attempts: readonly ProviderAttempt[];

  constructor(
    readonly capability: MarketDataCapability,
    readonly sources: readonly string[],
    attempts: readonly ProviderAttempt[],
  ) {
    const detail = attempts.map((a) => `${a.provider}:${a.errorCode}`).join(', ') || 'no_provider_registered';
    super(`DATA_UNAVAILABLE [${capability}] — ${detail}`);
    this.name = 'DataUnavailableError';
    this.attempts = attempts;
  }
}

export interface FallbackResult<T> {
  readonly value: T;
  /** The provider that ACTUALLY answered — never the nominal primary. */
  readonly source: string;
  readonly capability: MarketDataCapability;
  readonly attempts: readonly ProviderAttempt[];
}

interface FallbackRunner {
  readonly provider: string;
  readonly run: () => Promise<unknown>;
}

/**
 * P27 §27 — the fallback RATE is measured, not guessed.
 *   requests — capability calls that reached the chain
 *   fallbacks — calls where the nominal primary failed and a later provider answered
 *   exhausted — calls that terminated in DATA_UNAVAILABLE
 * Process-lifetime counters; no persistence (§26).
 */
const fallbackCounters = { requests: 0, fallbacks: 0, exhausted: 0 };

export function fallbackStats(): { requests: number; fallbacks: number; exhausted: number } {
  return { ...fallbackCounters };
}

/** Test hook — lets a suite measure deltas from a known baseline. */
export function resetFallbackStats(): void {
  fallbackCounters.requests = 0;
  fallbackCounters.fallbacks = 0;
  fallbackCounters.exhausted = 0;
}

/**
 * Runs the ordered runners for a capability until one succeeds.
 *
 * `runners` MUST follow `resolveChain(capability).providers` order; the helper
 * does not re-order them, so the priority stays deterministic and auditable.
 */
export async function runWithFallback<T>(
  capability: MarketDataCapability,
  runners: readonly FallbackRunner[],
): Promise<FallbackResult<T>> {
  const route = resolveChain(capability);
  const attempts: ProviderAttempt[] = [];
  fallbackCounters.requests += 1;

  if (runners.length === 0 || route.providers.length === 0) {
    fallbackCounters.exhausted += 1;
    throw new DataUnavailableError(
      capability,
      route.providers,
      runners.length === 0
        ? [{ provider: route.providers[0] ?? 'none', errorCode: 'NO_PROVIDER_REGISTERED', message: route.note }]
        : [],
    );
  }

  for (const runner of runners) {
    try {
      const value = (await runner.run()) as T;
      if (attempts.length > 0) fallbackCounters.fallbacks += 1;
      return { value, source: runner.provider, capability, attempts };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const errorCode =
        err instanceof Error && 'code' in err && typeof (err as { code?: unknown }).code === 'string'
          ? ((err as { code: string }).code)
          : 'PROVIDER_ERROR';
      attempts.push({ provider: runner.provider, errorCode, message: message.slice(0, 300) });
    }
  }

  fallbackCounters.exhausted += 1;
  throw new DataUnavailableError(capability, route.providers, attempts);
}

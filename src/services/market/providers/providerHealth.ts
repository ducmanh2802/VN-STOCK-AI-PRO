/**
 * P27 — PROVIDER HEALTH CLASSIFICATION (§7)
 * =========================================
 * One classification for every way a market-data provider can fail, plus an
 * in-memory registry so failures are OBSERVABLE instead of being swallowed by
 * an empty `catch`.
 *
 * States (§7):
 *   HEALTHY     last call succeeded
 *   DEGRADED    a retryable failure happened, but not enough to declare outage
 *   BLOCKED     the vendor refused us (403 / 401 / 407 / 429 / WAF)
 *   UNAVAILABLE repeated retryable failures (timeout, network, 5xx)
 *   INVALID     the payload was unusable (malformed / schema mismatch / stale)
 *
 * Nothing here fabricates data: a provider that is not HEALTHY still answers
 * with whatever it really returned, and its failures stay visible.
 */

export type ProviderHealthState =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'BLOCKED'
  | 'UNAVAILABLE'
  | 'INVALID';

export type ProviderFailureKind =
  | 'HTTP_ERROR'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'MALFORMED'
  | 'SCHEMA_MISMATCH'
  | 'STALE_PAYLOAD'
  | 'CIRCUIT_OPEN'
  | 'UNKNOWN';

export interface ProviderFailure {
  readonly kind: ProviderFailureKind;
  /** HTTP status when the vendor answered with one. */
  readonly statusCode?: number;
  readonly message: string;
}

export interface ProviderFailureVerdict {
  readonly state: ProviderHealthState;
  readonly retryable: boolean;
  readonly errorCode: string;
}

/**
 * Maps a thrown provider error onto a health verdict.
 *
 * Rules:
 *   - 4xx auth/WAF refusals are BLOCKED and are NEVER retried.
 *   - 429 is BLOCKED but retryable (the vendor asked us to slow down).
 *   - timeouts / network / 5xx are retryable (UNAVAILABLE is decided by the registry
 *     after repeated failures, not by a single blip).
 *   - a payload we cannot parse or that fails schema validation is INVALID and is
 *     never retried: the same request would produce the same junk.
 */
export function classifyProviderFailure(failure: ProviderFailure): ProviderFailureVerdict {
  const { kind, statusCode } = failure;
  const status = typeof statusCode === 'number' ? statusCode : undefined;

  if (kind === 'CIRCUIT_OPEN') {
    return { state: 'UNAVAILABLE', retryable: false, errorCode: 'CIRCUIT_OPEN' };
  }
  if (kind === 'MALFORMED') {
    return { state: 'INVALID', retryable: false, errorCode: 'MALFORMED_PAYLOAD' };
  }
  if (kind === 'SCHEMA_MISMATCH') {
    return { state: 'INVALID', retryable: false, errorCode: 'SCHEMA_MISMATCH' };
  }
  if (kind === 'STALE_PAYLOAD') {
    return { state: 'INVALID', retryable: true, errorCode: 'STALE_PAYLOAD' };
  }
  if (kind === 'TIMEOUT') {
    return { state: 'UNAVAILABLE', retryable: true, errorCode: 'PROVIDER_TIMEOUT' };
  }
  if (kind === 'NETWORK') {
    return { state: 'UNAVAILABLE', retryable: true, errorCode: 'PROVIDER_NETWORK_ERROR' };
  }
  if (kind === 'HTTP_ERROR' && status !== undefined) {
    if (status === 429) {
      return { state: 'BLOCKED', retryable: true, errorCode: 'RATE_LIMITED' };
    }
    if (status === 403 || status === 401 || status === 407) {
      return { state: 'BLOCKED', retryable: false, errorCode: 'PROVIDER_BLOCKED' };
    }
    if (status === 404) {
      return { state: 'UNAVAILABLE', retryable: false, errorCode: 'PROVIDER_ENDPOINT_NOT_FOUND' };
    }
    if (status === 408) {
      return { state: 'UNAVAILABLE', retryable: true, errorCode: 'PROVIDER_TIMEOUT' };
    }
    if (status >= 500) {
      return { state: 'DEGRADED', retryable: true, errorCode: 'PROVIDER_SERVER_ERROR' };
    }
    if (status >= 400) {
      return { state: 'INVALID', retryable: false, errorCode: 'PROVIDER_REQUEST_REJECTED' };
    }
    return { state: 'DEGRADED', retryable: false, errorCode: 'PROVIDER_HTTP_UNEXPECTED' };
  }
  if (kind === 'HTTP_ERROR') {
    return { state: 'DEGRADED', retryable: false, errorCode: 'PROVIDER_HTTP_ERROR' };
  }
  return { state: 'DEGRADED', retryable: false, errorCode: 'PROVIDER_ERROR_UNKNOWN' };
}

/** Best-effort classification of an arbitrary thrown value. */
export function classifyProviderError(err: unknown): ProviderFailure {
  if (err instanceof Error) {
    const anyErr = err as Error & { statusCode?: number; status?: number; code?: string };
    const statusCode =
      typeof anyErr.statusCode === 'number'
        ? anyErr.statusCode
        : typeof anyErr.status === 'number'
          ? anyErr.status
          : undefined;
    const message = err.message;

    if (err.name === 'AbortError' || /timeout|timed out|aborted/i.test(message)) {
      return { kind: 'TIMEOUT', statusCode, message };
    }
    if (anyErr.code === 'CIRCUIT_OPEN' || message === 'CIRCUIT_OPEN') {
      return { kind: 'CIRCUIT_OPEN', message };
    }
    if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|EPIPE|fetch failed|socket/i.test(message)) {
      return { kind: 'NETWORK', statusCode, message };
    }
    if (statusCode !== undefined) {
      return { kind: 'HTTP_ERROR', statusCode, message };
    }
    if (/malformed|invalid json|unexpected token|not an array|schema/i.test(message)) {
      return { kind: 'MALFORMED', message };
    }
    return { kind: 'UNKNOWN', statusCode, message };
  }
  return { kind: 'UNKNOWN', message: String(err) };
}

/** Failure count after which a still-failing retryable provider is UNAVAILABLE. */
export const UNAVAILABLE_AFTER_FAILURES = 3;

export interface ProviderHealthSnapshot {
  readonly provider: string;
  readonly state: ProviderHealthState;
  readonly consecutiveFailures: number;
  readonly lastErrorCode: string | null;
  readonly lastErrorMessage: string | null;
  readonly lastSuccessAt: string | null;
  readonly lastFailureAt: string | null;
  /** P27 §27 — provider latency as measured on the last successful call. */
  readonly lastLatencyMs: number | null;
  /** P27 §27 — running mean of the latencies observed in this process. */
  readonly avgLatencyMs: number | null;
}

interface ProviderHealthEntry {
  state: ProviderHealthState;
  consecutiveFailures: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastLatencyMs: number | null;
  avgLatencyMs: number | null;
  latencySamples: number;
  latencyTotalMs: number;
}

/**
 * Process-lifetime registry. No persistence, no database (P27 §26): a restart
 * starts from an empty registry, which is the honest state for a process that
 * has not yet observed anything.
 */
export class ProviderHealthRegistry {
  private readonly entries = new Map<string, ProviderHealthEntry>();

  private ensure(provider: string): ProviderHealthEntry {
    let entry = this.entries.get(provider);
    if (!entry) {
      entry = {
        state: 'HEALTHY',
        consecutiveFailures: 0,
        lastErrorCode: null,
        lastErrorMessage: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastLatencyMs: null,
        avgLatencyMs: null,
        latencySamples: 0,
        latencyTotalMs: 0,
      };
      this.entries.set(provider, entry);
    }
    return entry;
  }

  /** `latencyMs` is the measured round trip of the successful call, when known. */
  recordSuccess(provider: string, latencyMs?: number): void {
    const entry = this.ensure(provider);
    entry.state = 'HEALTHY';
    entry.consecutiveFailures = 0;
    entry.lastErrorCode = null;
    entry.lastErrorMessage = null;
    entry.lastSuccessAt = new Date().toISOString();
    if (Number.isFinite(latencyMs) && (latencyMs as number) >= 0) {
      const ms = Math.round(latencyMs as number);
      entry.lastLatencyMs = ms;
      entry.latencySamples += 1;
      entry.latencyTotalMs += ms;
      entry.avgLatencyMs = Math.round(entry.latencyTotalMs / entry.latencySamples);
    }
  }

  recordFailure(provider: string, failure: ProviderFailure): ProviderHealthSnapshot {
    const verdict = classifyProviderFailure(failure);
    const entry = this.ensure(provider);
    entry.consecutiveFailures += 1;
    entry.lastErrorCode = verdict.errorCode;
    entry.lastErrorMessage = failure.message.slice(0, 300);
    entry.lastFailureAt = new Date().toISOString();

    if (verdict.state === 'BLOCKED' || verdict.state === 'INVALID') {
      entry.state = verdict.state;
    } else if (entry.consecutiveFailures >= UNAVAILABLE_AFTER_FAILURES) {
      entry.state = 'UNAVAILABLE';
    } else {
      entry.state = 'DEGRADED';
    }
    return this.snapshot(provider);
  }

  get(provider: string): ProviderHealthSnapshot {
    return this.snapshot(provider);
  }

  snapshot(provider: string): ProviderHealthSnapshot {
    const e = this.ensure(provider);
    return {
      provider,
      state: e.state,
      consecutiveFailures: e.consecutiveFailures,
      lastErrorCode: e.lastErrorCode,
      lastErrorMessage: e.lastErrorMessage,
      lastSuccessAt: e.lastSuccessAt,
      lastFailureAt: e.lastFailureAt,
      lastLatencyMs: e.lastLatencyMs,
      avgLatencyMs: e.avgLatencyMs,
    };
  }

  /** Every provider observed by this process. */
  all(): ProviderHealthSnapshot[] {
    return Array.from(this.entries.keys()).map((name) => this.snapshot(name));
  }

  reset(): void {
    this.entries.clear();
  }
}

/** Shared registry — one per server process. */
export const providerHealth = new ProviderHealthRegistry();

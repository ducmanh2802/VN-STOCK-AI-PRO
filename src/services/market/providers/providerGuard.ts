/**
 * P27 — OUTBOUND PROVIDER PROTECTION (§19)
 * =========================================
 * Bounded timeout + bounded retry with exponential backoff + per-provider
 * circuit breaker, in front of every vendor call.
 *
 * Rules enforced here (§19):
 *   - no infinite retries: attempts are capped (default 2 extra tries)
 *   - no retry storms: exponential backoff between attempts, capped
 *   - no retry of clearly invalid requests: BLOCKED / INVALID verdicts are terminal
 *   - no retry of permanent 4xx (403/401/404/400) — only 429/5xx/timeout/network retry
 *   - a provider that keeps failing trips a breaker instead of being hammered
 *
 * Every attempt is recorded in the shared ProviderHealthRegistry so failures
 * stay observable (§7).
 */

import { CircuitBreaker, DEFAULT_CIRCUIT, backoffDelay, type CircuitOptions } from '../../../lib/platform/resilience/resilience.ts';
import {
  classifyProviderError,
  classifyProviderFailure,
  providerHealth,
  type ProviderFailure,
} from './providerHealth.ts';

export interface ProviderGuardRetryOptions {
  readonly attempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly factor?: number;
}

/** Read-only provider calls: one initial attempt + 2 bounded retries. */
export const DEFAULT_PROVIDER_RETRY: ProviderGuardRetryOptions = {
  attempts: 3,
  baseDelayMs: 150,
  maxDelayMs: 2000,
  factor: 2,
};

export interface ProviderGuardOptions {
  readonly provider: string;
  readonly timeoutMs?: number;
  readonly retry?: ProviderGuardRetryOptions;
  readonly circuit?: CircuitOptions;
  /** Injection seam for tests — avoids real sleeps and a real clock. */
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export class ProviderGuardError extends Error {
  constructor(
    readonly provider: string,
    readonly errorCode: string,
    readonly state: string,
    message: string,
    readonly attempts: number,
  ) {
    super(message);
    this.name = 'ProviderGuardError';
  }
}

const breakers = new Map<string, CircuitBreaker>();

function breakerFor(provider: string, options?: CircuitOptions): CircuitBreaker {
  let breaker = breakers.get(provider);
  if (!breaker) {
    breaker = new CircuitBreaker(options ?? DEFAULT_CIRCUIT);
    breakers.set(provider, breaker);
  }
  return breaker;
}

/** Test seam: clears the process-lifetime breakers. */
export function resetProviderGuards(): void {
  breakers.clear();
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs `fn` under timeout + bounded retry + circuit breaker.
 *
 * `fn` receives an `AbortSignal` so a timeout actually cancels the socket
 * instead of leaving the request running in the background.
 */
export async function withProviderGuard<T>(
  opts: ProviderGuardOptions,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const { provider } = opts;
  const retry = opts.retry ?? DEFAULT_PROVIDER_RETRY;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const sleep = opts.sleep ?? defaultSleep;
  const breaker = breakerFor(provider, opts.circuit);

  if (!breaker.allow()) {
    const snapshot = providerHealth.recordFailure(provider, {
      kind: 'CIRCUIT_OPEN',
      message: `circuit open for ${provider}`,
    });
    throw new ProviderGuardError(
      provider,
      'CIRCUIT_OPEN',
      snapshot.state,
      `DATA_UNAVAILABLE [${provider}] circuit open — provider is being protected from a retry storm`,
      0,
    );
  }

  let attempt = 0;
  let lastFailure: ProviderFailure = { kind: 'UNKNOWN', message: 'unknown provider failure' };

  for (;;) {
    attempt += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const attemptStartedAt = Date.now();
      const value = await fn(controller.signal);
      breaker.recordSuccess();
      // P27 §27 — provider latency is measured here, on the real round trip.
      providerHealth.recordSuccess(provider, Date.now() - attemptStartedAt);
      return value;
    } catch (err) {
      lastFailure = classifyProviderError(err);
      const verdict = classifyProviderFailure(lastFailure);
      providerHealth.recordFailure(provider, lastFailure);

      const retriesLeft = verdict.retryable && attempt < retry.attempts;
      if (!retriesLeft) {
        breaker.recordFailure();
        const snapshot = providerHealth.get(provider);
        throw new ProviderGuardError(
          provider,
          verdict.errorCode,
          snapshot.state,
          `${provider} failed after ${attempt} attempt(s): ${lastFailure.message}`,
          attempt,
        );
      }
      await sleep(Math.min(retry.maxDelayMs, backoffDelay(attempt, {
        attempts: retry.attempts,
        baseDelayMs: retry.baseDelayMs,
        maxDelayMs: retry.maxDelayMs,
        factor: retry.factor,
      })));
    } finally {
      clearTimeout(timer);
    }
  }
}

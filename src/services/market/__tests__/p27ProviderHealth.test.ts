import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  classifyProviderError,
  classifyProviderFailure,
  providerHealth,
  UNAVAILABLE_AFTER_FAILURES,
} from '../providers/providerHealth';
import { ProviderGuardError, resetProviderGuards, withProviderGuard } from '../providers/providerGuard';
import { PROVIDER_MATRIX, resolveChain, runWithFallback, DataUnavailableError } from '../providers/providerMatrix';

/**
 * P27 §7 / §19 — provider-failure handling.
 *
 * The four failure classes the spec requires (403 / timeout / malformed / retry
 * storm) plus the matrix guarantees. No network: every provider call is a local
 * function that throws on demand.
 *
 * `sleep` is injected as a no-op so bounded retry is asserted by CALL COUNT and
 * by elapsed-attempt count, not by wall-clock time.
 */

const NO_SLEEP = async (): Promise<void> => {};

beforeEach(() => {
  providerHealth.reset();
  resetProviderGuards();
});

afterEach(() => {
  vi.restoreAllMocks();
  providerHealth.reset();
  resetProviderGuards();
});

describe('§7 — failure classification', () => {
  it('403 is BLOCKED and never retried', () => {
    const verdict = classifyProviderFailure({ kind: 'HTTP_ERROR', statusCode: 403, message: 'Request Blocked' });

    expect(verdict.state).toBe('BLOCKED');
    expect(verdict.retryable).toBe(false);
    expect(verdict.errorCode).toBe('PROVIDER_BLOCKED');
    expect(classifyProviderError(Object.assign(new Error('blocked'), { statusCode: 403 }))).toEqual({
      kind: 'HTTP_ERROR',
      statusCode: 403,
      message: 'blocked',
    });
  });

  it('429 is BLOCKED but retryable (the vendor asked us to slow down)', () => {
    const verdict = classifyProviderFailure({ kind: 'HTTP_ERROR', statusCode: 429, message: 'rate limited' });

    expect(verdict.state).toBe('BLOCKED');
    expect(verdict.retryable).toBe(true);
    expect(verdict.errorCode).toBe('RATE_LIMITED');
  });

  it('a timeout is UNAVAILABLE and retryable', () => {
    const failure = classifyProviderError(new Error('request timed out after 10000ms'));

    expect(failure.kind).toBe('TIMEOUT');
    expect(classifyProviderFailure(failure)).toEqual({
      state: 'UNAVAILABLE',
      retryable: true,
      errorCode: 'PROVIDER_TIMEOUT',
    });
  });

  it('an abort is a TIMEOUT, a network drop is a NETWORK failure', () => {
    const aborted = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    expect(classifyProviderError(aborted).kind).toBe('TIMEOUT');
    expect(classifyProviderError(new TypeError('fetch failed')).kind).toBe('NETWORK');
  });

  it('a 5xx is a retryable DEGRADED failure, a 404 is terminal', () => {
    expect(classifyProviderFailure({ kind: 'HTTP_ERROR', statusCode: 503, message: 'upstream' })).toEqual({
      state: 'DEGRADED',
      retryable: true,
      errorCode: 'PROVIDER_SERVER_ERROR',
    });
    expect(classifyProviderFailure({ kind: 'HTTP_ERROR', statusCode: 404, message: 'no such route' })).toEqual({
      state: 'UNAVAILABLE',
      retryable: false,
      errorCode: 'PROVIDER_ENDPOINT_NOT_FOUND',
    });
  });

  it('malformed and schema-invalid payloads are INVALID and never retried', () => {
    for (const kind of ['MALFORMED', 'SCHEMA_MISMATCH'] as const) {
      const verdict = classifyProviderFailure({ kind, message: 'junk' });
      expect(verdict.state).toBe('INVALID');
      expect(verdict.retryable).toBe(false);
    }
    // A stale payload is invalid but may be re-fetched.
    expect(classifyProviderFailure({ kind: 'STALE_PAYLOAD', message: 'old' })).toEqual({
      state: 'INVALID',
      retryable: true,
      errorCode: 'STALE_PAYLOAD',
    });
  });
});

describe('§7 — health registry', () => {
  it('starts HEALTHY, degrades on one failure and becomes UNAVAILABLE after repeated failures', () => {
    expect(providerHealth.get('VPS')).toMatchObject({ state: 'HEALTHY', consecutiveFailures: 0 });

    providerHealth.recordFailure('VPS', { kind: 'TIMEOUT', message: 't1' });
    expect(providerHealth.get('VPS').state).toBe('DEGRADED');

    for (let i = 1; i < UNAVAILABLE_AFTER_FAILURES; i += 1) {
      providerHealth.recordFailure('VPS', { kind: 'TIMEOUT', message: `t${i + 1}` });
    }
    const dead = providerHealth.get('VPS');
    expect(dead.state).toBe('UNAVAILABLE');
    expect(dead.consecutiveFailures).toBe(UNAVAILABLE_AFTER_FAILURES);
    expect(dead.lastErrorCode).toBe('PROVIDER_TIMEOUT');

    providerHealth.recordSuccess('VPS');
    expect(providerHealth.get('VPS')).toMatchObject({
      state: 'HEALTHY',
      consecutiveFailures: 0,
      lastErrorCode: null,
    });
  });

  it('a blocked vendor is BLOCKED immediately (a single refusal is enough)', () => {
    providerHealth.recordFailure('KBS', { kind: 'HTTP_ERROR', statusCode: 403, message: 'blocked' });
    expect(providerHealth.get('KBS').state).toBe('BLOCKED');
    expect(providerHealth.get('KBS').lastErrorCode).toBe('PROVIDER_BLOCKED');
    expect(providerHealth.all()).toHaveLength(1);
  });
});

describe('§19 — bounded retry, timeout and circuit breaker', () => {
  it('403 fails fast: one attempt, no retry, BLOCKED', async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error('Request Blocked'), { statusCode: 403 }));

    await expect(
      withProviderGuard({ provider: 'VPS', sleep: NO_SLEEP, retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 1 } }, fn)
    ).rejects.toBeInstanceOf(ProviderGuardError);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(providerHealth.get('VPS')).toMatchObject({ state: 'BLOCKED', lastErrorCode: 'PROVIDER_BLOCKED' });
  });

  it('a timeout is retried a bounded number of times and then reported UNAVAILABLE', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('request timed out'));

    const err = await withProviderGuard(
      { provider: 'VPS', sleep: NO_SLEEP, retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 2 } },
      fn
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ProviderGuardError);
    expect((err as ProviderGuardError).attempts).toBe(3);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(providerHealth.get('VPS')).toMatchObject({
      state: 'UNAVAILABLE',
      lastErrorCode: 'PROVIDER_TIMEOUT',
    });
  });

  it('malformed payloads are not retried and mark the provider INVALID', async () => {
    const fn = vi.fn().mockRejectedValue(new SyntaxError('Unexpected token < in JSON at position 0'));

    const err = await withProviderGuard(
      { provider: 'KBS', sleep: NO_SLEEP, retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 1 } },
      fn
    ).catch((e: unknown) => e);

    expect((err as ProviderGuardError).errorCode).toBe('MALFORMED_PAYLOAD');
    expect((err as ProviderGuardError).attempts).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(providerHealth.get('KBS')).toMatchObject({ state: 'INVALID' });
  });

  it('a successful call records HEALTHY', async () => {
    const value = await withProviderGuard({ provider: 'VPS', sleep: NO_SLEEP }, async () => 'REAL');

    expect(value).toBe('REAL');
    expect(providerHealth.get('VPS')).toMatchObject({ state: 'HEALTHY', consecutiveFailures: 0 });
  });

  it('repeated failures trip the circuit so the provider is no longer called', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('request timed out'));

    const guard = {
      provider: 'VPS',
      sleep: NO_SLEEP,
      retry: { attempts: 1, baseDelayMs: 1, maxDelayMs: 1 },
      circuit: { failureThreshold: 2, resetTimeoutMs: 30_000 },
    };

    await withProviderGuard(guard, fn).catch(() => undefined);
    await withProviderGuard(guard, fn).catch(() => undefined);

    const before = fn.mock.calls.length;
    const openErr = await withProviderGuard(guard, fn).catch((e: unknown) => e);

    expect(fn.mock.calls.length).toBe(before); // the third call never reached the vendor
    expect((openErr as ProviderGuardError).errorCode).toBe('CIRCUIT_OPEN');
  });
});

describe('§6 — provider matrix', () => {
  it('routes each implemented capability to the single live provider', () => {
    expect(resolveChain('quote').providers).toEqual(['VPS']);
    expect(resolveChain('quotes').providers).toEqual(['VPS']);
    expect(resolveChain('fundamentals').providers).toEqual(['VPS']);
    expect(resolveChain('breadth').providers).toEqual(['VPS']);
    expect(resolveChain('foreignFlow').providers).toEqual(['VPS']);
    expect(resolveChain('history').providers).toEqual(['KBS']);
    expect(resolveChain('history').status).toBe('IMPLEMENTED');
  });

  it('declares index and marketCap UNAVAILABLE instead of inventing a source', () => {
    for (const capability of ['index', 'marketCap'] as const) {
      const route = PROVIDER_MATRIX[capability];
      expect(route.status).toBe('UNAVAILABLE');
      expect(route.providers).toEqual([]);
      expect(route.note.length).toBeGreaterThan(20);
    }
  });

  it('refuses to run a capability whose chain is empty', async () => {
    await expect(
      runWithFallback('index', [{ provider: 'VPS', run: async () => 1 }])
    ).rejects.toBeInstanceOf(DataUnavailableError);
  });

  it('the matrix covers every capability the service layer can request', () => {
    const capabilities = Object.keys(PROVIDER_MATRIX);
    expect(new Set(capabilities).size).toBe(8);
    for (const route of Object.values(PROVIDER_MATRIX)) {
      expect(route.capability).toBeTruthy();
      expect(['IMPLEMENTED', 'UNAVAILABLE']).toContain(route.status);
      if (route.status === 'UNAVAILABLE') expect(route.providers).toHaveLength(0);
      else expect(route.providers.length).toBeGreaterThan(0);
    }
  });
});

describe('§27 — provider latency is measured on real round trips', () => {
  it('records the last latency and a running mean across successful calls', () => {
    providerHealth.recordSuccess('VPS', 120);
    expect(providerHealth.get('VPS').lastLatencyMs).toBe(120);
    expect(providerHealth.get('VPS').avgLatencyMs).toBe(120);

    providerHealth.recordSuccess('VPS', 80);
    expect(providerHealth.get('VPS').lastLatencyMs).toBe(80);
    expect(providerHealth.get('VPS').avgLatencyMs).toBe(100);
  });

  it('leaves latency null when the call did not report one', () => {
    providerHealth.recordSuccess('KBS');
    expect(providerHealth.get('KBS').lastLatencyMs).toBeNull();
    expect(providerHealth.get('KBS').avgLatencyMs).toBeNull();
  });

  it('measures the guard round trip end to end and reports it in the snapshot', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });

    const promise = withProviderGuard({ provider: 'VPS', sleep: NO_SLEEP }, async () => {
      await gate;
      return 'payload';
    });

    await new Promise((r) => setTimeout(r, 12));
    release();

    await expect(promise).resolves.toBe('payload');
    const snap = providerHealth.get('VPS');
    expect(snap.state).toBe('HEALTHY');
    expect(snap.lastLatencyMs).not.toBeNull();
    expect(snap.lastLatencyMs as number).toBeGreaterThanOrEqual(10);
  });
});

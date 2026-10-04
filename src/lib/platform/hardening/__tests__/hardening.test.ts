import { describe, expect, it } from 'vitest';
import { loadConfig, ConfigError, configPublicView, assertStartupReady } from '../../config/env.ts';
import {
  backoffDelay,
  canRetry,
  checkAiContextLength,
  checkPageSize,
  checkSymbolList,
  CircuitBreaker,
  DEFAULT_LIMITS,
  withTimeout,
} from '../../resilience/resilience.ts';
import { GracefulShutdownCoordinator } from '../../lifecycle/gracefulShutdown.ts';

const T = 1_700_000_000_000;

describe('§41/§42 configuration', () => {
  const prod = { NODE_ENV: 'production', GEMINI_API_KEY: 'x', SQL_PASSWORD: 'y', SQL_HOST: 'h', SQL_USER: 'u', SQL_DB_NAME: 'd' };

  it('accepts a complete production configuration', () => {
    const c = loadConfig(prod);
    expect(c).toMatchObject({ env: 'production', port: 3000, logLevel: 'INFO' });
    expect(c.features).toEqual({ aiProvider: 'gemini', externalAuth: 'none' });
  });

  it('missing critical production config FAILS EXPLICITLY (no silent fallback)', () => {
    let caught: ConfigError | null = null;
    try {
      loadConfig({ NODE_ENV: 'production' });
    } catch (e) {
      caught = e as ConfigError;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    expect(caught!.issues).toEqual(expect.arrayContaining([
      'missing_production_secret:GEMINI_API_KEY',
      'missing_production_secret:SQL_PASSWORD',
      'missing:SQL_HOST',
      'missing:SQL_USER',
      'missing:SQL_DB_NAME',
    ]));
    expect(assertStartupReady).toBeDefined();
  });

  it('development tolerates absent secrets but marks features as unavailable (not faked)', () => {
    const c = loadConfig({ NODE_ENV: 'development' });
    expect(c.env).toBe('development');
    expect(c.features).toEqual({ aiProvider: 'none', externalAuth: 'none' });
    expect(c.secretPresence.GEMINI_API_KEY).toBe(false);
  });

  it('rejects invalid values instead of coercing them', () => {
    expect(() => loadConfig({ NODE_ENV: 'staging' })).toThrow(/invalid:NODE_ENV/);
    expect(() => loadConfig({ NODE_ENV: 'development', PORT: 'abc' })).toThrow(/invalid:PORT/);
    expect(() => loadConfig({ NODE_ENV: 'development', PORT: '99999' })).toThrow(/invalid:PORT/);
    expect(() => loadConfig({ NODE_ENV: 'development', LOG_LEVEL: 'TRACE' })).toThrow(/invalid:LOG_LEVEL/);
  });

  it('refuses DEBUG logging in production', () => {
    expect(() => loadConfig({ ...prod, LOG_LEVEL: 'DEBUG' })).toThrow(/invalid_production_log_level:DEBUG/);
  });

  it('public view never exposes secret VALUES (presence flags only)', () => {
    const view = configPublicView(loadConfig(prod));
    const blob = JSON.stringify(view);
    // key NAMES may appear (that is the presence signal); the values must not.
    expect(view.secretPresence).toMatchObject({ GEMINI_API_KEY: true, SQL_PASSWORD: true });
    expect(blob).not.toMatch(/"secrets"/);
    for (const secretValue of Object.values(loadConfig(prod).secrets)) {
      expect(blob).not.toContain(`"${secretValue}"`);
    }
    expect(blob).toContain('"GEMINI_API_KEY":true');
    expect(view.databaseConfigured).toBe(true);
  });
});

describe('§49 timeouts and retry policy', () => {
  it('withTimeout rejects slow work instead of hanging', async () => {
    await expect(withTimeout(new Promise(() => {}), 10)).rejects.toThrow('PROBE_TIMEOUT');
    await expect(withTimeout(Promise.resolve('fast'), 50)).resolves.toBe('fast');
  });

  it('writes are NEVER retried (accounting safety)', () => {
    expect(canRetry('write', 1)).toMatchObject({ shouldRetry: false, reason: 'write_not_retried' });
  });

  it('reads retry a bounded number of times with capped backoff', () => {
    expect(canRetry('read', 1).shouldRetry).toBe(true);
    expect(canRetry('read', 3)).toMatchObject({ shouldRetry: false, reason: 'attempts_exhausted' });
    expect(backoffDelay(1, { attempts: 3, baseDelayMs: 100, maxDelayMs: 1000, factor: 2 })).toBe(100);
    expect(backoffDelay(3, { attempts: 3, baseDelayMs: 100, maxDelayMs: 1000, factor: 2 })).toBe(400);
    expect(backoffDelay(9, { attempts: 3, baseDelayMs: 100, maxDelayMs: 1000, factor: 2 })).toBe(1000);
  });
});

describe('§39 circuit breaker', () => {
  it('opens after the threshold, half-opens after the window, closes on success', async () => {
    let clock = T;
    const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000 }, () => clock);
    expect(cb.current().status).toBe('CLOSED');
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.allow()).toBe(true);
    cb.recordFailure();
    expect(cb.current().status).toBe('OPEN');
    expect(cb.allow()).toBe(false);
    clock += 1001;
    expect(cb.allow()).toBe(true);
    expect(cb.current().status).toBe('HALF_OPEN');
    cb.recordSuccess();
    expect(cb.current()).toMatchObject({ status: 'CLOSED', failures: 0 });
  });

  it('run() surfaces CIRCUIT_OPEN instead of calling a dead provider', async () => {
    let clock = T;
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 1000 }, () => clock);
    await expect(cb.run(async () => { throw new Error('provider down'); })).rejects.toThrow('provider down');
    let called = 0;
    await expect(cb.run(async () => { called++; return 'ok'; })).rejects.toThrow('CIRCUIT_OPEN');
    expect(called).toBe(0);
  });
});

describe('§51 resource limits', () => {
  it('bounds pagination, symbol lists and AI context', () => {
    expect(checkPageSize(50).ok).toBe(true);
    expect(checkPageSize(0)).toMatchObject({ ok: false, reason: 'invalid_page_size' });
    expect(checkPageSize(DEFAULT_LIMITS.maxPageSize + 1)).toMatchObject({ ok: false, reason: 'page_size_exceeded' });
    expect(checkSymbolList(['HPG'])).toEqual({ ok: true, reason: null });
    expect(checkSymbolList([])).toMatchObject({ ok: false, reason: 'empty_symbol_list' });
    expect(checkSymbolList(new Array(DEFAULT_LIMITS.maxQuerySymbols + 1).fill('HPG'))).toMatchObject({ ok: false, reason: 'symbol_limit_exceeded' });
    expect(checkAiContextLength('x'.repeat(10)).ok).toBe(true);
    expect(checkAiContextLength('x'.repeat(DEFAULT_LIMITS.maxAiContextChars + 1))).toMatchObject({ ok: false, reason: 'ai_context_too_long' });
  });
});

describe('§48 graceful shutdown', () => {
  it('runs markNotReady → drain → stopJobs → closeDatabase in order', async () => {
    const calls: string[] = [];
    const c = new GracefulShutdownCoordinator({
      markNotReady: () => { calls.push('markNotReady'); },
      drain: () => { calls.push('drain'); },
      stopJobs: () => { calls.push('stopJobs'); },
      closeDatabase: () => { calls.push('closeDb'); },
    });
    const result = await c.shutdown(1000);
    expect(calls).toEqual(['markNotReady', 'drain', 'stopJobs', 'closeDb']);
    expect(result.sequence).toEqual(['MARK_NOT_READY', 'DRAINING', 'STOPPING_JOBS', 'CLOSING_DB', 'STOPPED']);
    expect(result).toMatchObject({ drainedCleanly: true, timedOut: false, errors: [] });
    expect(c.current()).toBe('STOPPED');
  });

  it('a stuck drain times out but the DB still closes (no corrupting interruption)', async () => {
    const calls: string[] = [];
    const c = new GracefulShutdownCoordinator({
      markNotReady: () => { calls.push('markNotReady'); },
      drain: () => new Promise<void>(() => {}),
      stopJobs: () => { calls.push('stopJobs'); },
      closeDatabase: () => { calls.push('closeDb'); },
    });
    const result = await c.shutdown(20);
    expect(result.timedOut).toBe(true);
    expect(result.drainedCleanly).toBe(false);
    expect(calls).toEqual(['markNotReady', 'stopJobs', 'closeDb']);
  });

  it('a failing step is recorded and the sequence still completes', async () => {
    const calls: string[] = [];
    const c = new GracefulShutdownCoordinator({
      markNotReady: () => { calls.push('markNotReady'); },
      drain: () => { calls.push('drain'); },
      stopJobs: () => { throw new Error('replay still writing'); },
      closeDatabase: () => { calls.push('closeDb'); },
    });
    const result = await c.shutdown(100);
    expect(calls).toContain('closeDb');
    expect(result.errors.join()).toContain('STOPPING_JOBS:replay still writing');
    expect(result.phase).toBe('STOPPED');
  });
});
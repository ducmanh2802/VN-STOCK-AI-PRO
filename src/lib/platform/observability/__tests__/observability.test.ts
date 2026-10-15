import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import {
  ConsoleLogSink,
  MemoryLogSink,
  StructuredLogger,
  levelForStatus,
} from '../logger.ts';
import { MetricsRegistry, registerPlatformMetrics } from '../metrics.ts';
import {
  livenessBody,
  readinessBody,
  runHealthCheck,
  statusCodeFor,
  type DependencyProbe,
  type DependencyStatus,
} from '../health.ts';
import { REDACTED } from '../../security/redaction.ts';

const T = 1_700_000_000_000;

describe('§34/§35 structured logging', () => {
  it('emits one JSON object with the minimum fields', () => {
    const sink = new MemoryLogSink();
    const log = new StructuredLogger(sink, 'INFO', 'platform', () => T);
    log.info({ event: 'request.completed', requestId: 'req_1', correlationId: 'c1', durationMs: 12, status: 200 });
    const line = sink.all()[0];
    expect(line).toMatchObject({
      timestamp: '2023-11-14T22:13:20.000Z',
      level: 'INFO',
      service: 'platform',
      event: 'request.completed',
      requestId: 'req_1',
      correlationId: 'c1',
      durationMs: 12,
      status: 200,
    });
    expect(() => JSON.parse(JSON.stringify(line))).not.toThrow();
  });

  it('respects level filtering (a tick storm cannot flood INFO)', () => {
    const sink = new MemoryLogSink();
    const log = new StructuredLogger(sink, 'WARN', 'market', () => T);
    log.debug({ event: 'tick' });
    log.info({ event: 'tick' });
    log.warn({ event: 'tick' });
    log.error({ event: 'tick' });
    expect(sink.all().map((l) => l.level)).toEqual(['WARN', 'ERROR']);
  });

  it('redacts secrets in every log field', () => {
    const sink = new MemoryLogSink();
    const log = new StructuredLogger(sink, 'INFO', 'auth', () => T);
    log.info({ event: 'login', password: 'CorrectHorse9', authorization: 'Bearer abc', symbol: 'HPG' });
    const out = JSON.stringify(sink.all()[0]);
    expect(out).not.toContain('CorrectHorse9');
    expect(out).toContain(REDACTED);
    expect(out).toContain('HPG');
  });

  it('maps HTTP statuses to levels', () => {
    expect(levelForStatus(200)).toBe('INFO');
    expect(levelForStatus(404)).toBe('WARN');
    expect(levelForStatus(503)).toBe('ERROR');
  });

  it('console sink writes one serialised line per call', () => {
    const original = console.log;
    const captured: string[] = [];
    console.log = (msg: unknown) => captured.push(String(msg));
    try {
      new StructuredLogger(new ConsoleLogSink(), 'INFO', 'platform', () => T).info({ event: 'x' });
    } finally {
      console.log = original;
    }
    expect(captured).toHaveLength(1);
    expect(JSON.parse(captured[0]!).event).toBe('x');
  });
});

describe('§32/§33 metrics', () => {
  it('registers the documented metric set and records values', () => {
    const m = new MetricsRegistry();
    registerPlatformMetrics(m);
    m.increment('http_requests_total', { route: '/api/stocks', method: 'GET', status: '200' });
    m.increment('http_requests_total', { route: '/api/stocks', method: 'GET', status: '200' });
    m.increment('http_errors_total', { route: '/api/stocks' });
    m.gauge('market_data_freshness_ms', 4200, { dataset: 'kbs_daily' });
    expect(m.value('http_requests_total', { route: '/api/stocks', method: 'GET', status: '200' })).toBe(2);
    expect(m.value('http_errors_total', { route: '/api/stocks' })).toBe(1);
    const names = m.snapshot().map((s) => s.name);
    expect(names).toContain('auth_login_total');
    expect(names).toContain('audit_records_total');
    expect(names).toContain('data_stale_requests_total');
    expect(names).toContain('provider_unavailable_total');
  });

  it('refuses to export financial values as metrics', () => {
    const m = new MetricsRegistry();
    expect(() => m.register({ name: 'portfolio_value_vnd', type: 'gauge', help: 'leak' })).toThrow(/METRIC_REJECTS_FINANCIAL_VALUE/);
    expect(() => m.register({ name: 'user_nav', type: 'gauge', help: 'leak' })).toThrow(/METRIC_REJECTS_FINANCIAL_VALUE/);
  });

  it('drops undeclared labels to bound cardinality', () => {
    const m = new MetricsRegistry();
    registerPlatformMetrics(m);
    m.increment('auth_login_total', { outcome: 'SUCCESS', userId: 'u-1', secretNote: 'x' });
    const series = m.snapshot().find((s) => s.name === 'auth_login_total')!.series;
    expect(series[0]!.labels).toEqual({ outcome: 'SUCCESS' });
  });

  it('exports Prometheus text with histogram count/sum', () => {
    const m = new MetricsRegistry();
    registerPlatformMetrics(m);
    m.observe('http_request_duration_ms', 12, { route: '/api/stocks' });
    m.observe('http_request_duration_ms', 30, { route: '/api/stocks' });
    const text = m.toPrometheus();
    expect(text).toContain('# TYPE http_request_duration_ms histogram');
    expect(text).toContain('http_request_duration_ms_count{route="/api/stocks"} 2');
    expect(text).toContain('http_request_duration_ms_sum{route="/api/stocks"} 42');
  });

  it('ignores writes to unregistered metrics and non-finite gauges', () => {
    const m = new MetricsRegistry();
    m.increment('nope');
    m.gauge('market_data_freshness_ms', Number.NaN);
    expect(m.snapshot()).toEqual([]);
  });
});

describe('§31 health / readiness', () => {
  const probe = (name: string, status: () => DependencyStatus, optional = false): DependencyProbe => ({
    name,
    optional,
    check: status,
  });

  it('liveness is independent of dependencies', async () => {
    const report = await runHealthCheck({ now: () => T, probes: [probe('db', () => { throw new Error('down'); })] });
    expect(report.alive).toBe(true);
    expect(livenessBody(report)).toEqual({ status: 'alive', checkedAt: new Date(T).toISOString() });
  });

  it('a failing required dependency makes the service NOT ready (503) and names it', async () => {
    const report = await runHealthCheck({ now: () => T, probes: [probe('postgres', () => { throw new Error('ECONNREFUSED'); })] });
    expect(report.ready).toBe(false);
    expect(report.status).toBe('unavailable');
    expect(report.blockedBy).toEqual(['postgres']);
    expect(statusCodeFor(report)).toBe(503);
    const body = readinessBody(report);
    expect(JSON.stringify(body)).toContain('postgres');
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
  });

  it('STALE is degraded but still ready (§36 preserved, not hidden)', async () => {
    const report = await runHealthCheck({ now: () => T, probes: [probe('kbs_daily', () => 'STALE')] });
    expect(report.ready).toBe(true);
    expect(report.status).toBe('degraded');
    expect(statusCodeFor(report)).toBe(200);
    expect(readinessBody(report).dependencies).toEqual([{ name: 'kbs_daily', status: 'STALE', optional: false }]);
  });

  it('optional dependency failure degrades without blocking readiness', async () => {
    const report = await runHealthCheck({ now: () => T, probes: [probe('gemini', () => { throw new Error('down'); }, true)] });
    expect(report.ready).toBe(true);
    expect(report.status).toBe('degraded');
  });

  it('a hanging probe times out instead of blocking readiness forever', async () => {
    const report = await runHealthCheck({
      now: () => T,
      timeoutMs: 20,
      probes: [{ name: 'slow', check: () => new Promise((r) => setTimeout(() => r('OK' as const), 5000)) }],
    });
    expect(report.ready).toBe(false);
    expect(report.dependencies[0]!.status).toBe('UNAVAILABLE');
  });

  it('INVALID is treated as blocking', async () => {
    const report = await runHealthCheck({ now: () => T, probes: [probe('ledger', () => 'INVALID')] });
    expect(report.ready).toBe(false);
  });

  it('all-OK is deterministic and exposes no internals', async () => {
    const report = await runHealthCheck({ now: () => T, probes: [probe('postgres', () => 'OK')] });
    expect(report).toMatchObject({ alive: true, ready: true, status: 'ok', blockedBy: [] });
    const blob = JSON.stringify(readinessBody(report)).toLowerCase();
    for (const leak of ['password', 'postgres://', 'stack', 'sql_host']) expect(blob).not.toContain(leak);
  });
});

describe('health endpoints over HTTP', () => {
  let server: ReturnType<express.Express['listen']>;
  let base = '';
  let mode: 'ok' | 'down' = 'ok';

  beforeAll(async () => {
    const app = express();
    const probes: DependencyProbe[] = [
      { name: 'postgres', check: (): DependencyStatus => (mode === 'down' ? ((): never => { throw new Error('down'); })() : 'OK') },
    ];
    app.get('/healthz', async (_req, res) => {
      const report = await runHealthCheck({ now: () => T, probes });
      res.status(200).json(livenessBody(report));
    });
    app.get('/readyz', async (_req, res) => {
      const report = await runHealthCheck({ now: () => T, probes });
      res.status(statusCodeFor(report)).json(readinessBody(report));
    });
    await new Promise<void>((r) => {
      server = app.listen(0, () => r());
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  it('200 while healthy, 503 when a required dependency is down, and liveness stays 200', async () => {
    const readyOk = await fetch(`${base}/readyz`);
    expect(readyOk.status).toBe(200);
    expect((await readyOk.json()) as Record<string, unknown>).toMatchObject({ ready: true, status: 'ok' });

    mode = 'down';
    const readyDown = await fetch(`${base}/readyz`);
    expect(readyDown.status).toBe(503);
    const live = await fetch(`${base}/healthz`);
    expect(live.status).toBe(200); // liveness must not flap on a DB outage
  });
});
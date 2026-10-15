/**
 * PLATFORM-04 — METRICS REGISTRY (§32/§33)
 *
 * A tiny, dependency-free registry: counters, gauges and histograms with bounded
 * label cardinality. No meaningless metrics are created — only what the roadmap asks
 * for and what an operator can act on.
 *
 * Privacy rule (§33): financial VALUES are never global metrics. Only counts, rates and
 * latencies are exported. A metric name containing portfolio/market-value-ish terms is
 * rejected at registration time to prevent an accidental leak.
 */
export type MetricType = 'counter' | 'gauge' | 'histogram';

export interface MetricDefinition {
  readonly name: string;
  readonly type: MetricType;
  readonly help: string;
  readonly labelNames?: readonly string[];
  readonly buckets?: readonly number[];
}

interface Series {
  labels: Record<string, string>;
  value: number;
  values?: number[];
}

const DEFAULT_BUCKETS: readonly number[] = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500];

/** Guards against accidentally exporting a user's financial position as a metric. */
const FORBIDDEN_TOKENS: ReadonlySet<string> = new Set([
  'nav',
  'cash',
  'balance',
  'equity',
  'profit',
  'pnl',
  'quantity',
  'holdings',
  'value',
]);

/**
 * Token-based (snake_case aware) so a legitimate name like `provider_unavailable_total`
 * is not rejected for containing the letters of a forbidden word.
 */
export function isFinancialMetricName(name: string): boolean {
  const segments = name.toLowerCase().split('_');
  for (const seg of segments) if (FORBIDDEN_TOKENS.has(seg)) return true;
  for (let i = 0; i < segments.length - 1; i++) {
    if (FORBIDDEN_TOKENS.has(`${segments[i]}_${segments[i + 1]}`)) return true;
  }
  return /marketvalue|portfoliovalue|positionvalue/.test(name.toLowerCase());
}

export interface MetricsSnapshot {
  readonly name: string;
  readonly type: MetricType;
  readonly help: string;
  readonly series: ReadonlyArray<{ labels: Record<string, string>; value: number; count?: number; sum?: number }>;
}

export class MetricsRegistry {
  private readonly definitions = new Map<string, MetricDefinition>();
  private readonly series = new Map<string, Series>();

  register(def: MetricDefinition): void {
    if (isFinancialMetricName(def.name)) {
      throw new Error(`METRIC_REJECTS_FINANCIAL_VALUE:${def.name}`);
    }
    if (this.definitions.has(def.name)) return;
    this.definitions.set(def.name, def);
  }

  /** Only declared labels are retained — undeclared ones are dropped entirely, never exposed. */
  private declaredLabels(name: string, labels: Record<string, string>): Record<string, string> {
    const allowed = this.definitions.get(name)?.labelNames ?? [];
    const out: Record<string, string> = {};
    for (const k of Object.keys(labels).sort()) if (allowed.includes(k)) out[k] = labels[k];
    return out;
  }

  private key(name: string, labels: Record<string, string>): string {
    const parts = Object.entries(this.declaredLabels(name, labels)).map(([k, v]) => `${k}=${v}`);
    return `${name}{${parts.join(',')}}`;
  }

  increment(name: string, labels: Record<string, string> = {}, by = 1): void {
    const def = this.definitions.get(name);
    if (!def || def.type === 'gauge') return;
    const safe = this.declaredLabels(name, labels);
    const k = this.key(name, safe);
    const s: Series = this.series.get(k) ?? { labels: safe, value: 0, values: undefined };
    s.value += by;
    this.series.set(k, s);
  }

  gauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const def = this.definitions.get(name);
    if (!def || !Number.isFinite(value)) return;
    const safe = this.declaredLabels(name, labels);
    this.series.set(this.key(name, safe), { labels: safe, value });
  }

  observe(name: string, valueMs: number, labels: Record<string, string> = {}): void {
    const def = this.definitions.get(name);
    if (!def || def.type !== 'histogram' || !Number.isFinite(valueMs) || valueMs < 0) return;
    const safe = this.declaredLabels(name, labels);
    const k = this.key(name, safe);
    const s: Series = this.series.get(k) ?? { labels: safe, value: 0, values: [] };
    s.value += 1;
    (s.values ??= []).push(valueMs);
    this.series.set(k, s);
  }

  value(name: string, labels: Record<string, string> = {}): number | null {
    return this.series.get(this.key(name, labels))?.value ?? null;
  }

  snapshot(): readonly MetricsSnapshot[] {
    return [...this.definitions.values()].map((def) => ({
      name: def.name,
      type: def.type,
      help: def.help,
      series: [...this.series.entries()]
        .filter(([k]) => k.startsWith(`${def.name}{`))
        .map(([, s]) => ({
          labels: s.labels,
          value: s.value,
          ...(s.values ? { count: s.values.length, sum: s.values.reduce((a, b) => a + b, 0) } : {}),
        })),
    }));
  }

  /** Prometheus text exposition — standard, dependency-free, easy to scrape. */
  toPrometheus(): string {
    const out: string[] = [];
    for (const m of this.snapshot()) {
      out.push(`# HELP ${m.name} ${m.help}`);
      out.push(`# TYPE ${m.name} ${m.type}`);
      for (const s of m.series) {
        const labels = Object.entries(s.labels).map(([k, v]) => `${k}="${String(v).replace(/"/g, '')}"`).join(',');
        const lbl = labels ? `{${labels}}` : '';
        if (m.type === 'histogram' && s.count !== undefined) {
          out.push(`${m.name}_count${lbl} ${s.count}`);
          out.push(`${m.name}_sum${lbl} ${s.sum ?? 0}`);
        } else {
          out.push(`${m.name}${lbl} ${s.value}`);
        }
      }
    }
    return out.join('\n');
  }

  reset(): void {
    this.series.clear();
  }
}

function labelsKey(labels: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(labels).sort()) out[k] = labels[k];
  return out;
}

/** §32/§33 the metric set this platform actually maintains. */
export function registerPlatformMetrics(registry: MetricsRegistry): void {
  registry.register({ name: 'http_requests_total', type: 'counter', help: 'HTTP requests handled', labelNames: ['route', 'method', 'status'] });
  registry.register({ name: 'http_errors_total', type: 'counter', help: 'HTTP 5xx responses', labelNames: ['route'] });
  registry.register({ name: 'http_request_duration_ms', type: 'histogram', help: 'HTTP request duration (ms)', labelNames: ['route'], buckets: DEFAULT_BUCKETS });
  registry.register({ name: 'auth_login_total', type: 'counter', help: 'Login attempts', labelNames: ['outcome'] });
  registry.register({ name: 'auth_rate_limited_total', type: 'counter', help: 'Requests refused by the rate limiter', labelNames: ['bucket'] });
  registry.register({ name: 'audit_records_total', type: 'counter', help: 'Audit records appended', labelNames: ['action'] });
  registry.register({ name: 'data_stale_requests_total', type: 'counter', help: 'Requests served with STALE market data', labelNames: ['dataset'] });
  registry.register({ name: 'provider_unavailable_total', type: 'counter', help: 'Upstream provider failures surfaced to the user', labelNames: ['provider'] });
  registry.register({ name: 'market_data_freshness_ms', type: 'gauge', help: 'Age of the newest market data in ms', labelNames: ['dataset'] });
}
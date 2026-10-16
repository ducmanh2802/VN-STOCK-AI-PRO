export class MetricsRegistry {
  private metrics = new Map<string, number>();

  inc(name: string, val = 1) {
    this.metrics.set(name, (this.metrics.get(name) ?? 0) + val);
  }

  toPrometheus(): string {
    let out = '';
    for (const [k, v] of this.metrics.entries()) {
      out += `# TYPE ${k} gauge\n${k} ${v}\n`;
    }
    return out;
  }
}

export function registerPlatformMetrics(_metrics: MetricsRegistry): void {
  // default gauges/counters
}

export interface DependencyProbe {
  name: string;
  optional?: boolean;
  check: () => Promise<'OK' | 'DEGRADED' | 'UNAVAILABLE'> | 'OK' | 'DEGRADED' | 'UNAVAILABLE';
}

export interface HealthReport {
  status: 'ok' | 'degraded' | 'unavailable';
  ready: boolean;
  checkedAt: number;
  dependencies: { name: string; status: 'OK' | 'DEGRADED' | 'UNAVAILABLE'; optional?: boolean }[];
  blockedBy: string[];
}

export async function runHealthCheck(options: {
  now: () => number;
  probes: readonly DependencyProbe[];
}): Promise<HealthReport> {
  const deps: HealthReport['dependencies'] = [];
  const blocked: string[] = [];
  let degraded = false;
  let unavailable = false;

  for (const p of options.probes) {
    try {
      const res = await p.check();
      deps.push({ name: p.name, status: res, optional: p.optional });
      if (res === 'DEGRADED') degraded = true;
      if (res === 'UNAVAILABLE') {
        if (!p.optional) {
          unavailable = true;
          blocked.push(p.name);
        } else {
          degraded = true;
        }
      }
    } catch {
      deps.push({ name: p.name, status: 'UNAVAILABLE', optional: p.optional });
      if (!p.optional) {
        unavailable = true;
        blocked.push(p.name);
      } else {
        degraded = true;
      }
    }
  }

  const status = unavailable ? 'unavailable' : degraded ? 'degraded' : 'ok';
  return {
    status,
    ready: !unavailable,
    checkedAt: options.now(),
    dependencies: deps,
    blockedBy: blocked,
  };
}

export function statusCodeFor(report: HealthReport): number {
  if (report.status === 'unavailable') return 503;
  return 200;
}

export function livenessBody(report: HealthReport) {
  return { status: 'alive', checkedAt: new Date(report.checkedAt).toISOString() };
}

export function readinessBody(report: HealthReport) {
  return {
    status: report.status,
    ready: report.ready,
    dependencies: report.dependencies,
    blockedBy: report.blockedBy,
    checkedAt: new Date(report.checkedAt).toISOString(),
  };
}

/**
 * PLATFORM-04 — HEALTH / READINESS (§31) + FAILURE SEMANTICS (§36)
 *
 * §31 distinguishes PROCESS ALIVE from SYSTEM READY. Liveness never touches a
 * dependency (a DB outage must not cause a restart loop); readiness does, and reports
 * each dependency's state individually.
 *
 * §36: a dependency failure is surfaced as CURRENT | STALE | UNAVAILABLE | INVALID.
 * `UNAVAILABLE` is NEVER converted into a 200 with a fabricated value.
 */
export type DependencyStatus = 'OK' | 'STALE' | 'UNAVAILABLE' | 'INVALID' | 'DEGRADED';

export interface DependencyProbe {
  readonly name: string;
  /** Probe must not throw; failures are reported as UNAVAILABLE. Sync or async. */
  check(): DependencyStatus | Promise<DependencyStatus>;
  /** A dependency whose failure should not block readiness (e.g. optional AI). */
  readonly optional?: boolean;
}

export interface DependencyReport {
  readonly name: string;
  readonly status: DependencyStatus;
  readonly optional: boolean;
}

export interface HealthReport {
  /** Liveness: the process is running. Never depends on external systems. */
  readonly alive: boolean;
  /** Readiness: dependencies are usable. */
  readonly ready: boolean;
  readonly status: 'ok' | 'degraded' | 'unavailable';
  readonly checkedAt: number;
  readonly dependencies: readonly DependencyReport[];
  /** Required dependencies that are blocking readiness. */
  readonly blockedBy: readonly string[];
}

export interface HealthOptions {
  readonly now: () => number;
  /** Optional probe with an explicit status (used in tests and for deterministic wiring). */
  readonly probes?: readonly DependencyProbe[];
  readonly timeoutMs?: number;
}

export async function runHealthCheck(opts: HealthOptions): Promise<HealthReport> {
  const probes = opts.probes ?? [];
  const reports: DependencyReport[] = [];
  const timeoutMs = opts.timeoutMs ?? 2000;

  for (const p of probes) {
    let status: DependencyStatus = 'OK';
    try {
      const result = await withTimeout(Promise.resolve(p.check()), timeoutMs);
      status = result;
    } catch {
      // §39/§36: fail predictably and explicitly; never silently report OK.
      status = 'UNAVAILABLE';
    }
    reports.push({ name: p.name, status, optional: p.optional === true });
  }

  const blocking = reports.filter((r) => !r.optional && (r.status === 'UNAVAILABLE' || r.status === 'INVALID'));
  const degraded = reports.some((r) => !r.optional && r.status === 'STALE') || reports.some((r) => r.optional && (r.status === 'UNAVAILABLE' || r.status === 'STALE'));

  return {
    alive: true,
    ready: blocking.length === 0,
    status: blocking.length > 0 ? 'unavailable' : degraded ? 'degraded' : 'ok',
    checkedAt: opts.now(),
    dependencies: reports,
    blockedBy: blocking.map((r) => r.name),
  };
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('PROBE_TIMEOUT')), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * §31 liveness body. Deliberately minimal: no dependency detail, no version internals,
 * no environment information.
 */
export function livenessBody(report: HealthReport): Record<string, unknown> {
  return { status: report.alive ? 'alive' : 'dead', checkedAt: new Date(report.checkedAt).toISOString() };
}

/**
 * §31 readiness body. Dependency NAMES and states are exposed; credentials, hosts and
 * stack traces are not.
 */
export function readinessBody(report: HealthReport): Record<string, unknown> {
  return {
    status: report.status,
    ready: report.ready,
    checkedAt: new Date(report.checkedAt).toISOString(),
    dependencies: report.dependencies.map((d) => ({ name: d.name, status: d.status, optional: d.optional })),
    blockedBy: report.blockedBy,
  };
}

/** Maps a DependencyStatus onto the HTTP status a client should see. */
export function statusCodeFor(report: HealthReport): number {
  if (!report.ready) return 503;
  if (report.status === 'degraded') return 200;
  return 200;
}
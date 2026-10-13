/**
 * DATABASE CONNECTIVITY HEALTH
 * ============================
 * Distinguishes three states that a configuration flag alone cannot:
 *
 *   NOT_CONFIGURED — a required SQL_* variable is absent; no connection is attempted.
 *   CONNECTED      — a bounded `SELECT 1` round trip succeeded at `checkedAt`.
 *   UNAVAILABLE    — configured, but the probe failed or timed out.
 *
 * Having every SQL_* variable set proves nothing about reachability, so CONNECTED is
 * only ever reported after a real round trip.
 *
 * Like `dbFailure.ts`, this module must not import `src/db/index.ts` at module
 * evaluation time (that constructs the pg pool); the default probe imports it lazily.
 * Reported detail is limited to an error CODE — never a message, host, user or password.
 */
import { isDatabaseUnavailable } from './dbFailure.ts';

export type DatabaseConnectivityState = 'NOT_CONFIGURED' | 'CONNECTED' | 'UNAVAILABLE';

export type DatabaseUnavailableReason = 'TIMEOUT' | 'CONNECTION_FAILED' | 'QUERY_FAILED';

export interface DatabaseHealth {
  readonly state: DatabaseConnectivityState;
  readonly checkedAt: string;
  /** Round-trip time of the probe. Null when no probe completed. */
  readonly latencyMs: number | null;
  /** Names (never values) of the SQL_* variables that are missing. */
  readonly missingConfiguration: readonly string[];
  readonly reason: DatabaseUnavailableReason | null;
  /** Driver/OS error code only (e.g. ECONNREFUSED, 28P01). */
  readonly errorCode: string | null;
}

/** The runtime pool needs all four; see `src/db/index.ts`. */
export const REQUIRED_DATABASE_ENV = ['SQL_HOST', 'SQL_USER', 'SQL_PASSWORD', 'SQL_DB_NAME'] as const;

export const DEFAULT_DATABASE_PROBE_TIMEOUT_MS = 3_000;

export type DatabaseProbe = () => Promise<unknown>;

export function missingDatabaseConfiguration(
  env: Record<string, string | undefined> = process.env
): string[] {
  return REQUIRED_DATABASE_ENV.filter((key) => !env[key] || env[key]!.trim() === '');
}

// Imported lazily (see header) and exactly once, so concurrent first probes share one load.
let dbModules: Promise<[typeof import('./index.ts'), typeof import('drizzle-orm')]> | null = null;

const defaultProbe: DatabaseProbe = async () => {
  dbModules ??= Promise.all([import('./index.ts'), import('drizzle-orm')]);
  const [{ db }, { sql }] = await dbModules;
  await db.execute(sql`SELECT 1`);
};

class ProbeTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`database probe exceeded ${timeoutMs}ms`);
    this.name = 'ProbeTimeoutError';
  }
}

function errorCodeOf(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; current !== null && current !== undefined && depth < 6; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && /^[A-Z0-9_]{1,32}$/i.test(code)) return code;
    const cause = (current as { cause?: unknown }).cause;
    if (cause === current) break;
    current = cause;
  }
  return null;
}

/**
 * Runs one bounded connectivity probe. Never throws: every failure is reported as
 * UNAVAILABLE with a classified reason.
 */
export async function checkDatabaseConnectivity(
  options: {
    env?: Record<string, string | undefined>;
    timeoutMs?: number;
    probe?: DatabaseProbe;
    now?: () => number;
  } = {}
): Promise<DatabaseHealth> {
  const now = options.now ?? Date.now;
  const missing = missingDatabaseConfiguration(options.env ?? process.env);
  if (missing.length > 0) {
    return {
      state: 'NOT_CONFIGURED',
      checkedAt: new Date(now()).toISOString(),
      latencyMs: null,
      missingConfiguration: missing,
      reason: null,
      errorCode: null,
    };
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_DATABASE_PROBE_TIMEOUT_MS;
  const probe = options.probe ?? defaultProbe;
  const started = now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const attempt = Promise.resolve().then(probe);
    // A probe that loses the race keeps running against pg's own connect timeout;
    // its eventual rejection must not surface as an unhandled rejection.
    attempt.catch(() => undefined);
    await Promise.race([
      attempt,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ProbeTimeoutError(timeoutMs)), timeoutMs);
        (timer as { unref?: () => void }).unref?.();
      }),
    ]);
    return {
      state: 'CONNECTED',
      checkedAt: new Date(now()).toISOString(),
      latencyMs: Math.max(0, now() - started),
      missingConfiguration: [],
      reason: null,
      errorCode: null,
    };
  } catch (error) {
    const reason: DatabaseUnavailableReason =
      error instanceof ProbeTimeoutError
        ? 'TIMEOUT'
        : isDatabaseUnavailable(error)
          ? 'CONNECTION_FAILED'
          : 'QUERY_FAILED';
    return {
      state: 'UNAVAILABLE',
      checkedAt: new Date(now()).toISOString(),
      latencyMs: null,
      missingConfiguration: [],
      reason,
      errorCode: reason === 'TIMEOUT' ? null : errorCodeOf(error),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

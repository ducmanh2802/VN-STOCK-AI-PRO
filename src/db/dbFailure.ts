/**
 * DATABASE-FAILURE CLASSIFIER
 * ===========================
 * One predicate shared by every HTTP handler so "the store is not there" is
 * reported as 503 DATA_UNAVAILABLE instead of a generic 500 Internal Server
 * Error. A 500 tells an operator "your code is broken"; a 503 tells the truth
 * — the request was fine, the dependency is missing.
 *
 * Deliberately dependency-free: this module must never import `src/db/index.ts`,
 * which constructs the pg pool at module-evaluation time.
 *
 * Keep the matcher TIGHT. Over-matching turns a genuine application bug into a
 * dependency outage and hides the bug; under-matching only costs a status code.
 */

/** Node/OS level connection failures (pg surfaces these through `error.code`). */
const CONNECTION_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EPIPE',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
]);

/**
 * Postgres SQLSTATEs that mean "cannot reach / not allowed into the database",
 * as opposed to SQLSTATEs caused by the query itself (e.g. 22P02 invalid input,
 * 23505 unique violation) which must stay 500.
 */
const POSTGRES_CODES = new Set([
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08003', // connection_does_not_exist
  '08006', // connection_failure
  '28000', // invalid_authorization_specification
  '28001', // invalid_authorization_specification_without_password
  '28P01', // invalid_password
  '3D000', // invalid_catalog_name (database does not exist)
  '57P03', // cannot_connect_now
  '53300', // too_many_connections
]);

/** Message fragments, lower-case matched. Covers drivers that drop the code. */
const MESSAGE_PATTERNS: readonly string[] = [
  'econnrefused',
  'econnreset',
  'etimedout',
  'getaddrinfo',
  'timeout expired', // pg `connectionTimeoutMillis` expiry
  'connection terminated',
  'connection ended',
  'connection refused',
  'the database system is starting up',
  'remaining connection slots are reserved',
  'password authentication failed',
  'no pg_hba.conf entry',
  'database system is in recovery mode',
];

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '';
}

function matchesDirectly(error: unknown): boolean {
  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string' && (CONNECTION_CODES.has(code) || POSTGRES_CODES.has(code))) {
    return true;
  }
  const message = messageOf(error).toLowerCase();
  if (!message) return false;
  return MESSAGE_PATTERNS.some((pattern) => message.includes(pattern));
}

/**
 * True only when the failure means "Postgres is unreachable / not configured".
 *
 * The chain is walked because repositories wrap driver errors in a Vietnamese
 * domain message while preserving the original as `cause`
 * (`new Error('…', { cause: error })`) — judging only the outer message would
 * classify a connection outage as an application bug.
 */
export function isDatabaseUnavailable(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current !== null && current !== undefined && depth < 6; depth++) {
    if (matchesDirectly(current)) return true;
    const cause = (current as { cause?: unknown }).cause;
    if (cause === current) break;
    current = cause;
  }
  return false;
}

/**
 * PLATFORM COMPOSITION ROOT
 * ========================
 * Single place where platform services are constructed and wired to HTTP.
 *
 * Storage honesty (important):
 *  - Identity/session/membership/audit state is PROCESS-LOCAL (in-memory) in this build.
 *  - Sessions therefore do NOT survive a process restart, and the audit trail is not
 *    durable. On restart there are no sessions (access is denied) and no audit history.
 *  - Migration 0007 already reserves the durable identity schema
 *    (`platform_user_account`, `platform_sessions`, `platform_auth_events`);
 *    drizzle-backed adapters are the documented next step.
 *  - Nothing is silently downgraded: a fresh process refuses access rather than
 *    accepting anonymous or reconstructed state.
 *
 * Nothing here knows what a portfolio, price, or trade is: the platform layer sits
 * below financial semantics and never reinterprets them.
 */
import { Router } from 'express';
import { createAuthApiRouter } from './AuthApiRouter.ts';
import { IdentityService, InMemoryUserStore } from '../identity/identityService.ts';
import { InMemorySessionStore, SessionManager, DEFAULT_SESSION_POLICY } from '../identity/session.ts';
import { ScryptPasswordHasher } from '../identity/password.ts';
import { InMemoryAuthEventSink, type AuthEventSink } from '../identity/types.ts';
import { InMemoryRateLimiter } from '../security/rateLimiter.ts';
import { AuditLog, AuthEventAuditSink, InMemoryAuditStore } from '../audit/auditLog.ts';
import { AuthorizationService } from '../authorization/authorizationService.ts';
import { InMemoryMembershipStore } from '../authorization/types.ts';
import { correlationMiddleware, securityHeaders } from '../../../middleware/platform/security.ts';
import { getAdminAuthState } from '../../firebase-admin.ts';
import { StructuredLogger, MemoryLogSink } from '../observability/logger.ts';
import { MetricsRegistry, registerPlatformMetrics } from '../observability/metrics.ts';
import {
  livenessBody,
  readinessBody,
  runHealthCheck,
  statusCodeFor,
  type DependencyProbe,
} from '../observability/health.ts';

export interface PlatformContext {
  readonly identity: IdentityService;
  readonly sessions: SessionManager;
  readonly limiter: InMemoryRateLimiter;
  readonly authEvents: InMemoryAuthEventSink;
  readonly audit: AuditLog;
  readonly authorization: AuthorizationService;
  readonly metrics: MetricsRegistry;
  readonly logger: StructuredLogger;
  readonly logSink: MemoryLogSink;
  readonly probes: readonly DependencyProbe[];
}

let context: PlatformContext | null = null;

/**
 * §31 dependency probes. The set was previously EMPTY, which made `/readyz` answer
 * `{ready:true, dependencies:[]}` while `/api/health` simultaneously reported
 * `database: DATABASE_CONFIGURATION_REQUIRED`. A readiness probe that cannot see an
 * unconfigured dependency is a false green: a load balancer would route traffic to a
 * container that cannot serve its database-backed routes.
 *
 * These probes report real CONFIGURATION state. Every entry is marked `optional` because
 * the platform is designed to run without a database (market data comes from KBS/VPS) —
 * an absent optional dependency degrades the report to `status:'degraded'` instead of
 * silently disappearing from it. A dependency that is configured but UNREACHABLE must be
 * registered by the deployment as a non-optional probe to actually gate traffic.
 */
export function defaultProbes(): readonly DependencyProbe[] {
  return [
    {
      name: 'database',
      optional: true,
      check: () =>
        process.env.SQL_HOST && process.env.SQL_USER && process.env.SQL_PASSWORD && process.env.SQL_DB_NAME
          ? 'OK'
          : 'UNAVAILABLE',
    },
    { name: 'auth', optional: true, check: () => (getAdminAuthState().status === 'READY' ? 'OK' : 'UNAVAILABLE') },
    { name: 'gemini', optional: true, check: () => (process.env.GEMINI_API_KEY ? 'OK' : 'UNAVAILABLE') },
  ];
}

export function getPlatformContext(): PlatformContext {
  if (context) return context;
  const users = new InMemoryUserStore();
  const authEvents = new InMemoryAuthEventSink();
  const audit = new AuditLog(new InMemoryAuditStore());
  // Every authentication event lands in the audit trail; the in-memory buffer is kept
  // for the auth-event read path only.
  const sink: AuthEventSink = {
    record: (e) => {
      authEvents.record(e);
      new AuthEventAuditSink(audit, () => Date.now()).record(e);
    },
  };
  const sessionStore = new InMemorySessionStore();
  const now = () => Date.now();
  const sessions = new SessionManager(sessionStore, now, DEFAULT_SESSION_POLICY);
  const identity = new IdentityService(users, sink, now, sessions, new ScryptPasswordHasher());
  const limiter = new InMemoryRateLimiter(now);
  const authorization = new AuthorizationService(new InMemoryMembershipStore());
  const metrics = new MetricsRegistry();
  registerPlatformMetrics(metrics);
  const logSink = new MemoryLogSink();
  const logger = new StructuredLogger(logSink, (process.env.LOG_LEVEL as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR') ?? 'INFO', 'platform', now);
  context = { identity, sessions, limiter, authEvents, audit, authorization, metrics, logger, logSink, probes: defaultProbes() };
  return context;
}

/** Test seam: replace the process context (never used by production wiring). */
export function setPlatformContext(next: PlatformContext | null): void {
  context = next;
}

export function createPlatformRouter(): Router {
  const router = Router();
  const ctx = getPlatformContext();
  router.use(correlationMiddleware);
  router.use(securityHeaders);

  // §31 liveness: process alive only — never touches a dependency.
  router.get('/healthz', (_req, res) => {
    const report = runHealthCheck({ now: () => Date.now(), probes: ctx.probes });
    void report.then((r) => res.status(200).json(livenessBody(r)));
  });

  // §31 readiness: dependency states, 503 when a required dependency is unusable.
  router.get('/readyz', async (_req, res) => {
    const report = await runHealthCheck({ now: () => Date.now(), probes: ctx.probes });
    res.status(statusCodeFor(report)).json(readinessBody(report));
  });

  // §32 metrics: Prometheus exposition, counts/latencies only — never user values.
  router.get('/metrics', (_req, res) => {
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.status(200).send(ctx.metrics.toPrometheus());
  });

  router.use('/auth', createAuthApiRouter({ identity: ctx.identity, limiter: ctx.limiter }));
  return router;
}
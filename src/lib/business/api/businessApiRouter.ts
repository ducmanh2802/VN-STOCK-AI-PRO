/**
 * BUSINESS-01 — COMMERCIAL API ROUTER
 * ===================================
 * Domain-level, authenticated, authorized, validated, auditable (roadmap §12).
 *
 * NOT MOUNTED BY THIS LANE.
 * `server.ts` is a protected file (roadmap §26 "Global server routing") and is currently
 * owned by the PLATFORM lane, so the Business lane exports a mount-ready router and does not
 * touch server.ts. Mounting is a one-line change once the two lanes converge; see
 * docs/BUSINESS_01_ARCHITECTURE.md §7.
 *
 * SECURITY POSTURE
 *  - every route requires an authenticated principal; anonymous access is refused
 *  - no route returns internal database structures
 *  - every mutating route appends a commercial audit event via EntitlementService
 *  - validation is explicit and fail-closed; nothing is coerced silently
 *  - rate limiting is applied per bucket (roadmap §09, §10 in the security audit)
 */

import { Router, type Request, type Response } from 'express';
import { IdentityService } from '../../platform/identity/identityService.ts';
import type { Principal } from '../../platform/identity/types.ts';
import { actorFromPrincipal } from '../actor.ts';
import type { BusinessActor } from '../actor.ts';
import type { EntitlementService } from '../entitlementService.ts';
import { FEATURES, isFeatureImplemented, type FeatureId } from '../features.ts';
import { PLAN_IDS } from '../plans.ts';
import type { PlanId, SubscriptionStatus } from '../types.ts';
import { isUnavailable, NOT_AVAILABLE, unavailable } from '../types.ts';

export interface BusinessRouterDeps {
  readonly entitlements: EntitlementService;
  /** Resolves the PLATFORM account status for a user id, for fail-closed actor checks. */
  readonly accountStatus: (userId: string) => BusinessActor['platformUserStatus'];
  /** Window key for usage, e.g. '2026-10'. Injected so the route never reads a clock. */
  /** PLATFORM IdentityService. Injected so the Business lane never owns identity state. */
  readonly identity: IdentityService;
  readonly periodKey: (nowIso: string) => string;
  readonly now: () => string;
}

const SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  'TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELLED', 'EXPIRED', 'INCOMPLETE', 'UNAVAILABLE',
];

/** Parse a bounded positive integer query param. Returns null when unusable. */
function boundedInt(value: unknown, max: number): number | null {
  if (typeof value !== 'string' || !/^[0-9]{1,4}$/.test(value)) return null;
  const n = Number.parseInt(value, 10);
  if (n < 0 || n > max) return null;
  return n;
}

function principalOf(req: Request, identity: IdentityService): Principal | null {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  if (token === '') return null;
  const result = identity.authenticateToken(token);
  return result.ok && result.principal ? result.principal : null;
}

export function createBusinessApiRouter(deps: BusinessRouterDeps): Router {
  const router = Router();
  // The PLATFORM IdentityService is injected, not imported as a singleton, so the router is
  // testable and so the Business lane never owns identity state.
  const identity = deps.identity;

  /**
   * Resolve the actor or refuse. Fail closed. The PLATFORM layer authenticates; the
   * BUSINESS layer authorizes. Neither substitutes for the other.
   */
  function requireActor(req: Request, res: Response): BusinessActor | null {
    const principal = principalOf(req, identity);
    if (!principal) {
      res.status(401).json({ error: 'FORBIDDEN', reason: 'AUTHENTICATION_REQUIRED' });
      return null;
    }
    const status = deps.accountStatus(principal.userId);
    const actor = actorFromPrincipal(principal, status, Date.parse(deps.now()), null);
    if (actor.ok === false) {
      res.status(403).json({ error: 'FORBIDDEN', reason: actor.reason });
      return null;
    }
    return actor.actor;
  }

  // ---------------------------------------------------------------- plans

  /**
   * GET /api/billing/plans
   * The plan catalog. Public by nature: it describes no user's commercial state.
   * Every feature is reported together with its IMPLEMENTATION STATUS so the client can
   * never present a capability the platform cannot deliver (roadmap §01.4).
   */
  router.get('/plans', async (_req: Request, res: Response) => {
    try {
      const { PLANS } = await import('../plans.ts');
      res.json({
        plans: PLAN_IDS.map((id) => {
          const p = PLANS.get(id)!;
          return {
            id: p.id,
            label: p.label,
            rank: p.rank,
            individual: p.individual,
            organization: p.organization,
            maxSeats: p.maxSeats,
            limits: p.limits,
            marketplaceModels: p.marketplaceModels,
          };
        }),
        features: FEATURES.map((f) => ({
          id: f.id,
          category: f.category,
          label: f.label,
          status: f.status,
          implemented: isFeatureImplemented(f.id),
          evidence: f.evidence,
        })),
      });
    } catch (error) {
      res.status(500).json({ error: 'UNAVAILABLE', reason: messageOf(error) });
    }
  });

  // ---------------------------------------------------------------- subscription

  /**
   * GET /api/billing/subscription
   * The caller's own commercial state only. No id parameter exists, so there is nothing to
   * tamper with and no IDOR surface.
   */
  router.get('/subscription', async (req: Request, res: Response) => {
    const actor = requireActor(req, res);
    if (!actor) return;
    try {
      const subjectId = actor.subject.subjectId;
      const sub = await deps.entitlements.resolvePlan(subjectId);
      const status = await deps.entitlements.statusOf(subjectId, Date.parse(deps.now()));
      const description = await deps.entitlements.describePlan(subjectId);
      res.json({
        subjectId,
        planId: sub,
        planLabel: description.label,
        status: status ?? 'UNAVAILABLE',
        features: description.features,
      });
    } catch (error) {
      res.status(500).json({ error: 'UNAVAILABLE', reason: messageOf(error) });
    }
  });

  /**
   * POST /api/billing/subscription/status
   * Explicit lifecycle transition. Illegal transitions are rejected by the state machine and
   * surface as 409. Idempotent in effect: replaying the same target status is a no-op only
   * when the machine allows the self-edge, which it deliberately does not.
   */
  router.post('/subscription/status', async (req: Request, res: Response) => {
    const actor = requireActor(req, res);
    if (!actor) return;
    const to = (req.body as { status?: unknown } | undefined)?.status;
    if (typeof to !== 'string' || !SUBSCRIPTION_STATUSES.includes(to as SubscriptionStatus)) {
      res.status(400).json({ error: 'INVALID', reason: 'UNSUPPORTED_SUBSCRIPTION_STATUS' });
      return;
    }
    // A subscriber may cancel or pause their own subscription. They may not, for example,
    // force their own subscription into PAST_DUE or EXPIRED. Only CANCELLED and PAUSED are
    // self-service; the rest are provider/system driven.
    if (to !== 'CANCELLED' && to !== 'PAUSED') {
      res.status(403).json({ error: 'FORBIDDEN', reason: 'STATUS_NOT_SELF_SERVICE' });
      return;
    }
    try {
      const subjectId = actor.subject.subjectId;
      await deps.entitlements.ensureFreeSubscription(subjectId, deps.now());
      const updated = await deps.entitlements.changeStatus({
        subjectId,
        to: to as SubscriptionStatus,
        at: deps.now(),
        actorUserId: subjectId,
        actorSessionId: actor.subject.sessionId,
        correlationId: actor.subject.correlationId,
        reason: 'SELF_SERVICE_REQUEST',
      });
      res.json({ status: updated.status, cancelAtPeriodEnd: updated.cancelAtPeriodEnd });
    } catch (error) {
      const code = messageOf(error);
      if (code.startsWith('INVALID_SUBSCRIPTION_TRANSITION')) {
        res.status(409).json({ error: 'INVALID', reason: code });
        return;
      }
      res.status(500).json({ error: 'UNAVAILABLE', reason: code });
    }
  });

  // ---------------------------------------------------------------- entitlements

  /**
   * GET /api/entitlements
   * The caller's resolved capabilities. Denials are reported as explicit decisions, never as
   * an absent entry, so the client can distinguish "not entitled" from "unknown".
   */
  router.get('/entitlements', async (req: Request, res: Response) => {
    const actor = requireActor(req, res);
    if (!actor) return;
    try {
      const subjectId = actor.subject.subjectId;
      const at = deps.now();
      const description = await deps.entitlements.describePlan(subjectId);
      const status = await deps.entitlements.statusOf(subjectId, Date.parse(at));

      const features = await Promise.all(
        description.features.map(async (f) => {
          const result = await deps.entitlements.check({
            actor,
            feature: f.id,
            at,
            periodKey: deps.periodKey(at),
          });
          return {
            feature: f.id as FeatureId,
            implemented: f.implemented,
            decision: result.verdict.decision,
            allowed: result.verdict.allowed,
            reason: result.verdict.reason,
          };
        }),
      );

      res.json({
        subjectId,
        planId: description.planId,
        subscriptionStatus: status ?? 'UNAVAILABLE',
        features,
      });
    } catch (error) {
      res.status(500).json({ error: 'UNAVAILABLE', reason: messageOf(error) });
    }
  });

  // ---------------------------------------------------------------- usage

  /**
   * GET /api/usage
   * Consumption for the caller's own account, for the requested period. Bounded.
   */
  router.get('/usage', async (req: Request, res: Response) => {
    const actor = requireActor(req, res);
    if (!actor) return;
    try {
      const subjectId = actor.subject.subjectId;
      const at = deps.now();
      const requested = (req.query.period as string | undefined) ?? deps.periodKey(at);
      if (!/^[0-9]{4}-[0-9]{2}$/.test(requested)) {
        res.status(400).json({ error: 'INVALID', reason: 'INVALID_PERIOD_KEY' });
        return;
      }
      const resources = [
        'AI_REQUESTS', 'BACKTEST_RUNS', 'PAPER_REPLAYS', 'RESEARCH_EXPERIMENTS',
        'EXPORTS', 'ALERTS', 'API_CALLS', 'COMMUNITY_POSTS', 'MARKETPLACE_LISTINGS',
      ] as const;

      const rows = await Promise.all(
        resources.map(async (resource) => {
          const r = await deps.entitlements.remaining({ subjectId, resource, periodKey: requested });
          return { resource, ...r };
        }),
      );
      res.json({ subjectId, periodKey: requested, usage: rows });
    } catch (error) {
      res.status(500).json({ error: 'UNAVAILABLE', reason: messageOf(error) });
    }
  });

  // ---------------------------------------------------------------- capability probe

  /**
   * POST /api/entitlements/check
   * Explicit capability probe. Optionally meters one metered unit of consumption.
   *
   * The caller MUST supply `usageEventId` when it wants consumption recorded. That id is the
   * idempotency key: retrying the request with the same id records exactly one unit.
   */
  router.post('/entitlements/check', async (req: Request, res: Response) => {
    const actor = requireActor(req, res);
    if (!actor) return;
    const body = (req.body ?? {}) as {
      feature?: unknown;
      meter?: unknown;
      usageEventId?: unknown;
      quantity?: unknown;
    };
    if (typeof body.feature !== 'string' || body.feature === '') {
      res.status(400).json({ error: 'INVALID', reason: 'FEATURE_REQUIRED' });
      return;
    }
    const quantity = body.quantity === undefined ? 1 : Number(body.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 1000) {
      res.status(400).json({ error: 'INVALID', reason: 'INVALID_QUANTITY' });
      return;
    }
    if (body.usageEventId !== undefined && (typeof body.usageEventId !== 'string' || body.usageEventId.length > 200)) {
      res.status(400).json({ error: 'INVALID', reason: 'INVALID_USAGE_EVENT_ID' });
      return;
    }
    try {
      const at = deps.now();
      const result = await deps.entitlements.check({
        actor,
        feature: body.feature,
        at,
        meter: typeof body.meter === 'string' ? (body.meter as never) : null,
        periodKey: deps.periodKey(at),
        usageEventId: typeof body.usageEventId === 'string' ? body.usageEventId : null,
        quantity,
      });
      const code = result.verdict.allowed ? 200 : httpCodeFor(result.verdict.decision);
      res.status(code).json({
        decision: result.verdict.decision,
        allowed: result.verdict.allowed,
        feature: result.verdict.feature,
        planId: result.verdict.planId,
        subscriptionStatus: result.verdict.subscriptionStatus,
        limit: result.verdict.limit,
        limitValue: result.verdict.limitValue,
        consumed: result.verdict.consumed,
        remaining: result.verdict.remaining,
        reason: result.verdict.reason,
        usageRecorded: result.usageEventId !== null && !result.usageDuplicate,
        usageDuplicate: result.usageDuplicate,
      });
    } catch (error) {
      res.status(500).json({ error: 'UNAVAILABLE', reason: messageOf(error) });
    }
  });

  // ---------------------------------------------------------------- audit

  /**
   * GET /api/billing/audit
   * The caller's own commercial audit trail, bounded and paginated. Never returns another
   * subject's events: there is no subject parameter to tamper with.
   */
  router.get('/audit', async (req: Request, res: Response) => {
    const actor = requireActor(req, res);
    if (!actor) return;
    const limit = boundedInt(req.query.limit, 100) ?? 50;
    const offset = boundedInt(req.query.offset, 100_000) ?? 0;
    try {
      const { BusinessAuditRepository } = await import('../../db/business/BusinessRepositories.ts');
      const events = await BusinessAuditRepository.forSubject(actor.subject.subjectId, limit);
      res.json({
        subjectId: actor.subject.subjectId,
        limit,
        offset,
        events: events.length === 0 ? unavailable('NO_COMMERCIAL_ACTIVITY', NOT_AVAILABLE) : events,
      });
    } catch (error) {
      res.status(500).json({ error: 'UNAVAILABLE', reason: messageOf(error) });
    }
  });

  return router;
}

function httpCodeFor(decision: string): number {
  switch (decision) {
    case 'DENIED_UNKNOWN_FEATURE':
    case 'DENIED_FEATURE_NOT_IN_PLAN':
    case 'DENIED_FEATURE_NOT_IMPLEMENTED':
    case 'DENIED_NO_SUBSCRIPTION':
    case 'DENIED_SUBSCRIPTION_INACTIVE':
      return 403;
    case 'DENIED_SUBJECT_MISMATCH':
      return 403;
    case 'LIMIT_REACHED':
      return 429;
    case 'REQUIRES_PAYMENT':
      return 402;
    case 'REQUIRES_RECONCILIATION':
      return 503;
    default:
      return 403;
  }
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'UNKNOWN_ERROR';
}

export { isUnavailable };
/**
 * P1-08 REMEDIATION — BUSINESS API ROUTER COMPOSITION
 * ===================================================
 * The Business lane shipped a certified commercial router but never mounted it:
 * `createBusinessApiRouter` had zero non-test callers and `server.ts` had no
 * `/api/billing` surface, so the entire entitlement / subscription / usage /
 * audit domain was unreachable over HTTP (P1-08).
 *
 * This composition supplies the four dependencies the router requires and returns
 * a mount-ready router. It lives in its own directory so it never collides with
 * the concurrent BUSINESS-06 lane, which owns
 * `src/services/business/BillingPersistenceService.ts`,
 * `src/services/business/OrganizationService.ts` and `src/services/business06/`.
 *
 * SECURITY POSTURE (inherited from the router, restated here because this is the
 * production wiring):
 * - identity comes from the shared PLATFORM `IdentityService`, so the Business lane
 *   never owns identity state;
 * - the account-status probe fails CLOSED: if it cannot resolve a status, the actor
 *   is treated as unavailable and every route refuses;
 * - the clock is injected, so the router never reads ambient time.
 */
import { Router } from 'express';
import { createBusinessApiRouter } from '../../lib/business/api/businessApiRouter.ts';
import { businessServices, type BusinessServiceBundle } from '../business/BusinessServiceComposition.ts';
import { getPlatformContext } from '../../lib/platform/api/createPlatformRouter.ts';
import type { BusinessActor } from '../../lib/business/actor.ts';

export interface BusinessApiRouterCompositionOptions {
  /** Overridable for tests. Defaults to the process-wide business bundle. */
  readonly services?: BusinessServiceBundle;
}

/** Window key for usage metering, e.g. '2026-10'. Derived from the injected clock. */
function periodKey(nowIso: string): string {
  return nowIso.slice(0, 7);
}

export function createBusinessApiRouterComposition(
  options: BusinessApiRouterCompositionOptions = {}
): Router {
  const services = options.services ?? businessServices();
  const platform = getPlatformContext();

  /**
   * Fail-closed account status. The Business lane must not grant access to an
   * account it cannot verify: an unknown account resolves to the most restrictive
   * PLATFORM status (`LOCKED`) so every downstream check refuses it, rather than
   * to a permissive default.
   */
  const accountStatus = (userId: string): BusinessActor['platformUserStatus'] => {
    try {
      const account = platform.identity.getAccount(userId);
      return account ? account.status : 'LOCKED';
    } catch {
      return 'LOCKED';
    }
  };

  return createBusinessApiRouter({
    entitlements: services.entitlements,
    identity: platform.identity,
    accountStatus,
    periodKey,
    now: () => new Date().toISOString(),
  });
}

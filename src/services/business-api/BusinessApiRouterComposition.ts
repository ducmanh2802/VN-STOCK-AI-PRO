import { Router } from 'express';
import { createBusinessApiRouter } from '../../lib/business/api/businessApiRouter.ts';
import {
  EntitlementService,
  InMemorySubscriptionStore,
} from '../../lib/business/entitlementService.ts';
import { InMemoryUsageMeter } from '../../lib/business/usageMeter.ts';
import { InMemoryCommercialAuditLog } from '../../lib/business/auditLog.ts';
import { IdentityService, InMemoryUserStore } from '../../lib/platform/identity/identityService.ts';
import { SessionManager, InMemorySessionStore } from '../../lib/platform/identity/session.ts';

export function createBusinessApiRouterComposition(): Router {
  const auditLog = new InMemoryCommercialAuditLog();
  const usageMeter = new InMemoryUsageMeter();
  const subscriptionStore = new InMemorySubscriptionStore();

  const entitlements = new EntitlementService({
    subscriptions: subscriptionStore,
    usage: usageMeter,
    audit: auditLog,
  });

  const sessionManager = new SessionManager(new InMemorySessionStore(), () => Date.now());
  const identity = new IdentityService(
    new InMemoryUserStore(),
    { record: () => {} },
    () => Date.now(),
    sessionManager
  );

  return createBusinessApiRouter({
    entitlements,
    accountStatus: () => 'ACTIVE',
    identity,
    periodKey: (nowIso: string) => nowIso.slice(0, 7),
    now: () => new Date().toISOString(),
  });
}

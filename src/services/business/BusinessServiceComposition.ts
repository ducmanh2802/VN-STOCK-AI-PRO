/**
 * BUSINESS-01 — SERVICE COMPOSITION ROOT
 * =======================================
 * The single place the commercial services are wired together.
 *
 * Dependency direction (roadmap §6, §7):
 *   HTTP router  ->  services  ->  domain engines (pure)  ->  repositories  ->  drizzle
 *
 * The domain engines have no I/O at all. The repositories are the only place that touches
 * the database. The router is the only place that touches HTTP. This keeps the commercial
 * rules testable without a database and keeps the business layer out of the trading layer.
 *
 * DEFAULT WIRING IS EXPLICIT AND SWAPPABLE. `createBusinessServices` accepts overrides so a
 * test, an integration harness or a future background worker can supply different adapters
 * without changing any engine.
 */

import { InMemoryCommercialAuditLog, type CommercialAuditLog } from '../../lib/business/auditLog.ts';
import { EntitlementService, InMemorySubscriptionStore, type SubscriptionStore } from '../../lib/business/entitlementService.ts';
import type { ReconciliationState } from '../../lib/business/entitlementEngine.ts';
import { InMemoryUsageMeter, type UsageMeter } from '../../lib/business/usageMeter.ts';

export interface BusinessServiceBundle {
  readonly entitlements: EntitlementService;
  readonly subscriptions: SubscriptionStore;
  readonly usage: UsageMeter;
  readonly audit: CommercialAuditLog;
}

export interface BusinessServiceOptions {
  readonly subscriptions?: SubscriptionStore;
  readonly usage?: UsageMeter;
  readonly audit?: CommercialAuditLog;
  readonly reconciliation?: (subjectId: string) => ReconciliationState;
}

/**
 * Build the bundle. Every dependency defaults to the deterministic in-memory
 * implementation, which is what makes the whole commercial layer runnable and testable
 * with no database and no payment provider.
 *
 * In production, pass the drizzle adapters from ./adapters/drizzleAdapters.ts.
 */
export function createBusinessServices(options: BusinessServiceOptions = {}): BusinessServiceBundle {
  const subscriptions = options.subscriptions ?? new InMemorySubscriptionStore();
  const usage = options.usage ?? new InMemoryUsageMeter();
  const audit = options.audit ?? new InMemoryCommercialAuditLog();

  const entitlements = new EntitlementService({
    subscriptions,
    usage,
    audit,
    reconciliation: options.reconciliation,
  });

  return { entitlements, subscriptions, usage, audit };
}

/** Process-wide default bundle. Single commercial state per process (modular monolith). */
let defaultBundle: BusinessServiceBundle | null = null;

export function businessServices(): BusinessServiceBundle {
  if (defaultBundle === null) defaultBundle = createBusinessServices();
  return defaultBundle;
}

/** Test seam: replace the process-wide bundle. Passing null resets it. */
export function setBusinessServices(bundle: BusinessServiceBundle | null): void {
  defaultBundle = bundle;
}
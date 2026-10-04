/**
 * BUSINESS LANE — PUBLIC BARREL
 * =============================
 * The supported import surface for the commercial layer.
 *
 * Consumers should import from `src/lib/business/index.ts` rather than reaching into
 * individual modules. That keeps the internal file layout free to change and makes the
 * "one way in" property (roadmap §01.7) enforceable by review.
 */

// ---- BUSINESS-01: monetization foundation ---------------------------------
export * from './types.ts';
export * from './features.ts';
export * from './plans.ts';
export * from './subscriptionMachine.ts';
export * from './entitlementEngine.ts';
export * from './entitlementService.ts';
export * from './usageMeter.ts';
export * from './actor.ts';
export * from './auditLog.ts';
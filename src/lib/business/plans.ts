/**
 * BUSINESS-01 — PLAN CATALOG AND PLAN RESOLUTION
 * ==============================================
 * Centralized plan/entitlement model (roadmap §01.1, §01.6).
 *
 * The FREE plan is explicit and data-driven. There is no `if (user) → free` logic
 * anywhere in the application; every subject resolves through PlanResolver and receives
 * the FREE plan's explicit feature set and limits.
 *
 * Prices are intentionally NOT modelled here. No payment provider exists in this
 * repository (PHASE 0 §5.2) and roadmap §2.1 forbids fabricating commercial figures.
 * Pricing is a BUSINESS-05 concern behind the PaymentProvider abstraction.
 */

import { FEATURE_ORDER, type FeatureId } from './features.ts';
import type { PlanDefinition, PlanId, PlanLimits } from './types.ts';

function idx(feature: FeatureId): number {
  const i = FEATURE_ORDER.indexOf(feature);
  if (i < 0) throw new Error(`UNKNOWN_FEATURE:${feature}`);
  return i;
}

const NO_LIMITS: PlanLimits = {
  aiRequestsPerPeriod: null,
  backtestRunsPerPeriod: null,
  paperReplaysPerPeriod: null,
  researchExperimentsPerPeriod: null,
  exportsPerPeriod: null,
  alertsPerPeriod: null,
  apiCallsPerPeriod: null,
  communityPostsPerPeriod: null,
  marketplaceListings: null,
};

function limits(over: Partial<PlanLimits>): PlanLimits {
  return { ...NO_LIMITS, ...over };
}

const PLAN_LIST: readonly PlanDefinition[] = [
  {
    id: 'FREE',
    rank: 0,
    label: 'Free',
    // Explicit, small, and truthful. Deliberately excludes RESEARCH_CERTIFICATION.
    features: ['LEARNING', 'MARKET_DATA', 'PORTFOLIO', 'ALERTS'],
    inclusiveThrough: -1,
    limits: limits({
      aiRequestsPerPeriod: 10,
      backtestRunsPerPeriod: 0,
      paperReplaysPerPeriod: 1,
      researchExperimentsPerPeriod: 1,
      exportsPerPeriod: 0,
      alertsPerPeriod: 3,
      apiCallsPerPeriod: 0,
      communityPostsPerPeriod: 0,
      marketplaceListings: 0,
    }),
    marketplaceModels: ['FREE'],
    maxSeats: 1,
    individual: true,
    organization: false,
  },
  {
    id: 'PREMIUM',
    rank: 1,
    label: 'Premium',
    features: ['SCENARIO', 'RESEARCH', 'AI_ASSISTANT'],
    // inclusive through RESEARCH_CERTIFICATION in FEATURE_ORDER.
    inclusiveThrough: idx('RESEARCH_CERTIFICATION'),
    limits: limits({
      aiRequestsPerPeriod: 500,
      backtestRunsPerPeriod: 100,
      paperReplaysPerPeriod: 50,
      researchExperimentsPerPeriod: 100,
      exportsPerPeriod: 20,
      alertsPerPeriod: 50,
      apiCallsPerPeriod: 0,
      communityPostsPerPeriod: 20,
      marketplaceListings: 0,
    }),
    marketplaceModels: ['FREE', 'ONE_TIME'],
    maxSeats: 1,
    individual: true,
    organization: false,
  },
  {
    id: 'PRO',
    rank: 2,
    label: 'Pro',
    features: ['BACKTEST', 'PAPER_REPLAY', 'ADVANCED_MARKET_DATA'],
    inclusiveThrough: idx('ADVANCED_MARKET_DATA'),
    limits: limits({
      aiRequestsPerPeriod: 5_000,
      backtestRunsPerPeriod: 2_000,
      paperReplaysPerPeriod: 1_000,
      researchExperimentsPerPeriod: 2_000,
      exportsPerPeriod: 500,
      alertsPerPeriod: 500,
      apiCallsPerPeriod: 0,
      communityPostsPerPeriod: 200,
      marketplaceListings: 10,
    }),
    marketplaceModels: ['FREE', 'ONE_TIME', 'SUBSCRIPTION', 'BUNDLE'],
    maxSeats: 1,
    individual: true,
    organization: false,
  },
  {
    id: 'TEAM',
    rank: 3,
    label: 'Team',
    features: ['COMMUNITY_READ', 'COMMUNITY_WRITE', 'MARKETPLACE_READ'],
    inclusiveThrough: idx('B2B_TRAINING'),
    limits: limits({
      aiRequestsPerPeriod: 25_000,
      backtestRunsPerPeriod: 10_000,
      paperReplaysPerPeriod: 5_000,
      researchExperimentsPerPeriod: 10_000,
      exportsPerPeriod: 2_500,
      alertsPerPeriod: 2_500,
      apiCallsPerPeriod: 0,
      communityPostsPerPeriod: 1_000,
      marketplaceListings: 50,
    }),
    marketplaceModels: ['FREE', 'ONE_TIME', 'SUBSCRIPTION', 'BUNDLE'],
    maxSeats: 25,
    individual: false,
    organization: true,
  },
  {
    id: 'BUSINESS',
    rank: 4,
    label: 'Business',
    features: ['TEAM_WORKSPACE', 'MARKETPLACE_PUBLISH', 'STRATEGY_PUBLISH', 'B2B_TRAINING'],
    inclusiveThrough: idx('B2B_TRAINING'),
    limits: limits({
      aiRequestsPerPeriod: 100_000,
      backtestRunsPerPeriod: 50_000,
      paperReplaysPerPeriod: 25_000,
      researchExperimentsPerPeriod: 50_000,
      exportsPerPeriod: 10_000,
      alertsPerPeriod: 10_000,
      apiCallsPerPeriod: 0,
      communityPostsPerPeriod: 5_000,
      marketplaceListings: 250,
    }),
    marketplaceModels: ['FREE', 'ONE_TIME', 'SUBSCRIPTION', 'BUNDLE', 'ORGANIZATION_LICENSE'],
    maxSeats: 250,
    individual: false,
    organization: true,
  },
  {
    id: 'ENTERPRISE',
    rank: 5,
    label: 'Enterprise',
    features: ['API_ACCESS', 'EXPORT'],
    inclusiveThrough: FEATURE_ORDER.length - 1,
    limits: limits({}),
    marketplaceModels: ['FREE', 'ONE_TIME', 'SUBSCRIPTION', 'BUNDLE', 'ORGANIZATION_LICENSE'],
    maxSeats: null,
    individual: false,
    organization: true,
  },
];

export const PLANS: ReadonlyMap<PlanId, PlanDefinition> = new Map(PLAN_LIST.map((p) => [p.id, p]));

export const PLAN_IDS: readonly PlanId[] = PLAN_LIST.map((p) => p.id);

export const FREE_PLAN_ID: PlanId = 'FREE';

export function planExists(id: string): id is PlanId {
  return PLANS.has(id as PlanId);
}

export function requirePlan(id: string): PlanDefinition {
  const p = PLANS.get(id as PlanId);
  if (!p) throw new Error(`UNKNOWN_PLAN:${id}`);
  return p;
}

/** The explicit free plan. Roadmap §01.6 — there is no implicit free tier. */
export function freePlan(): PlanDefinition {
  return requirePlan(FREE_PLAN_ID);
}

/**
 * Materialise a plan's full feature set: explicit features plus the inclusive cut-off over
 * the canonical registry order. Deterministic and total.
 */
export function planFeatures(plan: PlanDefinition): readonly FeatureId[] {
  const out: FeatureId[] = [];
  const seen = new Set<FeatureId>();
  if (plan.inclusiveThrough >= 0) {
    for (let i = 0; i <= Math.min(plan.inclusiveThrough, FEATURE_ORDER.length - 1); i++) {
      const f = FEATURE_ORDER[i];
      if (!seen.has(f)) {
        seen.add(f);
        out.push(f);
      }
    }
  }
  for (const f of plan.features) {
    if (!seen.has(f)) {
      seen.add(f);
      out.push(f);
    }
  }
  return out;
}

export function planHasFeature(plan: PlanDefinition, feature: FeatureId): boolean {
  return planFeatures(plan).includes(feature);
}

export function planLimit(plan: PlanDefinition, field: keyof PlanLimits): number | null {
  return plan.limits[field];
}

/** Highest-ranked plan among the inputs. Deterministic; ties broken by declaration order. */
export function highestRankPlan(candidates: readonly PlanId[]): PlanId {
  if (candidates.length === 0) throw new Error('NO_PLAN_CANDIDATES');
  let best: PlanDefinition = requirePlan(candidates[0]);
  for (const id of candidates) {
    const p = requirePlan(id);
    if (p.rank > best.rank) best = p;
  }
  return best.id;
}

export function planAllowsSubjectKind(plan: PlanDefinition, kind: 'USER' | 'ORGANIZATION'): boolean {
  return kind === 'USER' ? plan.individual : plan.organization;
}

export function planAllowsMarketplaceModel(plan: PlanDefinition, model: string): boolean {
  return (plan.marketplaceModels as readonly string[]).includes(model);
}

/**
 * Stable fingerprint of a plan's commercial meaning.
 *
 * Stored on every subscription row so that a later change to this catalog cannot silently
 * rewrite what a historical subscription meant. Uses the same FNV-1a construction as the
 * existing RESEARCH and PAPER REPLAY lanes (src/lib/research/ExperimentEngine.ts:20,
 * src/lib/replay/ReplayManifest.ts:17) so fingerprints are comparable across lanes.
 */
export function planFingerprint(id: string): string {
  const plan = requirePlan(id);
  const canonical = JSON.stringify([
    plan.id,
    plan.rank,
    [...plan.features].sort(),
    plan.inclusiveThrough,
    plan.limits,
    [...plan.marketplaceModels].sort(),
    plan.maxSeats,
    plan.individual,
    plan.organization,
  ]);
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `PLAN_${plan.id}_${hash.toString(16).padStart(8, '0')}`;
}
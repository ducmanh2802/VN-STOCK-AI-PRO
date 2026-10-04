/**
 * BUSINESS-01 TESTS — plan resolution / entitlement / feature access / usage limits
 *                   expired / cancelled / trial / fail-closed behaviour
 */
import { describe, it, expect } from 'vitest';
import {
  FEATURE_ORDER,
  featureExists,
  implementedFeatures,
  isFeatureImplemented,
  unavailableFeatures,
  requireFeature,
} from '../features.ts';
import {
  FREE_PLAN_ID,
  PLANS,
  PLAN_IDS,
  freePlan,
  highestRankPlan,
  planAllowsMarketplaceModel,
  planAllowsSubjectKind,
  planFeatures,
  planFingerprint,
  planHasFeature,
  planLimit,
  requirePlan,
} from '../plans.ts';
import type { FeatureId } from '../features.ts';

describe('FeatureRegistry', () => {
  it('declares every feature exactly once and in a stable order', () => {
    expect(new Set(FEATURE_ORDER).size).toBe(FEATURE_ORDER.length);
    expect(featureExists('LEARNING')).toBe(true);
    expect(featureExists('NOPE')).toBe(false);
  });

  it('fails closed on an unregistered feature identifier', () => {
    expect(() => requireFeature('NOT_A_FEATURE')).toThrow('UNKNOWN_FEATURE:NOT_A_FEATURE');
    expect(() => requireFeature('')).toThrow('UNKNOWN_FEATURE:');
  });

  it('marks a feature implemented only when real evidence exists', () => {
    for (const f of implementedFeatures()) {
      const def = requireFeature(f);
      expect(def.status).toBe('IMPLEMENTED');
      expect(def.evidence).not.toBeNull();
      expect(def.evidence).toMatch(/^src\//);
    }
  });

  it('never declares a dead feature as implemented (roadmap §01.4)', () => {
    for (const f of unavailableFeatures()) {
      expect(isFeatureImplemented(f)).toBe(false);
      expect(requireFeature(f).evidence).toBeNull();
    }
  });

  it('covers the roadmap capability list that has real implementation', () => {
    const required: FeatureId[] = [
      'LEARNING',
      'ADVANCED_LEARNING',
      'RESEARCH',
      'BACKTEST',
      'PAPER_REPLAY',
      'PORTFOLIO',
      'ADVANCED_PORTFOLIO',
      'SCENARIO',
      'AI_ASSISTANT',
      'ALERTS',
      'MARKET_DATA',
      'ADVANCED_MARKET_DATA',
    ];
    for (const f of required) expect(isFeatureImplemented(f)).toBe(true);
  });
});

describe('PlanCatalog', () => {
  it('exposes a total plan map with unique monotonic ranks', () => {
    const ranks = PLAN_IDS.map((id) => requirePlan(id).rank);
    expect(new Set(ranks).size).toBe(ranks.length);
    for (let i = 1; i < ranks.length; i++) expect(ranks[i]).toBeGreaterThan(ranks[i - 1]);
  });

  it('rejects an unknown plan identifier', () => {
    expect(() => requirePlan('GOLD')).toThrow('UNKNOWN_PLAN:GOLD');
    expect(PLANS.size).toBe(PLAN_IDS.length);
  });

  it('FREE is explicit and never implicitly widened', () => {
    const free = freePlan();
    expect(free.id).toBe(FREE_PLAN_ID);
    expect(planFeatures(free)).toEqual(['LEARNING', 'MARKET_DATA', 'PORTFOLIO', 'ALERTS']);
    // FREE deliberately does not grant research certification.
    expect(planHasFeature(free, 'RESEARCH_CERTIFICATION')).toBe(false);
    expect(planHasFeature(free, 'BACKTEST')).toBe(false);
    expect(planLimit(free, 'backtestRunsPerPeriod')).toBe(0);
  });

  it('expands the inclusive tier cut-off deterministically', () => {
    const premium = requirePlan('PREMIUM');
    const features = planFeatures(premium);
    expect(new Set(features).size).toBe(features.length);
    // explicit features plus the inclusive cut-off
    expect(features).toContain('SCENARIO');
    expect(features).toContain('BACKTEST'); // inclusive cut-off reached RESEARCH_CERTIFICATION
    expect(features).toContain('RESEARCH');
    expect(features).not.toContain('PAPER_REPLAY');
    expect(planFeatures(premium)).toEqual(features);
  });

  it('resolves the highest rank plan deterministically', () => {
    expect(highestRankPlan(['FREE', 'PRO', 'PREMIUM'])).toBe('PRO');
    expect(highestRankPlan(['FREE'])).toBe('FREE');
    expect(highestRankPlan(['FREE', 'FREE'])).toBe('FREE');
    expect(() => highestRankPlan([])).toThrow('NO_PLAN_CANDIDATES');
  });

  it('separates individual plans from organization plans', () => {
    expect(planAllowsSubjectKind(requirePlan('PRO'), 'USER')).toBe(true);
    expect(planAllowsSubjectKind(requirePlan('PRO'), 'ORGANIZATION')).toBe(false);
    expect(planAllowsSubjectKind(requirePlan('TEAM'), 'ORGANIZATION')).toBe(true);
    expect(planAllowsSubjectKind(requirePlan('TEAM'), 'USER')).toBe(false);
    expect(planAllowsSubjectKind(requirePlan('FREE'), 'ORGANIZATION')).toBe(false);
  });

  it('restricts marketplace commercial models per plan', () => {
    expect(planAllowsMarketplaceModel(freePlan(), 'FREE')).toBe(true);
    expect(planAllowsMarketplaceModel(freePlan(), 'SUBSCRIPTION')).toBe(false);
    expect(planAllowsMarketplaceModel(requirePlan('PRO'), 'SUBSCRIPTION')).toBe(true);
    expect(planAllowsMarketplaceModel(requirePlan('PRO'), 'ORGANIZATION_LICENSE')).toBe(false);
  });

  it('produces a stable fingerprint that changes when commercial meaning changes', () => {
    const a = planFingerprint('PRO');
    expect(a).toBe(planFingerprint('PRO'));
    expect(a).toMatch(/^PLAN_PRO_[0-9a-f]{8}$/);
    expect(planFingerprint('FREE')).not.toBe(a);
  });

  it('ENTERPRISE is the only plan with no seat ceiling', () => {
    expect(requirePlan('ENTERPRISE').maxSeats).toBeNull();
    expect(requirePlan('FREE').maxSeats).toBe(1);
    expect(requirePlan('BUSINESS').maxSeats).toBeGreaterThan(requirePlan('TEAM').maxSeats);
  });
});
/**
 * BUSINESS-03 TESTS — versioning / publication / certification / performance provenance
 *                     ranking / visibility / ownership / marketplace entitlement
 *                     commercial state / no fake performance / no version mutation
 */
import { describe, it, expect } from 'vitest';
import { MarketplaceEngine } from '../MarketplaceEngine.ts';
import {
  emptyEvidence,
  gateAllMetrics,
  gateMetric,
  gateProvenance,
  missingProvenance,
  provenanceComplete,
} from '../performanceGate.ts';
import {
  EVIDENCE_LADDER_ORDER,
  RANKING_METHODOLOGY,
  creatorEconomicsBalanced,
  evidence,
  noEvidence,
  versionRef,
  type PerformanceEvidence,
  type PublicationStatus,
  type StrategyVersion,
} from '../types.ts';
import { viewer } from '../../community/__tests__/viewers.ts';

const NOW = '2026-10-15T00:00:00Z';

function completeEvidence(): PerformanceEvidence {
  return {
    dataset: evidence('VN30 ADJUSTED 2026-10-01'),
    period: evidence({ start: '2020-01-01', end: '2025-12-31' }),
    strategyVersion: evidence('v2.1.0'),
    costModel: evidence('BPS 15 + tax 10'),
    executionModel: evidence('next-bar-fill, lot 100'),
    validationState: evidence('OUT_OF_SAMPLE_PASSED'),
  };
}

function base(over: Partial<Parameters<typeof MarketplaceEngine.createVersion>[0]> = {}) {
  return MarketplaceEngine.createVersion({
    strategyId: 's1',
    authorUserId: 'alice',
    name: 'Trend filter',
    description: 'A moving-average filter with a volatility overlay.',
    universe: 'VN30',
    assetClass: 'EQUITY',
    rules: { entry: 'sma20 > sma60', exit: 'sma20 < sma60' },
    parameters: { fast: '20', slow: '60' },
    riskModel: 'vol-target 12%',
    executionModel: 'next-bar-fill, lot 100',
    costModel: 'BPS 15 + tax 10',
    performanceEvidence: completeEvidence(),
    performance: [
      { metric: 'CAGR_PCT', value: 18.2 },
      { metric: 'SHARPE', value: 1.1 },
      { metric: 'MAX_DRAWDOWN_PCT', value: -22 },
    ],
    commercialModel: 'FREE',
    visibility: 'PUBLIC',
    createdAt: NOW,
    previousVersionId: null,
    ...over,
  });
}

// -----------------------------------------------------------------------------

describe('PerformanceGate — no fake performance (roadmap §03.2)', () => {
  it('refuses to display a metric when ANY provenance field is missing', () => {
    const fields = ['dataset', 'period', 'strategyVersion', 'costModel', 'executionModel', 'validationState'] as const;
    for (const field of fields) {
      const incomplete: PerformanceEvidence = { ...completeEvidence(), [field]: noEvidence('author did not record it') };
      const result = gateProvenance(incomplete);
      expect(result.displayable).toBe(false);
      if (result.displayable === false) {
        expect(result.missing).toEqual([field]);
        expect(result.marker).toBe('NOT_AVAILABLE');
      }
      // and no metric can be rendered from it
      const m = gateMetric({ metric: 'CAGR_PCT', value: 37.4 }, incomplete);
      expect(m.displayable).toBe(false);
    }
  });

  it('reports every missing field at once, not just the first', () => {
    const empty = emptyEvidence();
    expect(missingProvenance(empty)).toHaveLength(6);
    expect(provenanceComplete(empty)).toBe(false);
  });

  it('renders a metric only with complete provenance, carrying the provenance with it', () => {
    const g = gateMetric({ metric: 'CAGR_PCT', value: 18.2 }, completeEvidence());
    expect(g.displayable).toBe(true);
    if (g.displayable) {
      expect(g.value.value).toBe(18.2);
      expect(g.value.provenance.dataset).toBe('VN30 ADJUSTED 2026-10-01');
      expect(g.value.provenance.strategyVersion).toBe('v2.1.0');
    }
  });

  it('treats a non-finite metric value as unavailable rather than rendering it', () => {
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const g = gateMetric({ metric: 'CAGR_PCT', value: v }, completeEvidence());
      expect(g.displayable).toBe(false);
      if (g.displayable === false) expect(g.missing).toContain('nonFiniteValue');
    }
  });

  it('drops a non-finite metric but still renders the rest', () => {
    const g = gateAllMetrics(
      [{ metric: 'CAGR_PCT', value: 10 }, { metric: 'SHARPE', value: Number.NaN }],
      completeEvidence(),
    );
    expect(g.marker).toBe('AVAILABLE');
    expect(g.metrics).toHaveLength(1);
    expect(g.metrics[0].metric).toBe('CAGR_PCT');
  });
});

// -----------------------------------------------------------------------------

describe('MarketplaceEngine — publication (roadmap §03.3, §03.4)', () => {
  it('starts as DRAFT with exactly one evidence flag', () => {
    const v = base();
    expect(v.publication).toBe('DRAFT');
    expect(v.version).toBe(1);
    expect([...v.evidence]).toEqual(['AUTHORED']);
  });

  it('allows the documented publication transitions', () => {
    let v = base();
    v = MarketplaceEngine.transition(v, 'SUBMITTED');
    v = MarketplaceEngine.transition(v, 'UNDER_REVIEW');
    v = MarketplaceEngine.transition(v, 'PUBLISHED');
    expect(v.publication).toBe('PUBLISHED');
    expect(v.evidence.has('PUBLISHED')).toBe(true);
  });

  it('rejects illegal publication transitions', () => {
    expect(() => MarketplaceEngine.transition(base(), 'PUBLISHED')).toThrow('INVALID_PUBLICATION_TRANSITION:DRAFT->PUBLISHED');
    const published = MarketplaceEngine.transition(MarketplaceEngine.transition(MarketplaceEngine.transition(base(), 'SUBMITTED'), 'UNDER_REVIEW'), 'PUBLISHED');
    expect(() => MarketplaceEngine.transition(published, 'DRAFT')).toThrow('INVALID_PUBLICATION_TRANSITION:PUBLISHED->DRAFT');
    const archived = MarketplaceEngine.transition(published, 'ARCHIVED');
    expect(() => MarketplaceEngine.transition(archived, 'PUBLISHED')).toThrow('INVALID_PUBLICATION_TRANSITION:ARCHIVED->PUBLISHED');
  });

  it('PUBLISHING does NOT imply VERIFIED or CERTIFIED (roadmap §03.4)', () => {
    let v = base();
    v = MarketplaceEngine.transition(MarketplaceEngine.transition(v, 'SUBMITTED'), 'UNDER_REVIEW');
    v = MarketplaceEngine.transition(v, 'PUBLISHED');
    expect(v.publication).toBe('PUBLISHED');
    expect(v.evidence.has('VERIFIED')).toBe(false);
    expect(v.evidence.has('CERTIFIED')).toBe(false);
    expect(v.evidence.has('BACKTESTED')).toBe(false);
    expect(MarketplaceEngine.evidenceLevel(v)).toBe('PUBLISHED');
  });

  it('does not let a flag be asserted without its precondition', () => {
    const v = base();
    expect(MarketplaceEngine.canAssert(v, 'VERIFIED')).toBe(false);
    expect(MarketplaceEngine.canAssert(v, 'CERTIFIED')).toBe(false);
    const backtested = MarketplaceEngine.withEvidence(v, 'BACKTESTED');
    expect(MarketplaceEngine.canAssert(backtested, 'VERIFIED')).toBe(true);
    // CERTIFIED still requires its own assertion: BACKTESTED never implies CERTIFIED
    expect(MarketplaceEngine.canAssert(backtested, 'CERTIFIED')).toBe(false);
  });

  it('reports the strongest evidence rung without collapsing the ladder', () => {
    let v = base();
    for (const flag of ['BACKTESTED', 'OUT_OF_SAMPLE_TESTED', 'PAPER_TESTED', 'CERTIFIED'] as const) {
      v = MarketplaceEngine.withEvidence(v, flag);
    }
    expect(MarketplaceEngine.evidenceLevel(v)).toBe('CERTIFIED');
    expect(v.evidence.size).toBe(5);
    expect(EVIDENCE_LADDER_ORDER).toContain('VERIFIED');
  });
});

// -----------------------------------------------------------------------------

describe('MarketplaceEngine — versioning (roadmap §03.5)', () => {
  it('creates a new version and leaves the previous one byte-identical', () => {
    const v1 = base();
    const snapshot = JSON.stringify({ p: v1.performance, e: v1.performanceEvidence, ver: v1.version });
    const v2 = MarketplaceEngine.nextVersion(v1, { at: '2026-11-01T00:00:00Z', description: 'Revised description.' });
    expect(v2.version).toBe(2);
    expect(v2.previousVersionId).toBe('s1@v1');
    expect(v1.version).toBe(1);
    expect(JSON.stringify({ p: v1.performance, e: v1.performanceEvidence, ver: v1.version })).toBe(snapshot);
    expect(v2.description).toBe('Revised description.');
    expect(v1.description).not.toBe(v2.description);
  });

  it('does not let a new version inherit the previous version\'s evidence', () => {
    const v1 = MarketplaceEngine.withEvidence(base(), 'CERTIFIED');
    const v2 = MarketplaceEngine.nextVersion(v1, { at: NOW });
    expect([...v1.evidence]).toContain('CERTIFIED');
    expect([...v2.evidence]).toEqual(['AUTHORED']);
  });

  it('a new version starts as DRAFT regardless of the prior publication state', () => {
    const published = MarketplaceEngine.transition(
      MarketplaceEngine.transition(MarketplaceEngine.transition(base(), 'SUBMITTED'), 'UNDER_REVIEW'),
      'PUBLISHED',
    );
    expect(MarketplaceEngine.nextVersion(published, { at: NOW }).publication).toBe('DRAFT');
  });

  it('carries forward the prior performance until the new version supplies its own', () => {
    const v1 = base();
    const carried = MarketplaceEngine.nextVersion(v1, { at: NOW });
    expect(carried.performance).toEqual(v1.performance);
    const replaced = MarketplaceEngine.nextVersion(v1, { at: NOW, performance: [{ metric: 'CAGR_PCT', value: 5 }] });
    expect(replaced.performance).toEqual([{ metric: 'CAGR_PCT', value: 5 }]);
    expect(v1.performance).toHaveLength(3);
  });
});

// -----------------------------------------------------------------------------

describe('MarketplaceEngine — entitlement and ownership', () => {
  it('refuses submission by a non-author', () => {
    expect(() => MarketplaceEngine.submitForPublication(base(), { viewer: viewer({ userId: 'bob' }), planId: 'PRO', at: NOW }))
      .toThrow('FORBIDDEN:NOT_THE_AUTHOR');
    expect(() => MarketplaceEngine.submitForPublication(base(), { viewer: { userId: null, organizationIds: [], workspaceIds: [], canModerate: false }, planId: 'PRO', at: NOW }))
      .toThrow('FORBIDDEN:AUTHENTICATION_REQUIRED');
  });

  it('refuses a commercial model the author plan does not permit', () => {
    expect(() => MarketplaceEngine.submitForPublication(base({ commercialModel: 'SUBSCRIPTION' }), { viewer: viewer({ userId: 'alice' }), planId: 'FREE', at: NOW }))
      .toThrow('MARKETPLACE_MODEL_NOT_ALLOWED:SUBSCRIPTION');
  });

  it('refuses publishing when the plan has zero listings (roadmap §01.8 marketplace entitlement)', () => {
    expect(() => MarketplaceEngine.submitForPublication(base(), { viewer: viewer({ userId: 'alice' }), planId: 'FREE', at: NOW }))
      .toThrow('MARKETPLACE_PUBLISHING_NOT_IN_PLAN');
  });

  it('accepts submission on a plan that permits it', () => {
    const v = MarketplaceEngine.submitForPublication(base(), { viewer: viewer({ userId: 'alice' }), planId: 'PRO', at: NOW });
    expect(v.publication).toBe('SUBMITTED');
  });

  it('UNLISTED listings stay reachable by ref for authenticated users but are never public', () => {
    const v = base({ visibility: 'UNLISTED' });
    expect(MarketplaceEngine.canView(v, { userId: null, organizationIds: [], workspaceIds: [], canModerate: false })).toBe(false);
    expect(MarketplaceEngine.canView(v, viewer({ userId: 'bob' }))).toBe(true);
  });
});

// -----------------------------------------------------------------------------

describe('MarketplaceEngine — ranking (roadmap §03.6, §03.7)', () => {
  const ranked = (over: Partial<StrategyVersion> = {}, rankOver: Record<string, unknown> = {}) => ({
    version: { ...base(), ...over },
    sampleSize: 250,
    paperTradeCount: 50,
    outOfSample: true,
    ...rankOver,
  });

  it('excludes a version whose provenance does not resolve, with a reason', () => {
    const { ranking, excluded } = MarketplaceEngine.rank([
      { version: base(), sampleSize: 100, paperTradeCount: 10, outOfSample: false },
      { version: base({ strategyId: 's2', performanceEvidence: emptyEvidence() }), sampleSize: 100, paperTradeCount: 10, outOfSample: false },
    ]);
    expect(ranking).toHaveLength(1);
    expect(excluded).toEqual([{ strategyRef: 's2@v1', reason: 'PERFORMANCE_PROVENANCE_INCOMPLETE' }]);
  });

  it('never ranks on raw return: a higher CAGR with worse risk does not win', () => {
    const safe = { ...base(), strategyId: 'safe' };
    const risky = {
      ...base(),
      strategyId: 'risky',
      performance: [
        { metric: 'CAGR_PCT' as const, value: 95 },
        { metric: 'SHARPE' as const, value: 0.2 },
        { metric: 'MAX_DRAWDOWN_PCT' as const, value: -70 },
      ],
    };
    const { ranking } = MarketplaceEngine.rank([
      { version: safe, sampleSize: 250, paperTradeCount: 50, outOfSample: true },
      { version: risky, sampleSize: 250, paperTradeCount: 50, outOfSample: true },
    ]);
    expect(ranking[0].strategyRef).toBe('safe@v1');
    // the raw-return leader is ranked second despite +95% CAGR
    expect(ranking.map((r) => r.strategyRef)).toEqual(['safe@v1', 'risky@v1']);
  });

  it('publishes its methodology and every score component', () => {
    const { ranking, methodologyVersion } = MarketplaceEngine.rank([ranked()]);
    expect(methodologyVersion).toBe('v1.0.0-business-03-rank');
    expect(RANKING_METHODOLOGY.length).toBeGreaterThan(4);
    expect(Object.keys(ranking[0].components)).toEqual(
      expect.arrayContaining(['sharpe', 'drawdownPenalty', 'sampleSizeConfidence', 'validationBonus', 'paperEvidence']),
    );
  });

  it('lists missing components instead of scoring them as zero', () => {
    const { ranking } = MarketplaceEngine.rank([{ version: base(), sampleSize: null, paperTradeCount: null, outOfSample: false }]);
    expect(ranking[0].missing).toEqual(['sampleSize', 'paperTradeCount']);
    expect(ranking[0].components.sampleSizeConfidence).toBeUndefined();
  });

  it('is deterministic, including tie-break order', () => {
    const input = [
      { version: base({ strategyId: 'a' }), sampleSize: 100, paperTradeCount: 10, outOfSample: false },
      { version: base({ strategyId: 'b' }), sampleSize: 100, paperTradeCount: 10, outOfSample: false },
    ];
    const first = MarketplaceEngine.rank(input);
    const second = MarketplaceEngine.rank([...input].reverse());
    expect(first.ranking.map((r) => r.strategyRef)).toEqual(second.ranking.map((r) => r.strategyRef));
  });

  it('excludes a version missing a risk-adjusted metric rather than defaulting it', () => {
    const { ranking, excluded } = MarketplaceEngine.rank([
      { version: base({ performance: [{ metric: 'CAGR_PCT', value: 10 }] }), sampleSize: 10, paperTradeCount: 1, outOfSample: false },
    ]);
    expect(ranking).toHaveLength(0);
    expect(excluded[0].reason).toBe('MISSING_RISK_ADJUSTED_METRIC');
  });
});

// -----------------------------------------------------------------------------

describe('MarketplaceEngine — creator economics (roadmap §03.9)', () => {
  it('produces NOT_APPLICABLE rather than a fabricated payout when nothing settled', () => {
    const e = MarketplaceEngine.creatorEconomics({ listingRef: 's1@v1', settledGrossMinor: null, platformFeeBps: 1500 });
    expect(e.grossRevenueMinor).toBeNull();
    expect(e.creatorShareMinor).toBeNull();
    expect(e.payoutStatus).toBe('NOT_APPLICABLE');
  });

  it('keeps gross, platform fee and creator share separate and balanced', () => {
    const e = MarketplaceEngine.creatorEconomics({ listingRef: 's1@v1', settledGrossMinor: 100_000, platformFeeBps: 1500 });
    expect(e.platformFeeMinor).toBe(15_000);
    expect(e.creatorShareMinor).toBe(85_000);
    expect(creatorEconomicsBalanced(e)).toBe(true);
  });

  it('rejects an invalid fee or negative settled amount', () => {
    expect(() => MarketplaceEngine.creatorEconomics({ listingRef: 'x', settledGrossMinor: -1, platformFeeBps: 1500 })).toThrow('INVALID_SETTLED_GROSS');
    expect(() => MarketplaceEngine.creatorEconomics({ listingRef: 'x', settledGrossMinor: 100, platformFeeBps: 20_000 })).toThrow('INVALID_PLATFORM_FEE_BPS');
  });

  it('detects an unbalanced decomposition', () => {
    const e = MarketplaceEngine.creatorEconomics({ listingRef: 'x', settledGrossMinor: 100_000, platformFeeBps: 1500 });
    expect(creatorEconomicsBalanced({ ...e, creatorShareMinor: 90_000 })).toBe(false);
    // refunds + tax exceeding the creator share is also a violation
    expect(creatorEconomicsBalanced({ ...e, refundMinor: 80_000, taxWithheldMinor: 10_000 })).toBe(false);
  });
});

// -----------------------------------------------------------------------------

describe('MarketplaceEngine — validation (roadmap §03.1)', () => {
  it('requires universe, asset class, rules and all three models', () => {
    const b = {
      strategyId: 's', authorUserId: 'a', name: 'n', description: 'd', universe: 'VN30', assetClass: 'EQUITY',
      rules: { r: 'v' }, parameters: {}, riskModel: 'rm', executionModel: 'em', costModel: 'cm',
      performanceEvidence: completeEvidence(), performance: [], commercialModel: 'FREE' as const,
      visibility: 'PUBLIC' as const, createdAt: NOW, previousVersionId: null,
    };
    expect(() => MarketplaceEngine.createVersion({ ...b, universe: '  ' })).toThrow('STRATEGY_UNIVERSE_REQUIRED');
    expect(() => MarketplaceEngine.createVersion({ ...b, assetClass: '' })).toThrow('STRATEGY_ASSET_CLASS_REQUIRED');
    expect(() => MarketplaceEngine.createVersion({ ...b, rules: {} })).toThrow('STRATEGY_RULES_REQUIRED');
    expect(() => MarketplaceEngine.createVersion({ ...b, riskModel: '' })).toThrow('RISK_MODEL_REQUIRED');
    expect(() => MarketplaceEngine.createVersion({ ...b, executionModel: '' })).toThrow('EXECUTION_MODEL_REQUIRED');
    expect(() => MarketplaceEngine.createVersion({ ...b, costModel: '' })).toThrow('COST_MODEL_REQUIRED');
  });

  it('creates a listing whose provenance is incomplete — publishing is still possible', () => {
    const v = base({ performanceEvidence: emptyEvidence() });
    const submitted = MarketplaceEngine.submitForPublication(v, { viewer: viewer({ userId: 'alice' }), planId: 'PRO', at: NOW });
    expect(submitted.publication).toBe('SUBMITTED');
    // but its performance renders as explicitly unavailable, not as a number
    const perf = MarketplaceEngine.performanceForDisplay(submitted);
    expect(perf.status).toBe('NOT_AVAILABLE');
    if (perf.status === 'NOT_AVAILABLE') expect(perf.missing).toHaveLength(6);
  });

  it('versionRef is stable and readable', () => {
    expect(versionRef(base())).toBe('s1@v1');
  });
});

export type { PublicationStatus };
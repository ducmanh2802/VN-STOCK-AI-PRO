/**
 * BUSINESS-03 — MARKETPLACE ENGINE
 * ================================
 * Pure domain rules for the strategy/research marketplace. No I/O, no clock, no database.
 *
 * Guarantees:
 *  §03.1 a publication carries its universe, asset class, rules, parameters and all three
 *        models (risk / execution / cost)
 *  §03.4 PUBLISHED, VERIFIED and CERTIFIED are distinct; publication never implies validation
 *  §03.5 an update creates a new version; a prior version's recorded performance is immutable
 *  §03.6/§03.7 ranking is risk-adjusted, methodology-exposed, and never raw-return ordered
 *  §03.9 creator money stays decomposed; there is no payout balance to fabricate
 */

import {
  EVIDENCE_LADDER_RANK,
  PUBLICATION_TRANSITIONS,
  type CreatorEconomics,
  type EvidenceFlag,
  type PerformanceEvidence,
  type PublicationStatus,
  type RankInput,
  type RankScore,
  type StrategyVersion,
  versionRef,
} from './types.ts';
import { gateAllMetrics, type ListingPerformance } from './performanceGate.ts';
import { planAllowsMarketplaceModel, requirePlan } from '../plans.ts';
import type { PlanId } from '../types.ts';
import type { ViewerContext } from '../community/types.ts';

export const MARKETPLACE_VERSION = 'v1.0.0-business-03';

export interface CreateStrategyVersionInput {
  readonly strategyId: string;
  readonly authorUserId: string;
  readonly name: string;
  readonly description: string;
  readonly universe: string;
  readonly assetClass: string;
  readonly rules: Readonly<Record<string, string>>;
  readonly parameters: Readonly<Record<string, string>>;
  readonly riskModel: string;
  readonly executionModel: string;
  readonly costModel: string;
  readonly performanceEvidence: PerformanceEvidence;
  readonly performance: StrategyVersion['performance'];
  readonly commercialModel: StrategyVersion['commercialModel'];
  readonly visibility: StrategyVersion['visibility'];
  readonly createdAt: string;
  readonly previousVersionId: string | null;
}

export class MarketplaceEngine {
  // ---------------------------------------------------------------- create

  /**
   * Create version 1.
   *
   * Every version starts with exactly one evidence flag — AUTHORED — and no others.
   * In particular it does NOT start VERIFIED, because nothing has verified it yet. Starting
   * a version as PUBLISHED or CERTIFIED would be the fabrication this phase exists to stop.
   */
  static createVersion(input: CreateStrategyVersionInput): StrategyVersion {
    if (input.strategyId.trim() === '') throw new Error('INVALID_STRATEGY_ID');
    if (input.authorUserId.trim() === '') throw new Error('INVALID_AUTHOR_ID');
    if (input.name.trim() === '') throw new Error('STRATEGY_NAME_REQUIRED');
    if (input.description.trim() === '') throw new Error('STRATEGY_DESCRIPTION_REQUIRED');
    if (input.universe.trim() === '') throw new Error('STRATEGY_UNIVERSE_REQUIRED');
    if (input.assetClass.trim() === '') throw new Error('STRATEGY_ASSET_CLASS_REQUIRED');
    if (Object.keys(input.rules).length === 0) throw new Error('STRATEGY_RULES_REQUIRED');
    // §03.1 requires all three models to be stated. A strategy that omits its cost model
    // cannot have its performance interpreted, so it cannot be published with performance.
    if (input.riskModel.trim() === '') throw new Error('RISK_MODEL_REQUIRED');
    if (input.executionModel.trim() === '') throw new Error('EXECUTION_MODEL_REQUIRED');
    if (input.costModel.trim() === '') throw new Error('COST_MODEL_REQUIRED');
    if (Number.isNaN(Date.parse(input.createdAt))) throw new Error('INVALID_CREATED_AT');

    return Object.freeze({
      strategyId: input.strategyId,
      version: 1,
      authorUserId: input.authorUserId,
      name: input.name,
      description: input.description,
      universe: input.universe,
      assetClass: input.assetClass,
      rules: Object.freeze({ ...input.rules }),
      parameters: Object.freeze({ ...input.parameters }),
      riskModel: input.riskModel,
      executionModel: input.executionModel,
      costModel: input.costModel,
      evidence: new Set<EvidenceFlag>(['AUTHORED']),
      performanceEvidence: input.performanceEvidence,
      performance: [...input.performance],
      publication: 'DRAFT',
      commercialModel: input.commercialModel,
      visibility: input.visibility,
      createdAt: input.createdAt,
      previousVersionId: input.previousVersionId,
    });
  }

  // ---------------------------------------------------------------- versioning (§03.5)

  /**
   * Create the next version from an existing one.
   *
   * The prior version is returned untouched — it is a frozen value and this function has no
   * reference capable of mutating it. Its `performance` array and `performanceEvidence` are
   * carried forward verbatim, so a new version can never retroactively rewrite the numbers
   * recorded against an older one.
   */
  static nextVersion(
    previous: StrategyVersion,
    change: {
      readonly name?: string;
      readonly description?: string;
      readonly rules?: Readonly<Record<string, string>>;
      readonly parameters?: Readonly<Record<string, string>>;
      readonly performanceEvidence?: PerformanceEvidence;
      readonly performance?: StrategyVersion['performance'];
      readonly at: string;
    },
  ): StrategyVersion {
    if (Number.isNaN(Date.parse(change.at))) throw new Error('INVALID_CREATED_AT');

    return Object.freeze({
      strategyId: previous.strategyId,
      version: previous.version + 1,
      authorUserId: previous.authorUserId,
      name: change.name ?? previous.name,
      description: change.description ?? previous.description,
      universe: previous.universe,
      assetClass: previous.assetClass,
      rules: Object.freeze({ ...(change.rules ?? previous.rules) }),
      parameters: Object.freeze({ ...(change.parameters ?? previous.parameters) }),
      riskModel: previous.riskModel,
      executionModel: previous.executionModel,
      costModel: previous.costModel,
      // A new version starts with AUTHORED + PUBLISHED-history only. Evidence flags are
      // re-earned: v2 does not inherit v1's backtest, because v2 is different code.
      evidence: new Set<EvidenceFlag>(['AUTHORED']),
      performanceEvidence: change.performanceEvidence ?? previous.performanceEvidence,
      performance: change.performance === undefined ? previous.performance : [...change.performance],
      publication: 'DRAFT',
      commercialModel: previous.commercialModel,
      visibility: previous.visibility,
      createdAt: change.at,
      previousVersionId: versionRef(previous),
    });
  }

  // ---------------------------------------------------------------- evidence (§15)

  /** Record evidence on a version. Immutably. Never adds implied flags. */
  static withEvidence(v: StrategyVersion, flag: EvidenceFlag): StrategyVersion {
    if (v.evidence.has(flag)) return v;
    return Object.freeze({ ...v, evidence: new Set([...v.evidence, flag]) });
  }

  /**
   * Can `flag` be asserted? A lower-rung flag may never be implied by a higher one.
   * PUBLISHING never implies VERIFIED; this is the §03.4 check.
   */
  static canAssert(v: StrategyVersion, flag: EvidenceFlag): boolean {
    switch (flag) {
      case 'AUTHORED':
      case 'PUBLISHED':
        return true;
      case 'VERIFIED':
      case 'BACKTESTED':
        return v.evidence.has('BACKTESTED') || v.evidence.has('VERIFIED');
      case 'OUT_OF_SAMPLE_TESTED':
        return v.evidence.has('OUT_OF_SAMPLE_TESTED');
      case 'PAPER_TESTED':
        return v.evidence.has('PAPER_TESTED');
      case 'CERTIFIED':
        return v.evidence.has('CERTIFIED');
      default: {
        const exhaustive: never = flag;
        throw new Error(`UNKNOWN_EVIDENCE_FLAG:${String(exhaustive)}`);
      }
    }
  }

  /** The strongest evidence rung present. A display label, never an authorization input. */
  static evidenceLevel(v: StrategyVersion): EvidenceFlag {
    let best: EvidenceFlag = 'AUTHORED';
    for (const f of v.evidence) {
      if (EVIDENCE_LADDER_RANK[f] > EVIDENCE_LADDER_RANK[best]) best = f;
    }
    return best;
  }

  // ---------------------------------------------------------------- publication (§03.3)

  static canTransition(from: PublicationStatus, to: PublicationStatus): boolean {
    return PUBLICATION_TRANSITIONS[from].includes(to);
  }

  /**
   * Change publication status. Illegal transitions throw.
   * Moving out of PUBLISHED always leaves the evidence ladder untouched, so deprecating a
   * listing never erases the record of what had been verified about it.
   */
  static transition(v: StrategyVersion, to: PublicationStatus): StrategyVersion {
    if (!MarketplaceEngine.canTransition(v.publication, to)) {
      throw new Error(`INVALID_PUBLICATION_TRANSITION:${v.publication}->${to}`);
    }
    const next = Object.freeze({ ...v, publication: to });
    return to === 'PUBLISHED' ? MarketplaceEngine.withEvidence(next, 'PUBLISHED') : next;
  }

  /**
   * Submit for publication. Enforces that the author is the submitter, and that the
   * commercial model is one the author's plan permits.
   */
  static submitForPublication(
    v: StrategyVersion,
    input: { readonly viewer: ViewerContext; readonly planId: PlanId; readonly at: string },
  ): StrategyVersion {
    if (input.viewer.userId === null) throw new Error('FORBIDDEN:AUTHENTICATION_REQUIRED');
    if (input.viewer.userId !== v.authorUserId) throw new Error('FORBIDDEN:NOT_THE_AUTHOR');

    const plan = requirePlan(input.planId);
    if (!planAllowsMarketplaceModel(plan, v.commercialModel)) {
      throw new Error(`MARKETPLACE_MODEL_NOT_ALLOWED:${v.commercialModel}`);
    }
    const listings = plan.limits.marketplaceListings;
    if (listings === 0) throw new Error('MARKETPLACE_PUBLISHING_NOT_IN_PLAN');

    return MarketplaceEngine.transition(v, 'SUBMITTED');
  }

  // ---------------------------------------------------------------- visibility

  static canView(v: StrategyVersion, viewer: ViewerContext): boolean {
    if (v.visibility === 'PUBLIC') return true;
    if (viewer.userId === null) return false;
    if (viewer.userId === v.authorUserId) return true;
    // UNLISTED is reachable by ref by any authenticated user, but never listed.
    return true;
  }

  // ---------------------------------------------------------------- performance display

  /** The only sanctioned rendering of a version's performance. */
  static performanceForDisplay(v: StrategyVersion): ListingPerformance {
    const gated = gateAllMetrics(v.performance, v.performanceEvidence);
    if (gated.marker === 'NOT_AVAILABLE') {
      return {
        status: 'NOT_AVAILABLE',
        missing: gated.missing,
        reason: 'PERFORMANCE_PROVENANCE_INCOMPLETE',
      };
    }
    if (gated.provenance === null) {
      return { status: 'NOT_AVAILABLE', missing: gated.missing, reason: 'PERFORMANCE_PROVENANCE_INCOMPLETE' };
    }
    return { status: 'AVAILABLE', metrics: gated.metrics, provenance: gated.provenance };
  }

  // ---------------------------------------------------------------- ranking (§03.6/§03.7)

  /**
   * Ranked candidates. Returns an EMPTY list when provenance is incomplete for every
   * candidate rather than ranking on partial data.
   *
   * Raw return is never an input. A version whose provenance does not resolve is excluded
   * with a reason, not silently scored as zero — scoring it as zero would put unknown
   * strategies at the bottom, which reads as "we evaluated them and they were bad".
   */
  static rank(inputs: readonly RankInput[]): {
    readonly ranking: readonly RankScore[];
    readonly excluded: readonly { strategyRef: string; reason: string }[];
    readonly methodologyVersion: string;
  } {
    const scored: RankScore[] = [];
    const excluded: { strategyRef: string; reason: string }[] = [];

    for (const input of inputs) {
      const ref = versionRef(input.version);
      const perf = MarketplaceEngine.performanceForDisplay(input.version);
      if (perf.status !== 'AVAILABLE') {
        excluded.push({ strategyRef: ref, reason: 'PERFORMANCE_PROVENANCE_INCOMPLETE' });
        continue;
      }

      const metrics = new Map(perf.metrics.map((m) => [m.metric, m.value]));
      const sharpe = metrics.get('SHARPE');
      const maxDd = metrics.get('MAX_DRAWDOWN_PCT');
      if (sharpe === undefined || maxDd === undefined) {
        excluded.push({ strategyRef: ref, reason: 'MISSING_RISK_ADJUSTED_METRIC' });
        continue;
      }

      const components: Record<string, number> = {};
      const missing: string[] = [];

      components.sharpe = Math.min(Math.max(sharpe, -3), 3) / 3;
      components.drawdownPenalty = -Math.min(Math.max(Math.abs(maxDd), 0), 60) / 60;

      if (input.sampleSize === null) {
        missing.push('sampleSize');
      } else {
        components.sampleSizeConfidence = Math.min(input.sampleSize, 300) / 300;
      }

      components.validationBonus = input.outOfSample ? 0.1 : 0;

      if (input.paperTradeCount === null) {
        missing.push('paperTradeCount');
      } else {
        components.paperEvidence = Math.min(input.paperTradeCount, 100) / 100 * 0.1;
      }

      // Negative components are floored at 0 so a version is not ranked below "no evidence";
      // the missing-component list is what communicates uncertainty, not a negative score.
      const score = (Object.values(components) as number[]).reduce((sum, v) => sum + Math.max(v, 0), 0);

      scored.push({ strategyRef: ref, score: Number(score.toFixed(6)), components, missing });
    }

    scored.sort((a, b) => (b.score === a.score ? a.strategyRef.localeCompare(b.strategyRef) : b.score - a.score));
    return { ranking: scored, excluded, methodologyVersion: 'v1.0.0-business-03-rank' };
  }

  // ---------------------------------------------------------------- creator economics (§03.9)

  /**
   * Build creator economics from a SETTLED ledger amount. With no settled amount there is
   * no economics record beyond NOT_APPLICABLE — there is deliberately no way to invent a
   * payout balance.
   */
  static creatorEconomics(input: {
    readonly listingRef: string;
    readonly settledGrossMinor: number | null;
    readonly platformFeeBps: number;
    readonly refundMinor?: number;
    readonly taxWithheldMinor?: number;
  }): CreatorEconomics {
    if (input.settledGrossMinor === null) {
      return {
        listingRef: input.listingRef,
        grossRevenueMinor: null,
        platformFeeMinor: null,
        creatorShareMinor: null,
        refundMinor: null,
        taxWithheldMinor: null,
        payoutStatus: 'NOT_APPLICABLE',
      };
    }
    if (input.settledGrossMinor < 0) throw new Error('INVALID_SETTLED_GROSS');
    if (input.platformFeeBps < 0 || input.platformFeeBps > 10_000) throw new Error('INVALID_PLATFORM_FEE_BPS');

    const platformFeeMinor = Math.round((input.settledGrossMinor * input.platformFeeBps) / 10_000);
    return {
      listingRef: input.listingRef,
      grossRevenueMinor: input.settledGrossMinor,
      platformFeeMinor,
      creatorShareMinor: input.settledGrossMinor - platformFeeMinor,
      refundMinor: input.refundMinor ?? 0,
      taxWithheldMinor: input.taxWithheldMinor ?? 0,
      payoutStatus: 'PENDING',
    };
  }
}
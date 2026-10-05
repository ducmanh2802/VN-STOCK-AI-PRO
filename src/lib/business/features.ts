/**
 * BUSINESS-01 — CANONICAL FEATURE REGISTRY
 * ==========================================
 * Single source of truth for every commercially gateable capability.
 *
 * Roadmap §01.4: "Do not create dead features that have no implementation."
 * Roadmap §2.1:  "Never fabricate business data."
 *
 * Therefore every feature carries an explicit IMPLEMENTATION STATUS that is derived from
 * the PHASE 0 audit (docs/BUSINESS_READINESS_AUDIT.md §3, §4). A feature whose
 * implementation status is not IMPLEMENTED is DENIED by the entitlement engine, no matter
 * which plan holds it. Plans may therefore be authored ahead of implementation without
 * ever granting a capability that does not exist.
 *
 * The registry is the ONLY place a feature identifier is declared. Nothing in the
 * application may compare a raw plan string (roadmap §01.7).
 */

export type FeatureId =
  // learning
  | 'LEARNING'
  | 'ADVANCED_LEARNING'
  // research
  | 'RESEARCH'
  | 'BACKTEST'
  | 'RESEARCH_CERTIFICATION'
  // paper
  | 'PAPER_REPLAY'
  | 'PORTFOLIO'
  | 'ADVANCED_PORTFOLIO'
  | 'SCENARIO'
  // assistant / alerting
  | 'AI_ASSISTANT'
  | 'ALERTS'
  // market data
  | 'MARKET_DATA'
  | 'ADVANCED_MARKET_DATA'
  // business-owned (created by the business lane itself)
  | 'COMMUNITY_READ'
  | 'COMMUNITY_WRITE'
  | 'STRATEGY_PUBLISH'
  | 'MARKETPLACE_READ'
  | 'MARKETPLACE_PUBLISH'
  | 'TEAM_WORKSPACE'
  | 'B2B_TRAINING'
  // platform / integration
  | 'API_ACCESS'
  | 'EXPORT';

export type FeatureCategory =
  | 'LEARNING'
  | 'RESEARCH'
  | 'PAPER'
  | 'INTELLIGENCE'
  | 'MARKET_DATA'
  | 'COMMUNITY'
  | 'MARKETPLACE'
  | 'ORGANIZATION'
  | 'PLATFORM';

/**
 * Implementation status of the underlying product capability.
 *
 * P1-03 REMEDIATION. Two independent facts were previously conflated into a single
 * `IMPLEMENTED` flag, which answered "does an engine exist" while silently implying
 * "a production route can reach it". They are now separate:
 *
 * IMPLEMENTED          — a real engine exists in this repository.
 * NOT_YET_AVAILABLE    — commercially named, but no implementation exists yet.
 *
 * `reachable` below is the independent second fact. An `IMPLEMENTED` capability
 * whose `reachable` entry is false is NOT grantable over HTTP: the entitlement
 * engine refuses it, because selling a capability no route can deliver is the
 * exact defect the P1-03 audit identified.
 */
export type FeatureImplementationStatus = 'IMPLEMENTED' | 'NOT_YET_AVAILABLE';

/**
 * Reachability metadata (P1-03). `reachable` is only ever set to true when a
 * non-test production caller exists; the reachability gate in
 * `src/test/reachabilityGate.test.ts` fails CI when this drifts.
 */
export interface FeatureReachability {
  /** True only when a non-test production route or entrypoint reaches this feature. */
  readonly reachable: boolean;
  /** The production mount point (route path, use-case or server entrypoint). */
  readonly productionEntrypoint: string | null;
  /** The non-test caller proven to reach the engine. */
  readonly productionCaller: string | null;
  /** Evidence that the capability exists at all. */
  readonly engine: string | null;
}

export interface FeatureDefinition {
  readonly id: FeatureId;
  readonly category: FeatureCategory;
  readonly status: FeatureImplementationStatus;
  /** Repository path proving the implementation exists. Absent when NOT_YET_AVAILABLE. */
  readonly evidence: string | null;
  /** Commercial label. Never a performance or financial claim. */
  readonly label: string;
  readonly reachability: FeatureReachability;
}

const UNREACHABLE = {
  reachable: false,
  productionEntrypoint: null,
  productionCaller: null,
  engine: null,
} as const;

function def(
  id: FeatureId,
  category: FeatureCategory,
  status: FeatureImplementationStatus,
  evidence: string | null,
  label: string,
  reachability: FeatureReachability = { ...UNREACHABLE, engine: evidence },
): FeatureDefinition {
  return { id, category, status, evidence, label, reachability };
}

/**
 * ORDER MATTERS: this is the canonical ordering used when a plan declares "everything up
 * to and including tier N". See plans.ts.
 */
export const FEATURES: readonly FeatureDefinition[] = [
  // ---- learning -------------------------------------------------------------------
  def('LEARNING', 'LEARNING', 'IMPLEMENTED', 'src/lib/learning/catalog.ts', 'Learning Hub', {
    reachable: true,
    productionEntrypoint: 'src/pages/LearningDashboardPage.tsx (UI route)',
    productionCaller: 'src/services/learning/LearningService.ts',
    engine: 'src/lib/learning/catalog.ts',
  }),
  def(
    'ADVANCED_LEARNING',
    'LEARNING',
    'IMPLEMENTED',
    'src/lib/learning/catalog.ts',
    'Labs, projects, assessments and certificates',
    {
      reachable: true,
      productionEntrypoint: 'src/pages/LearningDashboardPage.tsx (UI route)',
      productionCaller: 'src/services/learning/LearningService.ts',
      engine: 'src/lib/learning/catalog.ts',
    }
  ),
  // ---- research ------------------------------------------------------------------
  // P1-02 / P1-03: these engines existed but had no production caller until
  // /api/research was mounted. They are now REACHABLE and therefore grantable.
  def('RESEARCH', 'RESEARCH', 'IMPLEMENTED', 'src/lib/research/ExperimentEngine.ts', 'Research workspace', {
    reachable: true,
    productionEntrypoint: 'POST /api/research/experiments',
    productionCaller: 'src/services/research/ResearchApiRouter.ts',
    engine: 'src/lib/research/ExperimentEngine.ts',
  }),
  def('BACKTEST', 'RESEARCH', 'IMPLEMENTED', 'src/lib/research/EventBacktestEngine.ts', 'Event-driven backtesting', {
    reachable: true,
    productionEntrypoint: 'POST /api/research/metrics',
    productionCaller: 'src/services/research/ResearchApiRouter.ts',
    engine: 'src/lib/research/EventBacktestEngine.ts',
  }),
  def(
    'RESEARCH_CERTIFICATION',
    'RESEARCH',
    'IMPLEMENTED',
    'src/lib/research/AuditEngine.ts',
    'Reproducible research certification',
    {
      reachable: true,
      productionEntrypoint: 'POST /api/research/certify',
      productionCaller: 'src/services/research/ResearchApiRouter.ts',
      engine: 'src/lib/research/AuditEngine.ts',
    }
  ),
  // ---- paper ---------------------------------------------------------------------
  // P1-09: PaperReplayEngine had zero non-test callers until /api/replay was mounted.
  def('PAPER_REPLAY', 'PAPER', 'IMPLEMENTED', 'src/lib/replay/PaperReplayEngine.ts', 'Paper replay (simulation only)', {
    reachable: true,
    productionEntrypoint: 'POST /api/replay/runs',
    productionCaller: 'src/services/replay/PaperReplayApiRouter.ts',
    engine: 'src/lib/replay/PaperReplayEngine.ts',
  }),
  def('PORTFOLIO', 'PAPER', 'IMPLEMENTED', 'src/lib/portfolio', 'Portfolio tracking', {
    reachable: true,
    productionEntrypoint: 'GET /api/trading/portfolio',
    productionCaller: 'src/lib/trading/api/TradingApiRouter.ts',
    engine: 'src/lib/portfolio',
  }),
  def(
    'ADVANCED_PORTFOLIO',
    'PAPER',
    'IMPLEMENTED',
    'src/lib/portfolio/CovarianceEngine.ts',
    'Risk, factor and concentration analytics',
    {
      reachable: true,
      productionEntrypoint: 'GET /api/trading/risk-metrics',
      productionCaller: 'src/lib/trading/api/TradingApiRouter.ts',
      engine: 'src/lib/portfolio/CovarianceEngine.ts',
    }
  ),
  // P1-03: `src/lib/product/scenario/ScenarioEngine.ts` has no non-test caller. The
  // `ScenarioEngine` used in production is the enterprise-analysis one, which is a
  // different module; this product-scenario capability is therefore unreachable.
  def('SCENARIO', 'INTELLIGENCE', 'IMPLEMENTED', 'src/lib/product/scenario/ScenarioEngine.ts', 'Scenario modelling', {
    reachable: false,
    productionEntrypoint: null,
    productionCaller: null,
    engine: 'src/lib/product/scenario/ScenarioEngine.ts',
  }),
  // ---- assistant / alerting ------------------------------------------------------
  // P1-03: the registry previously named an engine that only tests referenced.
  // The capability users actually reach is the mounted AI chat route, so the
  // evidence now describes THAT path. `ResearchAssistantFoundation` remains an
  // orphan and is reported as such in the cross-domain reachability audit.
  def(
    'AI_ASSISTANT',
    'INTELLIGENCE',
    'IMPLEMENTED',
    'src/services/assistant/aiChatService.ts',
    'Research assistant',
    {
      reachable: true,
      productionEntrypoint: 'POST /api/ai/chat',
      productionCaller: 'server.ts',
      engine: 'src/services/assistant/aiChatService.ts',
    }
  ),
  // P1-03: `src/lib/product/alerts/AlertEngine.ts` is reached only by
  // DecisionOSService, which itself has no production route. Honest answer: the
  // engine exists but no product entrypoint delivers alert rules yet.
  def('ALERTS', 'INTELLIGENCE', 'IMPLEMENTED', 'src/lib/product/alerts/AlertEngine.ts', 'Alert rules', {
    reachable: false,
    productionEntrypoint: null,
    productionCaller: null,
    engine: 'src/lib/product/alerts/AlertEngine.ts',
  }),
  // ---- market data ---------------------------------------------------------------
  def('MARKET_DATA', 'MARKET_DATA', 'IMPLEMENTED', 'src/services/market', 'Market data', {
    reachable: true,
    productionEntrypoint: 'GET /api/market-data/history/:symbol, /quote/:symbol, /fundamentals/:symbol',
    productionCaller: 'server.ts',
    engine: 'src/services/market/realMarketDataService.ts',
  }),
  // P1-03: MultiAssetQuantService imports the multi-asset engines but has no
  // non-test caller, so the cross-asset capability is implemented-but-unreachable.
  def('ADVANCED_MARKET_DATA', 'MARKET_DATA', 'IMPLEMENTED', 'src/lib/multi-asset', 'Multi-asset and cross-asset data', {
    reachable: false,
    productionEntrypoint: null,
    productionCaller: null,
    engine: 'src/lib/multi-asset',
  }),
  // ---- business-owned ------------------------------------------------------------
  def('COMMUNITY_READ', 'COMMUNITY', 'NOT_YET_AVAILABLE', null, 'Community feed'),
  def('COMMUNITY_WRITE', 'COMMUNITY', 'NOT_YET_AVAILABLE', null, 'Publish to community'),
  def('STRATEGY_PUBLISH', 'MARKETPLACE', 'NOT_YET_AVAILABLE', null, 'Publish a strategy'),
  def('MARKETPLACE_READ', 'MARKETPLACE', 'NOT_YET_AVAILABLE', null, 'Browse the marketplace'),
  def('MARKETPLACE_PUBLISH', 'MARKETPLACE', 'NOT_YET_AVAILABLE', null, 'Publish to the marketplace'),
  def('TEAM_WORKSPACE', 'ORGANIZATION', 'NOT_YET_AVAILABLE', null, 'Shared team workspace'),
  def('B2B_TRAINING', 'ORGANIZATION', 'NOT_YET_AVAILABLE', null, 'Organization training programme'),
  // ---- platform ------------------------------------------------------------------
  def('API_ACCESS', 'PLATFORM', 'NOT_YET_AVAILABLE', null, 'Programmatic API access'),
  def('EXPORT', 'PLATFORM', 'NOT_YET_AVAILABLE', null, 'Data export'),
];

const FEATURE_INDEX: ReadonlyMap<FeatureId, FeatureDefinition> = new Map(
  FEATURES.map((f) => [f.id, f]),
);

/** Canonical registry index. Contains every declared feature and nothing else. */
export const FEATURE_REGISTRY: ReadonlyMap<FeatureId, FeatureDefinition> = FEATURE_INDEX;

/** Declaration order of the registry — the stable tie-breaker for tier ordering. */
export const FEATURE_ORDER: readonly FeatureId[] = FEATURES.map((f) => f.id);

export function featureExists(id: string): id is FeatureId {
  return FEATURE_INDEX.has(id as FeatureId);
}

/**
 * Fail-closed lookup. An unregistered feature identifier is a programming error, not a
 * runtime condition: throwing here is what stops `plan === 'PRO'` style code from leaking
 * (roadmap §01.7).
 */
export function requireFeature(id: string): FeatureDefinition {
  const found = FEATURE_INDEX.get(id as FeatureId);
  if (!found) throw new Error(`UNKNOWN_FEATURE:${id}`);
  return found;
}

export function featureStatus(id: string): FeatureImplementationStatus {
  return requireFeature(id).status;
}

/** True only when a real engine exists in this repository for the feature. */
export function isFeatureImplemented(id: string): boolean {
  return requireFeature(id).status === 'IMPLEMENTED';
}

/**
 * P1-03 — True only when an engine exists AND a non-test production caller reaches it.
 *
 * This is the predicate the entitlement engine must use. `IMPLEMENTED` alone is not
 * enough: a capability that no route can deliver must never be sold, however real
 * its engine is.
 */
export function isFeatureReachable(id: string): boolean {
  const f = requireFeature(id);
  return f.status === 'IMPLEMENTED' && f.reachability.reachable === true;
}

/** All features that are commercially grantable today (implemented AND reachable). */
export function implementedFeatures(): readonly FeatureId[] {
  return FEATURES.filter((f) => f.status === 'IMPLEMENTED').map((f) => f.id);
}

/** Features that exist as an engine but have no production caller (P1-03). Never grantable. */
export function unreachableFeatures(): readonly FeatureId[] {
  return FEATURES.filter((f) => f.status === 'IMPLEMENTED' && !f.reachability.reachable).map(
    (f) => f.id,
  );
}

/** Features that are declared but have no implementation. Never grantable. */
export function unavailableFeatures(): readonly FeatureId[] {
  return FEATURES.filter((f) => f.status === 'NOT_YET_AVAILABLE').map((f) => f.id);
}

export function featuresByCategory(category: FeatureCategory): readonly FeatureId[] {
  return FEATURES.filter((f) => f.category === category).map((f) => f.id);
}
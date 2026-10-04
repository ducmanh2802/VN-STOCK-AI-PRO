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
 * IMPLEMENTED          — a real engine exists in this repository (PHASE 0 audited).
 * NOT_YET_AVAILABLE    — commercially named, but no implementation exists yet.
 *                        The entitlement engine DENIES these regardless of plan.
 */
export type FeatureImplementationStatus = 'IMPLEMENTED' | 'NOT_YET_AVAILABLE';

export interface FeatureDefinition {
  readonly id: FeatureId;
  readonly category: FeatureCategory;
  readonly status: FeatureImplementationStatus;
  /** Repository path proving the implementation exists. Absent when NOT_YET_AVAILABLE. */
  readonly evidence: string | null;
  /** Commercial label. Never a performance or financial claim. */
  readonly label: string;
}

function def(
  id: FeatureId,
  category: FeatureCategory,
  status: FeatureImplementationStatus,
  evidence: string | null,
  label: string,
): FeatureDefinition {
  return { id, category, status, evidence, label };
}

/**
 * ORDER MATTERS: this is the canonical ordering used when a plan declares "everything up
 * to and including tier N". See plans.ts.
 */
export const FEATURES: readonly FeatureDefinition[] = [
  // ---- learning -------------------------------------------------------------------
  def('LEARNING', 'LEARNING', 'IMPLEMENTED', 'src/lib/learning/catalog.ts', 'Learning Hub'),
  def(
    'ADVANCED_LEARNING',
    'LEARNING',
    'IMPLEMENTED',
    'src/lib/learning/catalog.ts',
    'Labs, projects, assessments and certificates',
  ),
  // ---- research ------------------------------------------------------------------
  def('RESEARCH', 'RESEARCH', 'IMPLEMENTED', 'src/lib/research/ExperimentEngine.ts', 'Research workspace'),
  def('BACKTEST', 'RESEARCH', 'IMPLEMENTED', 'src/lib/research/EventBacktestEngine.ts', 'Event-driven backtesting'),
  def(
    'RESEARCH_CERTIFICATION',
    'RESEARCH',
    'IMPLEMENTED',
    'src/lib/research/AuditEngine.ts',
    'Reproducible research certification',
  ),
  // ---- paper ---------------------------------------------------------------------
  def('PAPER_REPLAY', 'PAPER', 'IMPLEMENTED', 'src/lib/replay/PaperReplayEngine.ts', 'Paper replay (simulation only)'),
  def('PORTFOLIO', 'PAPER', 'IMPLEMENTED', 'src/lib/portfolio', 'Portfolio tracking'),
  def(
    'ADVANCED_PORTFOLIO',
    'PAPER',
    'IMPLEMENTED',
    'src/lib/portfolio/CovarianceEngine.ts',
    'Risk, factor and concentration analytics',
  ),
  def('SCENARIO', 'INTELLIGENCE', 'IMPLEMENTED', 'src/lib/product/scenario/ScenarioEngine.ts', 'Scenario modelling'),
  // ---- assistant / alerting ------------------------------------------------------
  def('AI_ASSISTANT', 'INTELLIGENCE', 'IMPLEMENTED', 'src/lib/product/assistant/ResearchAssistantFoundation.ts', 'Research assistant'),
  def('ALERTS', 'INTELLIGENCE', 'IMPLEMENTED', 'src/lib/product/alerts/AlertEngine.ts', 'Alert rules'),
  // ---- market data ---------------------------------------------------------------
  def('MARKET_DATA', 'MARKET_DATA', 'IMPLEMENTED', 'src/services/market', 'Market data'),
  def('ADVANCED_MARKET_DATA', 'MARKET_DATA', 'IMPLEMENTED', 'src/lib/multi-asset', 'Multi-asset and cross-asset data'),
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

/** All features that are commercially grantable today (real implementation exists). */
export function implementedFeatures(): readonly FeatureId[] {
  return FEATURES.filter((f) => f.status === 'IMPLEMENTED').map((f) => f.id);
}

/** Features that are declared but have no implementation. Never grantable. */
export function unavailableFeatures(): readonly FeatureId[] {
  return FEATURES.filter((f) => f.status === 'NOT_YET_AVAILABLE').map((f) => f.id);
}

export function featuresByCategory(category: FeatureCategory): readonly FeatureId[] {
  return FEATURES.filter((f) => f.category === category).map((f) => f.id);
}
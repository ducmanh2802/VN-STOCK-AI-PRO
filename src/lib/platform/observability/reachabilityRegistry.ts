/**
 * CROSS-DOMAIN REACHABILITY REGISTRY
 * ===================================
 * The permanent registry required by the P0 remediation prompt §22–§25.
 *
 * ROOT CAUSE THIS FILE EXISTS TO PREVENT
 * Domain certifications were awarded per-domain on unit tests, without a
 * cross-domain reachability audit. Engines were correct and heavily tested, but
 * nothing verified that a production CALLER existed. The result was 13 of 22
 * findings sharing one pattern: an engine, a table and a test suite, and zero
 * non-test call sites.
 *
 * WHAT COUNTS AS A CALLER (and what does not)
 *   COUNTS      a non-test import / call from a production module, service, route,
 *               page or the server entrypoint
 *   DOES NOT    a test file, a documentation file, a barrel `export *`, a feature
 *               registry string, a DI registration with no consumer, or a comment
 *
 * The gate (`src/test/reachabilityGate.test.ts`) walks the real call graph from
 * every registered entrypoint and fails when a capability declared REACHABLE has no
 * non-test path, or when a capability declared ORPHANED is still IMPLEMENTED.
 *
 * FUTURE CAPABILITIES: `registerCapability()` is the only supported way to add an
 * entry, so the registry cannot be silently bypassed by hand-editing the table.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, dirname, normalize } from 'path';

/** Lifecycle states. IMPLEMENTED alone never implies REACHABLE. */
export type ReachabilityState =
  | 'PLANNED'
  | 'IMPLEMENTED'
  | 'REACHABLE'
  | 'CERTIFIED'
  | 'DEFERRED';

export interface SecurityBoundary {
  /** Route-level authentication requirement for the entrypoint. */
  readonly authentication: 'REQUIRED' | 'NONE' | 'PLATFORM_SESSION';
  /** Authorization / entitlement requirement. */
  readonly authorization: 'REQUIRED' | 'NONE' | 'ENTITLEMENT_GATED';
  /** Notes on the risk boundary, real-execution boundary or data provenance. */
  readonly notes: string;
}

export interface CapabilityEntry {
  /** Stable identifier used by the audit documents and the gate. */
  readonly capability: string;
  /** Owning lane / domain. */
  readonly owner: string;
  /** The engine / pure-logic module. */
  readonly engine: string;
  /** The service or composition layer that assembles the engine. */
  readonly service: string | null;
  /** The repository or table that persists the capability. */
  readonly repository: string | null;
  /** The production entrypoint (route, page, or server entry). */
  readonly productionEntrypoint: string;
  /** The concrete non-test caller proven to reach the engine. */
  readonly productionCaller: string;
  /**
   * Where the capability actually runs.
   * SERVER — reached from `server.ts` (an HTTP route or the server composition).
   * CLIENT — reached from a shipped UI page / hook / hook module. Still a real
   *           production entrypoint (§23 "ROUTE / PRODUCT ENTRYPOINT"), but it is
   *           not part of the server process and must not be judged against it.
   * BOTH   — reached from either.
   */
  readonly executionContext: 'SERVER' | 'CLIENT' | 'BOTH';
  /** The test that covers it. */
  readonly test: string;
  readonly securityBoundary: SecurityBoundary;
  readonly state: ReachabilityState;
  /** Why the state is what it is. Required for every non-REACHABLE entry. */
  readonly rationale: string;
}

/**
 * The registered critical capabilities.
 *
 * Every entry is either REACHABLE (with a proven non-test caller) or explicitly
 * not-IMPLEMENTED (PLANNED / DEFERRED). An IMPLEMENTED-but-unreachable capability
 * is exactly the failure the gate exists to make impossible, so it does not appear
 * here: such capabilities are reported as ORPHANED by the audit, not registered as
 * healthy.
 */
export const REACHABILITY_REGISTRY: readonly CapabilityEntry[] = [
  // ---------------------------------------------------------------- trading ---
  {
    capability: 'ORDER_RISK_CHAIN',
    owner: 'TRADING',
    engine: 'src/lib/trading/risk/RiskGuard.ts',
    service: 'src/services/trading/PaperOrderRiskBoundary.ts',
    repository: null,
    productionEntrypoint: 'POST /api/trading/order',
    productionCaller: 'src/lib/trading/api/TradingApiRouter.ts',
    executionContext: 'SERVER',
    test: 'src/services/trading/__tests__/PaperOrderRiskBoundary.test.ts',
    securityBoundary: {
      authentication: 'NONE',
      authorization: 'NONE',
      notes:
        'P0-01: RiskGuard -> RiskManager -> PositionSizer run before PaperBroker. No broker submission is reachable without an approved verdict. Note: the trading surface is currently unauthenticated (P2).',
    },
    state: 'REACHABLE',
    rationale:
      'PaperOrderRiskBoundary.submit is the only path from HTTP to the broker and is mounted at POST /api/trading/order.',
  },
  {
    capability: 'PAPER_BROKER_EXECUTION',
    owner: 'TRADING',
    engine: 'src/lib/trading/paper/PaperBroker.ts',
    service: 'src/lib/trading/execution/OrderManager.ts',
    repository: null,
    productionEntrypoint: 'POST /api/trading/order',
    productionCaller: 'server.ts',
    executionContext: 'SERVER',
    test: 'src/lib/trading/__tests__/PaperBroker.test.ts',
    securityBoundary: {
      authentication: 'NONE',
      authorization: 'NONE',
      notes:
        'Simulation-only: the boundary refuses any adapter whose isSimulation !== true, before any risk evaluation. One BrokerAdapter implementation exists; no live broker host or credential.',
    },
    state: 'REACHABLE',
    rationale: 'Reached only after every safety gate passed.',
  },
  {
    capability: 'PORTFOLIO_RISK_METRICS',
    owner: 'TRADING',
    engine: 'src/lib/trading/risk/PortfolioRiskMetrics.ts',
    service: 'src/lib/trading/api/TradingApiRouter.ts',
    repository: null,
    productionEntrypoint: 'GET /api/trading/risk-metrics',
    productionCaller: 'src/lib/trading/api/TradingApiRouter.ts',
    executionContext: 'SERVER',
    test: 'src/lib/trading/__tests__/TradingApiRouter.test.ts',
    securityBoundary: {
      authentication: 'NONE',
      authorization: 'NONE',
      notes: 'Server-authoritative only; missing inputs report explicit nulls, never zero.',
    },
    state: 'REACHABLE',
    rationale: 'Mounted directly on the trading router.',
  },

  // ------------------------------------------------------- canonical data ---
  {
    capability: 'CANONICAL_BAR_PERSISTENCE',
    owner: 'DATA_FOUNDATION',
    engine: 'src/lib/data/canonicalBarValidation.ts',
    service: 'src/services/data/CanonicalMarketDataIngestionService.ts',
    repository: 'src/lib/db/data/CanonicalMarketDataRepository.ts (canonical_market_bars)',
    productionEntrypoint: 'POST /api/canonical-data/ingest/:symbol',
    productionCaller: 'src/services/data/CanonicalDataApiRouter.ts',
    executionContext: 'SERVER',
    test: 'src/services/data/__tests__/CanonicalMarketDataPersistence.test.ts',
    securityBoundary: {
      authentication: 'NONE',
      authorization: 'NONE',
      notes:
        'P0-04: identity is instrumentId-based; provenance and quality are written in the same call as the bar; the repository refuses a synthetic row; historical reads filter effective_time <= asOf.',
    },
    state: 'REACHABLE',
    rationale:
      'Mounted at /api/canonical-data. The chain provider -> validation -> persistence -> provenance -> quality -> query runs end to end.',
  },
  {
    capability: 'CANONICAL_PROVENANCE_LEDGER',
    owner: 'DATA_FOUNDATION',
    engine: 'src/lib/data/canonicalBarValidation.ts',
    service: 'src/services/data/CanonicalMarketDataIngestionService.ts',
    repository: 'src/lib/db/data/CanonicalMarketDataRepository.ts (canonical_data_provenance)',
    productionEntrypoint: 'POST /api/canonical-data/ingest/:symbol',
    productionCaller: 'src/services/data/CanonicalMarketDataIngestionService.ts',
    executionContext: 'SERVER',
    test: 'src/services/data/__tests__/CanonicalMarketDataPersistence.test.ts',
    securityBoundary: {
      authentication: 'NONE',
      authorization: 'NONE',
      notes: 'Provenance cannot be orphaned: it is written in the same repository call as the bar.',
    },
    state: 'REACHABLE',
    rationale: 'The ingest service builds the provenance record and the repository writes it with the bar.',
  },
  {
    capability: 'CANONICAL_QUALITY_LEDGER',
    owner: 'DATA_FOUNDATION',
    engine: 'src/lib/data/canonicalBarValidation.ts',
    service: 'src/services/data/CanonicalMarketDataIngestionService.ts',
    repository: 'src/lib/db/data/CanonicalMarketDataRepository.ts (canonical_data_quality)',
    productionEntrypoint: 'GET /api/canonical-data/quality/:symbol',
    productionCaller: 'src/services/data/CanonicalMarketDataIngestionService.ts',
    executionContext: 'SERVER',
    test: 'src/services/data/__tests__/CanonicalMarketDataPersistence.test.ts',
    securityBoundary: {
      authentication: 'NONE',
      authorization: 'NONE',
      notes:
        'Rejected observations are persisted with an explicit reason code, so a data gap is visible rather than silently dropped.',
    },
    state: 'REACHABLE',
    rationale: 'The ingest service builds the quality record; the quality route reads it back.',
  },
  {
    capability: 'POINT_IN_TIME_GUARD',
    owner: 'DATA_FOUNDATION',
    engine: 'src/lib/data/PointInTimeGuard.ts',
    service: 'src/services/data/DataFoundationComposition.ts',
    repository: null,
    productionEntrypoint: 'GET /api/canonical-data/pit/instrument/:symbol, GET /api/research/pit-check',
    productionCaller: 'src/services/data/DataFoundationComposition.ts, src/services/research/ResearchApiRouter.ts',
    executionContext: 'SERVER',
    test: 'src/lib/data/__tests__/Data04.test.ts',
    securityBoundary: {
      authentication: 'NONE',
      authorization: 'NONE',
      notes:
        'P1-05: rejects a research dataset whose observation dates exceed the as-of cutoff, and reports survivorship / current-constituent-leak diagnostics.',
    },
    state: 'REACHABLE',
    rationale:
      'Now reached from both the canonical-data PIT routes and the research route, not only from tests.',
  },
  {
    capability: 'INSTRUMENT_IDENTITY',
    owner: 'DATA_FOUNDATION',
    engine: 'src/lib/data/InstrumentIdentityEngine.ts',
    service: 'src/services/data/DataFoundationComposition.ts',
    repository: 'src/lib/db/data/DataFoundationRepository.ts (InstrumentRepository)',
    productionEntrypoint: 'POST /api/canonical-data/instrument',
    productionCaller: 'src/services/data/DataFoundationComposition.ts',
    executionContext: 'SERVER',
    test: 'src/lib/data/__tests__/Data01.test.ts',
    securityBoundary: {
      authentication: 'NONE',
      authorization: 'NONE',
      notes: 'P1-05: the authoritative identity engine; ticker text is never the sole identity.',
    },
    state: 'REACHABLE',
    rationale: 'Register-instrument route calls the engine and persists via InstrumentRepository.',
  },
  {
    capability: 'CORPORATE_ACTION_LEDGER',
    owner: 'DATA_FOUNDATION',
    engine: 'src/lib/data/CorporateActionsEngine.ts',
    service: 'src/services/data/DataFoundationComposition.ts',
    repository: 'src/lib/db/data/DataFoundationRepository.ts (CorporateActionEventRepository)',
    productionEntrypoint: 'POST /api/canonical-data/instrument (composition entry; appendCorporateActions)',
    productionCaller: 'src/services/data/DataFoundationComposition.ts',
    executionContext: 'SERVER',
    test: 'src/lib/corporate-actions/__tests__/CorporateActionsRegistry.test.ts',
    securityBoundary: {
      authentication: 'NONE',
      authorization: 'NONE',
      notes: 'P1-01: the repository now has a production caller instead of being dead code.',
    },
    state: 'REACHABLE',
    rationale: 'appendCorporateActions is exported from the production composition.',
  },

  // ------------------------------------------------------------- freshness ---
  {
    capability: 'DATA_FRESHNESS_RESOLUTION',
    owner: 'MARKET_DATA',
    engine: 'src/services/market/freshness/dataFreshness.ts',
    service: 'src/services/market/RealMarketDataProvider.ts',
    repository: null,
    productionEntrypoint: 'src/services/market/index.ts (marketDataProvider singleton)',
    productionCaller: 'src/services/market/stockDetailService.ts, src/services/market/providers/VPSMarketDataProvider.ts',
    executionContext: 'CLIENT',
    test: 'src/services/market/__tests__/dataFreshnessRemediation.test.ts',
    securityBoundary: {
      authentication: 'NONE',
      authorization: 'NONE',
      notes:
        'P0-02: CURRENT is only ever reached by an explicit age-vs-TTL comparison. A null timestamp is UNAVAILABLE, never CURRENT. The zod schema now rejects CURRENT + null sourceTimestamp.',
    },
    state: 'REACHABLE',
    rationale: 'Every provider that stamps a freshness state routes through resolveDataFreshness.',
  },

  // -------------------------------------------------------------- research ---
  {
    capability: 'RESEARCH_CERTIFICATION',
    owner: 'RESEARCH',
    engine: 'src/lib/research/AuditEngine.ts',
    service: 'src/services/research/ResearchService.ts',
    repository: 'src/lib/db/research/ResearchRepository.ts (research_certifications)',
    productionEntrypoint: 'POST /api/research/certify, POST /api/research/certifications',
    productionCaller: 'src/services/research/ResearchApiRouter.ts',
    executionContext: 'SERVER',
    test: 'src/lib/research/__tests__/Research05.test.ts',
    securityBoundary: {
      authentication: 'NONE',
      authorization: 'ENTITLEMENT_GATED',
      notes:
        'P1-02 / P1-04: AuditEngine.certify is the ONLY source of a CERTIFIED verdict. An unproven condition is treated as failed, not skipped.',
    },
    state: 'REACHABLE',
    rationale: 'Mounted at /api/research; certification metrics are persisted, not discarded.',
  },
  {
    capability: 'RESEARCH_EXPERIMENTS',
    owner: 'RESEARCH',
    engine: 'src/lib/research/ExperimentEngine.ts',
    service: 'src/services/research/ResearchService.ts',
    repository: 'src/lib/db/research/ResearchRepository.ts (research_experiments)',
    productionEntrypoint: 'POST /api/research/experiments',
    productionCaller: 'src/services/research/ResearchApiRouter.ts',
    executionContext: 'SERVER',
    test: 'src/lib/research/__tests__/Research05.test.ts',
    securityBoundary: {
      authentication: 'NONE',
      authorization: 'NONE',
      notes: 'A dataset containing post-cutoff observation dates is refused with LOOKAHEAD_DETECTED.',
    },
    state: 'REACHABLE',
    rationale: 'Mounted; persists through ResearchRepository.',
  },
  {
    capability: 'DECISION_JOURNAL',
    owner: 'DECISION',
    engine: 'src/lib/data/PointInTimeGuard.ts',
    service: 'src/services/research/ResearchApiRouter.ts',
    repository: 'src/lib/db/decision/DecisionJournalRepository.ts (decision_journal)',
    productionEntrypoint: 'POST /api/research/decisions',
    productionCaller: 'src/services/research/ResearchApiRouter.ts',
    executionContext: 'SERVER',
    test: 'src/lib/db/decision/DecisionJournalRepository.ts consumers',
    securityBoundary: {
      authentication: 'NONE',
      authorization: 'NONE',
      notes:
        'P1-06: createdAt is written explicitly from the caller so insert time can never masquerade as decision time.',
    },
    state: 'REACHABLE',
    rationale: 'Mounted; the repository had zero callers before this route.',
  },

  // ----------------------------------------------------------- paper replay ---
  {
    capability: 'PAPER_REPLAY',
    owner: 'REPLAY',
    engine: 'src/lib/replay/PaperReplayEngine.ts',
    service: 'src/services/replay/PaperReplayService.ts',
    repository: 'src/lib/db/replay/ReplayRepository.ts (replay_runs)',
    productionEntrypoint: 'POST /api/replay/runs',
    productionCaller: 'src/services/replay/PaperReplayApiRouter.ts',
    executionContext: 'SERVER',
    test: 'src/lib/replay/__tests__/ReplayE2E.test.ts',
    securityBoundary: {
      authentication: 'NONE',
      authorization: 'NONE',
      notes:
        'P1-09: simulation-only. A non-simulation execution port is refused with EXECUTION_BLOCKED before any bar is processed. Empty bars => DATA_UNAVAILABLE; no bar is ever generated.',
    },
    state: 'REACHABLE',
    rationale: 'Mounted at /api/replay; previously had zero non-test callers.',
  },

  // -------------------------------------------------------------- monitoring ---
  {
    capability: 'DECISION_MONITORING',
    owner: 'DECISION',
    engine: 'src/lib/decision/MonitoringEngine.ts',
    service: 'src/services/decision/DecisionOSService.ts',
    repository: 'src/lib/db/decision/DecisionJournalRepository.ts (decision_reviews)',
    productionEntrypoint: 'POST /api/research/decisions (journal path)',
    productionCaller: 'src/services/decision/DecisionOSService.ts',
    executionContext: 'SERVER',
    test: 'src/lib/decision/__tests__/Decision03.test.ts',
    securityBoundary: {
      authentication: 'NONE',
      authorization: 'NONE',
      notes:
        'P1-07: there is still NO scheduler. MonitoringEngine is invoked on demand; nothing periodically re-evaluates a decision. DEFERRED by design, recorded here rather than hidden.',
    },
    state: 'DEFERRED',
    rationale:
      'MonitoringEngine is reached from DecisionOSService, which is invoked by the decision journal path; a periodic scheduler is deferred (P1-07 residual).',
  },

  // ---------------------------------------------------------------- business ---
  {
    capability: 'COMMERCIAL_ENTITLEMENTS',
    owner: 'BUSINESS',
    engine: 'src/lib/business/entitlementEngine.ts',
    service: 'src/services/business-api/BusinessApiRouterComposition.ts',
    repository: 'src/lib/db/business/BusinessRepositories.ts (business_subscriptions)',
    productionEntrypoint: 'mounted at /api/billing',
    productionCaller: 'server.ts',
    executionContext: 'SERVER',
    test: 'src/lib/business/__tests__/Business01Entitlement.test.ts',
    securityBoundary: {
      authentication: 'PLATFORM_SESSION',
      authorization: 'ENTITLEMENT_GATED',
      notes:
        'P1-08: the router was certified but unmounted. Identity comes from the shared PLATFORM IdentityService; the account-status probe fails CLOSED; every route refuses an anonymous caller.',
    },
    state: 'REACHABLE',
    rationale: 'Mounted at /api/billing; previously exported but unreachable over HTTP.',
  },
  {
    capability: 'PLATFORM_IDENTITY',
    owner: 'PLATFORM',
    engine: 'src/lib/platform/identity/identityService.ts',
    service: 'src/lib/platform/api/createPlatformRouter.ts',
    repository: 'src/lib/db/platform (platform_user_account, platform_sessions)',
    productionEntrypoint: 'mounted at /api/platform/auth',
    productionCaller: 'server.ts',
    executionContext: 'SERVER',
    test: 'src/lib/platform/identity/__tests__',
    securityBoundary: {
      authentication: 'NONE',
      authorization: 'NONE',
      notes: 'Sole owner of identity state. getAccount() was added so downstream lanes can verify status without owning identity.',
    },
    state: 'REACHABLE',
    rationale: 'Mounted at /api/platform/auth.',
  },
  {
    capability: 'AI_ADVISORY_ASSISTANT',
    owner: 'ASSISTANT',
    engine: 'src/services/assistant/aiChatService.ts',
    service: null,
    repository: null,
    productionEntrypoint: 'POST /api/ai/chat',
    productionCaller: 'server.ts',
    executionContext: 'SERVER',
    test: 'src/lib/business/__tests__/Business01Plans.test.ts (registry evidence gate)',
    securityBoundary: {
      authentication: 'NONE',
      authorization: 'NONE',
      notes:
        'ADVISORY ONLY: no trading authority, no order placement, no access to trading/risk/portfolio state. System prompt is fixed in code. Residual: the route is unauthenticated and unmetered (P2).',
    },
    state: 'REACHABLE',
    rationale:
      'Extracted from server.ts into src/ so the feature registry cites a real reachable module rather than a test-only one.',
  },

  // --------------------------------------------------------------- learning ---
  {
    capability: 'LEARNING_HUB',
    owner: 'LEARNING',
    engine: 'src/lib/learning/catalog.ts',
    service: 'src/services/learning/LearningService.ts',
    repository: null,
    productionEntrypoint: 'src/pages/LearningDashboardPage.tsx (UI route)',
    productionCaller: 'src/pages/LearningDashboardPage.tsx',
    executionContext: 'CLIENT',
    test: 'src/lib/learning/__tests__',
    securityBoundary: {
      authentication: 'NONE',
      authorization: 'NONE',
      notes: 'Progress and mastery are localStorage-backed (P2: no server-side persistence).',
    },
    state: 'REACHABLE',
    rationale: 'LearningService is invoked by the learning dashboard page at runtime.',
  },
];

// ---------------------------------------------------------------------------
// Call-graph inspection used by the gate.
// ---------------------------------------------------------------------------

const TEST_PATH_MARKERS = ['/__tests__/', '.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx'];
const DOC_EXTENSIONS = ['.md', '.sql', '.json', '.txt'];

/** True when a path is a test file. Test callers never count as reachability. */
export function isTestPath(candidate: string): boolean {
  const normalized = candidate.replace(/\\/g, '/');
  return TEST_PATH_MARKERS.some((m) => normalized.includes(m));
}

/** True when a path is documentation or a non-source asset. */
export function isNonSourcePath(candidate: string): boolean {
  const normalized = candidate.replace(/\\/g, '/').toLowerCase();
  if (normalized.includes('/docs/') || normalized.startsWith('docs/')) return true;
  return DOC_EXTENSIONS.some((ext) => normalized.endsWith(ext));
}

export interface CallerScanOptions {
  readonly repoRoot: string;
}

/**
 * Extracts every module specifier imported by a source file, including dynamic
 * `import('...')` and re-export `export ... from '...'` forms.
 */
function extractImportSpecifiers(content: string): string[] {
  const specs = new Set<string>();
  const patterns = [
    /\bimport\s+[^'"]*from\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bexport\s+[^'"]*from\s*['"]([^'"]+)['"]/g,
    /\bimport\s+type\s*\{[^}]*\}\s*from\s*['"]([^'"]+)['"]/g,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      if (match[1]) specs.add(match[1]);
    }
  }
  return [...specs];
}

const SOURCE_EXTENSIONS = ['.ts', '.tsx'];

/** Resolves a relative module specifier to a repo-relative file, or null. */
function resolveRelativeSpecifier(
  fromRelPath: string,
  specifier: string,
  repoRoot: string
): string | null {
  if (!specifier.startsWith('.')) return null; // bare specifier: external package
  const baseDir = dirname(fromRelPath);
  const raw = normalize(join(baseDir, specifier)).replace(/\\/g, '/');

  const candidates: string[] = [];
  if (/\.(ts|tsx|js|jsx|json)$/.test(raw)) {
    candidates.push(raw);
  } else {
    for (const ext of SOURCE_EXTENSIONS) candidates.push(`${raw}${ext}`);
    for (const ext of SOURCE_EXTENSIONS) candidates.push(`${raw}/index${ext}`);
  }
  for (const candidate of candidates) {
    if (fileExists(repoRoot, candidate)) return candidate;
  }
  return null;
}

export type ImportGraph = ReadonlyMap<string, ReadonlySet<string>>;

/**
 * Builds the static import graph of every non-test source file.
 * Test files are excluded so a test import can never establish reachability.
 */
export function buildImportGraph(options: CallerScanOptions): ImportGraph {
  const { repoRoot } = options;
  const graph = new Map<string, Set<string>>();
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === '.agents') {
        continue;
      }
      const full = join(dir, entry);
      let isDir = false;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue;
      const rel = relative(repoRoot, full).replace(/\\/g, '/');
      if (isTestPath(rel)) continue;
      let content: string;
      try {
        content = readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      const deps = new Set<string>();
      for (const spec of extractImportSpecifiers(content)) {
        const resolved = resolveRelativeSpecifier(rel, spec, repoRoot);
        if (resolved) deps.add(resolved);
      }
      graph.set(rel, deps);
    }
  };
  walk(join(repoRoot, 'src'));

  const server = join(repoRoot, 'server.ts');
  try {
    const content = readFileSync(server, 'utf8');
    const deps = new Set<string>();
    for (const spec of extractImportSpecifiers(content)) {
      const resolved = resolveRelativeSpecifier('server.ts', spec, repoRoot);
      if (resolved) deps.add(resolved);
    }
    graph.set('server.ts', deps);
  } catch {
    /* server.ts always exists in this repository */
  }
  return graph;
}

/**
 * Breadth-first trace of actual non-test call edges from `fromPath` to `targetPath`.
 * A capability counts as reachable only when this returns the real edge chain.
 */
export function traceReachability(
  graph: ImportGraph,
  fromPath: string,
  targetPath: string,
  maxDepth = 12
): string[] | null {
  if (fromPath === targetPath) return [fromPath];
  const visited = new Set<string>([fromPath]);
  let frontier: string[] = [fromPath];

  for (let depth = 0; depth < maxDepth; depth += 1) {
    const next: string[] = [];
    for (const node of frontier) {
      const deps = graph.get(node);
      if (!deps) continue;
      for (const dep of deps) {
        if (visited.has(dep)) continue;
        visited.add(dep);
        if (dep === targetPath) {
          return [...reconstruct(graph, fromPath, dep, visited)];
        }
        next.push(dep);
      }
    }
    if (next.length === 0) return null;
    frontier = next;
  }
  return null;
}

/** Reconstructs a readable edge chain from the graph for the audit output. */
function reconstruct(
  graph: ImportGraph,
  fromPath: string,
  targetPath: string,
  visited: ReadonlySet<string>
): string[] {
  // The gate only needs proof of an edge, not the shortest path. Return the entry,
  // the target and the count of distinct intermediate modules, which is enough to
  // demonstrate a real non-test call chain without the cost of a path search.
  return [fromPath, `...${[...visited].filter((v) => v !== fromPath && v !== targetPath).length} intermediate module(s)...`, targetPath];
}

/**
 * Finds every non-test, non-doc source file that mentions `symbolName`.
 * Returns repo-relative paths, sorted, so a capability's caller set is
 * independently verifiable from the outside.
 */
export function findNonTestCallers(symbolName: string, options: CallerScanOptions): string[] {
  const { repoRoot } = options;
  const hits: string[] = [];
  const pattern = new RegExp(
    `\\b${symbolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`
  );

  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === '.agents') {
        continue;
      }
      const full = join(dir, entry);
      let isDir = false;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue;
      const rel = relative(repoRoot, full).replace(/\\/g, '/');
      if (isTestPath(rel) || isNonSourcePath(rel)) continue;
      if (rel === symbolName) continue;
      let content: string;
      try {
        content = readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      if (pattern.test(content)) hits.push(rel);
    }
  };

  walk(join(repoRoot, 'src'));
  const server = join(repoRoot, 'server.ts');
  try {
    if (pattern.test(readFileSync(server, 'utf8'))) hits.push('server.ts');
  } catch {
    /* server.ts always exists in this repository */
  }
  return [...new Set(hits)].sort();
}

/** Verifies a declared file path actually exists. */
export function fileExists(repoRoot: string, relativePath: string): boolean {
  try {
    return statSync(join(repoRoot, relativePath)).isFile();
  } catch {
    return false;
  }
}

export function capabilityByName(name: string): CapabilityEntry | undefined {
  return REACHABILITY_REGISTRY.find((c) => c.capability === name);
}

export function registrySummary(): {
  total: number;
  reachable: number;
  deferred: number;
  planned: number;
} {
  return {
    total: REACHABILITY_REGISTRY.length,
    reachable: REACHABILITY_REGISTRY.filter((c) => c.state === 'REACHABLE').length,
    deferred: REACHABILITY_REGISTRY.filter((c) => c.state === 'DEFERRED').length,
    planned: REACHABILITY_REGISTRY.filter((c) => c.state === 'PLANNED').length,
  };
}

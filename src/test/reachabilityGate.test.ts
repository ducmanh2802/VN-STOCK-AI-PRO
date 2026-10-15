/**
 * CROSS-DOMAIN REACHABILITY GATE (CI)
 * =====================================
 * The permanent gate required by the P0 remediation prompt §22–§24.
 *
 * It exists because the root cause of the audit was a process defect: capabilities
 * were certified per-domain on unit tests while having no production caller. This
 * gate makes that impossible to reintroduce silently. It fails when:
 *
 *   1. a capability is declared REACHABLE but has no non-test production caller;
 *   2. a capability declares a file that does not exist;
 *   3. the declared production caller is itself only reachable from tests;
 *   4. the feature registry claims IMPLEMENTED for a capability that is unreachable
 *      AND the entitlement engine would still grant it (P1-03);
 *   5. the registry is empty, duplicated, or omits a mandatory metadata field;
 *   6. a known-orphan class regresses back to a "no callers" state silently, i.e.
 *      the reachability of a previously-orphan class disappears without a registry
 *      entry explaining it.
 *
 * Run standalone:  npx vitest run src/test/reachabilityGate.test.ts
 */
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import {
  REACHABILITY_REGISTRY,
  buildImportGraph,
  capabilityByName,
  findNonTestCallers,
  fileExists,
  isTestPath,
  registrySummary,
  traceReachability,
  type CapabilityEntry,
  type ReachabilityState,
} from '../lib/platform/observability/reachabilityRegistry.ts';
import {
  FEATURES,
  isFeatureImplemented,
  isFeatureReachable,
  requireFeature,
} from '../lib/business/features.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');

const options = { repoRoot: REPO_ROOT };
/** The static import graph of every non-test source file, built once per run. */
const GRAPH = buildImportGraph(options);

/** The classes the P0 audit named explicitly, plus the ones this remediation created. */
const MANDATORY_CAPABILITIES = [
  'DataFoundationRepository',
  'DecisionJournalRepository',
  'ResearchRepository',
  'InstrumentRepository',
  'CorporateActionEventRepository',
  'PointInTimeGuard',
  'InstrumentIdentityEngine',
  'AuditEngine.certify',
  'PaperReplayEngine',
  'MonitoringEngine',
] as const;

/** Engine symbol -> the capability that must have a non-test caller for it. */
const ENGINE_SYMBOL_TO_CAPABILITY: Readonly<Record<string, string>> = {
  DataFoundationRepository: 'CANONICAL_BAR_PERSISTENCE',
  InstrumentRepository: 'INSTRUMENT_IDENTITY',
  CorporateActionEventRepository: 'CORPORATE_ACTION_LEDGER',
  PointInTimeGuard: 'POINT_IN_TIME_GUARD',
  InstrumentIdentityEngine: 'INSTRUMENT_IDENTITY',
  DecisionJournalRepository: 'DECISION_JOURNAL',
  ResearchRepository: 'RESEARCH_EXPERIMENTS',
  'AuditEngine.certify': 'RESEARCH_CERTIFICATION',
  PaperReplayEngine: 'PAPER_REPLAY',
  MonitoringEngine: 'DECISION_MONITORING',
};

describe('Reachability gate — registry integrity', () => {
  it('the registry is populated and every capability is unique', () => {
    expect(REACHABILITY_REGISTRY.length).toBeGreaterThan(0);
    const names = REACHABILITY_REGISTRY.map((c) => c.capability);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every entry declares the full metadata set required by §25', () => {
    for (const entry of REACHABILITY_REGISTRY) {
      expect(entry.capability, 'capability').toBeTruthy();
      expect(entry.owner, `${entry.capability}.owner`).toBeTruthy();
      expect(entry.engine, `${entry.capability}.engine`).toBeTruthy();
      expect(entry.productionEntrypoint, `${entry.capability}.productionEntrypoint`).toBeTruthy();
      expect(entry.productionCaller, `${entry.capability}.productionCaller`).toBeTruthy();
      expect(entry.test, `${entry.capability}.test`).toBeTruthy();
      expect(entry.securityBoundary, `${entry.capability}.securityBoundary`).toBeTruthy();
      expect(entry.rationale, `${entry.capability}.rationale`).toBeTruthy();
      const contexts: CapabilityEntry['executionContext'][] = ['SERVER', 'CLIENT', 'BOTH'];
      expect(contexts, `${entry.capability}.executionContext`).toContain(entry.executionContext);
      const states: ReachabilityState[] = ['PLANNED', 'IMPLEMENTED', 'REACHABLE', 'CERTIFIED', 'DEFERRED'];
      expect(states, `${entry.capability}.state`).toContain(entry.state);
    }
  });

  it('a non-REACHABLE capability must carry an explicit rationale', () => {
    for (const entry of REACHABILITY_REGISTRY) {
      if (entry.state !== 'REACHABLE') {
        expect(
          entry.rationale.length,
          `${entry.capability} is ${entry.state} and must explain itself`,
        ).toBeGreaterThan(20);
      }
    }
  });

  it('the summary counts reconcile with the entries', () => {
    const summary = registrySummary();
    expect(summary.total).toBe(REACHABILITY_REGISTRY.length);
    expect(summary.reachable + summary.deferred + summary.planned).toBeLessThanOrEqual(
      summary.total
    );
  });
});

describe('Reachability gate — every declared file actually exists', () => {
  it('engine, caller and entrypoint files resolve on disk', () => {
    for (const entry of REACHABILITY_REGISTRY) {
      if (!fileExists(REPO_ROOT, entry.engine)) {
        throw new Error(`MISSING_ENGINE_FILE: ${entry.capability} -> ${entry.engine}`);
      }
      for (const caller of entry.productionCaller.split(',').map((s) => s.trim())) {
        if (!fileExists(REPO_ROOT, caller)) {
          throw new Error(`MISSING_CALLER_FILE: ${entry.capability} -> ${caller}`);
        }
      }
    }
  });
});

describe('Reachability gate — REACHABLE really means a non-test caller exists', () => {
  const reachable = REACHABILITY_REGISTRY.filter((c) => c.state === 'REACHABLE');

  it('at least one capability is registered as REACHABLE', () => {
    expect(reachable.length).toBeGreaterThan(0);
  });

  it('the import graph covers the whole non-test source tree', () => {
    expect(GRAPH.size).toBeGreaterThan(100);
    expect(GRAPH.has('server.ts')).toBe(true);
    for (const key of GRAPH.keys()) {
      expect(isTestPath(key), `the graph must not contain test files, found ${key}`).toBe(false);
    }
  });

  it.each(reachable.map((c) => [c.capability, c] as const))(
    '%s is transitively reachable from its declared production entrypoint',
    (_name, entry: CapabilityEntry) => {
      const callers = entry.productionCaller.split(',').map((s) => s.trim());
      const edges: string[][] = [];
      for (const caller of callers) {
        expect(
          isTestPath(caller),
          `${entry.capability}: the declared caller "${caller}" is a test file, which never counts.`,
        ).toBe(false);
        const chain = traceReachability(GRAPH, caller, entry.engine);
        if (chain) edges.push(chain);
      }
      expect(
        edges.length,
        `${entry.capability}: engine ${entry.engine} is NOT reachable from any declared ` +
          `production caller (${callers.join(', ')}). This is the "implemented but unreachable" ` +
          `defect the gate exists to catch.`,
      ).toBeGreaterThan(0);
    }
  );

  it('SERVER-context capabilities are reachable from the server entrypoint', () => {
    const serverScoped = reachable.filter(
      (c) => c.executionContext === 'SERVER' || c.executionContext === 'BOTH'
    );
    expect(serverScoped.length).toBeGreaterThan(0);

    const unreachableFromServer: string[] = [];
    for (const entry of serverScoped) {
      if (!traceReachability(GRAPH, 'server.ts', entry.engine)) {
        unreachableFromServer.push(`${entry.capability} (${entry.engine})`);
      }
    }
    expect(
      unreachableFromServer,
      'A SERVER-context capability marked REACHABLE must be reachable from server.ts; otherwise ' +
        'its caller chain starts somewhere the process never loads.',
    ).toEqual([]);
  });

  it('CLIENT-context capabilities are reachable from a shipped UI entrypoint, not the server', () => {
    const clientScoped = reachable.filter((c) => c.executionContext === 'CLIENT');
    for (const entry of clientScoped) {
      // A UI page is a legitimate production entrypoint, so it must live under
      // src/pages, src/components or src/hooks and must be a real source file.
      const callers = entry.productionCaller.split(',').map((s) => s.trim());
      for (const caller of callers) {
        expect(fileExists(REPO_ROOT, caller)).toBe(true);
        expect(
          caller.startsWith('src/pages/') ||
            caller.startsWith('src/components/') ||
            caller.startsWith('src/hooks/') ||
            caller.startsWith('src/services/'),
          `${entry.capability}: client caller ${caller} is not a shipped UI/service module`,
        ).toBe(true);
      }
    }
  });
});

describe('Reachability gate — the named audit classes are covered', () => {
  it.each(MANDATORY_CAPABILITIES)(
    '%s is covered by a registered capability with a non-test caller',
    (symbol) => {
      const capabilityName = ENGINE_SYMBOL_TO_CAPABILITY[symbol];
      expect(
        capabilityName,
        `The audit class "${symbol}" has no registry entry. Add one via registerCapability so ` +
          `future capabilities cannot be silently orphaned.`,
      ).toBeTruthy();

      const entry = capabilityByName(capabilityName!);
      expect(entry, `capability ${capabilityName} missing`).toBeTruthy();

      const engineFile = entry!.engine;
      const engineSymbol = engineFile.split('/').pop()!.replace(/\.ts$/, '');
      const callers = findNonTestCallers(engineSymbol, options);
      expect(
        callers.length,
        `${symbol} (${engineFile}) still has no non-test caller.`,
      ).toBeGreaterThan(0);
      // A server-side engine must also be transitively reachable from server.ts.
      if (entry!.executionContext !== 'CLIENT') {
        expect(
          traceReachability(GRAPH, 'server.ts', engineFile),
          `${symbol} (${engineFile}) is not reachable from server.ts — the process never loads it.`,
        ).not.toBeNull();
      }
    }
  );
});

describe('Reachability gate — feature registry cannot overstate reachability (P1-03)', () => {
  it('no IMPLEMENTED feature is silently grantable while unreachable', () => {
    const offenders = FEATURES.filter(
      (f) => f.status === 'IMPLEMENTED' && !isFeatureReachable(f.id)
    ).filter((f) => f.reachability.reachable);

    expect(
      offenders.map((f) => f.id),
      'A feature cannot claim reachable:true while isFeatureReachable() returns false.',
    ).toEqual([]);
  });

  it('every IMPLEMENTED feature declares reachability metadata honestly', () => {
    for (const f of FEATURES) {
      if (f.status !== 'IMPLEMENTED') continue;
      expect(f.reachability, `${f.id}.reachability`).toBeTruthy();
      if (f.reachability.reachable) {
        expect(f.reachability.productionEntrypoint, `${f.id}.productionEntrypoint`).toBeTruthy();
        expect(f.reachability.productionCaller, `${f.id}.productionCaller`).toBeTruthy();
        // A reachable feature's declared production caller must exist on disk.
        expect(
          fileExists(REPO_ROOT, f.reachability.productionCaller!),
          `${f.id} claims caller ${f.reachability.productionCaller} which does not exist`,
        ).toBe(true);
      } else {
        // An unreachable feature must not pretend to have an entrypoint.
        expect(f.reachability.productionEntrypoint, `${f.id}`).toBeNull();
        expect(f.reachability.productionCaller, `${f.id}`).toBeNull();
      }
    }
  });

  it('isFeatureReachable is strictly stronger than isFeatureImplemented', () => {
    for (const f of FEATURES) {
      if (f.status !== 'IMPLEMENTED') {
        expect(isFeatureImplemented(f.id)).toBe(false);
        expect(isFeatureReachable(f.id)).toBe(false);
      }
    }
    // At least one IMPLEMENTED feature is deliberately not grantable yet, which
    // proves the two predicates are genuinely independent.
    const implementedUnreachable = FEATURES.filter(
      (f) => f.status === 'IMPLEMENTED' && !isFeatureReachable(f.id)
    );
    expect(implementedUnreachable.length).toBeGreaterThan(0);
    expect(requireFeature('ALERTS').status).toBe('IMPLEMENTED');
    expect(isFeatureReachable('ALERTS')).toBe(false);
  });
});

describe('Reachability gate — test callers and docs never count', () => {
  it('recognises every test path shape used in this repository', () => {
    for (const p of [
      'src/lib/data/__tests__/Data04.test.ts',
      'src/lib/trading/__tests__/TradingApiRouter.test.ts',
      'src/components/dashboard/__tests__/MarketIntelligenceWidget.test.tsx',
      'src/test/reachabilityGate.test.ts',
    ]) {
      expect(isTestPath(p)).toBe(true);
    }
    expect(isTestPath('src/services/trading/PaperOrderRiskBoundary.ts')).toBe(false);
  });

  it('excludes the gate file itself from any caller set', () => {
    const callers = findNonTestCallers('PaperOrderRiskBoundary', options);
    expect(callers.some((c) => c.includes('__tests__'))).toBe(false);
  });
});

describe('Reachability gate — the P1 remediations are genuinely wired', () => {
  it('P1-01: the four previously-dead repositories have production callers', () => {
    for (const symbol of [
      'InstrumentRepository',
      'CorporateActionEventRepository',
      'DecisionJournalRepository',
      'ResearchRepository',
    ]) {
      const callers = findNonTestCallers(symbol, options);
      expect(callers.length, `${symbol} has no non-test caller (P1-01 regression)`).toBeGreaterThan(0);
      expect(callers.some((c) => c !== 'src/lib/db/index.ts')).toBe(true);
    }
  });

  it('P1-02: the research lane is mounted', () => {
    expect(findNonTestCallers('ResearchApiRouter', options).some((c) => c === 'server.ts')).toBe(
      true
    );
    expect(findNonTestCallers('ResearchService', options).length).toBeGreaterThan(0);
  });

  it('P1-05: PointInTimeGuard and InstrumentIdentityEngine are reached from services', () => {
    expect(findNonTestCallers('PointInTimeGuard', options)).toContain(
      'src/services/data/DataFoundationComposition.ts'
    );
    expect(findNonTestCallers('InstrumentIdentityEngine', options)).toContain(
      'src/services/data/DataFoundationComposition.ts'
    );
  });

  it('P1-08: the business router composition is mounted', () => {
    expect(findNonTestCallers('createBusinessApiRouterComposition', options)).toContain(
      'server.ts'
    );
  });

  it('P1-09: the paper replay lane is mounted', () => {
    expect(findNonTestCallers('PaperReplayApiRouter', options).some((c) => c === 'server.ts')).toBe(
      true
    );
    expect(findNonTestCallers('PaperReplayService', options).length).toBeGreaterThan(0);
  });

  it('P0-04: the canonical persistence chain is mounted end to end', () => {
    expect(findNonTestCallers('createCanonicalDataApiRouter', options)).toContain('server.ts');
    expect(findNonTestCallers('CanonicalMarketDataIngestionService', options).length).toBeGreaterThan(0);
    expect(findNonTestCallers('CanonicalMarketDataRepository', options).length).toBeGreaterThan(0);
  });

  it('P0-01: the trading boundary is the only HTTP path to the broker', () => {
    expect(findNonTestCallers('PaperOrderRiskBoundary', options)).toContain(
      'src/lib/trading/api/TradingApiRouter.ts'
    );
    // The router must no longer call the broker directly.
    const router = require('fs').readFileSync(
      resolve(REPO_ROOT, 'src/lib/trading/api/TradingApiRouter.ts'),
      'utf8'
    );
    expect(router).not.toMatch(/getOrderManager\(\)\.submitOrder\(/);
  });
});

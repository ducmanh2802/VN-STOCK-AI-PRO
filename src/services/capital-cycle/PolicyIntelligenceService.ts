/**
 * PHASE 26 — POLICY & CAPITAL CYCLE INTELLIGENCE SERVICE
 * ======================================================
 * Production orchestrator providing cached, REAL-DATA-FIRST Industry Capital
 * Cycle, Policy Events, Mega-Projects, Beneficiaries, Backlog and Governance
 * intelligence.
 *
 * PROVENANCE:
 *   - All inputs are sourced from the persistence layer via CapitalCycleDataSource
 *     (default: DrizzleCapitalCycleDataSource → Phase 26 tables + Phase 24
 *     financial_facts_v2 TTM). There are NO hardcoded production datasets.
 *   - When the source is unavailable/empty the snapshot fails closed
 *     (freshness UNAVAILABLE, empty collections, capitalCycleSnapshot null).
 *
 * CACHE:
 *   - In-memory 60s TTL cache keyed by sector + symbol + asOfDate (isolated).
 */

import { cacheGet, cacheSet } from '../market/marketDataCache.ts';
import {
  PolicyEventEngine,
  StrategicProjectEngine,
  BeneficiaryMappingEngine,
  BacklogConversionEngine,
  CapitalCycleEngine,
  GovernanceEventEngine,
  EvidenceGraphEngine,
  type IndustryCapitalCycleAndPolicySnapshot,
  type IndustryCapitalCycleSnapshot,
  type CompanyBacklogSummary,
  type BacklogRevenueConversionResult,
} from '../../lib/capital-cycle/index.ts';
import {
  DrizzleCapitalCycleDataSource,
  emptyCapitalCycleData,
  type CapitalCycleDataSource,
  type CapitalCycleRawData,
} from './CapitalCycleDataProvider.ts';
import { combineFreshness } from '../earnings/EarningsDataProvider.ts';

const CACHE_KEY_PREFIX = 'CAPITAL_CYCLE_POLICY_SNAPSHOT';
const CACHE_TTL_MS = 60_000; // 60s cache

export interface GetCapitalCycleSnapshotOptions {
  readonly asOfDate?: string;
  readonly symbol?: string;
  readonly sectorId?: string;
  readonly forceRefresh?: boolean;
  /** Injected real-data source (defaults to the DB-backed provider). */
  readonly dataSource?: CapitalCycleDataSource;
  /** Pre-fetched real records (bypasses the data source). */
  readonly data?: CapitalCycleRawData;
}

export class PolicyIntelligenceService {
  private static readonly defaultDataSource: CapitalCycleDataSource = new DrizzleCapitalCycleDataSource();

  /**
   * Retrieves or builds the full IndustryCapitalCycleAndPolicySnapshot.
   */
  public static async getSnapshot(
    options?: GetCapitalCycleSnapshotOptions
  ): Promise<IndustryCapitalCycleAndPolicySnapshot> {
    const asOfDate = options?.asOfDate ?? new Date().toISOString().slice(0, 10);
    const symbol = options?.symbol ? options.symbol.trim().toUpperCase() : null;
    const sectorId = options?.sectorId ? options.sectorId.trim().toLowerCase() : null;
    const cacheKey = `${CACHE_KEY_PREFIX}_${sectorId || 'ALL'}_${symbol || 'ALL'}_${asOfDate}`;

    if (!options?.forceRefresh) {
      const cached = cacheGet<IndustryCapitalCycleAndPolicySnapshot>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const data = await this.resolveData({ asOfDate, symbol, sectorId }, options);

    // 1. Filter policies (lookahead-safe)
    const { validPolicies, lookaheadViolations: policyViolations } =
      PolicyEventEngine.filterPoliciesAsOf(data.policies, { asOfDate, sectorFilter: sectorId ?? undefined });

    // 2. Filter projects (lookahead-safe)
    const { validProjects, lookaheadViolations: projectViolations } =
      StrategicProjectEngine.filterProjectsAsOf(data.projects, { asOfDate, sectorFilter: sectorId ?? undefined });

    // 3. Filter beneficiaries (evidence-tiered, lookahead-safe)
    const { confirmedBeneficiaries, lookaheadViolations: beneficiaryViolations } =
      BeneficiaryMappingEngine.filterBeneficiaries(data.beneficiaries, { asOfDate, symbol: symbol ?? undefined });

    // 4. Backlog summary + conversion (TTM revenue sourced, never fabricated)
    let backlogSummary: CompanyBacklogSummary | null = null;
    let backlogConversion: BacklogRevenueConversionResult | null = null;
    if (symbol) {
      backlogSummary = BacklogConversionEngine.summarizeBacklog(
        symbol,
        data.backlogItems,
        data.ttmRevenueVnd,
        asOfDate
      );
      backlogConversion = BacklogConversionEngine.projectRevenueConversion(backlogSummary);
    }

    // 5. Capital Cycle stage — only when REAL drivers are available (else null/fail-closed)
    let capitalCycleSnapshot: IndustryCapitalCycleSnapshot | null = null;
    if (sectorId && data.capitalCycleDrivers) {
      capitalCycleSnapshot = CapitalCycleEngine.evaluateSnapshot({
        sectorId,
        sectorName: sectorId.toUpperCase(),
        asOfDate,
        drivers: data.capitalCycleDrivers,
        policies: validPolicies,
        projects: validProjects,
      });
    }

    // 6. Governance risk (lookahead-safe)
    const governanceRiskResult = GovernanceEventEngine.deriveGovernanceRiskStatus(
      symbol ?? '',
      data.governanceEvents,
      asOfDate
    );

    // 7. Evidence graph (provenance carried from source records)
    const evidenceGraph = EvidenceGraphEngine.buildGraph({
      rootSectorId: sectorId ?? 'GENERAL',
      asOfDate,
      policies: validPolicies,
      projects: validProjects,
      beneficiaries: confirmedBeneficiaries,
      backlogs: backlogSummary ? [backlogSummary] : [],
      governanceEvents: governanceRiskResult.activeEvents,
    });

    const allViolations = [...policyViolations, ...projectViolations, ...beneficiaryViolations];

    const freshness = combineFreshness([
      ...validPolicies.map((p) => p.provenance.freshness),
      ...validProjects.map((p) => p.provenance.freshness),
      ...confirmedBeneficiaries.map((b) => b.provenance.freshness),
      ...governanceRiskResult.activeEvents.map((g) => g.provenance.freshness),
    ]);

    const snapshot: IndustryCapitalCycleAndPolicySnapshot = {
      snapshotId: `SNAPSHOT_P26_${sectorId || 'ALL'}_${symbol || 'ALL'}_${asOfDate}`,
      asOfDate,
      symbol,
      sectorId,
      policyEvents: validPolicies,
      strategicProjects: validProjects,
      confirmedBeneficiaries,
      backlogSummary,
      backlogConversion,
      capitalCycleSnapshot,
      governanceEvents: governanceRiskResult.activeEvents,
      governanceRiskStatus: governanceRiskResult.riskStatus,
      evidenceGraph,
      freshness,
      lookaheadRejected: allViolations.length > 0,
      lookaheadViolations: allViolations,
    };

    cacheSet(cacheKey, snapshot, CACHE_TTL_MS);
    return snapshot;
  }

  /**
   * Resolves real source data. Uses an injected payload/source when provided,
   * otherwise the DB-backed default. Never throws — source failures fail closed.
   */
  private static async resolveData(
    request: { asOfDate: string; symbol: string | null; sectorId: string | null },
    options?: GetCapitalCycleSnapshotOptions
  ): Promise<CapitalCycleRawData> {
    if (options?.data) return options.data;
    const source = options?.dataSource ?? this.defaultDataSource;
    try {
      return await source.fetch({
        asOfDate: request.asOfDate,
        symbol: request.symbol,
        sectorId: request.sectorId,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return emptyCapitalCycleData(`DATA_UNAVAILABLE: capital cycle data source failure (${reason})`);
    }
  }
}

import type {
  IndustryCapitalCycleAndPolicySnapshot,
  PolicyEvent,
  StrategicProject,
  ProjectBeneficiary,
  BacklogItem,
  LegalGovernanceEvent,
  IndustryCycleDrivers,
} from '../../lib/capital-cycle/types.ts';
import { PolicyEventEngine } from '../../lib/capital-cycle/PolicyEventEngine.ts';
import { StrategicProjectEngine } from '../../lib/capital-cycle/StrategicProjectEngine.ts';
import { BeneficiaryMappingEngine } from '../../lib/capital-cycle/BeneficiaryMappingEngine.ts';
import { BacklogConversionEngine } from '../../lib/capital-cycle/BacklogConversionEngine.ts';
import { CapitalCycleEngine } from '../../lib/capital-cycle/CapitalCycleEngine.ts';
import { GovernanceEventEngine } from '../../lib/capital-cycle/GovernanceEventEngine.ts';
import { EvidenceGraphEngine } from '../../lib/capital-cycle/EvidenceGraphEngine.ts';
import { cached } from '../market/marketDataCache.ts';

export interface PolicyIntelligenceOptions {
  sectorId?: string;
  symbol?: string;
  asOfDate?: string;
  forceRefresh?: boolean;
  data?: {
    policies?: readonly PolicyEvent[];
    projects?: readonly StrategicProject[];
    beneficiaries?: readonly ProjectBeneficiary[];
    backlogItems?: readonly BacklogItem[];
    governanceEvents?: readonly LegalGovernanceEvent[];
    capitalCycleDrivers?: IndustryCycleDrivers;
    ttmRevenueVnd?: number;
    freshness?: any;
    issues?: readonly string[];
  };
}

export class PolicyIntelligenceService {
  public static async getSnapshot(
    options: PolicyIntelligenceOptions
  ): Promise<IndustryCapitalCycleAndPolicySnapshot> {
    const asOfDate = options.asOfDate ?? new Date().toISOString().slice(0, 10);
    const symbol = options.symbol?.trim().toUpperCase() ?? null;
    const sectorId = options.sectorId ?? 'materials';
    const key = `policy_snapshot_${sectorId}_${symbol ?? 'ALL'}_${asOfDate}`;

    const fetcher = async (): Promise<IndustryCapitalCycleAndPolicySnapshot> => {
      const inputPolicies = options.data?.policies ?? [];
      const inputProjects = options.data?.projects ?? [];
      const inputBeneficiaries = options.data?.beneficiaries ?? [];
      const inputBacklog = options.data?.backlogItems ?? [];
      const inputGov = options.data?.governanceEvents ?? [];

      const policyFilter = PolicyEventEngine.filterPoliciesAsOf(inputPolicies, { asOfDate });
      const projFilter = StrategicProjectEngine.filterProjectsAsOf(inputProjects, { asOfDate });
      const benFilter = BeneficiaryMappingEngine.filterBeneficiaries(inputBeneficiaries, { asOfDate });
      const govResult = GovernanceEventEngine.deriveGovernanceRiskStatus(symbol ?? 'MARKET', inputGov, asOfDate);

      let backlogSummary = null;
      let backlogConversion = null;
      if (symbol && inputBacklog.length > 0) {
        backlogSummary = BacklogConversionEngine.summarizeBacklog(
          symbol,
          inputBacklog,
          options.data?.ttmRevenueVnd ?? null,
          asOfDate
        );
        backlogConversion = BacklogConversionEngine.projectRevenueConversion(backlogSummary);
      }

      let capitalCycle = null;
      if (options.data?.capitalCycleDrivers) {
        capitalCycle = CapitalCycleEngine.evaluate({
          sectorId,
          sectorName: sectorId,
          asOfDate,
          drivers: options.data.capitalCycleDrivers,
          policies: policyFilter.validPolicies,
          projects: projFilter.validProjects,
        });
      }

      const evidenceGraph = EvidenceGraphEngine.buildGraph({
        rootSectorId: sectorId,
        asOfDate,
        policies: policyFilter.validPolicies,
        projects: projFilter.validProjects,
        beneficiaries: benFilter.confirmedBeneficiaries,
        backlogs: backlogSummary ? [backlogSummary] : [],
        governanceEvents: govResult.activeEvents,
      });

      return {
        snapshotId: `CC-${sectorId}-${asOfDate}`,
        asOfDate,
        symbol,
        sectorId,
        policyEvents: policyFilter.validPolicies,
        strategicProjects: projFilter.validProjects,
        confirmedBeneficiaries: benFilter.confirmedBeneficiaries,
        backlogSummary,
        backlogConversion,
        capitalCycleSnapshot: capitalCycle,
        governanceEvents: govResult.activeEvents,
        governanceRiskStatus: govResult.riskStatus,
        evidenceGraph,
        freshness: options.data?.freshness ?? 'CURRENT',
        lookaheadRejected: benFilter.lookaheadViolations.length > 0,
        lookaheadViolations: benFilter.lookaheadViolations,
      };
    };

    if (options.forceRefresh) {
      return fetcher();
    }
    return cached(key, fetcher, 30000);
  }
}

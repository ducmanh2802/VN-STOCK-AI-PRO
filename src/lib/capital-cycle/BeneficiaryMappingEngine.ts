/**
 * PHASE 26 — BENEFICIARY MAPPING ENGINE
 * =====================================
 * Evidence-tiered mapping connecting Strategic Mega-Projects to Listed Companies.
 *
 * CONSTITUTIONAL INVARIANTS:
 *   - Rumors and Tier 4 unverified sources are NEVER classified as confirmed beneficiaries.
 *   - Rumors and potential beneficiaries NEVER contribute to deterministic backlog values.
 *   - 'isConfirmedBeneficiary' is true ONLY for official tenders, contracts, or statutory filings.
 */

import type {
  ProjectBeneficiary,
  BeneficiaryEvidenceTier,
  DataFreshnessStatus,
} from './types.ts';

export interface EvaluateBeneficiaryOptions {
  readonly asOfDate?: string;
  readonly symbol?: string;
  readonly projectId?: string;
  readonly minEvidenceTier?: BeneficiaryEvidenceTier;
}

export class BeneficiaryMappingEngine {
  public static readonly VERSION = 'v1.0.0-phase26';

  /**
   * Evaluates and classifies evidence level for a project beneficiary.
   */
  public static isConfirmedEvidence(tier: BeneficiaryEvidenceTier): boolean {
    return (
      tier === 'OFFICIAL_CONTRACT' ||
      tier === 'OFFICIAL_TENDER_AWARD' ||
      tier === 'OFFICIAL_COMPANY_DISCLOSURE' ||
      tier === 'OFFICIAL_PROJECT_DOCUMENT'
    );
  }

  /**
   * Filters and normalizes project beneficiaries with strict rumor exclusion.
   */
  public static filterBeneficiaries(
    beneficiaries: readonly ProjectBeneficiary[],
    options?: EvaluateBeneficiaryOptions
  ): {
    confirmedBeneficiaries: ProjectBeneficiary[];
    unconfirmedBeneficiaries: ProjectBeneficiary[];
    rejectedRumorsCount: number;
    totalConfirmedContractValueVnd: number | null;
    lookaheadViolations: string[];
  } {
    const asOfDate = options?.asOfDate ?? new Date().toISOString().slice(0, 10);
    const targetSymbol = options?.symbol?.toUpperCase();
    const targetProjectId = options?.projectId;

    const confirmedBeneficiaries: ProjectBeneficiary[] = [];
    const unconfirmedBeneficiaries: ProjectBeneficiary[] = [];
    const lookaheadViolations: string[] = [];
    let rejectedRumorsCount = 0;
    let totalConfirmedValue: number | null = null;

    for (const b of beneficiaries) {
      // 1. Lookahead check
      const pubDate = b.provenance.publicationDate || b.awardDate || asOfDate;
      if (pubDate > asOfDate) {
        lookaheadViolations.push(
          `Beneficiary mapping for ${b.symbol} on ${b.projectId} (${pubDate}) > asOfDate (${asOfDate})`
        );
        continue;
      }

      // 2. Symbol / Project filters
      if (targetSymbol && b.symbol.toUpperCase() !== targetSymbol) {
        continue;
      }
      if (targetProjectId && b.projectId !== targetProjectId) {
        continue;
      }

      // 3. Strict Rumor & Tier 4 Check
      if (
        b.evidenceTier === 'RUMOR' ||
        b.evidenceTier === 'UNVERIFIED_SECONDARY_SOURCE' ||
        b.role === 'UNVERIFIED'
      ) {
        rejectedRumorsCount++;
        unconfirmedBeneficiaries.push({
          ...b,
          isConfirmedBeneficiary: false,
          confirmedBacklogShareVnd: null, // Zero contribution to backlog
        });
        continue;
      }

      // 4. Confirmation verification
      const isConfirmed = this.isConfirmedEvidence(b.evidenceTier);
      if (isConfirmed && b.role !== 'POTENTIAL_BENEFICIARY') {
        confirmedBeneficiaries.push({
          ...b,
          isConfirmedBeneficiary: true,
        });

        const val = b.confirmedBacklogShareVnd ?? b.contractValueVnd;
        if (val && val > 0) {
          totalConfirmedValue = (totalConfirmedValue ?? 0) + val;
        }
      } else {
        unconfirmedBeneficiaries.push({
          ...b,
          isConfirmedBeneficiary: false,
          confirmedBacklogShareVnd: null,
        });
      }
    }

    return {
      confirmedBeneficiaries,
      unconfirmedBeneficiaries,
      rejectedRumorsCount,
      totalConfirmedContractValueVnd: totalConfirmedValue,
      lookaheadViolations,
    };
  }

  /**
   * Summarizes all strategic project exposures for a given listed company.
   */
  public static summarizeCompanyProjectExposure(
    symbol: string,
    beneficiaries: readonly ProjectBeneficiary[],
    asOfDate?: string
  ): {
    symbol: string;
    confirmedProjectCount: number;
    potentialProjectCount: number;
    totalConfirmedContractValueVnd: number | null;
    highestRole: string | null;
    freshness: DataFreshnessStatus;
  } {
    const { confirmedBeneficiaries, unconfirmedBeneficiaries, totalConfirmedContractValueVnd } =
      this.filterBeneficiaries(beneficiaries, { asOfDate, symbol });

    const confirmedCount = confirmedBeneficiaries.length;
    const potentialCount = unconfirmedBeneficiaries.filter(
      (b) => b.role === 'POTENTIAL_BENEFICIARY'
    ).length;

    let highestRole: string | null = null;
    if (confirmedBeneficiaries.some((b) => b.role === 'DIRECT_CONTRACTOR')) {
      highestRole = 'DIRECT_CONTRACTOR';
    } else if (confirmedBeneficiaries.some((b) => b.role === 'JOINT_CONTRACTOR')) {
      highestRole = 'JOINT_CONTRACTOR';
    } else if (confirmedBeneficiaries.some((b) => b.role === 'SUBCONTRACTOR')) {
      highestRole = 'SUBCONTRACTOR';
    } else if (confirmedBeneficiaries.some((b) => b.role === 'MATERIAL_SUPPLIER' || b.role === 'EQUIPMENT_SUPPLIER')) {
      highestRole = 'SUPPLIER';
    }

    const freshness: DataFreshnessStatus =
      confirmedCount > 0
        ? confirmedBeneficiaries.some((b) => b.provenance.freshness === 'CURRENT')
          ? 'CURRENT'
          : 'STALE'
        : 'UNAVAILABLE';

    return {
      symbol: symbol.toUpperCase(),
      confirmedProjectCount: confirmedCount,
      potentialProjectCount: potentialCount,
      totalConfirmedContractValueVnd: totalConfirmedContractValueVnd,
      highestRole,
      freshness,
    };
  }
}

/**
 * PHASE 26 — POLICY EVENT ENGINE
 * ==============================
 * Deterministic ingestion, filtering, and quantitative target evaluation for
 * Government & Regulatory Policies affecting industries.
 *
 * INVARIANTS:
 *   - Strictly fail-closed if document number or source provenance is missing.
 *   - Lookahead guard: Policies published after evaluation `asOfDate` are filtered out.
 *   - Rumors or draft leaks without official gazette/portal IDs are flagged INVALID.
 */

import type {
  PolicyEvent,
  PolicyStatus,
  DataFreshnessStatus,
  EntityValidationStatus,
} from './types.ts';

export interface EvaluatePolicyOptions {
  readonly asOfDate?: string;
  readonly sectorFilter?: string;
  readonly activeOnly?: boolean;
}

export class PolicyEventEngine {
  public static readonly VERSION = 'v1.0.0-phase26';

  /**
   * Validates a single PolicyEvent for structural integrity and provenance.
   */
  public static validatePolicy(policy: PolicyEvent): {
    isValid: boolean;
    errors: string[];
    validationStatus: EntityValidationStatus;
  } {
    const errors: string[] = [];

    if (!policy.policyEventId || policy.policyEventId.trim().length === 0) {
      errors.push('Missing policyEventId');
    }
    if (!policy.documentNumber || policy.documentNumber.trim().length === 0) {
      errors.push('Missing official document number / resolution ID');
    }
    if (!policy.title || policy.title.trim().length === 0) {
      errors.push('Missing policy title');
    }
    if (!policy.announcementDate || !/^\d{4}-\d{2}-\d{2}$/.test(policy.announcementDate)) {
      errors.push(`Invalid announcementDate format: ${policy.announcementDate}`);
    }
    if (policy.effectiveDate && !/^\d{4}-\d{2}-\d{2}$/.test(policy.effectiveDate)) {
      errors.push(`Invalid effectiveDate format: ${policy.effectiveDate}`);
    }
    if (!policy.provenance || !policy.provenance.source) {
      errors.push('Missing source provenance');
    }
    if (policy.targetInvestmentVnd !== undefined && policy.targetInvestmentVnd !== null) {
      if (isNaN(policy.targetInvestmentVnd) || policy.targetInvestmentVnd < 0) {
        errors.push(`Invalid targetInvestmentVnd: ${policy.targetInvestmentVnd}`);
      }
    }

    const isValid = errors.length === 0;
    const validationStatus: EntityValidationStatus = isValid
      ? 'VALID'
      : policy.provenance?.sourceTier === 'TIER_4_UNVERIFIED'
        ? 'INVALID'
        : 'SUSPECT';

    return { isValid, errors, validationStatus };
  }

  /**
   * Filters and normalizes a collection of policies as of a specific historical date.
   * Protects against lookahead bias.
   */
  public static filterPoliciesAsOf(
    policies: readonly PolicyEvent[],
    options?: EvaluatePolicyOptions
  ): {
    validPolicies: PolicyEvent[];
    filteredCount: number;
    lookaheadViolations: string[];
  } {
    const asOfDate = options?.asOfDate ?? new Date().toISOString().slice(0, 10);
    const sectorFilter = options?.sectorFilter?.toLowerCase();
    const activeOnly = options?.activeOnly ?? true;

    const validPolicies: PolicyEvent[] = [];
    const lookaheadViolations: string[] = [];
    let filteredCount = 0;

    for (const p of policies) {
      // 1. Lookahead check: Published or announced date must not exceed asOfDate
      const pubDate = p.provenance.publicationDate || p.announcementDate;
      if (pubDate > asOfDate) {
        lookaheadViolations.push(
          `Policy ${p.documentNumber} (${pubDate}) is after evaluation date (${asOfDate})`
        );
        filteredCount++;
        continue;
      }

      // 2. Structural validation
      const validation = this.validatePolicy(p);
      if (!validation.isValid) {
        filteredCount++;
        continue;
      }

      // 3. Sector filter
      if (sectorFilter) {
        const matchesSector = p.affectedSectors.some(
          (s) => s.toLowerCase() === sectorFilter || s.toLowerCase() === 'all'
        );
        if (!matchesSector) {
          filteredCount++;
          continue;
        }
      }

      // 4. Status filter
      if (activeOnly) {
        const inactiveStatuses: PolicyStatus[] = ['CANCELLED', 'EXPIRED', 'SUSPENDED'];
        if (inactiveStatuses.includes(p.status)) {
          filteredCount++;
          continue;
        }
      }

      validPolicies.push(p);
    }

    return { validPolicies, filteredCount, lookaheadViolations };
  }

  /**
   * Computes aggregate policy intensity and planned capital allocation for a sector.
   */
  public static computeSectorPolicyIntensity(
    sectorId: string,
    policies: readonly PolicyEvent[],
    asOfDate?: string
  ): {
    sectorId: string;
    activePolicyCount: number;
    totalTargetCapitalVnd: number | null;
    highestAuthority: string | null;
    supportScore: number; // 0 - 100
    freshness: DataFreshnessStatus;
  } {
    const { validPolicies } = this.filterPoliciesAsOf(policies, {
      asOfDate,
      sectorFilter: sectorId,
      activeOnly: true,
    });

    if (validPolicies.length === 0) {
      return {
        sectorId,
        activePolicyCount: 0,
        totalTargetCapitalVnd: null,
        highestAuthority: null,
        supportScore: 0,
        freshness: 'UNAVAILABLE',
      };
    }

    let totalTargetCapital: number | null = null;
    let weightSum = 0;

    const authorityWeights: Record<string, number> = {
      NATIONAL_ASSEMBLY: 35,
      GOVERNMENT: 30,
      PRIME_MINISTER: 30,
      STATE_BANK_OF_VIETNAM: 25,
      MINISTRY_OF_FINANCE: 25,
      MINISTRY_OF_TRANSPORT: 20,
      MINISTRY_OF_INDUSTRY_AND_TRADE: 20,
      MINISTRY_OF_CONSTRUCTION: 20,
      MINISTRY_OF_PLANNING_AND_INVESTMENT: 20,
      STATE_SECURITIES_COMMISSION: 15,
      PROVINCIAL_PEOPLES_COMMITTEE: 10,
      OTHER_REGULATORY_BODY: 5,
    };

    let highestAuth: string | null = null;
    let highestWeight = 0;

    for (const p of validPolicies) {
      const auth = p.issuingAuthority;
      const w = authorityWeights[auth] || 10;
      weightSum += w;

      if (w > highestWeight) {
        highestWeight = w;
        highestAuth = auth;
      }

      if (p.targetInvestmentVnd && p.targetInvestmentVnd > 0) {
        totalTargetCapital = (totalTargetCapital ?? 0) + p.targetInvestmentVnd;
      }
    }

    // Support score bounded [0, 100]
    const supportScore = Math.min(100, Math.round(weightSum * 1.5));

    // Freshness is current if at least one policy is fresh
    const isCurrent = validPolicies.some((p) => p.provenance.freshness === 'CURRENT');

    return {
      sectorId,
      activePolicyCount: validPolicies.length,
      totalTargetCapitalVnd: totalTargetCapital,
      highestAuthority: highestAuth,
      supportScore,
      freshness: isCurrent ? 'CURRENT' : 'STALE',
    };
  }
}

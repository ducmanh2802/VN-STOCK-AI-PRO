/**
 * PHASE 26 — LEGAL & GOVERNANCE EVENT ENGINE
 * ==========================================
 * Deterministic processing of material corporate legal and governance events
 * with strict provenance and RiskGuard integration contracts.
 *
 * GOVERNANCE RISK RULES:
 *   - LEVEL_4 (Criminal Action / Detention of Chairman/CEO / Mandatory Halt) -> CRITICAL_VERIFIED_GOVERNANCE_EVENT (Blocks RiskGuard).
 *   - LEVEL_3 (Regulatory Enforcement / Manipulation Probe / Special Control) -> MATERIAL_GOVERNANCE_RISK.
 *   - LEVEL_2 (Administrative Tax / Delayed Disclosure / Audit Matter) -> GOVERNANCE_EVENT.
 *   - LEVEL_1 (Informational Notice) -> NO_MATERIAL_GOVERNANCE_EVENT.
 */

import type {
  LegalGovernanceEvent,
  GovernanceSeverityLevel,
  GovernanceRiskStatus,
  DataFreshnessStatus,
  EntityValidationStatus,
} from './types.ts';

export class GovernanceEventEngine {
  public static readonly VERSION = 'v1.0.0-phase26';

  /**
   * Validates a LegalGovernanceEvent.
   */
  public static validateEvent(event: LegalGovernanceEvent): {
    isValid: boolean;
    errors: string[];
    validationStatus: EntityValidationStatus;
  } {
    const errors: string[] = [];

    if (!event.eventId || event.eventId.trim().length === 0) {
      errors.push('Missing eventId');
    }
    if (!event.symbol || event.symbol.trim().length === 0) {
      errors.push('Missing symbol');
    }
    if (!event.title || event.title.trim().length === 0) {
      errors.push('Missing event title');
    }
    if (!event.eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(event.eventDate)) {
      errors.push(`Invalid eventDate: ${event.eventDate}`);
    }
    if (!event.authority || event.authority.trim().length === 0) {
      errors.push('Missing regulatory authority');
    }
    if (!event.provenance || !event.provenance.source) {
      errors.push('Missing source provenance');
    }

    const isValid = errors.length === 0;
    const validationStatus: EntityValidationStatus = isValid
      ? 'VALID'
      : event.provenance?.sourceTier === 'TIER_4_UNVERIFIED'
        ? 'INVALID'
        : 'SUSPECT';

    return { isValid, errors, validationStatus };
  }

  /**
   * Evaluates active governance events for a company and derives RiskGuard GovernanceRiskStatus.
   */
  public static deriveGovernanceRiskStatus(
    symbol: string,
    events: readonly LegalGovernanceEvent[],
    asOfDate?: string
  ): {
    symbol: string;
    riskStatus: GovernanceRiskStatus;
    highestSeverity: GovernanceSeverityLevel | null;
    activeEvents: LegalGovernanceEvent[];
    blockReason?: string;
    freshness: DataFreshnessStatus;
  } {
    const evaluationDate = asOfDate ?? new Date().toISOString().slice(0, 10);
    const sym = symbol.toUpperCase();

    // Filter events as of evaluation date with lookahead protection
    const activeEvents = events.filter((e) => {
      if (e.symbol.toUpperCase() !== sym) return false;
      const pubDate = e.provenance.publicationDate || e.announcementDate || evaluationDate;
      return pubDate <= evaluationDate && e.status !== 'CONCLUDED';
    });

    if (activeEvents.length === 0) {
      return {
        symbol: sym,
        riskStatus: 'NO_MATERIAL_GOVERNANCE_EVENT',
        highestSeverity: null,
        activeEvents: [],
        freshness: 'CURRENT',
      };
    }

    let hasLevel4 = false;
    let hasLevel3 = false;
    let hasLevel2 = false;
    let highestSev: GovernanceSeverityLevel = 'LEVEL_1_INFORMATIONAL';
    let blockReason: string | undefined;

    for (const e of activeEvents) {
      if (e.severity === 'LEVEL_4_CRIMINAL_ACTION') {
        hasLevel4 = true;
        highestSev = 'LEVEL_4_CRIMINAL_ACTION';
        blockReason = `CRITICAL GOVERNANCE RISK: ${e.title} issued by ${e.authority} on ${e.eventDate}`;
        break;
      }
      if (e.severity === 'LEVEL_3_REGULATORY_ACTION') {
        hasLevel3 = true;
        highestSev = 'LEVEL_3_REGULATORY_ACTION';
      } else if (e.severity === 'LEVEL_2_ADMINISTRATIVE' && !hasLevel3) {
        hasLevel2 = true;
        highestSev = 'LEVEL_2_ADMINISTRATIVE';
      }
    }

    let riskStatus: GovernanceRiskStatus = 'NO_MATERIAL_GOVERNANCE_EVENT';
    if (hasLevel4) {
      riskStatus = 'CRITICAL_VERIFIED_GOVERNANCE_EVENT';
    } else if (hasLevel3) {
      riskStatus = 'MATERIAL_GOVERNANCE_RISK';
    } else if (hasLevel2) {
      riskStatus = 'GOVERNANCE_EVENT';
    }

    const isCurrent = activeEvents.some((e) => e.provenance.freshness === 'CURRENT');

    return {
      symbol: sym,
      riskStatus,
      highestSeverity: highestSev,
      activeEvents,
      blockReason,
      freshness: isCurrent ? 'CURRENT' : 'STALE',
    };
  }
}

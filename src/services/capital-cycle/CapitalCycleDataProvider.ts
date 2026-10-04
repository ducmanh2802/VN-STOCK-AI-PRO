/**
 * PHASE 26 — CAPITAL CYCLE & POLICY DATA PROVIDER
 * ===============================================
 * Bridges the read-only Phase 26 persistence layer (CapitalCycleRepository) into
 * the deterministic Phase 26 domain contracts.
 *
 * GUARANTEES:
 *   - REAL DATA ONLY: every value originates from persisted Phase 26 rows or the
 *     Phase 24 `financial_facts_v2` store. No hardcoded / "canonical" datasets,
 *     no synthetic drivers, no fabricated revenue.
 *   - FAIL-CLOSED: when the database is unavailable, empty, or a row cannot be
 *     faithfully represented, the provider returns an explicit empty/unavailable
 *     payload (UNAVAILABLE) and records an issue. It never substitutes a
 *     plausible-looking default.
 */

import {
  CapitalCycleRepository,
  type PolicyEventRow,
  type StrategicProjectRow,
  type ProjectBeneficiaryRow,
  type LegalGovernanceEventRow,
} from '../../lib/db/CapitalCycleRepository.ts';
import { PolicyEventEngine } from '../../lib/capital-cycle/PolicyEventEngine.ts';
import type {
  PolicyEvent,
  PolicyType,
  PolicyStatus,
  IssuingAuthority,
  StrategicProject,
  ProjectCategory,
  ProjectStatus,
  ProjectBeneficiary,
  BeneficiaryRole,
  BeneficiaryEvidenceTier,
  BacklogItem,
  LegalGovernanceEvent,
  LegalGovernanceEventType,
  GovernanceSeverityLevel,
  IndustryCycleDrivers,
  SourceProvenance,
  SourceTier,
  EntityValidationStatus,
  DataFreshnessStatus,
} from '../../lib/capital-cycle/types.ts';
import { combineFreshness } from '../earnings/EarningsDataProvider.ts';

// ---------------------------------------------------------------------------
// Enum whitelists (faithful representation — unknown values never invented)
// ---------------------------------------------------------------------------

const SOURCE_TIERS: readonly SourceTier[] = [
  'TIER_1_STATUTORY',
  'TIER_2_EXCHANGE',
  'TIER_3_SECONDARY',
  'TIER_4_UNVERIFIED',
];
const VALIDATION_STATES: readonly EntityValidationStatus[] = ['VALID', 'PROVISIONAL', 'SUSPECT', 'INVALID'];
const FRESHNESS_STATES: readonly DataFreshnessStatus[] = ['CURRENT', 'STALE', 'UNAVAILABLE', 'INVALID'];

const ISSUING_AUTHORITIES: readonly IssuingAuthority[] = [
  'NATIONAL_ASSEMBLY',
  'GOVERNMENT',
  'PRIME_MINISTER',
  'STATE_BANK_OF_VIETNAM',
  'MINISTRY_OF_FINANCE',
  'MINISTRY_OF_TRANSPORT',
  'MINISTRY_OF_INDUSTRY_AND_TRADE',
  'MINISTRY_OF_CONSTRUCTION',
  'MINISTRY_OF_PLANNING_AND_INVESTMENT',
  'STATE_SECURITIES_COMMISSION',
  'PROVINCIAL_PEOPLES_COMMITTEE',
  'OTHER_REGULATORY_BODY',
];
const POLICY_TYPES: readonly PolicyType[] = [
  'RESOLUTION',
  'DECISION',
  'DECREE',
  'CIRCULAR',
  'MASTER_PLAN',
  'DIRECTIVE',
  'INCENTIVE_POLICY',
];
const POLICY_STATUSES: readonly PolicyStatus[] = [
  'ANNOUNCED',
  'APPROVED',
  'ISSUED',
  'EFFECTIVE',
  'AMENDED',
  'SUSPENDED',
  'EXPIRED',
  'CANCELLED',
];
const GEOGRAPHIC_SCOPES = [
  'NATIONAL',
  'NORTH',
  'CENTRAL',
  'SOUTH',
  'KEY_ECONOMIC_ZONE',
  'SPECIFIC_PROVINCE',
] as const;
const FUNDING_MECHANISMS = [
  'STATE_BUDGET',
  'ODA',
  'PPP',
  'COMMERCIAL_CREDIT',
  'FDI',
  'PRIVATE_EQUITY',
  'MIXED',
] as const;

const PROJECT_CATEGORIES: readonly ProjectCategory[] = [
  'TRANSPORT_HIGHWAY',
  'TRANSPORT_RAILWAY',
  'TRANSPORT_AIRPORT',
  'TRANSPORT_SEAPORT',
  'ENERGY_POWER_PLANT',
  'ENERGY_GRID_TRANSMISSION',
  'ENERGY_OIL_GAS_UPSTREAM',
  'INDUSTRIAL_PARK',
  'DIGITAL_INFRASTRUCTURE',
  'WATER_ENVIRONMENT',
  'URBAN_INFRASTRUCTURE',
];
const PROJECT_STATUSES: readonly ProjectStatus[] = [
  'PROPOSED',
  'PLANNED',
  'APPROVED',
  'TENDERING',
  'AWARDED',
  'UNDER_CONSTRUCTION',
  'PARTIALLY_OPERATIONAL',
  'OPERATIONAL',
  'DELAYED',
  'SUSPENDED',
  'CANCELLED',
  'COMPLETED',
];

const BENEFICIARY_ROLES: readonly BeneficiaryRole[] = [
  'DIRECT_CONTRACTOR',
  'JOINT_CONTRACTOR',
  'SUBCONTRACTOR',
  'EQUIPMENT_SUPPLIER',
  'MATERIAL_SUPPLIER',
  'OPERATOR',
  'INVESTOR',
  'FINANCING_PARTNER',
  'INDIRECT_BENEFICIARY',
  'POTENTIAL_BENEFICIARY',
  'UNVERIFIED',
];
const BENEFICIARY_TIERS: readonly BeneficiaryEvidenceTier[] = [
  'OFFICIAL_CONTRACT',
  'OFFICIAL_TENDER_AWARD',
  'OFFICIAL_COMPANY_DISCLOSURE',
  'OFFICIAL_PROJECT_DOCUMENT',
  'VERIFIED_SECONDARY_SOURCE',
  'UNVERIFIED_SECONDARY_SOURCE',
  'RUMOR',
];

const GOVERNANCE_EVENT_TYPES: readonly LegalGovernanceEventType[] = [
  'REGULATORY_PENALTY',
  'DISCLOSURE_VIOLATION',
  'ACCOUNTING_AUDIT_QUALIFIED',
  'INVESTIGATION',
  'PROSECUTION',
  'INDICTMENT',
  'MANAGEMENT_CHANGE',
  'BOARD_DISPUTE',
  'LISTING_STATUS_EVENT',
  'TRADING_SUSPENSION',
  'GOVERNANCE_BREACH',
];
const GOVERNANCE_SEVERITIES: readonly GovernanceSeverityLevel[] = [
  'LEVEL_1_INFORMATIONAL',
  'LEVEL_2_ADMINISTRATIVE',
  'LEVEL_3_REGULATORY_ACTION',
  'LEVEL_4_CRIMINAL_ACTION',
];
const GOVERNANCE_STATUSES = ['PENDING', 'OFFICIAL_SANCTION', 'APPEALED', 'CONCLUDED'] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function coerce<T extends string>(value: string | null | undefined, allowed: readonly T[]): T | null {
  if (value === null || value === undefined) return null;
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function num(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function splitList(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

/** Builds provenance from a persisted row; null when the timeline is unverifiable. */
function provenanceOf(
  row: {
    source: string;
    sourceTier: string;
    sourceUrl?: string | null;
    publicationDate: string | null;
    freshness: string;
    validationStatus: string;
  },
  retrievalDate: string,
  documentNumber?: string | null
): SourceProvenance | null {
  if (!row.publicationDate) return null; // cannot establish an availability timeline -> fail closed
  return {
    source: row.source,
    sourceTier: coerce(row.sourceTier, SOURCE_TIERS) ?? 'TIER_4_UNVERIFIED',
    sourceUrl: row.sourceUrl ?? null,
    documentNumber: documentNumber ?? null,
    publicationDate: row.publicationDate,
    publicationTimestamp: null,
    retrievalDate,
    freshness: coerce(row.freshness, FRESHNESS_STATES) ?? 'UNAVAILABLE',
    validationStatus: coerce(row.validationStatus, VALIDATION_STATES) ?? 'PROVISIONAL',
  };
}

// ---------------------------------------------------------------------------
// Row -> domain mappers (each returns null when not faithfully representable)
// ---------------------------------------------------------------------------

function toPolicyEvent(row: PolicyEventRow, retrievalDate: string): PolicyEvent | null {
  const issuingAuthority = coerce(row.issuingAuthority, ISSUING_AUTHORITIES);
  const policyType = coerce(row.policyType, POLICY_TYPES);
  const status = coerce(row.status, POLICY_STATUSES);
  const geographicScope = coerce(row.geographicScope, GEOGRAPHIC_SCOPES);
  const provenance = provenanceOf(row, retrievalDate, row.documentNumber);
  if (!issuingAuthority || !policyType || !status || !geographicScope || !provenance) return null;
  return {
    policyEventId: row.policyEventId,
    documentNumber: row.documentNumber,
    title: row.title,
    description: row.description,
    issuingAuthority,
    policyType,
    status,
    affectedSectors: splitList(row.targetSectors),
    quantitativeTargets: [],
    targetInvestmentVnd: num(row.targetInvestmentVnd),
    fundingMechanism: coerce(row.fundingMechanism, FUNDING_MECHANISMS),
    geographicScope,
    announcementDate: row.announcementDate,
    effectiveDate: row.effectiveDate ?? null,
    expiryDate: null,
    provenance,
  };
}

function toStrategicProject(row: StrategicProjectRow, retrievalDate: string): StrategicProject | null {
  const category = coerce(row.category, PROJECT_CATEGORIES);
  const projectStatus = coerce(row.projectStatus, PROJECT_STATUSES);
  const provenance = provenanceOf(row, retrievalDate);
  if (!category || !projectStatus || !provenance) return null;
  return {
    projectId: row.projectId,
    projectCode: row.projectCode,
    name: row.name,
    category,
    primarySectorId: row.primarySectorId,
    locationProvince: splitList(row.locationProvinces),
    projectStatus,
    estimatedInvestmentVnd: num(row.estimatedInvestmentVnd),
    approvedInvestmentVnd: num(row.approvedInvestmentVnd),
    fundingSource: row.fundingSource ?? '',
    owner: row.owner ?? '',
    contractingAuthority: row.contractingAuthority ?? '',
    startDatePlanned: row.startDatePlanned ?? null,
    expectedCompletionDate: row.expectedCompletionDate ?? null,
    actualCompletionDate: row.actualCompletionDate ?? null,
    delayMonths: row.delayMonths ?? null,
    progressPercent: num(row.progressPercent),
    provenance,
  };
}

function toBeneficiary(row: ProjectBeneficiaryRow, retrievalDate: string): ProjectBeneficiary | null {
  const role = coerce(row.role, BENEFICIARY_ROLES);
  const evidenceTier = coerce(row.evidenceTier, BENEFICIARY_TIERS);
  const provenance = provenanceOf(row, retrievalDate);
  if (!role || !evidenceTier || !provenance) return null;
  return {
    relationshipId: row.relationshipId,
    projectId: row.projectId,
    symbol: row.symbol,
    companyName: row.companyName,
    role,
    evidenceTier,
    contractPackageCode: row.contractPackageCode ?? null,
    contractValueVnd: num(row.contractValueVnd),
    confirmedBacklogShareVnd: num(row.confirmedBacklogShareVnd),
    awardDate: row.awardDate ?? null,
    executionPeriodMonths: row.executionPeriodMonths ?? null,
    isConfirmedBeneficiary: row.isConfirmedBeneficiary,
    provenance,
  };
}

function toGovernanceEvent(row: LegalGovernanceEventRow, retrievalDate: string): LegalGovernanceEvent | null {
  const eventType = coerce(row.eventType, GOVERNANCE_EVENT_TYPES);
  const severity = coerce(row.severity, GOVERNANCE_SEVERITIES);
  const status = coerce(row.status, GOVERNANCE_STATUSES);
  const provenance = provenanceOf(row, retrievalDate);
  if (!eventType || !severity || !status || !provenance) return null;
  return {
    eventId: row.eventId,
    symbol: row.symbol,
    companyName: row.companyName,
    eventType,
    severity,
    title: row.title,
    description: row.description,
    authority: row.authority,
    officialDocumentNumber: row.officialDocumentNumber ?? null,
    affectedPersonName: row.affectedPersonName ?? null,
    affectedPersonRole: row.affectedPersonRole ?? null,
    fineAmountVnd: num(row.fineAmountVnd),
    eventDate: row.eventDate,
    announcementDate: row.announcementDate,
    effectiveDate: row.effectiveDate ?? null,
    status,
    provenance,
  };
}

/** Derives backlog items from confirmed beneficiary relationships (real lineage). */
function backlogFromBeneficiaries(beneficiaries: readonly ProjectBeneficiary[]): BacklogItem[] {
  const items: BacklogItem[] = [];
  for (const b of beneficiaries) {
    if (!b.isConfirmedBeneficiary) continue;
    const remaining = b.confirmedBacklogShareVnd ?? b.contractValueVnd ?? null;
    if (remaining === null || remaining <= 0) continue;
    items.push({
      itemId: `BL_${b.relationshipId}`,
      symbol: b.symbol,
      projectId: b.projectId,
      projectName: null,
      contractCode: b.contractPackageCode ?? null,
      contractValueVnd: b.contractValueVnd ?? remaining,
      remainingBacklogVnd: remaining,
      recognizedRevenueVnd: null,
      verificationType: 'CONTRACTED_VERIFIED',
      awardDate: b.awardDate ?? null,
      expectedStartDate: null,
      expectedCompletionDate: null,
      provenance: b.provenance,
    });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Public contracts
// ---------------------------------------------------------------------------

export interface CapitalCycleDataRequest {
  readonly asOfDate: string;
  readonly symbol?: string | null;
  readonly sectorId?: string | null;
}

export interface CapitalCycleRawData {
  readonly policies: readonly PolicyEvent[];
  readonly projects: readonly StrategicProject[];
  readonly beneficiaries: readonly ProjectBeneficiary[];
  readonly backlogItems: readonly BacklogItem[];
  readonly governanceEvents: readonly LegalGovernanceEvent[];
  readonly capitalCycleDrivers: IndustryCycleDrivers | null;
  readonly ttmRevenueVnd: number | null;
  readonly freshness: DataFreshnessStatus;
  readonly issues: readonly string[];
}

export interface CapitalCycleDataSource {
  fetch(request: CapitalCycleDataRequest): Promise<CapitalCycleRawData>;
}

/** Explicit fail-closed payload — no data is ever invented. */
export function emptyCapitalCycleData(issue: string): CapitalCycleRawData {
  return {
    policies: [],
    projects: [],
    beneficiaries: [],
    backlogItems: [],
    governanceEvents: [],
    capitalCycleDrivers: null,
    ttmRevenueVnd: null,
    freshness: 'UNAVAILABLE',
    issues: [issue],
  };
}

/**
 * Real database-backed data source. Reads the Phase 26 tables and the Phase 24
 * `financial_facts_v2` TTM bridge. Any persistence/availability failure is
 * converted into an explicit UNAVAILABLE payload (fail-closed).
 */
export class DrizzleCapitalCycleDataSource implements CapitalCycleDataSource {
  public async fetch(request: CapitalCycleDataRequest): Promise<CapitalCycleRawData> {
    const { asOfDate, symbol, sectorId } = request;
    const retrievalDate = new Date().toISOString().slice(0, 10);
    const issues: string[] = [];

    let policyRows: PolicyEventRow[];
    let projectRows: StrategicProjectRow[];
    let beneficiaryRows: ProjectBeneficiaryRow[];
    let governanceRows: LegalGovernanceEventRow[];
    let ttmRevenueVnd: number | null = null;

    try {
      [policyRows, projectRows, beneficiaryRows, governanceRows] = await Promise.all([
        CapitalCycleRepository.getPolicyEvents(asOfDate),
        CapitalCycleRepository.getStrategicProjects(asOfDate),
        CapitalCycleRepository.getBeneficiaries(asOfDate),
        CapitalCycleRepository.getGovernanceEvents(asOfDate),
      ]);
      if (symbol) {
        ttmRevenueVnd = await CapitalCycleRepository.getTtmRevenue(symbol, asOfDate);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return emptyCapitalCycleData(`DATA_UNAVAILABLE: capital cycle persistence unreachable (${reason})`);
    }

    const policies: PolicyEvent[] = [];
    for (const row of policyRows) {
      const mapped = toPolicyEvent(row, retrievalDate);
      if (mapped) policies.push(mapped);
      else issues.push(`SKIPPED_POLICY_ROW:${row.policyEventId}`);
    }

    const projects: StrategicProject[] = [];
    for (const row of projectRows) {
      const mapped = toStrategicProject(row, retrievalDate);
      if (mapped) projects.push(mapped);
      else issues.push(`SKIPPED_PROJECT_ROW:${row.projectId}`);
    }

    const beneficiaries: ProjectBeneficiary[] = [];
    for (const row of beneficiaryRows) {
      const mapped = toBeneficiary(row, retrievalDate);
      if (mapped) beneficiaries.push(mapped);
      else issues.push(`SKIPPED_BENEFICIARY_ROW:${row.relationshipId}`);
    }

    const governanceEvents: LegalGovernanceEvent[] = [];
    for (const row of governanceRows) {
      const mapped = toGovernanceEvent(row, retrievalDate);
      if (mapped) governanceEvents.push(mapped);
      else issues.push(`SKIPPED_GOVERNANCE_ROW:${row.eventId}`);
    }

    const backlogItems = backlogFromBeneficiaries(beneficiaries);

    // Capital-cycle drivers are DERIVED from real policy evidence only; drivers
    // without a real source remain null/UNKNOWN (never fabricated).
    let policySupportScore: number | null = null;
    if (sectorId && policies.length > 0) {
      policySupportScore = PolicyEventEngine.computeSectorPolicyIntensity(sectorId, policies, asOfDate).supportScore;
    }
    const capitalCycleDrivers: IndustryCycleDrivers | null =
      policySupportScore !== null
        ? {
            policySupportScore,
            publicInvestmentVelocity: null,
            privateCapexTrend: 'UNKNOWN',
            industryCapacityUtilizationPercent: null,
            averageGrossMarginTrend: 'UNKNOWN',
            industryBookToBillRatio: null,
            roicVsWaccSpreadPercent: null,
            industryCreditGrowthPercent: null,
          }
        : null;

    if (policies.length === 0 && projects.length === 0 && beneficiaries.length === 0 && governanceEvents.length === 0) {
      issues.push('NO_PERSISTED_PHASE26_RECORDS');
    }

    return {
      policies,
      projects,
      beneficiaries,
      backlogItems,
      governanceEvents,
      capitalCycleDrivers,
      ttmRevenueVnd,
      freshness: combineFreshness([
        ...policies.map((p) => p.provenance.freshness),
        ...projects.map((p) => p.provenance.freshness),
        ...beneficiaries.map((b) => b.provenance.freshness),
        ...governanceEvents.map((g) => g.provenance.freshness),
      ]),
      issues,
    };
  }
}

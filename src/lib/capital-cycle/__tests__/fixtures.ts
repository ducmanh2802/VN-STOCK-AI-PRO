/**
 * PHASE 26 — SHARED TEST FIXTURES
 * =================================
 * Deterministic test factories for Phase 26 unit and integration test suites.
 */

import type {
  PolicyEvent,
  StrategicProject,
  ProjectBeneficiary,
  BacklogItem,
  LegalGovernanceEvent,
  IndustryCycleDrivers,
} from '../types.ts';

export function makeTestPolicy(overrides?: Partial<PolicyEvent>): PolicyEvent {
  return {
    policyEventId: 'TEST_POL_01',
    documentNumber: '100/NQ-CP',
    title: 'Nghị quyết phát triển cơ sở hạ tầng giao thông trọng điểm',
    description: 'Tập trung đầu tư cao tốc và hạ tầng logistics kết nối vùng kinh tế trọng điểm.',
    issuingAuthority: 'GOVERNMENT',
    policyType: 'RESOLUTION',
    status: 'EFFECTIVE',
    affectedSectors: ['materials', 'transport', 'logistics'],
    quantitativeTargets: [
      { metricName: 'Kilomet cao tốc hoàn thành', targetValue: 3000, unit: 'km', targetYear: 2025 },
    ],
    targetInvestmentVnd: 500000000000000,
    fundingMechanism: 'STATE_BUDGET',
    geographicScope: 'NATIONAL',
    announcementDate: '2024-01-10',
    effectiveDate: '2024-01-10',
    provenance: {
      source: 'Cổng Thông tin Chính phủ',
      sourceTier: 'TIER_1_STATUTORY',
      documentNumber: '100/NQ-CP',
      publicationDate: '2024-01-10',
      retrievalDate: '2026-10-01',
      freshness: 'CURRENT',
      validationStatus: 'VALID',
    },
    ...overrides,
  };
}

export function makeTestProject(overrides?: Partial<StrategicProject>): StrategicProject {
  return {
    projectId: 'TEST_PROJ_01',
    projectCode: 'EXP-NORTH-SOUTH',
    name: 'Dự án Đường cao tốc Bắc - Nam phía Đông',
    category: 'TRANSPORT_HIGHWAY',
    primarySectorId: 'materials',
    locationProvince: ['Ninh Bình', 'Thanh Hóa', 'Nghệ An'],
    projectStatus: 'UNDER_CONSTRUCTION',
    estimatedInvestmentVnd: 146990000000000,
    approvedInvestmentVnd: 146990000000000,
    fundingSource: 'Ngân sách Nhà nước',
    owner: 'Ban Quản lý Dự án Thăng Long',
    contractingAuthority: 'Bộ Giao thông Vận tải',
    startDatePlanned: '2021-09-01',
    expectedCompletionDate: '2025-12-31',
    delayMonths: 0,
    progressPercent: 72,
    provenance: {
      source: 'Bộ GTVT',
      sourceTier: 'TIER_1_STATUTORY',
      publicationDate: '2024-06-01',
      retrievalDate: '2026-10-01',
      freshness: 'CURRENT',
      validationStatus: 'VALID',
    },
    ...overrides,
  };
}

export function makeTestBeneficiary(overrides?: Partial<ProjectBeneficiary>): ProjectBeneficiary {
  return {
    relationshipId: 'TEST_BEN_01',
    projectId: 'TEST_PROJ_01',
    symbol: 'HHV',
    companyName: 'CTCP Đầu tư Hạ tầng Giao thông Đèo Cả',
    role: 'DIRECT_CONTRACTOR',
    evidenceTier: 'OFFICIAL_TENDER_AWARD',
    contractPackageCode: 'Gói thầu XL01 Xây lắp cầu và hầm',
    contractValueVnd: 3800000000000,
    confirmedBacklogShareVnd: 3800000000000,
    awardDate: '2023-08-15',
    executionPeriodMonths: 28,
    isConfirmedBeneficiary: true,
    provenance: {
      source: 'Hệ thống Mạng Đấu thầu Quốc gia',
      sourceTier: 'TIER_1_STATUTORY',
      publicationDate: '2023-08-15',
      retrievalDate: '2026-10-01',
      freshness: 'CURRENT',
      validationStatus: 'VALID',
    },
    ...overrides,
  };
}

export function makeTestBacklogItem(overrides?: Partial<BacklogItem>): BacklogItem {
  return {
    itemId: 'TEST_BL_01',
    symbol: 'HHV',
    projectId: 'TEST_PROJ_01',
    projectName: 'Cao tốc Bắc - Nam Gói XL01',
    contractCode: 'XL01-HHV',
    contractValueVnd: 3800000000000,
    remainingBacklogVnd: 2100000000000,
    recognizedRevenueVnd: 1700000000000,
    verificationType: 'CONTRACTED_VERIFIED',
    awardDate: '2023-08-15',
    expectedStartDate: '2023-09-01',
    expectedCompletionDate: '2025-12-31',
    provenance: {
      source: 'BCTC Quý 2/2024 HHV',
      sourceTier: 'TIER_1_STATUTORY',
      publicationDate: '2024-07-29',
      retrievalDate: '2026-10-01',
      freshness: 'CURRENT',
      validationStatus: 'VALID',
    },
    ...overrides,
  };
}

export function makeTestGovernanceEvent(overrides?: Partial<LegalGovernanceEvent>): LegalGovernanceEvent {
  return {
    eventId: 'TEST_GOV_01',
    symbol: 'ABC',
    companyName: 'CTCP Tập đoàn ABC',
    eventType: 'DISCLOSURE_VIOLATION',
    severity: 'LEVEL_2_ADMINISTRATIVE',
    title: 'Xử phạt vi phạm hành chính chậm công bố báo cáo kiểm toán',
    description: 'Ủy ban Chứng khoán Nhà nước ban hành quyết định xử phạt do chậm công bố thông tin BCTC kiểm toán.',
    authority: 'Ủy ban Chứng khoán Nhà nước',
    officialDocumentNumber: '123/QĐ-XPVPHC',
    fineAmountVnd: 85000000,
    eventDate: '2024-04-12',
    announcementDate: '2024-04-12',
    status: 'OFFICIAL_SANCTION',
    provenance: {
      source: 'Cổng thông tin UBCKNN (ssc.gov.vn)',
      sourceTier: 'TIER_1_STATUTORY',
      publicationDate: '2024-04-12',
      retrievalDate: '2026-10-01',
      freshness: 'CURRENT',
      validationStatus: 'VALID',
    },
    ...overrides,
  };
}

export function makeTestDrivers(overrides?: Partial<IndustryCycleDrivers>): IndustryCycleDrivers {
  return {
    policySupportScore: 75,
    publicInvestmentVelocity: 0.8,
    privateCapexTrend: 'EXPANDING',
    industryCapacityUtilizationPercent: 82,
    averageGrossMarginTrend: 'EXPANDING',
    industryBookToBillRatio: 1.3,
    roicVsWaccSpreadPercent: 3.5,
    industryCreditGrowthPercent: 14.0,
    ...overrides,
  };
}

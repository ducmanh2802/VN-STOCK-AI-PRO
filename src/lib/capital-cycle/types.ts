/**
 * PHASE 26 — INDUSTRY CAPITAL CYCLE & POLICY INTELLIGENCE: DOMAIN CONTRACTS
 * =======================================================================
 * Deterministic, source-backed, fail-closed contracts for:
 *   - Government Policy & Capital Allocation
 *   - Strategic Projects & Evidence-Tiered Beneficiaries
 *   - Corporate Backlog & Revenue Conversion
 *   - Industry Capital Cycle Classification (6 Stages)
 *   - Legal & Governance Events & RiskGuard Integration
 *   - Observed Event Market Reaction Analysis (T-20 to T+60)
 *   - Policy-to-Valuation Evidence Graph
 *
 * NON-NEGOTIABLE INVARIANTS:
 *   1. `null` ALWAYS means "unavailable / not reported" — NEVER 0, NEVER a guess.
 *   2. Policy, capital flow, and backlog are EVIDENCE layers, NEVER direct BUY signals.
 *   3. Rumors and unverified secondary sources NEVER enter deterministic calculations.
 *   4. Epistemological separation: Policy != Capital != Project Win != Backlog != Revenue != FCF != Buy.
 *   5. Adopt PR-01 DataFreshnessStatus ('CURRENT' | 'STALE' | 'UNAVAILABLE' | 'INVALID').
 */

import type { DataFreshnessStatus } from '../../types/stock.ts';

export type { DataFreshnessStatus };

// ============================================================================
// 1. SOURCE PROVENANCE & VALIDATION CONTRACTS
// ============================================================================

export type SourceTier =
  | 'TIER_1_STATUTORY'   // Government portal, Prime Minister decision, SSC, VSDC, official gazette
  | 'TIER_2_EXCHANGE'    // HOSE, HNX, official procurement portal (muasamcong), audited annual report
  | 'TIER_3_SECONDARY'   // Reputable financial media, verified industry research
  | 'TIER_4_UNVERIFIED'; // Social media, rumors, unconfirmed forums (CANNOT affect deterministic models)

export type EntityValidationStatus =
  | 'VALID'              // Verified against primary/secondary sources with confirmed IDs
  | 'PROVISIONAL'        // Single-source secondary evidence pending confirmation
  | 'SUSPECT'            // Conflicting data points or discrepancies detected
  | 'INVALID';           // Failed integrity or sanity checks (fails closed)

export interface SourceProvenance {
  readonly source: string;
  readonly sourceTier: SourceTier;
  readonly sourceUrl?: string | null;
  readonly documentNumber?: string | null;
  readonly publicationDate: string; // ISO YYYY-MM-DD
  readonly publicationTimestamp?: string | null;
  readonly retrievalDate: string;   // ISO YYYY-MM-DD
  readonly freshness: DataFreshnessStatus;
  readonly validationStatus: EntityValidationStatus;
  readonly verificationNotes?: string | null;
}

// ============================================================================
// 2. POLICY EVENT & CAPITAL ALLOCATION CONTRACTS
// ============================================================================

export type PolicyType =
  | 'RESOLUTION'       // Nghị quyết (Chính phủ / Quốc hội)
  | 'DECISION'         // Quyết định (Thủ tướng / Bộ trưởng)
  | 'DECREE'           // Nghị định
  | 'CIRCULAR'         // Thông tư
  | 'MASTER_PLAN'      // Quy hoạch tổng thể quốc gia / ngành (e.g. Quy hoạch Điện 8)
  | 'DIRECTIVE'        // Chỉ thị
  | 'INCENTIVE_POLICY';// Gói kích thích / Ưu đãi thuế / Lãi suất

export type PolicyStatus =
  | 'ANNOUNCED'        // Mới công bố dự thảo
  | 'APPROVED'         // Đã phê duyệt chủ trương
  | 'ISSUED'           // Đã ban hành văn bản chính thức
  | 'EFFECTIVE'        // Đã có hiệu lực thi hành
  | 'AMENDED'          // Đã sửa đổi / bổ sung
  | 'SUSPENDED'        // Tạm hoãn thi hành
  | 'EXPIRED'          // Đã hết hiệu lực
  | 'CANCELLED';       // Bị bãi bỏ

export type IssuingAuthority =
  | 'NATIONAL_ASSEMBLY'
  | 'GOVERNMENT'
  | 'PRIME_MINISTER'
  | 'STATE_BANK_OF_VIETNAM'
  | 'MINISTRY_OF_FINANCE'
  | 'MINISTRY_OF_TRANSPORT'
  | 'MINISTRY_OF_INDUSTRY_AND_TRADE'
  | 'MINISTRY_OF_CONSTRUCTION'
  | 'MINISTRY_OF_PLANNING_AND_INVESTMENT'
  | 'STATE_SECURITIES_COMMISSION'
  | 'PROVINCIAL_PEOPLES_COMMITTEE'
  | 'OTHER_REGULATORY_BODY';

export interface QuantitativePolicyTarget {
  readonly metricName: string;
  readonly targetValue: number;
  readonly unit: string;
  readonly baselineValue?: number | null;
  readonly targetYear: number;
}

export interface PolicyEvent {
  readonly policyEventId: string;
  readonly documentNumber: string;
  readonly title: string;
  readonly description: string;
  readonly issuingAuthority: IssuingAuthority;
  readonly policyType: PolicyType;
  readonly status: PolicyStatus;
  readonly affectedSectors: readonly string[];     // e.g. ['energy', 'materials', 'transport']
  readonly affectedSubindustries?: readonly string[];
  readonly quantitativeTargets: readonly QuantitativePolicyTarget[];
  readonly targetInvestmentVnd?: number | null;     // Quy mô vốn mục tiêu (VND)
  readonly fundingMechanism?: 'STATE_BUDGET' | 'ODA' | 'PPP' | 'COMMERCIAL_CREDIT' | 'FDI' | 'PRIVATE_EQUITY' | 'MIXED' | null;
  readonly geographicScope: 'NATIONAL' | 'NORTH' | 'CENTRAL' | 'SOUTH' | 'KEY_ECONOMIC_ZONE' | 'SPECIFIC_PROVINCE';
  readonly announcementDate: string; // ISO YYYY-MM-DD
  readonly effectiveDate?: string | null;
  readonly expiryDate?: string | null;
  readonly provenance: SourceProvenance;
}

/**
 * Capital allocation stage lifecycle.
 * Strict rule: ANNOUNCED != COMMITTED != DISBURSED.
 */
export type CapitalAllocationStage =
  | 'ANNOUNCED_CAPITAL'    // Vốn công bố / mục tiêu kế hoạch
  | 'APPROVED_CAPITAL'     // Vốn được cấp có thẩm quyền phê duyệt
  | 'ALLOCATED_CAPITAL'    // Vốn đã giao kế hoạch năm (Quyết định giao vốn)
  | 'COMMITTED_CAPITAL'    // Vốn đã cam kết tài trợ / ký hiệp định
  | 'CONTRACTED_CAPITAL'   // Vốn đã ký hợp đồng xây lắp / mua sắm (EPC)
  | 'DISBURSED_CAPITAL'    // Vốn thực tế đã giải ngân (Kho bạc thanh toán)
  | 'REALIZED_CAPITAL';    // Giá trị khối lượng xây lắp hoàn thành nghiệm thu

export interface CapitalAllocationRecord {
  readonly allocationId: string;
  readonly policyEventId?: string | null;
  readonly projectId?: string | null;
  readonly sectorId: string;
  readonly capitalStage: CapitalAllocationStage;
  readonly amountVnd: number | null;
  readonly fiscalYear: number;
  readonly periodQuarter?: number | null;
  readonly fundingSource: 'STATE_BUDGET' | 'GOVERNMENT_BONDS' | 'ODA' | 'PPP' | 'FDI' | 'BANK_CREDIT' | 'CORPORATE_CAPEX' | 'OTHER';
  readonly asOfDate: string;
  readonly provenance: SourceProvenance;
}

// ============================================================================
// 3. STRATEGIC PROJECT & BENEFICIARY CONTRACTS
// ============================================================================

export type ProjectCategory =
  | 'TRANSPORT_HIGHWAY'       // Cao tốc Bắc - Nam, vành đai
  | 'TRANSPORT_RAILWAY'       // Đường sắt cao tốc, metro đô thị
  | 'TRANSPORT_AIRPORT'       // Sân bay Long Thành, mở rộng Tân Sơn Nhất / Nội Bài
  | 'TRANSPORT_SEAPORT'       // Cảng Lạch Huyện, Cái Mép - Thị Vải, Cần Giờ
  | 'ENERGY_POWER_PLANT'      // Nhiệt điện LNG, Thủy điện, Điện gió ngoài khơi
  | 'ENERGY_GRID_TRANSMISSION'// Đường dây 500kV mạch 3, trạm biến áp
  | 'ENERGY_OIL_GAS_UPSTREAM' // Chuỗi dự án Lô B - Ô Môn, Cá Voi Xanh
  | 'INDUSTRIAL_PARK'         // KCN VSIP, Becamex, KBC
  | 'DIGITAL_INFRASTRUCTURE'  // Trung tâm dữ liệu quốc gia, cáp quang biển, viễn thông
  | 'WATER_ENVIRONMENT'      // Công trình thủy lợi, chống ngập, xử lý chất thải
  | 'URBAN_INFRASTRUCTURE';   // Dự án phát triển đô thị trọng điểm

export type ProjectStatus =
  | 'PROPOSED'
  | 'PLANNED'
  | 'APPROVED'
  | 'TENDERING'
  | 'AWARDED'
  | 'UNDER_CONSTRUCTION'
  | 'PARTIALLY_OPERATIONAL'
  | 'OPERATIONAL'
  | 'DELAYED'
  | 'SUSPENDED'
  | 'CANCELLED'
  | 'COMPLETED';

export interface StrategicProject {
  readonly projectId: string;
  readonly projectCode: string;
  readonly name: string;
  readonly category: ProjectCategory;
  readonly primarySectorId: string;
  readonly locationProvince: readonly string[];
  readonly projectStatus: ProjectStatus;
  readonly estimatedInvestmentVnd: number | null;
  readonly approvedInvestmentVnd: number | null;
  readonly fundingSource: string;
  readonly owner: string; // Chủ đầu tư (e.g. EVN, ACV, VEC, PVN)
  readonly contractingAuthority: string; // Cơ quan quản lý nhà nước có thẩm quyền
  readonly startDatePlanned?: string | null;
  readonly expectedCompletionDate?: string | null;
  readonly actualCompletionDate?: string | null;
  readonly delayMonths?: number | null;
  readonly progressPercent?: number | null;
  readonly provenance: SourceProvenance;
}

/**
 * Beneficiary relationship classification with strict evidence tiers.
 */
export type BeneficiaryRole =
  | 'DIRECT_CONTRACTOR'       // Tổng thầu EPC / Nhà thầu chính thức trúng gói thầu
  | 'JOINT_CONTRACTOR'        // Liên danh trúng thầu
  | 'SUBCONTRACTOR'           // Nhà thầu phụ thi công
  | 'EQUIPMENT_SUPPLIER'      // Nhà cung cấp thiết bị / công nghệ
  | 'MATERIAL_SUPPLIER'       // Nhà cung cấp vật liệu xây dựng (Thép, Xi măng, Đá, Nhựa đường)
  | 'OPERATOR'                // Đơn vị vận hành, khai thác sau hoàn thành
  | 'INVESTOR'                // Doanh nghiệp nắm giữ cổ phần / nhà đầu tư dự án (PPP/BOT)
  | 'FINANCING_PARTNER'       // Tổ chức tín dụng tài trợ vốn
  | 'INDIRECT_BENEFICIARY'    // Hưởng lợi gián tiếp (e.g. BĐS ven cao tốc, Logistics gần cảng)
  | 'POTENTIAL_BENEFICIARY'   // Ứng viên tham gia đấu thầu (Chưa có kết quả)
  | 'UNVERIFIED';             // Tin đồn mạng xã hội (Bị loại khỏi tính toán định lượng)

export type BeneficiaryEvidenceTier =
  | 'OFFICIAL_CONTRACT'             // Hợp đồng đã ký kết công bố chính thức
  | 'OFFICIAL_TENDER_AWARD'         // Quyết định phê duyệt kết quả lựa chọn nhà thầu (muasamcong)
  | 'OFFICIAL_COMPANY_DISCLOSURE'   // Báo cáo thường niên / Nghị quyết ĐHCĐ / CBTT của doanh nghiệp niêm yết
  | 'OFFICIAL_PROJECT_DOCUMENT'     // Văn bản của chủ đầu tư / Bộ GTVT / EVN
  | 'VERIFIED_SECONDARY_SOURCE'     // Báo chí tài chính chính thống (Đầu tư, VnEconomy, Tuổi trẻ)
  | 'UNVERIFIED_SECONDARY_SOURCE'   // Diễn đàn, bài viết không dẫn nguồn
  | 'RUMOR';                        // Tin đồn hội nhóm đầu cơ (CẤM đưa vào backlog)

export interface ProjectBeneficiary {
  readonly relationshipId: string;
  readonly projectId: string;
  readonly symbol: string;
  readonly companyName: string;
  readonly role: BeneficiaryRole;
  readonly evidenceTier: BeneficiaryEvidenceTier;
  readonly contractPackageCode?: string | null; // e.g. "Gói thầu 5.10 Sân bay Long Thành"
  readonly contractValueVnd?: number | null;
  readonly confirmedBacklogShareVnd?: number | null;
  readonly awardDate?: string | null;
  readonly executionPeriodMonths?: number | null;
  readonly isConfirmedBeneficiary: boolean; // TRUE only if TIER 1 or 2 with verified tender/contract
  readonly provenance: SourceProvenance;
}

// ============================================================================
// 4. CORPORATE BACKLOG & REVENUE CONVERSION CONTRACTS
// ============================================================================

export type BacklogVerificationType =
  | 'CONTRACTED_VERIFIED'     // Có hợp đồng hoặc kết quả trúng thầu xác thực
  | 'DISCLOSED_UNAUDITED'     // Doanh nghiệp công bố trong thuyết trình NĐT nhưng chưa kiểm toán
  | 'ESTIMATED_RUN_RATE'      // Ước tính nội suy kỹ thuật (gắn cờ cảnh báo)
  | 'UNVERIFIED';             // Không đủ căn cứ

export interface BacklogItem {
  readonly itemId: string;
  readonly symbol: string;
  readonly projectId?: string | null;
  readonly projectName?: string | null;
  readonly contractCode?: string | null;
  readonly contractValueVnd: number | null;
  readonly remainingBacklogVnd: number | null;
  readonly recognizedRevenueVnd?: number | null;
  readonly verificationType: BacklogVerificationType;
  readonly awardDate?: string | null;
  readonly expectedStartDate?: string | null;
  readonly expectedCompletionDate?: string | null;
  readonly provenance: SourceProvenance;
}

export interface CompanyBacklogSummary {
  readonly symbol: string;
  readonly asOfDate: string;
  readonly totalConfirmedBacklogVnd: number | null;
  /**
   * Segregated unaudited disclosures (P26-P2-4): company-disclosed but
   * unaudited backlog (IR decks, press releases). Reported for transparency;
   * NEVER included in confirmed totals, coverage, or conversion.
   */
  readonly totalUnauditedDisclosedBacklogVnd: number | null;
  readonly totalUnverifiedBacklogVnd: number | null;
  readonly trailingTwelveMonthsRevenueVnd: number | null;
  readonly bookToBillRatio: number | null;         // Backlog mới ký / Doanh thu ghi nhận TTM
  readonly backlogCoverageYears: number | null;    // Tổng backlog còn lại / Doanh thu TTM
  readonly items: readonly BacklogItem[];
  readonly freshness: DataFreshnessStatus;
}

export interface BacklogRevenueProjectionYear {
  readonly year: number;
  readonly projectedRevenueFromBacklogVnd: number | null;
  readonly completionPercentExpected: number | null;
  readonly confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNAVAILABLE';
}

export interface BacklogRevenueConversionResult {
  readonly symbol: string;
  readonly asOfDate: string;
  readonly confirmedBacklogVnd: number | null;
  readonly scheduleAvailable: boolean;
  readonly projectedRevenues: readonly BacklogRevenueProjectionYear[];
  readonly averageHistoricalGrossMarginPercent: number | null;
  readonly projectedGrossProfitVnd: number | null;
  readonly conversionStatus: 'SCHEDULE_VERIFIED' | 'ESTIMATED_STRAIGHT_LINE' | 'UNAVAILABLE';
  readonly notes: readonly string[];
}

// ============================================================================
// 5. INDUSTRY CAPITAL CYCLE CLASSIFICATION
// ============================================================================

/**
 * The 6 canonical stages of the Austrian / Institutional Capital Cycle.
 * Strictly an analytical condition — NOT a buy/sell signal.
 */
export type CapitalCycleStage =
  | 'EARLY_CYCLE'          // Khởi động chu kỳ: Hỗ trợ chính sách cao, giải ngân tăng, công suất dư thừa, biên LN thấp
  | 'ACCELERATING'         // Tăng tốc: Đơn hàng tăng mạnh, đầu tư mở rộng công suất (Capex), biên LN cải thiện
  | 'EXPANDING'            // Mở rộng đỉnh cao: Capex đạt đỉnh, ghi nhận DT kỷ lục, ROIC cao, tín dụng mở rộng
  | 'PEAKING'              // Chạm đỉnh chu kỳ: Công suất hoạt động tối đa, định giá cao, áp lực dư cung bắt đầu xuất hiện
  | 'DECELERATING'         // Suy giảm: Dư cung công suất, tồn kho tăng, biên lợi nhuận bị ép mạnh, dòng tiền giảm
  | 'CAPITAL_DESTRUCTION'  // Phá hủy vốn: ROIC < WACC, dư thừa công suất nghiêm trọng, áp lực nợ xấu, cắt giảm vốn đầu tư
  | 'UNKNOWN';             // Thiếu dữ liệu để phân loại (Fail-closed)

export interface IndustryCycleDrivers {
  readonly policySupportScore: number | null;      // 0 - 100
  readonly publicInvestmentVelocity: number | null;// Tỷ lệ giải ngân vốn đầu tư công thực tế / kế hoạch
  readonly privateCapexTrend: 'EXPANDING' | 'STABLE' | 'CONTRACTING' | 'UNKNOWN';
  readonly industryCapacityUtilizationPercent: number | null;
  readonly averageGrossMarginTrend: 'EXPANDING' | 'STABLE' | 'COMPRESSING' | 'UNKNOWN';
  readonly industryBookToBillRatio: number | null;
  readonly roicVsWaccSpreadPercent: number | null;
  readonly industryCreditGrowthPercent: number | null;
}

export interface IndustryCapitalCycleSnapshot {
  readonly sectorId: string;
  readonly sectorName: string;
  readonly asOfDate: string;
  readonly stage: CapitalCycleStage;
  readonly cycleScore: number | null; // 0 - 100
  readonly confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNAVAILABLE';
  readonly drivers: IndustryCycleDrivers;
  readonly keyPolicies: readonly PolicyEvent[];
  readonly majorProjects: readonly StrategicProject[];
  readonly keyObservations: readonly string[];
  readonly freshness: DataFreshnessStatus;
}

// ============================================================================
// 6. LEGAL & GOVERNANCE EVENT CONTRACTS
// ============================================================================

export type LegalGovernanceEventType =
  | 'REGULATORY_PENALTY'        // Xử phạt vi phạm hành chính (UBCKNN / Thuế)
  | 'DISCLOSURE_VIOLATION'      // Vi phạm công bố thông tin / Bị nhắc nhở
  | 'ACCOUNTING_AUDIT_QUALIFIED'// Ý kiến kiểm toán ngoại trừ / Từ chối đưa ý kiến
  | 'INVESTIGATION'             // Đang bị thanh tra / kiểm tra / điều tra
  | 'PROSECUTION'               // Khởi tố vụ án / Khởi tố bị can
  | 'INDICTMENT'                // Bắt tạm giam / Truy tố lãnh đạo chủ chốt
  | 'MANAGEMENT_CHANGE'         // Bãi nhiệm / Miễn nhiệm đột xuất Chủ tịch / TGĐ
  | 'BOARD_DISPUTE'             // Tranh chấp nội bộ HĐQT / ĐHCĐ bất thường
  | 'LISTING_STATUS_EVENT'      // Bị đưa vào diện cảnh báo / kiểm soát / hạn chế giao dịch
  | 'TRADING_SUSPENSION'        // Đình chỉ giao dịch cổ phiếu
  | 'GOVERNANCE_BREACH';        // Giao dịch bên liên quan không minh bạch

export type GovernanceSeverityLevel =
  | 'LEVEL_1_INFORMATIONAL'     // Nhắc nhở chậm nộp báo cáo, xử phạt phạt tiền nhỏ
  | 'LEVEL_2_ADMINISTRATIVE'    // Phạt vi phạm thuế, kiểm toán có ý kiến lưu ý, miễn nhiệm định kỳ
  | 'LEVEL_3_REGULATORY_ACTION' // Đưa vào diện kiểm soát, xử phạt thao túng giá, thanh tra trọng điểm
  | 'LEVEL_4_CRIMINAL_ACTION';  // Khởi tố, bắt tạm giam Chủ tịch/TGĐ, đình chỉ giao dịch bắt buộc

export type GovernanceRiskStatus =
  | 'NO_MATERIAL_GOVERNANCE_EVENT' // Không ghi nhận sự kiện pháp lý nghiêm trọng
  | 'GOVERNANCE_EVENT'            // Có sự kiện Level 1-2 đang theo dõi
  | 'MATERIAL_GOVERNANCE_RISK'    // Rủi ro quản trị đáng kể (Level 3) -> Hạ tỷ trọng / hair-cut
  | 'CRITICAL_VERIFIED_GOVERNANCE_EVENT'; // Rủi ro nghiêm trọng (Level 4) -> Kích hoạt chặn RiskGuard

export interface LegalGovernanceEvent {
  readonly eventId: string;
  readonly symbol: string;
  readonly companyName: string;
  readonly eventType: LegalGovernanceEventType;
  readonly severity: GovernanceSeverityLevel;
  readonly title: string;
  readonly description: string;
  readonly authority: string;     // e.g. "Ủy ban Chứng khoán Nhà nước", "Cơ quan Cảnh sát điều tra Bộ Công an"
  readonly officialDocumentNumber?: string | null;
  readonly affectedPersonName?: string | null;
  readonly affectedPersonRole?: string | null;
  readonly fineAmountVnd?: number | null;
  readonly eventDate: string;     // ISO YYYY-MM-DD
  readonly announcementDate: string;
  readonly effectiveDate?: string | null;
  readonly status: 'PENDING' | 'OFFICIAL_SANCTION' | 'APPEALED' | 'CONCLUDED';
  readonly provenance: SourceProvenance;
}

// ============================================================================
// 7. EVENT MARKET REACTION OBSERVATION (NON-CAUSAL)
// ============================================================================

export interface EventWindowMetric {
  readonly window: 'T-20' | 'T-10' | 'T-5' | 'T0' | 'T+1' | 'T+5' | 'T+10' | 'T+20' | 'T+60';
  readonly priceReturnPercent: number | null;
  readonly volumeVsSma20Ratio: number | null;
  readonly benchmarkRelativeReturnPercent: number | null; // e.g. VN-INDEX relative
  readonly netForeignBuyVolume: number | null;
}

export interface ObservedEventMarketReaction {
  readonly eventId: string;
  readonly symbol: string;
  readonly eventType: string;
  readonly eventDate: string;
  readonly windowMetrics: readonly EventWindowMetric[];
  readonly preEventVolatility: number | null;
  readonly postEventVolatility: number | null;
  readonly maximumDrawdownPercent: number | null;
  readonly recoveryDaysToPreEventPrice: number | null;
  readonly marketDataStatus: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE';
  readonly disclaimer: string; // Strictly disclaims unverified causal attribution
}

// ============================================================================
// 8. EVIDENCE GRAPH CONTRACTS
// ============================================================================

export type GraphNodeType =
  | 'POLICY_NODE'
  | 'CAPITAL_ALLOCATION_NODE'
  | 'PROJECT_NODE'
  | 'SECTOR_NODE'
  | 'COMPANY_NODE'
  | 'CONTRACT_NODE'
  | 'BACKLOG_NODE'
  | 'REVENUE_CONVERSION_NODE'
  | 'GOVERNANCE_RISK_NODE';

export type GraphEdgeType =
  | 'FUNDS_SECTOR'
  | 'MANDATES_PROJECT'
  | 'ALLOCATES_CAPITAL_TO'
  | 'AWARDS_CONTRACT_TO'
  | 'GENERATES_BACKLOG'
  | 'CONVERTS_TO_REVENUE'
  | 'IMPOSES_GOVERNANCE_RISK_ON';

export interface EvidenceGraphNode {
  readonly nodeId: string;
  readonly nodeType: GraphNodeType;
  readonly label: string;
  readonly entityId: string;
  readonly attributes: Record<string, unknown>;
  readonly provenance: SourceProvenance;
}

export interface EvidenceGraphEdge {
  readonly edgeId: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly edgeType: GraphEdgeType;
  readonly weight: number; // 0.0 - 1.0 (Strength of empirical evidence)
  readonly evidenceTier: BeneficiaryEvidenceTier | SourceTier;
  readonly confirmed: boolean;
  readonly notes?: string;
}

export interface PolicyToValuationEvidenceGraph {
  readonly rootPolicyOrSectorId: string;
  readonly asOfDate: string;
  readonly nodes: readonly EvidenceGraphNode[];
  readonly edges: readonly EvidenceGraphEdge[];
  readonly isComplete: boolean;
}

// ============================================================================
// 9. COMPLETE PHASE 26 MASTER DOMAIN SNAPSHOT
// ============================================================================

export interface IndustryCapitalCycleAndPolicySnapshot {
  readonly snapshotId: string;
  readonly asOfDate: string;
  readonly symbol?: string | null;
  readonly sectorId?: string | null;
  readonly policyEvents: readonly PolicyEvent[];
  readonly strategicProjects: readonly StrategicProject[];
  readonly confirmedBeneficiaries: readonly ProjectBeneficiary[];
  readonly backlogSummary?: CompanyBacklogSummary | null;
  readonly backlogConversion?: BacklogRevenueConversionResult | null;
  readonly capitalCycleSnapshot?: IndustryCapitalCycleSnapshot | null;
  readonly governanceEvents: readonly LegalGovernanceEvent[];
  readonly governanceRiskStatus: GovernanceRiskStatus;
  readonly evidenceGraph?: PolicyToValuationEvidenceGraph | null;
  readonly freshness: DataFreshnessStatus;
  readonly lookaheadRejected: boolean;
  readonly lookaheadViolations: readonly string[];
}

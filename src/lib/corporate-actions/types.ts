/**
 * PHASE 23 — CORPORATE ACTIONS INTELLIGENCE: DOMAIN CONTRACTS
 * ==========================================================
 * Authoritative types, interfaces, and enums for Vietnam equity corporate actions.
 * Adheres strictly to PR-01 freshness contracts, VSDC clearing standards,
 * and HOSE/HNX trading regulations.
 */

import type { DataFreshnessStatus } from '../../types/stock.ts';
import type { CandlePoint } from '../indicators/types.ts';

/**
 * Authoritative Corporate Action types officially supported in Phase 23.
 */
export type CorporateActionType =
  | 'CASH_DIVIDEND'           // Cổ tức bằng tiền mặt
  | 'STOCK_DIVIDEND'          // Cổ tức bằng cổ phiếu
  | 'BONUS_ISSUE'             // Thưởng cổ phiếu / Tăng vốn từ nguồn vốn chủ sở hữu
  | 'RIGHTS_ISSUE'            // Quyền mua cổ phiếu phát hành thêm
  | 'STOCK_SPLIT'             // Chia tách cổ phiếu
  | 'REVERSE_SPLIT'           // Gộp cổ phiếu
  | 'SHAREHOLDER_MEETING'     // Đại hội đồng cổ đông (AGM/EGM)
  | 'WRITTEN_CONSULTATION';   // Lấy ý kiến cổ đông bằng văn bản

/**
 * Event lifecycle status per VSDC and exchange notices.
 */
export type CorporateActionStatus =
  | 'ANNOUNCED'               // Đã công bố thông tin / Nghị quyết HĐQT
  | 'CONFIRMED'               // Đã có thông báo chính thức từ VSDC
  | 'EX_DATE_PASSED'          // Đã qua ngày giao dịch không hưởng quyền
  | 'COMPLETED'               // Đã hoàn tất thực hiện quyền / tiền đã về tài khoản
  | 'CANCELLED'               // Hủy bỏ thực hiện quyền
  | 'AMENDED';                // Đã đính chính / thay đổi ngày hoặc tỷ lệ

/**
 * Fractional-share disposition policy.
 * Standard VSDC default is FLOOR (làm tròn xuống hàng đơn vị, phần lẻ thập phân hủy bỏ).
 */
export type FractionalSharePolicy =
  | 'FLOOR'                   // Làm tròn xuống hàng đơn vị, phần lẻ hủy bỏ (VSDC chuẩn)
  | 'ROUND'                   // Làm tròn theo quy tắc toán học
  | 'CASH_IN_LIEU'            // Thanh toán phần lẻ bằng tiền mặt
  | 'CANCEL'                  // Hủy bỏ toàn bộ phần lẻ
  | 'NONE';                   // Không phát sinh phần lẻ

/**
 * Canonical representation of corporate action entitlement ratios.
 * Example "100:8": 100 existing shares give entitlement to 8 new shares/rights.
 */
export interface CorporateActionRatio {
  oldShares: number;          // Số cổ phiếu sở hữu làm căn cứ (mẫu số, e.g. 100)
  newShares: number;          // Số quyền hoặc cổ phiếu được nhận (tử số, e.g. 8)
  ratioDecimal: number;       // newShares / oldShares (e.g. 0.08)
  rawExpression: string;      // Biểu thức nguyên bản từ thông báo (e.g. "100:8")
}

/**
 * Authoritative dates governing the corporate action timeline.
 */
export interface CorporateActionDates {
  announcementDate: string | null;  // Ngày công bố thông tin (YYYY-MM-DD)
  exDate: string;                   // Ngày giao dịch không hưởng quyền - GDKHQ (YYYY-MM-DD)
  recordDate: string;               // Ngày đăng ký cuối cùng tại VSDC - ĐKCC (YYYY-MM-DD)
  paymentDate: string | null;       // Ngày thanh toán tiền mặt / phân phối cổ phiếu
  tradingDate: string | null;       // Ngày cổ phiếu phát hành thêm bắt đầu giao dịch
  rightsStartDate: string | null;   // Ngày bắt đầu chuyển nhượng quyền / đăng ký mua
  rightsEndDate: string | null;     // Ngày kết thúc chuyển nhượng quyền / nộp tiền
}

/**
 * Canonical Corporate Action entity.
 */
export interface CorporateAction {
  id: string;                       // Unique ID: e.g. "CA_HPG_CASH_DIVIDEND_2026-05-20"
  symbol: string;
  isin: string | null;
  exchange: 'HOSE' | 'HNX' | 'UPCOM';
  actionType: CorporateActionType;
  status: CorporateActionStatus;
  dates: CorporateActionDates;

  // Financial parameters
  ratio: CorporateActionRatio | null;
  cashAmountVnd: number | null;     // Số tiền cổ tức / 1 cổ phiếu (e.g. 1000 VND)
  cashYieldPercent: number | null;  // cashAmountVnd / 10,000 (Mệnh giá) * 100%
  issuePriceVnd: number | null;     // Giá phát hành quyền mua (e.g. 10000 VND)
  quantityExpected: number | null;  // Số lượng chứng khoán dự kiến phát hành

  // Rights specific identifiers
  rightsCode: string | null;        // Mã quyền mua tại VSDC (e.g. "MIRHPG241")
  rightsIsin: string | null;

  // Fractional policy
  fractionalPolicy: FractionalSharePolicy;

  // Governance details (AGM/EGM)
  meetingVenue?: string | null;
  meetingTime?: string | null;
  votingRatio?: string | null;      // Tỷ lệ biểu quyết (e.g. "1:1")

  // Provenance & Freshness
  source: 'VSDC' | 'HOSE' | 'HNX' | 'ISSUER';
  sourceDocumentRef?: string | null;
  sourceTimestamp: number | null;
  fetchedAt: string;
  dataFreshness: DataFreshnessStatus;
  warnings: string[];
}

/**
 * Single-event backward price adjustment factor.
 */
export interface CorporateActionAdjustmentFactor {
  exDate: string;
  actionId: string;
  actionType: CorporateActionType;
  factor: number;                   // Multiplier k_t = P_ex / P_prev
  inverseFactor: number;            // Volume multiplier 1 / k_t
  prevClosePrice: number;
  exReferencePrice: number;
  formulaApplied: string;
}

/**
 * Derived adjusted historical price bar.
 * Raw KBS OHLCV bars are strictly preserved in raw fields without in-place mutation.
 */
export interface AdjustedPriceBar extends CandlePoint {
  rawOpen: number;
  rawHigh: number;
  rawLow: number;
  rawClose: number;
  rawVolume: number;
  cumulativeAdjustmentFactor: number;
}

/**
 * Historical dividend summary metrics.
 */
export interface CorporateActionDividendSummary {
  ttmCashDividendsVnd: number | null;
  indicatedAnnualDividendVnd: number | null;
  historicalYieldPercent: number | null;
  lastDividendDate: string | null;
  lastCashAmountVnd: number | null;
}

/**
 * Provenance lineage metadata.
 */
export interface CorporateActionDataLineage {
  sources: string[];
  engine: string;
  calculationVersion: string;
}

/**
 * Complete PR-01 compliant Corporate Actions Intelligence Snapshot.
 */
export interface CorporateActionIntelligenceSnapshot {
  symbol: string;
  asOfDate: string;
  dataFreshness: DataFreshnessStatus;
  sourceTimestamp: number | null;
  fetchedAt: string;
  upcomingEvents: CorporateAction[];
  historicalEvents: CorporateAction[];
  activeRights: CorporateAction[];
  adjustmentFactors: CorporateActionAdjustmentFactor[];
  dividendSummary: CorporateActionDividendSummary;
  dataLineage: CorporateActionDataLineage;
  warnings: string[];
}

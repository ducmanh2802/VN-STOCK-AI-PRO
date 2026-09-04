import { sanitizeNumber } from '../common/types.ts';

export interface ValuationMethodOutput {
  value: number | null;
  reason?: string;
}

/**
 * 1. P/E Multiple Valuation
 * Fair Value = Target P/E * Normalized EPS
 */
export function calculatePEValuation(
  eps?: number | null,
  targetPE: number = 15
): ValuationMethodOutput {
  const e = sanitizeNumber(eps);
  const pe = sanitizeNumber(targetPE);

  if (e === null || pe === null) {
    return { value: null, reason: 'Thiếu EPS hoặc hệ số P/E mục tiêu.' };
  }
  if (e <= 0) {
    return { value: null, reason: 'EPS âm hoặc bằng 0, không thể định giá theo phương pháp P/E.' };
  }
  if (pe <= 0) {
    return { value: null, reason: 'P/E mục tiêu phải lớn hơn 0.' };
  }

  const fairValue = e * pe;
  return { value: Number(fairValue.toFixed(0)) };
}

/**
 * 2. P/B Multiple Valuation
 * Fair Value = Target P/B * BVPS
 */
export function calculatePBValuation(
  bookValuePerShare?: number | null,
  targetPB: number = 1.8
): ValuationMethodOutput {
  const bvps = sanitizeNumber(bookValuePerShare);
  const pb = sanitizeNumber(targetPB);

  if (bvps === null || pb === null) {
    return { value: null, reason: 'Thiếu BVPS hoặc hệ số P/B mục tiêu.' };
  }
  if (bvps <= 0) {
    return { value: null, reason: 'Giá trị sổ sách (BVPS) âm hoặc bằng 0.' };
  }
  if (pb <= 0) {
    return { value: null, reason: 'P/B mục tiêu phải lớn hơn 0.' };
  }

  const fairValue = bvps * pb;
  return { value: Number(fairValue.toFixed(0)) };
}

/**
 * 3. 2-Stage Discounted Cash Flow (DCF) Valuation
 */
export function calculateDCFValuation(params: {
  freeCashFlow?: number | null;
  growthRate5Y?: number | null;    // e.g. 0.12 (12%)
  terminalGrowthRate?: number;     // e.g. 0.03 (3%)
  discountRateWACC?: number;       // e.g. 0.105 (10.5%)
  netDebt?: number | null;         // Total Debt - Cash
  outstandingShares?: number | null;
}): ValuationMethodOutput {
  const fcf = sanitizeNumber(params.freeCashFlow);
  const shares = sanitizeNumber(params.outstandingShares);
  const g1 = sanitizeNumber(params.growthRate5Y) ?? 0.10;
  const g2 = sanitizeNumber(params.terminalGrowthRate) ?? 0.03;
  const wacc = sanitizeNumber(params.discountRateWACC) ?? 0.105;
  const netDebt = sanitizeNumber(params.netDebt) ?? 0;

  if (fcf === null || shares === null) {
    return { value: null, reason: 'Thiếu dòng tiền tự do (FCF) hoặc số lượng cổ phiếu lưu hành.' };
  }
  if (fcf <= 0) {
    return { value: null, reason: 'Dòng tiền tự do (FCF) âm, không đủ điều kiện chiết khấu DCF chuẩn.' };
  }
  if (shares <= 0) {
    return { value: null, reason: 'Số lượng cổ phiếu lưu hành không hợp lệ.' };
  }
  if (wacc <= g2) {
    return { value: null, reason: 'Lãi suất chiết khấu (WACC) phải lớn hơn tốc độ tăng trưởng dài hạn.' };
  }

  // Stage 1: 5-year projections
  let pvFCF = 0;
  let currentProjectedFCF = fcf;

  for (let year = 1; year <= 5; year++) {
    currentProjectedFCF *= (1 + g1);
    pvFCF += currentProjectedFCF / Math.pow(1 + wacc, year);
  }

  // Stage 2: Terminal Value
  const terminalValue = (currentProjectedFCF * (1 + g2)) / (wacc - g2);
  const pvTerminalValue = terminalValue / Math.pow(1 + wacc, 5);

  const enterpriseValue = pvFCF + pvTerminalValue;
  const equityValue = enterpriseValue - netDebt;

  if (equityValue <= 0) {
    return { value: null, reason: 'Giá trị vốn chủ sau khi trừ nợ thuần không dương.' };
  }

  const fairValuePerShare = equityValue / shares;
  return { value: Number(fairValuePerShare.toFixed(0)) };
}

/**
 * 4. Dividend Discount Model (DDM - Gordon Growth)
 * Fair Value = D0 * (1 + g) / (r - g)
 */
export function calculateDividendValuation(params: {
  annualDividendPerShare?: number | null;
  dividendGrowthRate?: number | null; // e.g. 0.05 (5%)
  requiredReturnRate?: number | null; // e.g. 0.11 (11%)
}): ValuationMethodOutput {
  const d0 = sanitizeNumber(params.annualDividendPerShare);
  const g = sanitizeNumber(params.dividendGrowthRate) ?? 0.04;
  const r = sanitizeNumber(params.requiredReturnRate) ?? 0.105;

  if (d0 === null || d0 <= 0) {
    return { value: null, reason: 'Doanh nghiệp không chi trả cổ tức tiền mặt đều đặn (không áp dụng DDM).' };
  }
  if (r <= g) {
    return { value: null, reason: 'Tỷ suất sinh lời yêu cầu phải lớn hơn tốc độ tăng trưởng cổ tức.' };
  }

  const d1 = d0 * (1 + g);
  const fairValue = d1 / (r - g);

  return { value: Number(fairValue.toFixed(0)) };
}

/**
 * 5. Historical Multiple Valuation
 * Combines historical median P/E and P/B
 */
export function calculateHistoricalValuation(params: {
  eps?: number | null;
  bookValuePerShare?: number | null;
  historicalMedianPE?: number | null;
  historicalMedianPB?: number | null;
}): ValuationMethodOutput {
  const eps = sanitizeNumber(params.eps);
  const bvps = sanitizeNumber(params.bookValuePerShare);
  const medPE = sanitizeNumber(params.historicalMedianPE);
  const medPB = sanitizeNumber(params.historicalMedianPB);

  const estimates: number[] = [];

  if (eps !== null && eps > 0 && medPE !== null && medPE > 0) {
    estimates.push(eps * medPE);
  }

  if (bvps !== null && bvps > 0 && medPB !== null && medPB > 0) {
    estimates.push(bvps * medPB);
  }

  if (estimates.length === 0) {
    return { value: null, reason: 'Không đủ dữ liệu bội số P/E hoặc P/B lịch sử trung bình.' };
  }

  const fairValue = estimates.reduce((a, b) => a + b, 0) / estimates.length;
  return { value: Number(fairValue.toFixed(0)) };
}

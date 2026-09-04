import { isValidNumber, sanitizeNumber } from '../common/types.ts';

export interface MetricCalculationResult {
  value: number | null;
  explanation?: string;
}

/**
 * 1. Revenue Growth YoY / QoQ (%)
 */
export function calculateRevenueGrowth(
  currentRevenue?: number | null,
  previousRevenue?: number | null
): MetricCalculationResult {
  const cur = sanitizeNumber(currentRevenue);
  const prev = sanitizeNumber(previousRevenue);

  if (cur === null || prev === null) {
    return {
      value: null,
      explanation: 'Thiếu dữ liệu doanh thu kỳ hiện tại hoặc kỳ trước.',
    };
  }
  if (prev <= 0) {
    return {
      value: null,
      explanation: 'Doanh thu kỳ trước nhỏ hơn hoặc bằng 0, không thể tính tỷ lệ tăng trưởng phần trăm.',
    };
  }

  const growth = ((cur - prev) / prev) * 100;
  return { value: Number(growth.toFixed(2)) };
}

/**
 * 2. Net Profit Growth YoY / QoQ (%)
 */
export function calculateProfitGrowth(
  currentProfit?: number | null,
  previousProfit?: number | null
): MetricCalculationResult {
  const cur = sanitizeNumber(currentProfit);
  const prev = sanitizeNumber(previousProfit);

  if (cur === null || prev === null) {
    return {
      value: null,
      explanation: 'Thiếu dữ liệu lợi nhuận sau thuế kỳ hiện tại hoặc kỳ trước.',
    };
  }
  if (prev === 0) {
    return {
      value: null,
      explanation: 'Lợi nhuận kỳ trước bằng 0, không thể chia cho 0.',
    };
  }

  // If previous profit was negative and current is positive (turnaround)
  if (prev < 0) {
    if (cur > 0) {
      const turnaroundGrowth = ((cur - prev) / Math.abs(prev)) * 100;
      return {
        value: Number(turnaroundGrowth.toFixed(2)),
        explanation: 'Doanh nghiệp chuyển từ lỗ sang lãi (Turnaround).',
      };
    } else {
      const growth = ((cur - prev) / Math.abs(prev)) * 100;
      return {
        value: Number(growth.toFixed(2)),
        explanation: 'Doanh nghiệp tiếp tục ghi nhận lỗ.',
      };
    }
  }

  const growth = ((cur - prev) / prev) * 100;
  return { value: Number(growth.toFixed(2)) };
}

/**
 * 3. Earnings Per Share (EPS)
 */
export function calculateEPS(
  netProfit?: number | null,
  outstandingShares?: number | null
): MetricCalculationResult {
  const profit = sanitizeNumber(netProfit);
  const shares = sanitizeNumber(outstandingShares);

  if (profit === null || shares === null) {
    return {
      value: null,
      explanation: 'Thiếu dữ liệu lợi nhuận ròng hoặc số lượng cổ phiếu lưu hành.',
    };
  }
  if (shares <= 0) {
    return {
      value: null,
      explanation: 'Số lượng cổ phiếu lưu hành phải lớn hơn 0.',
    };
  }

  const eps = profit / shares;
  return { value: Number(eps.toFixed(2)) };
}

/**
 * 4. Price-to-Earnings Ratio (P/E)
 */
export function calculatePE(
  price?: number | null,
  eps?: number | null
): MetricCalculationResult {
  const p = sanitizeNumber(price);
  const e = sanitizeNumber(eps);

  if (p === null || e === null) {
    return {
      value: null,
      explanation: 'Thiếu giá thị trường hoặc EPS để tính P/E.',
    };
  }
  if (p <= 0) {
    return {
      value: null,
      explanation: 'Giá thị trường không hợp lệ (<= 0).',
    };
  }
  if (e <= 0) {
    return {
      value: null,
      explanation: 'EPS âm hoặc bằng 0, hệ số P/E không có ý nghĩa định giá thông thường.',
    };
  }

  const pe = p / e;
  return { value: Number(pe.toFixed(2)) };
}

/**
 * 5. Price-to-Book Ratio (P/B)
 */
export function calculatePB(
  price?: number | null,
  bookValuePerShare?: number | null
): MetricCalculationResult {
  const p = sanitizeNumber(price);
  const bvps = sanitizeNumber(bookValuePerShare);

  if (p === null || bvps === null) {
    return {
      value: null,
      explanation: 'Thiếu giá thị trường hoặc giá trị sổ sách mỗi cổ phiếu (BVPS).',
    };
  }
  if (p <= 0) {
    return {
      value: null,
      explanation: 'Giá thị trường phải lớn hơn 0.',
    };
  }
  if (bvps <= 0) {
    return {
      value: null,
      explanation: 'Vốn chủ sở hữu âm hoặc BVPS <= 0, hệ số P/B không xác định.',
    };
  }

  const pb = p / bvps;
  return { value: Number(pb.toFixed(2)) };
}

/**
 * 6. Return on Equity (ROE %)
 */
export function calculateROE(
  netProfit?: number | null,
  equity?: number | null
): MetricCalculationResult {
  const profit = sanitizeNumber(netProfit);
  const eq = sanitizeNumber(equity);

  if (profit === null || eq === null) {
    return {
      value: null,
      explanation: 'Thiếu dữ liệu lợi nhuận ròng hoặc vốn chủ sở hữu.',
    };
  }
  if (eq <= 0) {
    return {
      value: null,
      explanation: 'Vốn chủ sở hữu âm hoặc bằng 0, không thể tính ROE.',
    };
  }

  const roe = (profit / eq) * 100;
  return { value: Number(roe.toFixed(2)) };
}

/**
 * 7. Return on Assets (ROA %)
 */
export function calculateROA(
  netProfit?: number | null,
  totalAssets?: number | null
): MetricCalculationResult {
  const profit = sanitizeNumber(netProfit);
  const assets = sanitizeNumber(totalAssets);

  if (profit === null || assets === null) {
    return {
      value: null,
      explanation: 'Thiếu dữ liệu lợi nhuận ròng hoặc tổng tài sản.',
    };
  }
  if (assets <= 0) {
    return {
      value: null,
      explanation: 'Tổng tài sản phải lớn hơn 0.',
    };
  }

  const roa = (profit / assets) * 100;
  return { value: Number(roa.toFixed(2)) };
}

/**
 * 8. Debt to Equity (D/E)
 */
export function calculateDebtToEquity(
  totalLiabilities?: number | null,
  totalEquity?: number | null
): MetricCalculationResult {
  const liabilities = sanitizeNumber(totalLiabilities);
  const equity = sanitizeNumber(totalEquity);

  if (liabilities === null || equity === null) {
    return {
      value: null,
      explanation: 'Thiếu dữ liệu tổng nợ phải trả hoặc vốn chủ sở hữu.',
    };
  }
  if (equity <= 0) {
    return {
      value: null,
      explanation: 'Vốn chủ sở hữu âm hoặc bằng 0 (nguy cơ mất an toàn vốn).',
    };
  }

  const de = liabilities / equity;
  return { value: Number(de.toFixed(2)) };
}

/**
 * 9. Current Ratio (Tỷ số thanh toán hiện hành)
 */
export function calculateCurrentRatio(
  currentAssets?: number | null,
  currentLiabilities?: number | null
): MetricCalculationResult {
  const ca = sanitizeNumber(currentAssets);
  const cl = sanitizeNumber(currentLiabilities);

  if (ca === null || cl === null) {
    return {
      value: null,
      explanation: 'Thiếu dữ liệu tài sản ngắn hạn hoặc nợ ngắn hạn.',
    };
  }
  if (cl <= 0) {
    return {
      value: null,
      explanation: 'Nợ ngắn hạn bằng 0 hoặc âm, không thể tính tỷ số thanh toán hiện hành.',
    };
  }

  const cr = ca / cl;
  return { value: Number(cr.toFixed(2)) };
}

/**
 * 10. Dividend Yield (%)
 */
export function calculateDividendYield(
  dividendPerShare?: number | null,
  price?: number | null
): MetricCalculationResult {
  const dps = sanitizeNumber(dividendPerShare);
  const p = sanitizeNumber(price);

  if (dps === null || p === null) {
    return {
      value: null,
      explanation: 'Thiếu dữ liệu cổ tức bằng tiền mặt hoặc thị giá cổ phiếu.',
    };
  }
  if (p <= 0) {
    return {
      value: null,
      explanation: 'Thị giá cổ phiếu phải lớn hơn 0.',
    };
  }
  if (dps < 0) {
    return {
      value: null,
      explanation: 'Cổ tức chi trả không thể là số âm.',
    };
  }

  const yieldPct = (dps / p) * 100;
  return { value: Number(yieldPct.toFixed(2)) };
}

/**
 * 11. Operating Margin (%)
 */
export function calculateOperatingMargin(
  operatingProfit?: number | null,
  revenue?: number | null
): MetricCalculationResult {
  const op = sanitizeNumber(operatingProfit);
  const rev = sanitizeNumber(revenue);

  if (op === null || rev === null) {
    return {
      value: null,
      explanation: 'Thiếu dữ liệu lợi nhuận thuần từ HĐKD hoặc doanh thu thuần.',
    };
  }
  if (rev <= 0) {
    return {
      value: null,
      explanation: 'Doanh thu thuần phải lớn hơn 0.',
    };
  }

  const margin = (op / rev) * 100;
  return { value: Number(margin.toFixed(2)) };
}

/**
 * 12. Net Margin (%)
 */
export function calculateNetMargin(
  netProfit?: number | null,
  revenue?: number | null
): MetricCalculationResult {
  const profit = sanitizeNumber(netProfit);
  const rev = sanitizeNumber(revenue);

  if (profit === null || rev === null) {
    return {
      value: null,
      explanation: 'Thiếu dữ liệu lợi nhuận sau thuế hoặc doanh thu thuần.',
    };
  }
  if (rev <= 0) {
    return {
      value: null,
      explanation: 'Doanh thu thuần phải lớn hơn 0.',
    };
  }

  const margin = (profit / rev) * 100;
  return { value: Number(margin.toFixed(2)) };
}

/**
 * 13. Free Cash Flow (FCF = Operating Cash Flow - CapEx)
 */
export function calculateFreeCashFlow(
  operatingCashFlow?: number | null,
  capitalExpenditure?: number | null
): MetricCalculationResult {
  const ocf = sanitizeNumber(operatingCashFlow);
  const capex = sanitizeNumber(capitalExpenditure);

  if (ocf === null) {
    return {
      value: null,
      explanation: 'Thiếu dữ liệu lưu chuyển tiền thuần từ hoạt động kinh doanh (OCF).',
    };
  }

  // If CapEx is not explicitly supplied or 0, FCF defaults to OCF
  const actualCapex = capex !== null ? Math.abs(capex) : 0;
  const fcf = ocf - actualCapex;

  return {
    value: Number(fcf.toFixed(2)),
    explanation: capex === null ? 'CapEx không có sẵn, FCF tính tạm bằng OCF.' : undefined,
  };
}

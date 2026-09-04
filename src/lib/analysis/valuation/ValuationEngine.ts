import { sanitizeNumber } from '../common/types.ts';
import {
  calculatePEValuation,
  calculatePBValuation,
  calculateDCFValuation,
  calculateDividendValuation,
  calculateHistoricalValuation,
} from './formulas.ts';

export interface ValuationEngineInput {
  currentPrice: number;
  eps?: number | null;
  bookValuePerShare?: number | null;
  freeCashFlow?: number | null;
  annualDividendPerShare?: number | null;
  outstandingShares?: number | null;
  netDebt?: number | null;
  targetPE?: number;
  targetPB?: number;
  historicalMedianPE?: number | null;
  historicalMedianPB?: number | null;
  growthRate5Y?: number | null;
  discountRateWACC?: number | null;
}

export interface ValuationEngineResult {
  fairValuePE: number | null;
  fairValuePB: number | null;
  fairValueDCF: number | null;
  fairValueDividend: number | null;
  fairValueHistorical: number | null;
  weightedFairValue: number | null;
  upsidePercent: number | null;
  valuationScore: number | null; // 0 - 100 attractiveness score
  status: 'success' | 'insufficient_data';
  methodWeights: Record<string, number>;
  notes: string[];
  disclaimer: string;
}

export class ValuationEngine {
  public static readonly DISCLAIMER =
    'Định giá doanh nghiệp là ước tính kỹ thuật dựa trên các giả định tài chính quá khứ và dự phóng tương lai. Kết quả không phải là cam kết thị giá chắc chắn, nhà đầu tư cần kết hợp phân tích chu kỳ ngành và quản trị rủi ro.';

  /**
   * Deterministically calculates multi-method fair value and overall valuation attractiveness score.
   */
  static evaluate(input: ValuationEngineInput): ValuationEngineResult {
    const notes: string[] = [];
    const currentPrice = sanitizeNumber(input.currentPrice);

    if (currentPrice === null || currentPrice <= 0) {
      return {
        fairValuePE: null,
        fairValuePB: null,
        fairValueDCF: null,
        fairValueDividend: null,
        fairValueHistorical: null,
        weightedFairValue: null,
        upsidePercent: null,
        valuationScore: null,
        status: 'insufficient_data',
        methodWeights: {},
        notes: ['Thị giá hiện tại không hợp lệ (nhỏ hơn hoặc bằng 0).'],
        disclaimer: ValuationEngine.DISCLAIMER,
      };
    }

    // 1. P/E Valuation
    const peRes = calculatePEValuation(input.eps, input.targetPE ?? 15);
    if (peRes.reason) notes.push(`[P/E]: ${peRes.reason}`);

    // 2. P/B Valuation
    const pbRes = calculatePBValuation(input.bookValuePerShare, input.targetPB ?? 1.8);
    if (pbRes.reason) notes.push(`[P/B]: ${pbRes.reason}`);

    // 3. DCF Valuation
    const dcfRes = calculateDCFValuation({
      freeCashFlow: input.freeCashFlow,
      growthRate5Y: input.growthRate5Y,
      discountRateWACC: input.discountRateWACC ?? 0.105,
      netDebt: input.netDebt,
      outstandingShares: input.outstandingShares,
    });
    if (dcfRes.reason) notes.push(`[DCF]: ${dcfRes.reason}`);

    // 4. Dividend Discount Model (Gordon)
    const divRes = calculateDividendValuation({
      annualDividendPerShare: input.annualDividendPerShare,
    });
    if (divRes.reason) notes.push(`[DDM]: ${divRes.reason}`);

    // 5. Historical Multiples Valuation
    const histRes = calculateHistoricalValuation({
      eps: input.eps,
      bookValuePerShare: input.bookValuePerShare,
      historicalMedianPE: input.historicalMedianPE,
      historicalMedianPB: input.historicalMedianPB,
    });
    if (histRes.reason) notes.push(`[Lịch sử]: ${histRes.reason}`);

    // Aggregate available models dynamically
    const methods: Array<{ name: string; value: number; baseWeight: number }> = [];

    if (peRes.value !== null) methods.push({ name: 'PE', value: peRes.value, baseWeight: 0.30 });
    if (pbRes.value !== null) methods.push({ name: 'PB', value: pbRes.value, baseWeight: 0.20 });
    if (dcfRes.value !== null) methods.push({ name: 'DCF', value: dcfRes.value, baseWeight: 0.35 });
    if (divRes.value !== null) methods.push({ name: 'Dividend', value: divRes.value, baseWeight: 0.15 });
    if (histRes.value !== null) methods.push({ name: 'Historical', value: histRes.value, baseWeight: 0.20 });

    if (methods.length === 0) {
      return {
        fairValuePE: null,
        fairValuePB: null,
        fairValueDCF: null,
        fairValueDividend: null,
        fairValueHistorical: null,
        weightedFairValue: null,
        upsidePercent: null,
        valuationScore: null,
        status: 'insufficient_data',
        methodWeights: {},
        notes: [
          'Không đủ dữ liệu đầu vào cần thiết cho bất kỳ mô hình định giá nào.',
          ...notes,
        ],
        disclaimer: ValuationEngine.DISCLAIMER,
      };
    }

    // Normalize weights among active methods
    const totalBaseWeight = methods.reduce((acc, m) => acc + m.baseWeight, 0);
    const methodWeights: Record<string, number> = {};
    let weightedSum = 0;

    for (const m of methods) {
      const normalizedWeight = Number((m.baseWeight / totalBaseWeight).toFixed(3));
      methodWeights[m.name] = normalizedWeight;
      weightedSum += m.value * (m.baseWeight / totalBaseWeight);
    }

    const weightedFairValue = Math.round(weightedSum);
    const upsidePercent = Number(
      (((weightedFairValue - currentPrice) / currentPrice) * 100).toFixed(2)
    );

    // Calculate valuation attractiveness score (0 - 100)
    // upside > 30% => 95, upside 15-30% => 80, upside 0-15% => 65, upside -15 - 0% => 45, upside < -15% => 20
    let valuationScore = 50;
    if (upsidePercent >= 35) {
      valuationScore = 95;
    } else if (upsidePercent >= 20) {
      valuationScore = 80;
    } else if (upsidePercent >= 5) {
      valuationScore = 65;
    } else if (upsidePercent >= -10) {
      valuationScore = 45;
    } else {
      valuationScore = 20;
    }

    notes.push(
      `Định giá tổng hợp bình quân theo ${methods.length} phương pháp đạt ${weightedFairValue.toLocaleString('vi-VN')} đ (Upside: ${upsidePercent > 0 ? '+' : ''}${upsidePercent}%).`
    );

    return {
      fairValuePE: peRes.value,
      fairValuePB: pbRes.value,
      fairValueDCF: dcfRes.value,
      fairValueDividend: divRes.value,
      fairValueHistorical: histRes.value,
      weightedFairValue,
      upsidePercent,
      valuationScore,
      status: 'success',
      methodWeights,
      notes,
      disclaimer: ValuationEngine.DISCLAIMER,
    };
  }
}

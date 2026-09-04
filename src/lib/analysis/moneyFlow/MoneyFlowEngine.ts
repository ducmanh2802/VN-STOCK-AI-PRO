import { CandleInput, isValidNumber, sanitizeNumber } from '../common/types.ts';

export interface ForeignTradingInput {
  foreignBuyVolume?: number | null;
  foreignBuyValue?: number | null;
  foreignSellVolume?: number | null;
  foreignSellValue?: number | null;
  foreignNetVolume?: number | null;
  foreignNetValue?: number | null;
  foreignRoomPercent?: number | null;
}

export interface InstitutionalTradingInput {
  largeOrderBuyValue?: number | null;
  largeOrderSellValue?: number | null;
  largeOrderNetValue?: number | null;
}

export interface MoneyFlowEngineInput {
  candles: CandleInput[];
  foreignTrading?: ForeignTradingInput | null;
  institutionalTrading?: InstitutionalTradingInput | null;
}

export type MoneyFlowTrend =
  | 'STRONG_INFLOW'
  | 'INFLOW'
  | 'NEUTRAL'
  | 'OUTFLOW'
  | 'STRONG_OUTFLOW';

export type ForeignFlowSignal = 'NET_BUY' | 'NET_SELL' | 'NEUTRAL' | 'NO_DATA';

export interface ForeignFlowResult {
  buy: number | null;
  sell: number | null;
  net: number | null;
  foreignBuy: number | null;
  foreignSell: number | null;
  foreignNet: number | null;
  buyValue: number | null;
  sellValue: number | null;
  netValue: number | null;
  signal: ForeignFlowSignal;
  percentageOfTotalVolume: number | null;
  description: string;
}

export type VolumeSignalStatus =
  | 'SURGE'
  | 'ABOVE_AVERAGE'
  | 'NORMAL'
  | 'LOW'
  | 'DRY_UP';

export interface VolumeSignalResult {
  currentVolume: number;
  volumeSMA20: number | null;
  volumeRatio: number | null;
  status: VolumeSignalStatus;
  interpretation: string;
}

export type AccumulationStatus = 'ACCUMULATION' | 'DISTRIBUTION' | 'NEUTRAL';
export type ADTrend = 'RISING' | 'FALLING' | 'FLAT';

export interface AccumulationSignalResult {
  status: AccumulationStatus;
  moneyFlowMultiplier: number | null; // between -1.0 and +1.0
  adTrend: ADTrend;
  cmf20: number | null; // Chaikin Money Flow (-1.0 to +1.0)
  description: string;
}

export type PriceVolumePattern =
  | 'BULLISH_CONFIRMATION' // Price up, volume up
  | 'BEARISH_DISTRIBUTION' // Price down, volume up
  | 'BULLISH_DIVERGENCE'   // Price down, volume dry up (low supply)
  | 'BEARISH_DIVERGENCE'   // Price up, volume dry up (weak rally)
  | 'NEUTRAL';

export interface PriceVolumeRelationshipResult {
  pattern: PriceVolumePattern;
  priceChangePct: number;
  volumeRatio: number | null;
  description: string;
}

export interface InstitutionalFlowResult {
  hasData: boolean;
  largeOrdersBuy: number | null;
  largeOrdersSell: number | null;
  netBigMoney: number | null;
  description: string;
}

export interface MoneyFlowResult {
  score: number; // 0 - 100 normalized
  trend: MoneyFlowTrend;
  foreignFlow: ForeignFlowResult;
  volumeSignal: VolumeSignalResult;
  accumulationSignal: AccumulationSignalResult;
  priceVolumeRelationship: PriceVolumeRelationshipResult;
  tradingValue: number; // in currency (VND)
  institutionalFlow: InstitutionalFlowResult;
  reasons: string[];
  warnings: string[];
}

/**
 * Calculates Money Flow Multiplier: [(Close - Low) - (High - Close)] / (High - Low)
 * Ranges between -1.0 and +1.0. If High === Low, returns 0.
 */
export function calculateMoneyFlowMultiplier(candle: CandleInput): number {
  const range = candle.high - candle.low;
  if (range <= 0) return 0;
  const multiplier = (candle.close - candle.low - (candle.high - candle.close)) / range;
  return Number(Math.max(-1, Math.min(1, multiplier)).toFixed(4));
}

/**
 * Calculates 20-period Chaikin Money Flow (CMF).
 * CMF = Sum(MFV, 20) / Sum(Volume, 20)
 * where MFV = Money Flow Multiplier * Volume
 */
export function calculateCMF(candles: CandleInput[], period: number = 20): number | null {
  if (!Array.isArray(candles) || candles.length < period || period <= 0) {
    return null;
  }

  const slice = candles.slice(candles.length - period);
  let totalMFV = 0;
  let totalVolume = 0;

  for (const c of slice) {
    const mfm = calculateMoneyFlowMultiplier(c);
    totalMFV += mfm * c.volume;
    totalVolume += c.volume;
  }

  if (totalVolume <= 0) return 0;
  return Number((totalMFV / totalVolume).toFixed(4));
}

/**
 * Evaluates Price-Volume Relationship deterministically.
 */
export function evaluatePriceVolume(
  current: CandleInput,
  previous: CandleInput | null,
  volumeRatio: number | null
): PriceVolumeRelationshipResult {
  if (!previous || previous.close <= 0) {
    return {
      pattern: 'NEUTRAL',
      priceChangePct: 0,
      volumeRatio,
      description: 'Chưa đủ nến liền kề để đối chiếu mối quan hệ giá - khối lượng.',
    };
  }

  const priceChangePct = Number((((current.close - previous.close) / previous.close) * 100).toFixed(2));
  const isVolHigh = volumeRatio !== null && volumeRatio >= 1.25;
  const isVolLow = volumeRatio !== null && volumeRatio < 0.8;

  if (priceChangePct > 0.5) {
    if (isVolHigh) {
      return {
        pattern: 'BULLISH_CONFIRMATION',
        priceChangePct,
        volumeRatio,
        description: 'Giá tăng kèm thanh khoản bùng nổ: Dòng tiền chủ động mua lên quyết liệt, củng cố xu hướng tăng vững chắc.',
      };
    }
    if (isVolLow) {
      return {
        pattern: 'BEARISH_DIVERGENCE',
        priceChangePct,
        volumeRatio,
        description: 'Giá tăng nhưng thanh khoản sụt giảm (phân kỳ khối lượng): Đà tăng thiếu dòng tiền bảo trợ, tiềm ẩn bẫy giá tăng (Bull Trap).',
      };
    }
    return {
      pattern: 'BULLISH_CONFIRMATION',
      priceChangePct,
      volumeRatio,
      description: 'Giá tăng với thanh khoản ở mức trung bình, dòng tiền duy trì trạng thái ổn định.',
    };
  }

  if (priceChangePct < -0.5) {
    if (isVolHigh) {
      return {
        pattern: 'BEARISH_DISTRIBUTION',
        priceChangePct,
        volumeRatio,
        description: 'Giá giảm kèm thanh khoản lớn: Áp lực bán tháo chủ động (phân phối dòng tiền), rủi ro điều chỉnh cao.',
      };
    }
    if (isVolLow) {
      return {
        pattern: 'BULLISH_DIVERGENCE',
        priceChangePct,
        volumeRatio,
        description: 'Giá điều chỉnh với thanh khoản kiệt quệ: Áp lực bán yếu, dấu hiệu cạn cung kiểm định đáy hỗ trợ tích cực.',
      };
    }
    return {
      pattern: 'BEARISH_DISTRIBUTION',
      priceChangePct,
      volumeRatio,
      description: 'Giá giảm với thanh khoản bình thường, thị trường nghiêng về bên bán.',
    };
  }

  return {
    pattern: 'NEUTRAL',
    priceChangePct,
    volumeRatio,
    description: 'Giá đi ngang tích lũy quanh vùng tham chiếu, dòng tiền cân bằng.',
  };
}

export class MoneyFlowEngine {
  /**
   * Deterministically evaluates Money Flow metrics:
   * Foreign Flow, Volume Signals, Trading Value, Price-Volume relationship, Accumulation/Distribution.
   */
  static evaluate(input: MoneyFlowEngineInput): MoneyFlowResult {
    const reasons: string[] = [];
    const warnings: string[] = [];

    const candles = input.candles || [];
    if (candles.length === 0) {
      return {
        score: 50,
        trend: 'NEUTRAL',
        foreignFlow: {
          buy: null,
          sell: null,
          net: null,
          foreignBuy: null,
          foreignSell: null,
          foreignNet: null,
          buyValue: null,
          sellValue: null,
          netValue: null,
          signal: 'NO_DATA',
          percentageOfTotalVolume: null,
          description: 'Không có dữ liệu nến giao dịch.',
        },
        volumeSignal: {
          currentVolume: 0,
          volumeSMA20: null,
          volumeRatio: null,
          status: 'DRY_UP',
          interpretation: 'Không có dữ liệu khối lượng.',
        },
        accumulationSignal: {
          status: 'NEUTRAL',
          moneyFlowMultiplier: null,
          adTrend: 'FLAT',
          cmf20: null,
          description: 'Không có dữ liệu để tính tích lũy/phân phối.',
        },
        priceVolumeRelationship: {
          pattern: 'NEUTRAL',
          priceChangePct: 0,
          volumeRatio: null,
          description: 'Không có dữ liệu giá giao dịch.',
        },
        tradingValue: 0,
        institutionalFlow: {
          hasData: false,
          largeOrdersBuy: null,
          largeOrdersSell: null,
          netBigMoney: null,
          description: 'Không có dữ liệu giao dịch tổ chức (không suy đoán).',
        },
        reasons: ['Thiếu dữ liệu nến giao dịch để phân tích dòng tiền.'],
        warnings: ['Dữ liệu nến rỗng.'],
      };
    }

    const latest = candles[candles.length - 1];
    const prev = candles.length > 1 ? candles[candles.length - 2] : null;

    // 1. TRADING VALUE (VND)
    const tradingValue = Math.round(latest.close * latest.volume);

    // 2. VOLUME METRICS & RATIO
    const lookback = Math.min(20, candles.length);
    let volumeSMA20: number | null = null;
    let volumeRatio: number | null = null;
    let volumeStatus: VolumeSignalStatus = 'NORMAL';
    let volInterpretation = '';

    if (lookback > 0) {
      const volSum = candles.slice(candles.length - lookback).reduce((acc, c) => acc + c.volume, 0);
      volumeSMA20 = Math.round(volSum / lookback);

      if (volumeSMA20 > 0) {
        volumeRatio = Number((latest.volume / volumeSMA20).toFixed(2));
        if (volumeRatio >= 2.0) {
          volumeStatus = 'SURGE';
          volInterpretation = `Khối lượng đột biến gấp ${volumeRatio}x trung bình 20 phiên.`;
        } else if (volumeRatio >= 1.25) {
          volumeStatus = 'ABOVE_AVERAGE';
          volInterpretation = `Khối lượng sôi động, cao hơn ${((volumeRatio - 1) * 100).toFixed(0)}% so với trung bình 20 phiên.`;
        } else if (volumeRatio >= 0.75) {
          volumeStatus = 'NORMAL';
          volInterpretation = 'Khối lượng giao dịch ở mức trung bình bình thường.';
        } else if (volumeRatio >= 0.4) {
          volumeStatus = 'LOW';
          volInterpretation = 'Khối lượng giao dịch thấp, dòng tiền thận trọng quan sát.';
        } else {
          volumeStatus = 'DRY_UP';
          volInterpretation = 'Thanh khoản cạn kiệt đáng kể so với mức bình quân.';
        }
      } else {
        volumeRatio = latest.volume > 0 ? 999 : 0;
        volumeStatus = latest.volume > 0 ? 'SURGE' : 'DRY_UP';
        volInterpretation = 'Khối lượng trung bình các phiên trước bằng 0.';
      }
    }

    const volumeSignal: VolumeSignalResult = {
      currentVolume: latest.volume,
      volumeSMA20,
      volumeRatio,
      status: volumeStatus,
      interpretation: volInterpretation,
    };

    // 3. ACCUMULATION / DISTRIBUTION (MFM & CMF)
    const mfm = calculateMoneyFlowMultiplier(latest);
    const cmf20 = calculateCMF(candles, 20);

    let adStatus: AccumulationStatus = 'NEUTRAL';
    let adTrend: ADTrend = 'FLAT';
    let adDesc = '';

    // If latest close closed in the upper half of high-low range (mfm > 0.2)
    if (mfm >= 0.3) {
      adStatus = 'ACCUMULATION';
      adDesc = 'Lực mua gom chiếm ưu thế, nến đóng cửa sát vùng giá cao nhất phiên.';
    } else if (mfm <= -0.3) {
      adStatus = 'DISTRIBUTION';
      adDesc = 'Áp lực phân phối xả hàng chiếm ưu thế, nến đóng cửa sát vùng giá thấp nhất phiên.';
    } else {
      adStatus = 'NEUTRAL';
      adDesc = 'Lực mua và bán giằng co, nến đóng cửa ở vùng trung vị phiên.';
    }

    if (cmf20 !== null) {
      if (cmf20 > 0.08) {
        adTrend = 'RISING';
        adDesc += ` Chỉ số Chaikin Money Flow CMF(20) = +${cmf20} xác nhận dòng tiền tích lũy ròng trong 20 phiên qua.`;
      } else if (cmf20 < -0.08) {
        adTrend = 'FALLING';
        adDesc += ` Chỉ số Chaikin Money Flow CMF(20) = ${cmf20} cảnh báo dòng tiền đang bị rút ròng.`;
      } else {
        adTrend = 'FLAT';
        adDesc += ` Chỉ số CMF(20) = ${cmf20} cho thấy dòng tiền trung lập.`;
      }
    }

    const accumulationSignal: AccumulationSignalResult = {
      status: adStatus,
      moneyFlowMultiplier: mfm,
      adTrend,
      cmf20,
      description: adDesc,
    };

    // 4. PRICE-VOLUME RELATIONSHIP
    const priceVolRel = evaluatePriceVolume(latest, prev, volumeRatio);

    // 5. FOREIGN TRADING FLOW (STRICT CONSTRAINT: DO NOT INFER UNLESS ACTUAL DATA EXISTS)
    const foreignData = input.foreignTrading;
    let foreignFlow: ForeignFlowResult;

    if (
      foreignData &&
      (isValidNumber(foreignData.foreignBuyVolume) ||
        isValidNumber(foreignData.foreignSellVolume) ||
        isValidNumber(foreignData.foreignNetVolume) ||
        isValidNumber(foreignData.foreignBuyValue) ||
        isValidNumber(foreignData.foreignSellValue) ||
        isValidNumber(foreignData.foreignNetValue))
    ) {
      const fBuy = sanitizeNumber(foreignData.foreignBuyVolume) ?? 0;
      const fSell = sanitizeNumber(foreignData.foreignSellVolume) ?? 0;
      const fNet = sanitizeNumber(foreignData.foreignNetVolume) ?? fBuy - fSell;

      const fBuyVal = sanitizeNumber(foreignData.foreignBuyValue);
      const fSellVal = sanitizeNumber(foreignData.foreignSellValue);
      const fNetVal = sanitizeNumber(foreignData.foreignNetValue) ?? (fBuyVal !== null && fSellVal !== null ? fBuyVal - fSellVal : null);

      let signal: ForeignFlowSignal = 'NEUTRAL';
      let desc = '';
      const totalVol = latest.volume > 0 ? latest.volume : 1;
      const pctOfTotal = Number((((fBuy + fSell) / totalVol) * 100).toFixed(2));

      if (fNet > 50000 || (fNetVal !== null && fNetVal > 1_000_000_000)) {
        signal = 'NET_BUY';
        desc = `Khối ngoại mua ròng ${fNet.toLocaleString('vi-VN')} cổ phiếu${fNetVal ? ` (giá trị +${(fNetVal / 1e9).toFixed(2)} tỷ VND)` : ''}.`;
      } else if (fNet < -50000 || (fNetVal !== null && fNetVal < -1_000_000_000)) {
        signal = 'NET_SELL';
        desc = `Khối ngoại bán ròng ${Math.abs(fNet).toLocaleString('vi-VN')} cổ phiếu${fNetVal ? ` (giá trị ${(fNetVal / 1e9).toFixed(2)} tỷ VND)` : ''}.`;
      } else {
        signal = 'NEUTRAL';
        desc = `Khối ngoại giao dịch cân bằng (mua ròng ${fNet.toLocaleString('vi-VN')} cổ phiếu).`;
      }

      foreignFlow = {
        buy: fBuy,
        sell: fSell,
        net: fNet,
        foreignBuy: fBuy,
        foreignSell: fSell,
        foreignNet: fNet,
        buyValue: fBuyVal,
        sellValue: fSellVal,
        netValue: fNetVal,
        signal,
        percentageOfTotalVolume: pctOfTotal,
        description: desc,
      };

      reasons.push(desc);
    } else {
      // Do not fabricate or infer foreign/institutional activity without data
      foreignFlow = {
        buy: null,
        sell: null,
        net: null,
        foreignBuy: null,
        foreignSell: null,
        foreignNet: null,
        buyValue: null,
        sellValue: null,
        netValue: null,
        signal: 'NO_DATA',
        percentageOfTotalVolume: null,
        description: 'Không có dữ liệu giao dịch khối ngoại (không suy đoán).',
      };
      warnings.push('Chưa có dữ liệu giao dịch khối ngoại phiên này.');
    }

    // 6. INSTITUTIONAL TRADING FLOW (STRICT CONSTRAINT: DO NOT INFER UNLESS ACTUAL DATA EXISTS)
    const instData = input.institutionalTrading;
    let institutionalFlow: InstitutionalFlowResult;

    if (
      instData &&
      (isValidNumber(instData.largeOrderNetValue) ||
        isValidNumber(instData.largeOrderBuyValue) ||
        isValidNumber(instData.largeOrderSellValue))
    ) {
      const netVal = sanitizeNumber(instData.largeOrderNetValue) ?? 0;
      const buyVal = sanitizeNumber(instData.largeOrderBuyValue);
      const sellVal = sanitizeNumber(instData.largeOrderSellValue);
      let instDesc = '';

      if (netVal > 2_000_000_000) {
        instDesc = `Dữ liệu lệnh lớn (Cá mập/Tổ chức) ghi nhận mua ròng +${(netVal / 1e9).toFixed(2)} tỷ VND.`;
      } else if (netVal < -2_000_000_000) {
        instDesc = `Dữ liệu lệnh lớn (Cá mập/Tổ chức) ghi nhận bán ròng ${(netVal / 1e9).toFixed(2)} tỷ VND.`;
      } else {
        instDesc = `Dữ liệu lệnh lớn tổ chức cân bằng (${(netVal / 1e9).toFixed(2)} tỷ VND).`;
      }

      institutionalFlow = {
        hasData: true,
        largeOrdersBuy: buyVal,
        largeOrdersSell: sellVal,
        netBigMoney: netVal,
        description: instDesc,
      };

      reasons.push(instDesc);
    } else {
      // STRICT: Do NOT infer or speculate on institutional/whale activity without data
      institutionalFlow = {
        hasData: false,
        largeOrdersBuy: null,
        largeOrdersSell: null,
        netBigMoney: null,
        description: 'Không có dữ liệu giao dịch khớp lệnh tổ chức (không suy đoán hành vi tổ chức).',
      };
    }

    // 6. SCORING ENGINE (0 - 100)
    // Pillars:
    // A. Price-Volume confirmation (30%)
    // B. Accumulation/Distribution (MFM + CMF) (30%)
    // C. Volume surge / quality (20%)
    // D. Foreign Flow (20% if present, redistributed if NO_DATA)

    let pvScore = 50;
    if (priceVolRel.pattern === 'BULLISH_CONFIRMATION') {
      pvScore = volumeRatio && volumeRatio >= 1.5 ? 95 : 80;
      reasons.push(priceVolRel.description);
    } else if (priceVolRel.pattern === 'BEARISH_DISTRIBUTION') {
      pvScore = volumeRatio && volumeRatio >= 1.5 ? 15 : 25;
      reasons.push(priceVolRel.description);
    } else if (priceVolRel.pattern === 'BULLISH_DIVERGENCE') {
      pvScore = 65; // Selling dried up
      reasons.push(priceVolRel.description);
    } else if (priceVolRel.pattern === 'BEARISH_DIVERGENCE') {
      pvScore = 40; // Rally lacking volume
      reasons.push(priceVolRel.description);
    } else {
      pvScore = 50;
    }

    let adScore = 50;
    // MFM ranges -1 to +1 -> convert to 0 to 100
    const mfmScore = (mfm + 1) * 50;
    if (cmf20 !== null) {
      // CMF ranges typically -0.3 to +0.3
      const cmfScore = Math.max(0, Math.min(100, (cmf20 + 0.3) * (100 / 0.6)));
      adScore = Number((mfmScore * 0.5 + cmfScore * 0.5).toFixed(1));
    } else {
      adScore = Number(mfmScore.toFixed(1));
    }
    reasons.push(accumulationSignal.description);

    let volScore = 50;
    if (volumeStatus === 'SURGE') {
      // High volume is positive if price closed up, negative if price closed down
      volScore = latest.close >= (prev?.close ?? latest.open) ? 90 : 25;
    } else if (volumeStatus === 'ABOVE_AVERAGE') {
      volScore = latest.close >= (prev?.close ?? latest.open) ? 75 : 35;
    } else if (volumeStatus === 'LOW' || volumeStatus === 'DRY_UP') {
      volScore = 45;
    } else {
      volScore = 55;
    }

    let rawScore: number;
    if (foreignFlow.signal !== 'NO_DATA') {
      let fScore = 50;
      if (foreignFlow.signal === 'NET_BUY') fScore = 85;
      else if (foreignFlow.signal === 'NET_SELL') fScore = 25;
      else fScore = 50;

      rawScore = pvScore * 0.30 + adScore * 0.30 + volScore * 0.20 + fScore * 0.20;
    } else {
      // Redistribute weight: PV 40%, AD 40%, Volume 20%
      rawScore = pvScore * 0.40 + adScore * 0.40 + volScore * 0.20;
    }

    const score = Number(Math.max(0, Math.min(100, rawScore)).toFixed(1));

    // 7. DETERMINE OVERALL MONEY FLOW TREND
    let trend: MoneyFlowTrend = 'NEUTRAL';
    if (score >= 80) {
      trend = 'STRONG_INFLOW';
    } else if (score >= 60) {
      trend = 'INFLOW';
    } else if (score <= 25) {
      trend = 'STRONG_OUTFLOW';
    } else if (score <= 40) {
      trend = 'OUTFLOW';
    } else {
      trend = 'NEUTRAL';
    }

    return {
      score,
      trend,
      foreignFlow,
      volumeSignal,
      accumulationSignal,
      priceVolumeRelationship: priceVolRel,
      tradingValue,
      institutionalFlow,
      reasons,
      warnings,
    };
  }
}

import { CandleInput } from '../common/types.ts';
import { SupportResistanceLevel, RiskAnalysisResult } from './types.ts';
import { VolumeTrend } from './indicators.ts';

export function calculateRiskAnalysis(
  candles: CandleInput[],
  price: number,
  supportLevels: SupportResistanceLevel[],
  resistanceLevels: SupportResistanceLevel[],
  rsi14: number | null,
  atr14: number | null,
  sma200: number | null,
  volumeTrend?: VolumeTrend,
  high52Week?: number | null
): RiskAnalysisResult {
  const riskFactors: string[] = [];

  // Volatility 20D
  let volatility20D: number | null = null;
  if (candles.length >= 20) {
    const slice20 = candles.slice(candles.length - 20);
    const returns: number[] = [];
    for (let i = 1; i < slice20.length; i++) {
      if (slice20[i - 1].close > 0) {
        returns.push((slice20[i].close - slice20[i - 1].close) / slice20[i - 1].close);
      }
    }
    if (returns.length > 0) {
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
      volatility20D = Number((Math.sqrt(variance) * 100).toFixed(2));
      if (volatility20D > 3.5) {
        riskFactors.push(`Độ biến động 20 phiên cao (${volatility20D}%), biên độ giao dịch lớn.`);
      }
    }
  }

  // ATR %
  const atrPercent = atr14 && price > 0 ? Number(((atr14 / price) * 100).toFixed(2)) : null;
  if (atrPercent && atrPercent > 4.0) {
    riskFactors.push(`Biên độ giá thực tế ATR/giá ở mức cao (${atrPercent}%), cần quản trị rủi ro chặt chẽ.`);
  }

  // Support / Resistance distance
  const nearestSupport = supportLevels.length > 0 ? supportLevels[0].price : null;
  const nearestResistance = resistanceLevels.length > 0 ? resistanceLevels[0].price : null;

  const distanceToSupport = nearestSupport && price > 0 ? Number((((price - nearestSupport) / price) * 100).toFixed(2)) : null;
  const distanceToResistance = nearestResistance && price > 0 ? Number((((nearestResistance - price) / price) * 100).toFixed(2)) : null;

  const downsideToSupport = distanceToSupport;
  const upsideToResistance = distanceToResistance;

  if (distanceToResistance !== null && distanceToResistance < 2.0 && distanceToResistance > 0) {
    riskFactors.push(`Giá đang tiệm cận vùng kháng cự mạnh (${nearestResistance?.toLocaleString('vi-VN')} đ), áp lực chốt lời gia tăng.`);
  }

  // RSI overbought / oversold
  if (rsi14 !== null && rsi14 >= 70) {
    riskFactors.push(`RSI(14) đạt ${rsi14} chạm vùng quá mua (Overbought), nguy cơ rung lắc điều chỉnh ngắn hạn.`);
  } else if (rsi14 !== null && rsi14 <= 30) {
    riskFactors.push(`RSI(14) ở mức thấp ${rsi14} trong vùng quá bán, quán tính giảm điểm vẫn cần theo dõi.`);
  }

  // Below SMA200
  if (sma200 !== null && price < sma200) {
    riskFactors.push(`Giá giao dịch dưới đường trung bình động dài hạn SMA200 (${sma200.toLocaleString('vi-VN')} đ), xu hướng trung-dài hạn chưa thực sự tích cực.`);
  }

  // 52-week drawdown
  let drawdown52wHigh: number | null = null;
  if (high52Week && high52Week > 0) {
    drawdown52wHigh = Number((((price - high52Week) / high52Week) * 100).toFixed(2));
    if (drawdown52wHigh < -25) {
      riskFactors.push(`Cổ phiếu đang chiết khấu sâu ${drawdown52wHigh}% so với đỉnh 52 tuần.`);
    }
  }

  // Low liquidity / Volume dry
  if (volumeTrend === 'DRY') {
    riskFactors.push('Thanh khoản suy giảm rõ rệt, dòng tiền lớn chưa sẵn sàng quay trở lại.');
  }

  return {
    volatility20D,
    atr14,
    atrPercent,
    distanceToSupport,
    distanceToResistance,
    drawdown52wHigh,
    upsideToResistance,
    downsideToSupport,
    riskFactors,
  };
}

import { CandleInput } from '../common/types.ts';
import {
  validateCandles,
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateVolumeSMA,
  calculateATR,
} from './indicators.ts';

export interface TechnicalScoreBreakdown {
  trend: number;     // 20%
  momentum: number;  // 15%
  volume: number;    // 15%
  rsi: number;       // 10%
  macd: number;      // 10%
  support: number;   // 15%
  breakout: number;  // 15%
}

export interface TechnicalScoreResult {
  score: number; // 0 - 100 overall score
  breakdown: TechnicalScoreBreakdown;
  reasons: string[];
  warnings: string[];
}

export class TechnicalScoreEngine {
  /**
   * Evaluates technical strength based on 7 deterministic pillars:
   * Trend (20%), Momentum (15%), Volume (15%), RSI (10%), MACD (10%), Support (15%), Breakout (15%).
   */
  static evaluate(candles: CandleInput[]): TechnicalScoreResult {
    const reasons: string[] = [];
    const warnings: string[] = [];

    const valid = validateCandles(candles);

    if (valid.length === 0) {
      return {
        score: 0,
        breakdown: {
          trend: 0,
          momentum: 0,
          volume: 0,
          rsi: 0,
          macd: 0,
          support: 0,
          breakout: 0,
        },
        reasons: ['Không có dữ liệu nến giao dịch.'],
        warnings: ['Dữ liệu rỗng, không thể tính toán chỉ báo kỹ thuật.'],
      };
    }

    if (valid.length < 20) {
      warnings.push(`Số lượng nến (${valid.length}) ít hơn khuyến nghị tối thiểu 20 phiên.`);
    }

    const latest = valid[valid.length - 1];
    const prev = valid.length > 1 ? valid[valid.length - 2] : latest;

    // Check zero volume
    if (latest.volume === 0) {
      warnings.push('Khối lượng phiên gần nhất bằng 0 (thanh khoản đóng băng).');
    }

    // 1. TREND PILLAR (Weight: 20%)
    let trendScore = 50;
    const sma20 = calculateSMA(valid, 20);
    const sma50 = calculateSMA(valid, 50);

    if (sma20.length > 0) {
      const ma20Val = sma20[sma20.length - 1].value;
      if (latest.close > ma20Val) {
        trendScore += 25;
        reasons.push(`Giá nằm trên đường MA20 (${ma20Val.toLocaleString('vi-VN')} đ), xác nhận xu hướng ngắn hạn tích cực.`);
      } else {
        trendScore -= 20;
        reasons.push(`Giá nằm dưới đường MA20 (${ma20Val.toLocaleString('vi-VN')} đ), cảnh báo xu hướng ngắn hạn suy yếu.`);
      }

      if (sma50.length > 0) {
        const ma50Val = sma50[sma50.length - 1].value;
        if (ma20Val > ma50Val) {
          trendScore += 25;
          reasons.push('Đường MA20 nằm trên MA50 (Golden Cross xu hướng trung hạn).');
        } else {
          trendScore -= 15;
          reasons.push('Đường MA20 nằm dưới MA50 (Dead Cross xu hướng trung hạn).');
        }
      }
    } else {
      warnings.push('Chưa đủ 20 phiên để tính toán đường xu hướng SMA20.');
    }
    trendScore = Math.max(0, Math.min(100, trendScore));

    // 2. MOMENTUM PILLAR (Weight: 15%)
    let momentumScore = 50;
    const ema12 = calculateEMA(valid, 12);
    const ema26 = calculateEMA(valid, 26);

    if (ema12.length > 0 && ema26.length > 0) {
      const e12Val = ema12[ema12.length - 1].value;
      const e26Val = ema26[ema26.length - 1].value;
      const priceChangePct = prev.close > 0 ? ((latest.close - prev.close) / prev.close) * 100 : 0;

      if (e12Val > e26Val) {
        momentumScore += 25;
        reasons.push('Xung lực EMA12 nhanh hơn EMA26 cho thấy đà tăng đang chiếm ưu thế.');
      } else {
        momentumScore -= 20;
        reasons.push('Xung lực EMA ngắn hạn yếu hơn trung hạn.');
      }

      if (priceChangePct > 1.5) {
        momentumScore += 25;
      } else if (priceChangePct < -1.5) {
        momentumScore -= 20;
      }
    } else {
      warnings.push('Không đủ dữ liệu tính toán xung lực EMA.');
    }
    momentumScore = Math.max(0, Math.min(100, momentumScore));

    // 3. VOLUME PILLAR (Weight: 15%)
    let volumeScore = 50;
    const volSMA = calculateVolumeSMA(valid, 20);

    if (volSMA.length > 0) {
      const avgVol = volSMA[volSMA.length - 1].value;
      if (avgVol > 0) {
        const volRatio = latest.volume / avgVol;
        const isUp = latest.close >= prev.close;

        if (volRatio >= 1.5 && isUp) {
          volumeScore = 95;
          reasons.push(`Khối lượng bùng nổ gấp ${(volRatio).toFixed(1)}x trung bình 20 phiên cùng giá tăng (dòng tiền lớn gom hàng).`);
        } else if (volRatio >= 1.1 && isUp) {
          volumeScore = 75;
          reasons.push('Khối lượng cao hơn mức trung bình trong phiên tăng điểm.');
        } else if (volRatio >= 1.5 && !isUp) {
          volumeScore = 20;
          reasons.push(`Khối lượng bán tháo tăng vọt gấp ${(volRatio).toFixed(1)}x trung bình phiên.`);
        } else if (volRatio < 0.7) {
          volumeScore = 40;
          reasons.push('Khối lượng giao dịch sụt giảm, dòng tiền thận trọng quan sát.');
        }
      }
    } else {
      warnings.push('Chưa đủ dữ liệu để tính toán trung bình khối lượng 20 phiên.');
    }
    volumeScore = Math.max(0, Math.min(100, volumeScore));

    // 4. RSI PILLAR (Weight: 10%)
    let rsiScore = 50;
    const rsiSeries = calculateRSI(valid, 14);

    if (rsiSeries.length > 0) {
      const currentRSI = rsiSeries[rsiSeries.length - 1].value;
      if (currentRSI >= 50 && currentRSI <= 68) {
        rsiScore = 85;
        reasons.push(`RSI(14) đạt ${currentRSI.toFixed(1)} trong vùng xu hướng tăng mạnh bền vững (50-68).`);
      } else if (currentRSI > 68 && currentRSI <= 80) {
        rsiScore = 65;
        reasons.push(`RSI(14) đạt ${currentRSI.toFixed(1)} - tiệm cận vùng quá mua, chú ý rủi ro rung lắc.`);
      } else if (currentRSI > 80) {
        rsiScore = 30;
        reasons.push(`RSI(14) đạt ${currentRSI.toFixed(1)} - vùng quá mua cực độ, rủi ro điều chỉnh cao.`);
      } else if (currentRSI < 30) {
        rsiScore = 55; // Quá bán - tiềm năng hồi phục kỹ thuật
        reasons.push(`RSI(14) ở mức ${currentRSI.toFixed(1)} - chạm ngưỡng quá bán, có thể xuất hiện nhịp hồi.`);
      } else {
        rsiScore = 40;
        reasons.push(`RSI(14) ở mức ${currentRSI.toFixed(1)} - nằm dưới ngưỡng trung tính 50.`);
      }
    } else {
      warnings.push('Chưa đủ 14 phiên để tính toán chỉ số RSI.');
    }
    rsiScore = Math.max(0, Math.min(100, rsiScore));

    // 5. MACD PILLAR (Weight: 10%)
    let macdScore = 50;
    const macdSeries = calculateMACD(valid, 12, 26, 9);

    if (macdSeries.length > 0) {
      const currentMACD = macdSeries[macdSeries.length - 1];
      const prevMACD = macdSeries.length > 1 ? macdSeries[macdSeries.length - 2] : null;

      if (currentMACD.macd > currentMACD.signal) {
        macdScore += 25;
        if (currentMACD.macd > 0) {
          macdScore += 15;
          reasons.push('Đường MACD cắt lên trên Signal Line và nằm trên trục 0 (Tín hiệu mua mạnh).');
        } else {
          reasons.push('Đường MACD cắt lên trên Signal Line nhưng vẫn dưới trục 0.');
        }
      } else {
        macdScore -= 25;
        reasons.push('Đường MACD nằm dưới Signal Line (Áp lực điều chỉnh).');
      }

      if (prevMACD && currentMACD.histogram > prevMACD.histogram) {
        macdScore += 10;
      }
    } else {
      warnings.push('Chưa đủ dữ liệu để tính toán MACD (yêu cầu tối thiểu 35 phiên).');
    }
    macdScore = Math.max(0, Math.min(100, macdScore));

    // 6. SUPPORT & RESISTANCE PILLAR (Weight: 15%)
    let supportScore = 50;
    const bbSeries = calculateBollingerBands(valid, 20, 2);

    if (bbSeries.length > 0) {
      const bb = bbSeries[bbSeries.length - 1];
      const bandRange = bb.upper - bb.lower;
      if (bandRange > 0) {
        const positionInBand = (latest.close - bb.lower) / bandRange;

        if (positionInBand >= 0.35 && positionInBand <= 0.85) {
          supportScore = 80;
          reasons.push('Giá vận động lành mạnh trong nửa trên dải Bollinger Bands, được hỗ trợ bởi dải giữa.');
        } else if (positionInBand > 0.85) {
          supportScore = 60;
          reasons.push('Giá tiệm cận dải trên Bollinger Bands.');
        } else if (positionInBand < 0.15) {
          supportScore = 40;
          reasons.push('Giá xuyên thủng hoặc tiệm cận dải dưới Bollinger Bands.');
        } else {
          supportScore = 50;
        }
      }
    } else {
      warnings.push('Chưa đủ dữ liệu tính dải Bollinger Bands.');
    }
    supportScore = Math.max(0, Math.min(100, supportScore));

    // 7. BREAKOUT PILLAR (Weight: 15%)
    let breakoutScore = 50;
    const lookback = Math.min(valid.length - 1, 20);

    if (lookback >= 5) {
      const recentCandles = valid.slice(valid.length - lookback - 1, valid.length - 1);
      const maxHigh = Math.max(...recentCandles.map((c) => c.high));
      const minLow = Math.min(...recentCandles.map((c) => c.low));

      if (latest.close > maxHigh) {
        breakoutScore = 95;
        reasons.push(`Đột phá đỉnh ${lookback} phiên gần nhất (Breakout thành công tại ${latest.close.toLocaleString('vi-VN')} đ).`);
      } else if (latest.close >= maxHigh * 0.985) {
        breakoutScore = 75;
        reasons.push(`Giá đang áp sát ngưỡng kháng cự đỉnh ngắn hạn (${maxHigh.toLocaleString('vi-VN')} đ).`);
      } else if (latest.close < minLow) {
        breakoutScore = 15;
        reasons.push(`Thủng đáy hỗ trợ ${lookback} phiên, xác nhận tín hiệu giảm tiêu cực.`);
      } else {
        breakoutScore = 50;
      }
    } else {
      warnings.push('Chưa đủ phiên để kiểm định ngưỡng Breakout.');
    }
    breakoutScore = Math.max(0, Math.min(100, breakoutScore));

    // COMPOSITE WEIGHTED SCORE (20% + 15% + 15% + 10% + 10% + 15% + 15% = 100%)
    const compositeScore =
      trendScore * 0.20 +
      momentumScore * 0.15 +
      volumeScore * 0.15 +
      rsiScore * 0.10 +
      macdScore * 0.10 +
      supportScore * 0.15 +
      breakoutScore * 0.15;

    return {
      score: Number(compositeScore.toFixed(1)),
      breakdown: {
        trend: Number(trendScore.toFixed(1)),
        momentum: Number(momentumScore.toFixed(1)),
        volume: Number(volumeScore.toFixed(1)),
        rsi: Number(rsiScore.toFixed(1)),
        macd: Number(macdScore.toFixed(1)),
        support: Number(supportScore.toFixed(1)),
        breakout: Number(breakoutScore.toFixed(1)),
      },
      reasons,
      warnings,
    };
  }
}

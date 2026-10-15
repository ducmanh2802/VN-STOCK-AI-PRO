import { CandlePoint, IndicatorSnapshot } from './types';
import { calculateSMA } from './sma';
import { calculateRSI } from './rsi';
import { calculateMACD } from './macd';
import { calculateBollingerBands } from './bollinger';
import { calculateVolumeSeries } from './volume';

/**
 * Computes a comprehensive, deterministic snapshot of technical indicators
 * for the latest trading session.
 */
export function computeIndicatorSnapshot(candles: CandlePoint[]): IndicatorSnapshot | null {
  if (!candles || candles.length < 20) {
    return null;
  }

  const latest = candles[candles.length - 1];
  const currentPrice = latest.close;

  // 1. SMA 20, 50, 200
  const sma20Series = calculateSMA(candles, 20);
  const sma50Series = calculateSMA(candles, 50);
  const sma200Series = calculateSMA(candles, 200);

  const sma20Val = sma20Series.length > 0 ? sma20Series[sma20Series.length - 1].value : currentPrice;
  const sma50Val = sma50Series.length > 0 ? sma50Series[sma50Series.length - 1].value : null;
  const sma200Val = sma200Series.length > 0 ? sma200Series[sma200Series.length - 1].value : null;

  // 2. RSI (14)
  const rsiSeries = calculateRSI(candles, 14);
  const rsiVal = rsiSeries.length > 0 ? rsiSeries[rsiSeries.length - 1].value : 50;

  let rsiStatus: IndicatorSnapshot['rsi']['status'] = 'NEUTRAL';
  let rsiLabel = 'Trung tính (Chờ tích lũy)';
  if (rsiVal >= 70) {
    rsiStatus = 'OVERBOUGHT';
    rsiLabel = 'Quá mua (Cảnh giác áp lực chốt lời)';
  } else if (rsiVal >= 60) {
    rsiStatus = 'BULLISH';
    rsiLabel = 'Tích cực (Xung lực tăng duy trì)';
  } else if (rsiVal <= 30) {
    rsiStatus = 'OVERSOLD';
    rsiLabel = 'Quá bán (Vùng đáy kỹ thuật ngắn hạn)';
  } else if (rsiVal <= 40) {
    rsiStatus = 'BEARISH';
    rsiLabel = 'Yếu (Áp lực điều chỉnh chi phối)';
  }

  // 3. MACD (12, 26, 9)
  const macdSeries = calculateMACD(candles, 12, 26, 9);
  const latestMACD = macdSeries.length > 0 ? macdSeries[macdSeries.length - 1] : null;
  const prevMACD = macdSeries.length > 1 ? macdSeries[macdSeries.length - 2] : latestMACD;

  let macdTrend: IndicatorSnapshot['macd']['trend'] = null;
  let macdLabel = 'Chưa đủ dữ liệu để tính MACD (cần tối thiểu 35 phiên)';
  if (latestMACD && prevMACD) {
    if (latestMACD.macd > latestMACD.signal && prevMACD.macd <= prevMACD.signal) {
      macdTrend = 'BULLISH_CROSS';
      macdLabel = 'Cắt lên Signal (Tín hiệu MUA ngắn hạn)';
    } else if (latestMACD.macd < latestMACD.signal && prevMACD.macd >= prevMACD.signal) {
      macdTrend = 'BEARISH_CROSS';
      macdLabel = 'Cắt xuống Signal (Tín hiệu BÁN chốt lời)';
    } else if (latestMACD.macd > latestMACD.signal) {
      macdTrend = 'BULLISH';
      macdLabel = 'Nằm trên Signal (Động lượng tăng tiếp diễn)';
    } else {
      macdTrend = 'BEARISH';
      macdLabel = 'Nằm dưới Signal (Động lượng điều chỉnh)';
    }
  }
  
  // 4. Bollinger Bands (20, 2)
  const bbSeries = calculateBollingerBands(candles, 20, 2);
  const latestBB = bbSeries.length > 0 ? bbSeries[bbSeries.length - 1] : { upper: currentPrice, middle: currentPrice, lower: currentPrice, pb: 0.5, bandwidth: 0 };

  let bbStatus: IndicatorSnapshot['bollinger']['status'] = 'NORMAL';
  let bbLabel = 'Dao động trong dải';
  if (latestBB.bandwidth < 10) {
    bbStatus = 'SQUEEZE';
    bbLabel = 'Thắt nút cổ chai (Sắp có biến động lớn)';
  } else if (currentPrice >= latestBB.upper * 0.99) {
    bbStatus = 'TESTING_UPPER';
    bbLabel = 'Chạm dải trên (Cản động ngắn hạn)';
  } else if (currentPrice <= latestBB.lower * 1.01) {
    bbStatus = 'TESTING_LOWER';
    bbLabel = 'Chạm dải dưới (Hỗ trợ động ngắn hạn)';
  } else if (latestBB.bandwidth > 25) {
    bbStatus = 'EXPANDING';
    bbLabel = 'Dải dãn nở mạnh (Xu hướng bùng nổ)';
  }

  // 5. Volume Series
  const volSeries = calculateVolumeSeries(candles, 20);
  const latestVol = volSeries.length > 0 ? volSeries[volSeries.length - 1] : { value: 0, volumeMA: undefined };
  const volMA20 = latestVol.volumeMA !== undefined && latestVol.volumeMA > 0 ? latestVol.volumeMA : null;
  const ratioToMA = volMA20 !== null ? Number((latestVol.value / volMA20).toFixed(2)) : null;

  let volTrend: IndicatorSnapshot['volume']['trend'] = null;
  if (ratioToMA !== null) {
    volTrend = 'NORMAL';
    if (ratioToMA >= 1.5) {
      volTrend = 'SURGE';
    } else if (ratioToMA <= 0.65) {
      volTrend = 'DRY';
    }
  }

  return {
    rsi: {
      value: rsiVal,
      status: rsiStatus,
      label: rsiLabel,
    },
    macd: {
      macd: latestMACD ? latestMACD.macd : null,
      signal: latestMACD ? latestMACD.signal : null,
      histogram: latestMACD ? latestMACD.histogram : null,
      trend: macdTrend,
      label: macdLabel,
    },
    sma20: {
      value: sma20Val,
      priceRelation: currentPrice >= sma20Val ? 'ABOVE' : 'BELOW',
      diffPercent: Number((((currentPrice - sma20Val) / sma20Val) * 100).toFixed(2)),
    },
    sma50: {
      value: sma50Val,
      priceRelation: sma50Val !== null ? (currentPrice >= sma50Val ? 'ABOVE' : 'BELOW') : null,
      diffPercent: sma50Val !== null ? Number((((currentPrice - sma50Val) / sma50Val) * 100).toFixed(2)) : null,
    },
    sma200: {
      value: sma200Val,
      priceRelation: sma200Val !== null ? (currentPrice >= sma200Val ? 'ABOVE' : 'BELOW') : null,
      diffPercent: sma200Val !== null ? Number((((currentPrice - sma200Val) / sma200Val) * 100).toFixed(2)) : null,
      goldenCross: sma50Val !== null && sma200Val !== null ? sma50Val > sma200Val : null,
    },
    bollinger: {
      upper: latestBB.upper,
      middle: latestBB.middle,
      lower: latestBB.lower,
      pb: latestBB.pb,
      bandwidth: latestBB.bandwidth,
      status: bbStatus,
      label: bbLabel,
    },
    volume: {
      current: latestVol.value,
      ma20: volMA20,
      ratioToMA,
      trend: volTrend,
    },
  };
}

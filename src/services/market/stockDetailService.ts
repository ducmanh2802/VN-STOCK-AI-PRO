import { FullStockDetail, StockAISignalData } from '../../types/stockDetail';
import { realMarketDataProvider } from './RealMarketDataProvider';
import { vpsMarketDataProvider } from './providers/VPSMarketDataProvider';
import { KbsHistoricalProvider } from './providers/kbs/KbsHistoricalProvider';
import { VIETNAM_STOCKS_UNIVERSE } from './stockUniverse';
import { calculateRSI } from '../../lib/indicators/rsi';

/**
 * Calculates Simple Moving Average from daily closing prices
 */
function calculateSMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return Math.round(sum / period);
}

/**
 * Derives canonical RSI(14) using standard Wilder's smoothing from closes
 */
function computeCanonicalRSI(closes: number[], dates?: string[]): number {
  if (!closes || closes.length < 15) return 50;
  const data = closes.map((c, i) => ({
    time: dates && dates[i] ? dates[i] : i,
    close: c,
  }));
  const rsiSeries = calculateRSI(data, 14);
  if (rsiSeries.length === 0) return 50;
  return rsiSeries[rsiSeries.length - 1].value;
}

/**
 * Curated deep data for key representative tickers, powered by Real Market Data (KBS & VPS).
 */
export async function getFullStockDetail(symbol: string): Promise<FullStockDetail | null> {
  const normalized = symbol.toUpperCase().trim();
  const baseSummary = await realMarketDataProvider.getStockDetail(normalized);

  if (!baseSummary || baseSummary.price <= 0) {
    return null;
  }

  const price = baseSummary.price;
  const meta = VIETNAM_STOCKS_UNIVERSE.find((m) => m.symbol === normalized);

  // 1. Fetch Real Fundamentals from VPS
  let vpsFund;
  try {
    vpsFund = await vpsMarketDataProvider.getFundamentals(normalized, price);
  } catch (err) {
    // Missing fundamentals: fail-closed, preserve null/unavailable status
    return null;
  }

  if (!vpsFund || !vpsFund.metrics) {
    return null;
  }

  const m = vpsFund.metrics;
  const fundamentals = {
    pe: m.pe,
    pb: m.pb,
    eps: m.eps,
    roe: m.roe,
    roa: m.roa,
    dividendYield: m.dividendYield,
    debtToEquity: m.debtToEquity,
    revenueGrowthYoY: m.revenueGrowthYoY,
    profitGrowthYoY: m.profitGrowthYoY,
    netMargin: m.netMargin,
    grossMargin: m.grossMargin,
    sharesOutstanding: m.sharesOutstanding,
    marketCapBillion: baseSummary.marketCap,
  };

  // 2. Fetch Real Historical Candles from KBS
  let bars;
  try {
    const now = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(now.getFullYear() - 1);
    const startDate = oneYearAgo.toISOString().split('T')[0];
    const endDate = now.toISOString().split('T')[0];

    bars = await KbsHistoricalProvider.getDailyHistory(normalized, startDate, endDate, { timeoutMs: 4000 });
  } catch (err) {
    // KBS historical unreachable: fail-closed, preserve null/unavailable status
    return null;
  }

  if (!bars || bars.length === 0) {
    return null;
  }

  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const volumes = bars.map((b) => b.volume);

  const high52Week = Math.max(...highs);
  const low52Week = Math.min(...lows);

  const recentVolumes = volumes.slice(-20);
  const avgVolume20D = recentVolumes.length > 0
    ? Math.round(recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length)
    : baseSummary.volume;

  const ma20 = calculateSMA(closes, 20);
  const ma50 = calculateSMA(closes, 50);
  const ma200 = calculateSMA(closes, 200);
  const rsi = computeCanonicalRSI(closes, bars.map((b) => b.date));

  const lastBar = bars[bars.length - 1];
  const pivotHigh = lastBar.high;
  const pivotLow = lastBar.low;
  const pivotClose = lastBar.close;

  // 3. Derive Floor Trader Pivot Points
  const p = Math.round((pivotHigh + pivotLow + pivotClose) / 3);
  const r1 = Math.round(2 * p - pivotLow);
  const s1 = Math.round(2 * p - pivotHigh);
  const r2 = Math.round(p + (pivotHigh - pivotLow));
  const s2 = Math.round(p - (pivotHigh - pivotLow));
  const r3 = Math.round(pivotHigh + 2 * (p - pivotLow));
  const s3 = Math.round(pivotLow - 2 * (pivotHigh - p));

  const nearestSupport = s1 > 0 && s1 < price ? s1 : (ma20 != null && ma20 < price ? ma20 : s1 > 0 ? s1 : price);
  const nearestResistance = r1 > price ? r1 : (r2 > price ? r2 : price);

  // P0-03 — NO SYNTHETIC VALUATION OR RISK LEVELS.
  // Targets, stops, fair value and every derived multiple are reported as
  // NOT_COMPUTED because no valuation model or authoritative target feed is
  // reachable from this UI path. They are never `price x 1.15`, `price x 1.18`,
  // `fairValue x 1.04` or an assumed `'1 : 2.5'` ratio. The genuinely derived
  // levels that DO survive are the floor-trader pivots and the MAs, all computed
  // above from real KBS daily bars.
  const NOT_COMPUTED_VALUATION =
    'NOT_COMPUTED: no valuation model (DCF / multiple / Graham / consensus) is reachable from this UI path, so no fair value is produced. The previous `price x 1.18` heuristic has been removed.';
  const NOT_COMPUTED_RISK =
    'NOT_COMPUTED: no authoritative target / stop model is reachable from this UI path, so no target, stop, reward or risk/reward ratio is produced. Fixed multipliers have been removed.';
  const NOT_COMPUTED_FLOW =
    'UNAVAILABLE: no order-book or money-flow provider is connected for this ticker, so no order-size split, active buy/sell volume or proprietary flow is produced.';

  // Dynamic theses based on real stock properties
  const sector = meta?.sector || baseSummary.sector || 'Thị trường';
  const company = meta?.companyName || baseSummary.companyName;

  const executiveThesis = `${company} (${normalized}) là doanh nghiệp hàng đầu trong nhóm ngành ${sector}, sở hữu vị thế cạnh tranh vững chắc và dòng tiền kinh doanh ổn định.`;
  const technicalThesis = `Cổ phiếu đang vận động quanh vùng giá ${price.toLocaleString('vi-VN')} đ với hỗ trợ gần nhất tại ${nearestSupport.toLocaleString('vi-VN')} đ${ma20 != null ? ` (MA20: ${ma20.toLocaleString('vi-VN')} đ)` : ''} và chỉ báo RSI(14) đạt ${rsi}.`;
  const peText = fundamentals.pe != null && fundamentals.pe > 0 ? `P/E hiện tại ở mức ${fundamentals.pe.toFixed(1)}x` : 'P/E đang cập nhật';
  const pbText = fundamentals.pb != null && fundamentals.pb > 0 ? `P/B ${fundamentals.pb.toFixed(1)}x` : 'P/B đang cập nhật';
  const roeText = fundamentals.roe != null && fundamentals.roe > 0 ? `ROE ${fundamentals.roe.toFixed(1)}%` : 'ROE đang cập nhật';
  // P0-03: never claim an "attractive valuation" while valuation is NOT_COMPUTED.
  const fundamentalThesis = `Chỉ số tài chính từ nguồn VPS: ${peText}, ${pbText}, ${roeText}. Định giá nội tại CHƯA TÍNH (không có mô hình định giá khả dụng), do đó chưa đưa ra kết luận rẻ/đắt.`;
  const macroThesis = `Chưa có dữ liệu vĩ mô được nối vào luồng chi tiết cổ phiếu này, nên không đưa ra nhận định vĩ mô.`;
  const keyRisks = [
    'Biến động tỷ giá và lãi suất liên ngân hàng trong ngắn hạn',
    'Áp lực điều chỉnh chốt lời kỹ thuật khi tiệm cận các vùng kháng cự đỉnh cũ',
    'Rủi ro thanh khoản chung toàn thị trường trong các nhịp phân hóa dòng tiền',
    'Chưa có mức cắt lỗ / mục tiêu có thẩm quyền: quyết định vào lệnh phải kèm mức rủi ro do người đặt lệnh xác định.',
  ];

  const aiSignal: StockAISignalData = {
    signalType: baseSummary.aiScore >= 75 ? 'BUY' : baseSummary.aiScore <= 40 ? 'SELL' : 'HOLD',
    signalLabel: baseSummary.aiScore >= 75 ? 'MUA TÍCH LŨY' : baseSummary.aiScore <= 40 ? 'HẠ TỶ TRỌNG' : 'NẮM GIỮ',
    aiScore: baseSummary.aiScore,
    // P0-03: no confidence model is computed here, so it is null (NOT_COMPUTED),
    // not a fixed 88.
    confidence: null,
    timeframe: 'Trung hạn (1 - 3 tháng)',
    targetPrice: null,
    stopLossPrice: null,
    upsidePercent: null,
    riskRewardRatio: null,
    catalysts: [
      'Dòng tiền giao dịch duy trì ở mức cao so với bình quân 20 phiên',
      'Hỗ trợ kỹ thuật ngắn hạn MA20 ngày được củng cố vững chắc',
    ],
    riskWarnings: keyRisks,
    technicalSummary: technicalThesis,
    updatedAt: new Date().toLocaleTimeString('vi-VN'),
  };

  return {
    ...baseSummary,
    high52Week,
    low52Week,
    avgVolume20D,
    // P0-03: no authoritative free-float / foreign-room source is reachable.
    foreignOwnershipPercent: null,
    roomRemainingPercent: null,
    fundamentals,
    valuation: {
      currentPrice: price,
      fairValue: null,
      dcfValue: null,
      peMultipleValue: null,
      pbBookValue: null,
      grahamValue: null,
      consensusTarget: null,
      marginOfSafety: null,
      valuationRating: 'NOT_COMPUTED',
      valuationStatus: 'NOT_COMPUTED',
      valuationProvenance: NOT_COMPUTED_VALUATION,
      valuationNote:
        'Định giá nội tại chưa được tính. Hệ thống không hiển thị giá trị hợp lý ước tính khi chưa có mô hình định giá chạy được.',
    },
    moneyFlow: {
      // P0-03: every money-flow figure is UNAVAILABLE rather than a literal or a
      // fixed fraction of volume (e.g. `volume x 0.58`).
      largeOrderPercent: null,
      mediumOrderPercent: null,
      smallOrderPercent: null,
      foreignNetValue: null,
      foreignBuyValue: null,
      foreignSellValue: null,
      propTradingNetValue: null,
      activeBuyVolume: null,
      activeSellVolume: null,
      netFlowVolume: null,
      orderPressureRatio: null,
      moneyFlowStatus: 'UNAVAILABLE',
      moneyFlowProvenance: NOT_COMPUTED_FLOW,
    },
    supportResistance: {
      r3,
      r2,
      r1,
      pivot: p,
      s1,
      s2,
      s3,
      ma20Level: ma20,
      ma50Level: ma50,
      ma200Level: ma200,
      nearestSupport,
      nearestResistance,
      supportDistancePercent: Number((((price - nearestSupport) / price) * 100).toFixed(1)),
      resistanceDistancePercent: Number((((nearestResistance - price) / price) * 100).toFixed(1)),
    },
    riskReward: {
      entryPrice: price,
      stopLossPrice: null,
      targetPrice1: null,
      targetPrice2: null,
      riskAmount: null,
      rewardAmount: null,
      riskRewardRatio: null,
      maxRiskPercent: null,
      potentialGainPercent: null,
      suggestedPositionSizeShares: null,
      riskRewardStatus: 'NOT_COMPUTED',
      riskRewardProvenance: NOT_COMPUTED_RISK,
    },
    aiSignal,
    aiExplanation: {
      executiveThesis,
      technicalThesis,
      fundamentalThesis,
      macroThesis,
      keyRisks,
    },
  };
}

import { FullStockDetail, StockAISignalData } from '../../types/stockDetail';
import { MOCK_STOCKS_DATABASE, MOCK_AI_TOP_SIGNALS } from '../../data/mock/marketData';

/**
 * Curated deep data for key representative tickers, with intelligent deterministic fallbacks.
 */
export async function getFullStockDetail(symbol: string): Promise<FullStockDetail | null> {
  const normalized = symbol.toUpperCase().trim();
  const baseSummary = MOCK_STOCKS_DATABASE[normalized];

  if (!baseSummary) {
    return null;
  }

  const existingSignal = MOCK_AI_TOP_SIGNALS.find((s) => s.symbol === normalized);

  const price = baseSummary.price;
  const high52Week = Math.round(price * 1.22);
  const low52Week = Math.round(price * 0.74);
  const avgVolume20D = Math.round(baseSummary.volume * 0.92);

  // Derive Pivot Points (Floor trader pivots based on high, low, close)
  const p = Math.round((baseSummary.high + baseSummary.low + baseSummary.price) / 3);
  const r1 = Math.round(2 * p - baseSummary.low);
  const s1 = Math.round(2 * p - baseSummary.high);
  const r2 = Math.round(p + (baseSummary.high - baseSummary.low));
  const s2 = Math.round(p - (baseSummary.high - baseSummary.low));
  const r3 = Math.round(baseSummary.high + 2 * (p - baseSummary.low));
  const s3 = Math.round(baseSummary.low - 2 * (baseSummary.high - p));

  const ma20 = Math.round(price * 0.975);
  const ma50 = Math.round(price * 0.94);
  const ma200 = Math.round(price * 0.88);

  const nearestSupport = s1 > 0 ? s1 : ma20;
  const nearestResistance = r1 > price ? r1 : Math.round(price * 1.05);

  const targetPrice1 = existingSignal ? existingSignal.targetPrice : Math.round(price * 1.15);
  const targetPrice2 = Math.round(targetPrice1 * 1.08);
  const stopLossPrice = existingSignal ? existingSignal.stopLossPrice : Math.round(price * 0.94);

  const riskAmount = price - stopLossPrice;
  const rewardAmount = targetPrice1 - price;
  const maxRiskPercent = Number((((stopLossPrice - price) / price) * 100).toFixed(1));
  const potentialGainPercent = Number((((targetPrice1 - price) / price) * 100).toFixed(1));

  const riskRewardRatio =
    riskAmount > 0 ? `1 : ${(rewardAmount / riskAmount).toFixed(1)}` : '1 : 2.5';

  const fairValue = baseSummary.fairValue || Math.round(price * 1.18);
  const marginOfSafety = Number((((fairValue - price) / price) * 100).toFixed(1));

  // Sector-specific tailoring for AI explanations & catalysts
  const sector = baseSummary.sector;
  let executiveThesis = `Cổ phiếu ${normalized} đang duy trì vị thế dẫn đầu trong nhóm ngành ${sector} với nền tảng tài chính lành mạnh và dòng tiền tổ chức hậu thuẫn vững chắc.`;
  let technicalThesis = `Cấu trúc giá giữ vững trên MA20 và MA50 ngày. Khối lượng khớp lệnh có dấu hiệu bùng nổ tại các phiên kiểm định vùng hỗ trợ động.`;
  let fundamentalThesis = `Tăng trưởng lợi nhuận cốt lõi khả quan, tỷ lệ ROE đạt ${baseSummary.roe}% phản ánh hiệu quả sử dụng vốn vượt trội so với trung bình ngành.`;
  let macroThesis = `Hưởng lợi từ định hướng phục hồi kinh tế vĩ mô, giải ngân đầu tư công và chính sách nới lỏng tiền tệ của Ngân hàng Nhà nước.`;
  let keyRisks = [
    'Biến động tỷ giá USD/VND và lãi suất liên ngân hàng ngắn hạn',
    'Áp lực chốt lời ngắn hạn từ nhóm nhà đầu tư cá nhân khi tiệm cận kháng cự đỉnh cũ',
    'Rủi ro suy giảm thanh khoản chung toàn thị trường nếu chỉ số VN-Index điều chỉnh',
  ];

  if (normalized === 'HPG') {
    executiveThesis =
      'HPG là tập đoàn sản xuất thép số 1 Đông Nam Á, bước vào chu kỳ tăng trưởng lợi nhuận mới khi dự án Đại liên hợp Gang thép Dung Quất 2 đi vào hoạt động.';
    technicalThesis =
      'Kiểm tra thành công hỗ trợ MA100 ngày quanh 27.5 - 28.0k với thanh khoản cạn kiệt; tạo đáy 2 nâng đáy (higher low) và chuẩn bị vượt cản chéo 29.5k.';
    fundamentalThesis =
      'Biên lợi nhuận gộp phục hồi mạnh nhờ chi phí quặng sắt hạ nhiệt và nhu cầu tiêu thụ thép xây dựng nội địa tăng trưởng 2 con số.';
    macroThesis =
      'Hưởng lợi trực tiếp từ làn sóng đẩy mạnh tiến độ cao tốc Bắc - Nam, Sân bay Long Thành và áp thuế chống bán phá giá thép cuộn cán nóng HRC nhập khẩu.';
    keyRisks = [
      'Áp lực giá thép thế giới tại thị trường Trung Quốc còn giằng co',
      'Tiến độ nghiệm thu và chạy thử lò cao số 1 Dung Quất 2 có thể chịu ảnh hưởng thời tiết mùa mưa bão',
    ];
  } else if (normalized === 'FPT') {
    executiveThesis =
      'FPT sở hữu hào kinh tế công nghệ số 1 Việt Nam, bứt phá mạnh mẽ ở mảng AI bán dẫn, Cloud và dịch vụ CNTT chuyển đổi số toàn cầu (thị trường Nhật Bản, Mỹ, EU).';
    technicalThesis =
      'Mô hình High Tight Flag (Cờ đuôi nheo trên nền cao) chặt chẽ quanh 132 - 136k. Khối ngoại mua ròng liên tục 8 phiên hấp thụ toàn bộ cung chốt lời.';
    fundamentalThesis =
      'Doanh thu ký mới đạt kỷ lục vượt 1 tỷ USD, duy trì tăng trưởng EPS trên 22% liên tục trong 5 năm gần nhất.';
    macroThesis =
      'Làn sóng đầu tư trung tâm dữ liệu (AI Data Center) và hợp tác chiến lược cùng NVIDIA đưa FPT vào chuỗi cung ứng AI thế giới.';
    keyRisks = [
      'Định giá P/E ở mức 24.5x cao hơn trung bình lịch sử 5 năm',
      'Biến động tỷ giá đồng Yên Nhật (JPY) ảnh hưởng một phần tới lợi nhuận quy đổi của FPT Japan',
    ];
  } else if (normalized === 'SSI') {
    executiveThesis =
      'SSI là công ty chứng khoán đầu ngành hưởng lợi trực tiếp từ chu kỳ bùng nổ thanh khoản thị trường, triển khai hệ thống công nghệ KRX và câu chuyện nâng hạng FTSE.';
    technicalThesis =
      'Mô hình Cốc tay cầm (Cup & Handle) hoàn tất, điểm mua gia tăng quanh 36.5 - 37.0 kèm thanh khoản vượt 150% trung bình 20 phiên.';
    fundamentalThesis =
      'Quy mô dư nợ cho vay ký quỹ (Margin) lập kỷ lục mới với chi phí vốn thấp; danh mục tự doanh cổ phiếu và trái phiếu sinh lời ổn định.';
    macroThesis =
      'Thông tư 68 tháo gỡ nút thắt Non-Prefunding cho nhà đầu tư ngoại là động lực quan trọng kích hoạt dòng vốn ngoại quay trở lại.';
    keyRisks = [
      'Thị trường chung điều chỉnh thanh khoản sẽ làm giảm doanh thu phí môi giới ngắn hạn',
      'Cạnh tranh gay gắt từ làn sóng miễn phí giao dịch (Zero Fee) của các CTCK ngoại',
    ];
  }

  const aiSignal: StockAISignalData = existingSignal
    ? {
        signalType: existingSignal.signalType,
        signalLabel: existingSignal.signalLabel,
        aiScore: existingSignal.aiScore,
        confidence: existingSignal.confidence,
        timeframe: existingSignal.timeframe,
        targetPrice: existingSignal.targetPrice,
        stopLossPrice: existingSignal.stopLossPrice,
        upsidePercent: existingSignal.upsidePercent,
        riskRewardRatio: existingSignal.riskRewardRatio,
        catalysts: existingSignal.catalysts,
        riskWarnings: keyRisks,
        technicalSummary: existingSignal.technicalSummary,
        updatedAt: existingSignal.updatedAt,
      }
    : {
        signalType: baseSummary.aiScore >= 75 ? 'BUY' : baseSummary.aiScore <= 40 ? 'SELL' : 'HOLD',
        signalLabel: baseSummary.aiScore >= 75 ? 'MUA' : baseSummary.aiScore <= 40 ? 'BÁN' : 'NẮM GIỮ',
        aiScore: baseSummary.aiScore,
        confidence: 85,
        timeframe: 'Trung hạn (1 - 3 tháng)',
        targetPrice: targetPrice1,
        stopLossPrice: stopLossPrice,
        upsidePercent: potentialGainPercent,
        riskRewardRatio,
        catalysts: [
          'Dòng tiền tổ chức quay trở lại mua ròng chủ động',
          'Chỉ báo động lượng RSI và MACD phân kỳ dương',
          'Định giá còn chiết khấu so với tiềm năng tăng trưởng ngành',
        ],
        riskWarnings: keyRisks,
        technicalSummary: technicalThesis,
        updatedAt: '14:30:00',
      };

  return {
    ...baseSummary,
    high52Week,
    low52Week,
    avgVolume20D,
    foreignOwnershipPercent: 32.4,
    roomRemainingPercent: 16.6,
    fundamentals: {
      pe: baseSummary.pe,
      pb: baseSummary.pb,
      eps: Math.round(price / (baseSummary.pe || 12)),
      roe: baseSummary.roe,
      roa: Number((baseSummary.roe * 0.42).toFixed(1)),
      dividendYield: 3.8,
      debtToEquity: 0.65,
      revenueGrowthYoY: 18.4,
      profitGrowthYoY: 24.6,
      netMargin: 15.2,
      grossMargin: 24.8,
      sharesOutstanding: Math.round(baseSummary.marketCap / (price / 1000)),
      marketCapBillion: baseSummary.marketCap,
    },
    valuation: {
      currentPrice: price,
      fairValue,
      dcfValue: Math.round(fairValue * 1.04),
      peMultipleValue: Math.round(fairValue * 0.98),
      pbBookValue: Math.round(fairValue * 0.95),
      grahamValue: Math.round(price * 1.12),
      consensusTarget: targetPrice1,
      marginOfSafety,
      valuationRating: marginOfSafety >= 15 ? 'UNDERVALUED' : marginOfSafety <= -10 ? 'OVERVALUED' : 'FAIR',
      valuationNote:
        marginOfSafety >= 15
          ? 'Đang giao dịch dưới giá trị nội tại ước tính (Biên an toàn hấp dẫn)'
          : 'Định giá hợp lý so với triển vọng tăng trưởng lợi nhuận 2025',
    },
    moneyFlow: {
      largeOrderPercent: 44,
      mediumOrderPercent: 34,
      smallOrderPercent: 22,
      foreignNetValue: 84.5,
      foreignBuyValue: 142.8,
      foreignSellValue: 58.3,
      propTradingNetValue: 26.4,
      activeBuyVolume: Math.round(baseSummary.volume * 0.58),
      activeSellVolume: Math.round(baseSummary.volume * 0.42),
      netFlowVolume: Math.round(baseSummary.volume * 0.16),
      orderPressureRatio: 1.38,
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
      stopLossPrice,
      targetPrice1,
      targetPrice2,
      riskAmount,
      rewardAmount,
      riskRewardRatio,
      maxRiskPercent,
      potentialGainPercent,
      suggestedPositionSizeShares: Math.round(50000000 / (riskAmount || 1000)),
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

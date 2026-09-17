/**
 * PHASE 20.7 — MARKET INTELLIGENCE SNAPSHOT BUILDER
 * ===================================================
 * Aggregates Market Regime, Breadth, Sector Intelligence, Relative Strength,
 * and Volume/Flow metrics into a deterministic, auditable, immutable snapshot.
 */

import { MarketBreadthEngine } from './MarketBreadthEngine.ts';
import { SectorIntelligenceEngine } from './SectorIntelligenceEngine.ts';
import { RelativeStrengthEngine } from './RelativeStrengthEngine.ts';
import { VolumeFlowIntelligenceEngine } from './VolumeFlowIntelligenceEngine.ts';
import { MarketRegimeEngine } from './MarketRegimeEngine.ts';
import { calculateSupportResistance } from '../technical/supportResistance.ts';
import type { CandlePoint } from '../../indicators/types.ts';
import type { CandleInput } from '../common/types.ts';
import type {
  ConstituentCandleData,
  MarketIntelligenceSnapshot,
  RelativeStrengthMetrics,
  MarketSupportResistanceResult,
  MarketBreakdownRiskResult,
  MarketRecoveryStrengthResult,
  BreakdownRiskLevel,
  RecoveryStrengthStage,
} from './types.ts';

export interface MarketIntelligenceSnapshotInput {
  indexCandles: readonly CandlePoint[];
  vn30Candles?: readonly CandlePoint[];
  constituents: readonly ConstituentCandleData[];
  asOf?: string;
  universeName?: string;
}

export class MarketIntelligenceSnapshotBuilder {
  public static readonly VERSION = 'v1.0.0-phase20';

  /**
   * Builds a complete, immutable MarketIntelligenceSnapshot.
   */
  public static build(input: MarketIntelligenceSnapshotInput): MarketIntelligenceSnapshot {
    const {
      indexCandles,
      vn30Candles,
      constituents,
      asOf = new Date().toISOString(),
      universeName = 'VIETNAM_EQUITIES',
    } = input;

    const allWarnings: string[] = [];

    // 1. Evaluate Market Breadth
    const breadth = MarketBreadthEngine.evaluate(constituents, {
      universe: universeName,
      asOf,
    });
    allWarnings.push(...breadth.warnings);

    // 2. Evaluate Sector Intelligence
    const sectorResult = SectorIntelligenceEngine.evaluate(constituents, {
      asOf,
      benchmarkCandles: {
        vnIndex: indexCandles,
        vn30: vn30Candles,
      },
    });
    allWarnings.push(...sectorResult.warnings);

    // 3. Evaluate Market Regime
    const regime = MarketRegimeEngine.evaluate({
      indexCandles,
      breadth,
      universeName,
      asOf,
    });
    allWarnings.push(...regime.warnings);

    // 4. Evaluate Volume / Flow Aggregation across constituents
    let marketVolumeSpikeCount = 0;
    let marketDryUpCount = 0;
    let totalUpVol = 0;
    let totalDownVol = 0;

    const stockRSList: RelativeStrengthMetrics[] = [];

    for (const item of constituents) {
      if (!item.candles || item.candles.length < 5) continue;

      // Volume flow
      const vf = VolumeFlowIntelligenceEngine.evaluate({
        symbol: item.symbol,
        candles: item.candles,
        asOf,
      });

      if (vf.volumeSpike) marketVolumeSpikeCount++;
      if (vf.volumeDryUp) marketDryUpCount++;
      totalUpVol += vf.upVolume;
      totalDownVol += vf.downVolume;

      // Relative Strength vs VN-INDEX
      const rs = RelativeStrengthEngine.evaluate({
        symbol: item.symbol,
        assetCandles: item.candles,
        benchmarkCandles: indexCandles,
        benchmarkName: 'VN-INDEX',
        asOf,
      });
      if (rs.overallRS !== null) {
        stockRSList.push(rs);
      }
    }

    // Sort stocks by overallRS descending to get leaders
    stockRSList.sort((a, b) => (b.overallRS ?? 0) - (a.overallRS ?? 0));
    const topStocksRS = stockRSList.slice(0, 10);

    const totalDecisiveVol = totalUpVol + totalDownVol;
    const marketAdvancingVolumeRatio =
      totalDecisiveVol > 0 ? Number((totalUpVol / totalDecisiveVol).toFixed(4)) : null;

    // 5. Data Quality & Coverage Summary
    const totalUniverseSymbols = constituents.length;
    const validSymbols = breadth.validConstituents;
    const coveragePercent =
      totalUniverseSymbols > 0
        ? Number(((validSymbols / totalUniverseSymbols) * 100).toFixed(2))
        : 0;
    const isFailClosed = coveragePercent < 50;

    if (isFailClosed) {
      allWarnings.push(
        `DATA_QUALITY_ALERT: Low market coverage (${coveragePercent}%). Snapshot flagged as degraded.`
      );
    }

    // Deduplicate warnings
    const uniqueWarnings = Array.from(new Set(allWarnings));

    // 6. Support & Resistance Analysis (VN-INDEX Benchmark)
    const currentPrice = indexCandles.length > 0 ? indexCandles[indexCandles.length - 1].close : null;
    let supportResistance: MarketSupportResistanceResult;

    if (!indexCandles || indexCandles.length < 10 || currentPrice === null) {
      supportResistance = {
        currentPrice: null,
        nearestSupport: null,
        secondarySupport: null,
        distanceToSupportPct: null,
        nearestResistance: null,
        secondaryResistance: null,
        distanceToResistancePct: null,
        status: 'DATA_UNAVAILABLE',
        reason: 'Chưa đủ dữ liệu nến chỉ số để xác định ngưỡng hỗ trợ / kháng cự.',
      };
    } else {
      const srResult = calculateSupportResistance(indexCandles as CandleInput[]);
      const nearestSup = srResult.support.length > 0 ? srResult.support[0] : null;
      const secondarySup = srResult.support.length > 1 ? srResult.support[1] : null;
      const nearestRes = srResult.resistance.length > 0 ? srResult.resistance[0] : null;
      const secondaryRes = srResult.resistance.length > 1 ? srResult.resistance[1] : null;

      const distSupPct = (nearestSup && currentPrice > 0)
        ? Number((((currentPrice - nearestSup.price) / currentPrice) * 100).toFixed(2))
        : null;

      const distResPct = (nearestRes && currentPrice > 0)
        ? Number((((nearestRes.price - currentPrice) / currentPrice) * 100).toFixed(2))
        : null;

      supportResistance = {
        currentPrice,
        nearestSupport: nearestSup ? { price: nearestSup.price, strength: nearestSup.strength } : null,
        secondarySupport: secondarySup ? { price: secondarySup.price, strength: secondarySup.strength } : null,
        distanceToSupportPct: distSupPct,
        nearestResistance: nearestRes ? { price: nearestRes.price, strength: nearestRes.strength } : null,
        secondaryResistance: secondaryRes ? { price: secondaryRes.price, strength: secondaryRes.strength } : null,
        distanceToResistancePct: distResPct,
        status: 'LIVE',
      };
    }

    // 7. Breakdown Risk Analysis
    let breakdownRisk: MarketBreakdownRiskResult;
    if (supportResistance.status === 'DATA_UNAVAILABLE' || currentPrice === null) {
      breakdownRisk = {
        riskLevel: 'DATA_UNAVAILABLE',
        nearestSupportPrice: null,
        distanceToSupportPct: null,
        downsideVolumeCondition: 'KHÔNG XÁC ĐỊNH (Thiếu dữ liệu)',
        marketBreadthCondition: 'KHÔNG XÁC ĐỊNH',
        trendCondition: 'KHÔNG XÁC ĐỊNH',
        volatilityCondition: 'KHÔNG XÁC ĐỊNH',
        supportingMetrics: {
          volatilityScore: null,
          breadthScore: null,
          trendScore: null,
          liquidityScore: null,
        },
        why: ['Dữ liệu chỉ số hoặc hỗ trợ kỹ thuật chưa khả dụng.'],
        confirmationConditions: ['Chờ dữ liệu nến chỉ số và độ rộng thị trường.'],
        invalidationConditions: ['Cần kết nối dữ liệu thị trường.'],
        status: 'DATA_UNAVAILABLE',
        reason: 'Chưa đủ dữ liệu để tính toán rủi ro gãy nền.',
      };
    } else {
      const { nearestSupport, distanceToSupportPct } = supportResistance;
      const tScore = regime.scores.trendScore ?? 50;
      const bScore = regime.scores.breadthScore ?? 50;
      const vScore = regime.scores.volatilityScore ?? 50;
      const lScore = regime.scores.liquidityScore ?? 50;
      const pScore = regime.scores.participationScore ?? 50;

      const downsideVolCond = pScore < 40 && lScore > 55
        ? 'Áp lực bán chiếm ưu thế lớn kèm thanh khoản gia tăng'
        : pScore < 45
        ? 'Bên bán chủ động hơn nhưng thanh khoản chưa đột biến'
        : 'Thanh khoản bán trong giới hạn kiểm soát';

      const breadthCond = bScore < 35
        ? 'Độ rộng suy yếu nghiêm trọng, số mã giảm chiếm đa số'
        : bScore < 45
        ? 'Độ rộng phân hóa tiêu cực'
        : 'Độ rộng ổn định, cân bằng giữa các nhóm ngành';

      const trendCond = tScore < 40
        ? 'Gãy các đường trung bình động ngắn hạn (SMA20/SMA50)'
        : tScore < 50
        ? 'Xu hướng ngắn hạn đi ngang suy yếu'
        : 'Duy trì trên các mốc trung bình động quan trọng';

      const volCond = vScore >= 65
        ? 'Biến động thị trường mở rộng mạnh (ATR tăng cao)'
        : vScore >= 40
        ? 'Biến động ở mức bình thường của thị trường'
        : 'Biến động thị trường thu hẹp';

      let riskLevel: BreakdownRiskLevel = 'LOW';
      const why: string[] = [];
      const confirmationConditions: string[] = [];
      const invalidationConditions: string[] = [];

      const nearSupport = distanceToSupportPct !== null && distanceToSupportPct <= 1.2;
      const underSupport = distanceToSupportPct !== null && distanceToSupportPct < 0;

      if ((nearSupport || underSupport) && (tScore <= 40 || bScore <= 35 || regime.regime === 'BEAR_TREND' || regime.regime === 'DISTRIBUTION') && vScore >= 55) {
        riskLevel = 'HIGH';
        why.push(`Chỉ số tiệm cận/thủng hỗ trợ gần nhất (${nearestSupport?.price.toLocaleString('vi-VN')} điểm).`);
        why.push(`Độ rộng thị trường suy yếu (${bScore}/100) và xu hướng giá gãy hỗ trợ (${tScore}/100).`);
        confirmationConditions.push('Đóng cửa phiên dưới ngưỡng hỗ trợ kèm thanh khoản vượt 1.3x trung bình 20 phiên.');
        confirmationConditions.push('Số mã thủng đáy ngắn hạn tiếp tục tăng trên toàn thị trường.');
        invalidationConditions.push(`Lực cầu bắt đáy đẩy chỉ số hồi phục bật lên trên ngưỡng ${nearestSupport?.price.toLocaleString('vi-VN')} điểm.`);
        invalidationConditions.push('Độ rộng thị trường phục hồi với số mã tăng vượt số mã giảm.');
      } else if (nearSupport || bScore < 45 || regime.regime === 'DISTRIBUTION' || (tScore < 50 && vScore > 50)) {
        riskLevel = 'MEDIUM';
        if (nearSupport) {
          why.push(`Khoảng cách tới hỗ trợ gần hẹp (${distanceToSupportPct}% tới ${nearestSupport?.price.toLocaleString('vi-VN')}).`);
        }
        if (bScore < 45) {
          why.push(`Độ rộng thị trường chưa xác nhận sức mạnh tích cực (Breadth: ${bScore}/100).`);
        }
        if (tScore < 50) {
          why.push(`Điểm xu hướng kỹ thuật nằm dưới ngưỡng trung tính (${tScore}/100).`);
        }
        confirmationConditions.push(`Thủng vùng hỗ trợ ${nearestSupport?.price.toLocaleString('vi-VN')} với áp lực bán lan rộng.`);
        confirmationConditions.push('Thanh khoản bên bán gia tăng đột biến trong phiên ATC.');
        invalidationConditions.push('Dòng tiền lan tỏa vào nhóm vốn hóa lớn đẩy chỉ số bứt phá xa vùng hỗ trợ.');
        invalidationConditions.push('Điểm xu hướng vượt trên 60 và độ rộng vượt 50%.');
      } else {
        riskLevel = 'LOW';
        why.push(`Khoảng cách tới hỗ trợ an toàn (${distanceToSupportPct ?? '> 2'}% trên vùng ${nearestSupport?.price.toLocaleString('vi-VN')}).`);
        why.push(`Xu hướng (${tScore}/100) và độ rộng (${bScore}/100) duy trì mức độ ổn định.`);
        confirmationConditions.push('Thị trường bất ngờ xuất hiện phiên phân phối lớn với biên độ giảm sâu.');
        confirmationConditions.push('Khối lượng bán chủ động vượt trội trên các mã trụ cột.');
        invalidationConditions.push('Chỉ số tiếp tục kiểm định thành công các ngưỡng hỗ trợ và vượt đỉnh ngắn hạn.');
      }

      breakdownRisk = {
        riskLevel,
        nearestSupportPrice: nearestSupport?.price ?? null,
        distanceToSupportPct,
        downsideVolumeCondition: downsideVolCond,
        marketBreadthCondition: breadthCond,
        trendCondition: trendCond,
        volatilityCondition: volCond,
        supportingMetrics: {
          volatilityScore: vScore,
          breadthScore: bScore,
          trendScore: tScore,
          liquidityScore: lScore,
        },
        why,
        confirmationConditions,
        invalidationConditions,
        status: 'LIVE',
      };
    }

    // 8. Recovery Strength Analysis
    let recoveryStrength: MarketRecoveryStrengthResult;
    if (supportResistance.status === 'DATA_UNAVAILABLE' || currentPrice === null) {
      recoveryStrength = {
        recoveryState: 'DATA_UNAVAILABLE',
        supportHoldStatus: null,
        resistanceReclaimStatus: null,
        breadthImprovement: null,
        volumeConfirmation: null,
        momentumCondition: 'KHÔNG XÁC ĐỊNH',
        trendCondition: 'KHÔNG XÁC ĐỊNH',
        leadershipCondition: 'KHÔNG XÁC ĐỊNH',
        resistanceRange: 'Chưa xác định',
        supportingMetrics: {
          advanceDeclineRatio: null,
          marketParticipation: null,
          momentumScore: null,
          trendScore: null,
        },
        why: ['Thiếu dữ liệu nến chỉ số hoặc độ rộng để đánh giá phục hồi.'],
        confirmationConditions: ['Chờ dữ liệu thị trường đầy đủ.'],
        invalidationConditions: ['Cần kết nối dữ liệu.'],
        status: 'DATA_UNAVAILABLE',
        reason: 'Chưa đủ dữ liệu để tính toán sức mạnh phục hồi.',
      };
    } else {
      const { nearestSupport, nearestResistance, distanceToResistancePct } = supportResistance;
      const tScore = regime.scores.trendScore ?? 50;
      const mScore = regime.scores.momentumScore ?? 50;
      const pScore = regime.scores.participationScore ?? 50;
      const lScore = regime.scores.liquidityScore ?? 50;
      const adRatio = breadth.advanceDeclineRatio;
      const ma20Pct = breadth.percentAboveMA20;

      const supportHeld = nearestSupport ? currentPrice >= nearestSupport.price : true;
      const resistanceReclaimed = nearestResistance ? currentPrice >= nearestResistance.price : false;
      const breadthImproved = (adRatio !== null && adRatio >= 1.2) || (ma20Pct !== null && ma20Pct >= 0.5);
      const volumeConfirmed = pScore >= 55 && lScore >= 45;

      const momentumCond = mScore >= 60
        ? 'Động lượng tăng mạnh (RSI & MACD đồng thuận dương)'
        : mScore >= 45
        ? 'Động lượng cân bằng, quán tính giảm đã chững lại'
        : 'Động lượng yếu, lực cầu mua lên còn thận trọng';

      const trendCond = tScore >= 65
        ? 'Xu hướng tăng được củng cố trên các đường MA'
        : tScore >= 50
        ? 'Xu hướng ngắn hạn đang cải thiện dần'
        : 'Xu hướng chính vẫn chịu sức ép kháng cự phía trên';

      const leadershipCond = topStocksRS.length > 0 && (topStocksRS[0].overallRS ?? 0) > 10
        ? `Nhóm dẫn dắt xuất hiện rõ rệt (${topStocksRS.slice(0, 3).map((s) => s.symbol).join(', ')})`
        : 'Chưa có nhóm ngành hoặc cổ phiếu dẫn dắt bứt phá dứt khoát';

      const resRange = nearestResistance
        ? `${nearestResistance.price.toLocaleString('vi-VN')} điểm (${distanceToResistancePct !== null ? `cách +${distanceToResistancePct}%` : ''})`
        : 'Đang ở vùng đỉnh cao nhất';

      let recoveryState: RecoveryStrengthStage = 'WEAK';
      const why: string[] = [];
      const confirmationConditions: string[] = [];
      const invalidationConditions: string[] = [];

      if (supportHeld && (resistanceReclaimed || (distanceToResistancePct !== null && distanceToResistancePct <= 0.5)) && volumeConfirmed && breadthImproved && mScore >= 55) {
        recoveryState = 'CONFIRMED';
        why.push('Ngưỡng hỗ trợ giữ vững và chỉ số đã kiểm định/chinh phục vùng kháng cự.');
        why.push('Độ rộng thị trường cải thiện rõ rệt và dòng tiền mua chủ động xác nhận.');
        confirmationConditions.push('Giữ vững trên ngưỡng cản vừa vượt qua trong tối thiểu 2 phiên tiếp theo.');
        confirmationConditions.push('Thanh khoản duy trì trên mức bình quân 20 phiên.');
        invalidationConditions.push('Quay đầu giảm điểm đột ngột thủng lại vùng hỗ trợ.');
        invalidationConditions.push('Độ rộng thị trường thu hẹp, xuất hiện phân kỳ âm động lượng.');
      } else if (supportHeld && (breadthImproved || volumeConfirmed || mScore >= 50)) {
        recoveryState = 'DEVELOPING';
        why.push('Chỉ số giữ được nền hỗ trợ kỹ thuật và có tín hiệu hấp thụ cung.');
        if (breadthImproved) {
          why.push(`Độ rộng thị trường bắt đầu lan tỏa tích cực (A/D: ${adRatio ?? 'N/A'}).`);
        }
        if (volumeConfirmed) {
          why.push('Thanh khoản mua lên cải thiện so với các phiên điều chỉnh.');
        } else {
          why.push('Tuy nhiên thanh khoản mua xác nhận còn khiêm tốn.');
        }
        confirmationConditions.push(`Bứt phá dứt khoát qua vùng kháng cự gần nhất ${resRange}.`);
        confirmationConditions.push('Dòng tiền luân chuyển mở rộng sang các nhóm cổ phiếu trụ cột.');
        invalidationConditions.push(`Thủng ngưỡng hỗ trợ gần nhất (${nearestSupport?.price.toLocaleString('vi-VN')} điểm).`);
        invalidationConditions.push('Áp lực bán bất ngờ gia tăng dập tắt nhịp hồi phục.');
      } else {
        recoveryState = 'WEAK';
        why.push('Lực cầu mua lên còn rất yếu, chỉ số chủ yếu hồi kỹ thuật yếu ớt.');
        if (!supportHeld) {
          why.push('Chỉ số nằm dưới vùng hỗ trợ ngắn hạn.');
        }
        why.push('Độ rộng thị trường chưa lan tỏa và thanh khoản mua chưa có tín hiệu vào.');
        confirmationConditions.push('Cần xuất hiện phiên bùng nổ theo đà (FTD) với khối lượng lớn và biên độ tăng trên 1.5%.');
        confirmationConditions.push('Độ rộng tăng vượt trội với hơn 60% cổ phiếu trong rổ vượt MA20.');
        invalidationConditions.push('Tiếp tục đà rơi dò đáy mới hoặc rung lắc mạnh quanh vùng giá thấp.');
      }

      recoveryStrength = {
        recoveryState,
        supportHoldStatus: supportHeld,
        resistanceReclaimStatus: resistanceReclaimed,
        breadthImprovement: breadthImproved,
        volumeConfirmation: volumeConfirmed,
        momentumCondition: momentumCond,
        trendCondition: trendCond,
        leadershipCondition: leadershipCond,
        resistanceRange: resRange,
        supportingMetrics: {
          advanceDeclineRatio: adRatio,
          marketParticipation: pScore,
          momentumScore: mScore,
          trendScore: tScore,
        },
        why,
        confirmationConditions,
        invalidationConditions,
        status: 'LIVE',
      };
    }

    return {
      timestamp: asOf,
      market: 'VIETNAM_EQUITIES',
      regime,
      breadth,
      sectors: sectorResult.sectors,
      topRelativeStrength: {
        stocksVsVnIndex: topStocksRS,
        sectorsVsVnIndex: sectorResult.sectors,
      },
      volumeFlow: {
        marketVolumeSpikeCount,
        marketDryUpCount,
        marketAdvancingVolumeRatio,
      },
      dataQuality: {
        totalUniverseSymbols,
        validSymbols,
        coveragePercent,
        isFailClosed,
      },
      dataLineage: {
        sources: ['KBS_OHLCV', 'VPS_QUOTES', 'VIETNAM_STOCKS_UNIVERSE'],
        calculationVersion: MarketIntelligenceSnapshotBuilder.VERSION,
        engine: 'MarketIntelligenceSnapshotBuilder',
      },
      calculationVersion: MarketIntelligenceSnapshotBuilder.VERSION,
      warnings: uniqueWarnings,
      supportResistance,
      breakdownRisk,
      recoveryStrength,
    };
  }
}

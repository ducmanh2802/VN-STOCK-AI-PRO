import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MarketIntelligenceWidget } from '../MarketIntelligenceWidget';
import type { MarketIntelligenceSnapshot } from '../../../lib/analysis/market/types';

describe('MarketIntelligenceWidget (Dashboard Step 1)', () => {
  const mockSnapshot: MarketIntelligenceSnapshot = {
    timestamp: '2026-03-20T10:00:00.000Z',
    market: 'VIETNAM_EQUITIES',
    regime: {
      regime: 'BULL_TREND',
      confidence: 85,
      timestamp: '2026-03-20T10:00:00.000Z',
      calculationVersion: 'v1.0.0-phase20',
      scores: {
        trendScore: 78,
        breadthScore: 65,
        volatilityScore: 35,
        liquidityScore: 70,
        momentumScore: 72,
        participationScore: 68,
      },
      dataLineage: {
        source: 'KBS_OHLCV',
        universe: 'VN30',
        barCount: 60,
        constituentsEvaluated: 30,
      },
      warnings: [],
    },
    breadth: {
      universe: 'VN30',
      asOf: '2026-03-20T10:00:00.000Z',
      totalConstituents: 30,
      validConstituents: 30,
      advanceCount: 20,
      declineCount: 8,
      unchangedCount: 2,
      advanceDeclineRatio: 2.5,
      percentAboveMA20: 0.73,
      percentAboveMA50: 0.80,
      percentAboveMA200: 0.90,
      newHighCount: 4,
      newLowCount: 0,
      upVolume: 150000000,
      downVolume: 50000000,
      upDownVolumeRatio: 3.0,
      breadthThrust: 0.67,
      marketParticipation: 0.75,
      coverageRatio: 1.0,
      dataLineage: {
        source: 'KBS_OHLCV',
        timestamp: '2026-03-20T10:00:00.000Z',
        calculationVersion: 'v1.0.0-phase20',
      },
      calculationVersion: 'v1.0.0-phase20',
      warnings: [],
    },
    sectors: [],
    topRelativeStrength: {
      stocksVsVnIndex: [],
      sectorsVsVnIndex: [],
    },
    volumeFlow: {
      marketVolumeSpikeCount: 3,
      marketDryUpCount: 1,
      marketAdvancingVolumeRatio: 0.75,
    },
    dataQuality: {
      totalUniverseSymbols: 30,
      validSymbols: 30,
      coveragePercent: 100,
      isFailClosed: false,
    },
    dataLineage: {
      sources: ['KBS_OHLCV', 'VPS_QUOTES'],
      calculationVersion: 'v1.0.0-phase20',
      engine: 'MarketIntelligenceSnapshotBuilder',
    },
    calculationVersion: 'v1.0.0-phase20',
    warnings: [],
    supportResistance: {
      currentPrice: 1295.5,
      nearestSupport: { price: 1280.0, strength: 4 },
      secondarySupport: { price: 1260.0, strength: 3 },
      distanceToSupportPct: 1.20,
      nearestResistance: { price: 1310.0, strength: 4 },
      secondaryResistance: { price: 1330.0, strength: 2 },
      distanceToResistancePct: 1.12,
      status: 'LIVE',
    },
    breakdownRisk: {
      riskLevel: 'LOW',
      nearestSupportPrice: 1280.0,
      distanceToSupportPct: 1.20,
      downsideVolumeCondition: 'Thanh khoản bán trong giới hạn kiểm soát',
      marketBreadthCondition: 'Độ rộng ổn định, cân bằng giữa các nhóm ngành',
      trendCondition: 'Duy trì trên các mốc trung bình động quan trọng',
      volatilityCondition: 'Biến động ở mức bình thường của thị trường',
      supportingMetrics: {
        volatilityScore: 35,
        breadthScore: 65,
        trendScore: 78,
        liquidityScore: 70,
      },
      why: ['Khoảng cách tới hỗ trợ an toàn.'],
      confirmationConditions: ['Thị trường bất ngờ xuất hiện phiên phân phối lớn.'],
      invalidationConditions: ['Chỉ số tiếp tục kiểm định thành công các ngưỡng hỗ trợ.'],
      status: 'LIVE',
    },
    recoveryStrength: {
      recoveryState: 'DEVELOPING',
      supportHoldStatus: true,
      resistanceReclaimStatus: false,
      breadthImprovement: true,
      volumeConfirmation: true,
      momentumCondition: 'Động lượng tăng mạnh (RSI & MACD đồng thuận dương)',
      trendCondition: 'Xu hướng tăng được củng cố trên các đường MA',
      leadershipCondition: 'Nhóm dẫn dắt xuất hiện rõ rệt',
      resistanceRange: '1.310 điểm (cách +1.12%)',
      supportingMetrics: {
        advanceDeclineRatio: 2.5,
        marketParticipation: 68,
        momentumScore: 72,
        trendScore: 78,
      },
      why: ['Chỉ số giữ được nền hỗ trợ kỹ thuật và có tín hiệu hấp thụ cung.'],
      confirmationConditions: ['Bứt phá dứt khoát qua vùng kháng cự gần nhất.'],
      invalidationConditions: ['Thủng ngưỡng hỗ trợ gần nhất.'],
      status: 'LIVE',
    },
  };

  it('renders loading skeleton when isLoading is true', () => {
    const html = renderToString(<MarketIntelligenceWidget isLoading={true} />);
    expect(html).toContain('id="market-intelligence-loading"');
  });

  it('renders error state when isError is true', () => {
    const html = renderToString(
      <MarketIntelligenceWidget isError={true} error={new Error('Network error')} />
    );
    expect(html).toContain('id="market-intelligence-error"');
  });

  it('renders complete Market Intelligence dashboard with canonical Phase 20 data', () => {
    const html = renderToString(
      <MarketIntelligenceWidget
        intelligence={mockSnapshot}
        indices={[
          {
            symbol: 'VN-INDEX',
            displayName: 'VN-Index',
            value: 1295.5,
            change: 12.3,
            changePercent: 0.96,
            totalVolume: 500000000,
            totalValue: 15000,
            advances: 250,
            declines: 120,
            unchanged: 50,
            ceilings: 12,
            floors: 0,
            status: 'TRADING',
            sparkline: [1280, 1285, 1290, 1295.5],
          },
          {
            symbol: 'VN30',
            displayName: 'VN30-Index',
            value: 1340.2,
            change: 15.1,
            changePercent: 1.14,
            totalVolume: 200000000,
            totalValue: 8000,
            advances: 20,
            declines: 8,
            unchanged: 2,
            ceilings: 2,
            floors: 0,
            status: 'TRADING',
            sparkline: [1325, 1330, 1335, 1340.2],
          },
        ]}
      />
    );

    // Section header & Provenance
    expect(html).toContain('THÔNG MINH THỊ TRƯỜNG (MARKET INTELLIGENCE)');
    expect(html).toContain('PHASE 20 CANONICAL');
    expect(html).toContain('LIVE');
    expect(html).toContain('KBS + VPS');

    // Market Regime Card
    expect(html).toContain('Chế độ thị trường (Market Regime)');
    expect(html).toContain('XU HƯỚNG TĂNG (BULL TREND)');
    expect(html).toContain('78/100'); // Trend score
    expect(html).toContain('65/100'); // Breadth score
    expect(html).toContain('70/100'); // Liquidity score
    expect(html).toContain('35/100'); // Volatility score

    // Breakdown Risk Card
    expect(html).toContain('RỦI RO GÃY NỀN (BREAKDOWN RISK)');
    expect(html).toContain('RỦI RO THẤP (LOW)');
    expect(html).toContain('1.280'); // nearest support
    expect(html).toContain('+1.2%'); // distance

    // Recovery Strength Card
    expect(html).toContain('SỨC MẠNH PHỤC HỒI (RECOVERY STRENGTH)');
    expect(html).toContain('ĐANG PHÁT TRIỂN (DEVELOPING)');
    expect(html).toContain('ĐẠT YÊU CẦU'); // supportHoldStatus
    expect(html).toContain('ĐANG KIỂM ĐỊNH'); // resistanceReclaimStatus

    // Support & Resistance Card
    expect(html).toContain('HỖ TRỢ &amp; KHÁNG CỰ (SUPPORT / RESISTANCE)');
    expect(html).toContain('1.310'); // Nearest resistance
    expect(html).toContain('+1.12%'); // Resistance distance
    expect(html).toContain('1.280'); // Nearest support
    expect(html).toContain('-1.2%'); // Support distance
  });

  it('handles missing/null metrics safely without converting null to 0 or hiding state', () => {
    const degradedSnapshot: MarketIntelligenceSnapshot = {
      ...mockSnapshot,
      supportResistance: {
        currentPrice: null,
        nearestSupport: null,
        secondarySupport: null,
        distanceToSupportPct: null,
        nearestResistance: null,
        secondaryResistance: null,
        distanceToResistancePct: null,
        status: 'DATA_UNAVAILABLE',
      },
      breakdownRisk: {
        riskLevel: 'DATA_UNAVAILABLE',
        nearestSupportPrice: null,
        distanceToSupportPct: null,
        downsideVolumeCondition: 'KHÔNG XÁC ĐỊNH',
        marketBreadthCondition: 'KHÔNG XÁC ĐỊNH',
        trendCondition: 'KHÔNG XÁC ĐỊNH',
        volatilityCondition: 'KHÔNG XÁC ĐỊNH',
        supportingMetrics: {
          volatilityScore: null,
          breadthScore: null,
          trendScore: null,
          liquidityScore: null,
        },
        why: [],
        confirmationConditions: [],
        invalidationConditions: [],
        status: 'DATA_UNAVAILABLE',
      },
      recoveryStrength: {
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
        why: [],
        confirmationConditions: [],
        invalidationConditions: [],
        status: 'DATA_UNAVAILABLE',
      },
    };

    const html = renderToString(<MarketIntelligenceWidget intelligence={degradedSnapshot} />);

    // Must show DATA UNAVAILABLE
    expect(html).toContain('DATA UNAVAILABLE');
    // Must NOT fabricate 0.00% or 0 điểm
    expect(html).not.toContain('0.00%');
    expect(html).not.toContain('>0 điểm<');
  });
});

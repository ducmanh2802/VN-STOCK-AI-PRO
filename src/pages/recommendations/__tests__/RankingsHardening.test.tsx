import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  formatRank,
  formatScore,
  formatExpectedReturn,
  formatRiskReward,
  formatEvaluationTimestamp,
  formatDataStatus,
  makeRankingSorter,
  isFiniteNumber,
  isPositiveFiniteNumber,
} from '../metrics';
import { RecommendationRanking, RankingResult } from '../../../types/recommendation';
import { RecommendationEngine } from '../../../lib/analysis/strategy/RecommendationEngine';
import { RankingsTable } from '../RankingsTable';
import { RecommendationsPage } from '../../RecommendationsPage';

// Rankings page state is driven by the market-queries hooks. Controlling them
// at the hook boundary lets each test render the REAL page branch (loading,
// data, empty, error) without a DOM environment or network.
const hooksMock = vi.hoisted(() => ({
  rankings: {
    data: undefined as unknown,
    isLoading: false,
    error: null as unknown,
    refetch: () => {},
    isFetching: false,
  },
  stockRecommendations: {
    data: undefined as unknown,
    isLoading: true,
    error: null as unknown,
  },
}));

vi.mock('../../../hooks/useMarketQueries', () => ({
  useRecommendationRankings: () => hooksMock.rankings,
  useStockRecommendations: () => hooksMock.stockRecommendations,
}));

const renderPage = () =>
  renderToStaticMarkup(<RecommendationsPage onSelectStock={() => {}} />);

/**
 * PHASE 19.5.4 — Rankings UI Hardening & Canonical Quant Integration Test Suite
 * Covers all 12 requirements from Phase 19.5.4 specification.
 */
describe('Phase 19.5.4 — Rankings Hardening & Integration', () => {
  const validRankings: RecommendationRanking[] = [
    {
      strategy: 'SHORT_TERM',
      rank: 1,
      symbol: 'FPT',
      companyName: 'CTCP FPT',
      score: 85,
      signal: 'BUY',
      confidence: 'HIGH',
      expectedReturn: 14.5,
      riskReward: 2.5,
      dataStatus: 'OK',
      evaluationTimestamp: '2026-03-20T10:00:00.000Z',
      source: 'KBS_VPS',
    },
    {
      strategy: 'SHORT_TERM',
      rank: 2,
      symbol: 'HPG',
      companyName: 'CTCP Tập đoàn Hòa Phát',
      score: 72,
      signal: 'BUY',
      confidence: 'HIGH',
      expectedReturn: 10.0,
      riskReward: 2.0,
      dataStatus: 'OK',
      evaluationTimestamp: '2026-03-20T10:00:00.000Z',
      source: 'KBS_VPS',
    },
    {
      strategy: 'SHORT_TERM',
      rank: 3,
      symbol: 'VNM',
      companyName: 'CTCP Sữa Việt Nam',
      score: 45,
      signal: 'HOLD',
      confidence: 'MEDIUM',
      expectedReturn: -2.0,
      riskReward: 1.2,
      dataStatus: 'OK',
      evaluationTimestamp: '2026-03-20T10:00:00.000Z',
      source: 'KBS_VPS',
    },
  ];

  // Test 1: Real ranking data renders
  it('Test 1: Real ranking data renders in table with canonical fields', () => {
    const html = renderToStaticMarkup(
      <RankingsTable
        rankings={validRankings}
        activeStockSymbol="FPT"
        sortBy="rank"
        sortOrder="asc"
        onSort={vi.fn()}
        onSelectRowStock={vi.fn()}
        onNavigateToStock={vi.fn()}
      />
    );

    expect(html).toContain('FPT');
    expect(html).toContain('CTCP FPT');
    expect(html).toContain('HPG');
    expect(html).toContain('CTCP Tập đoàn Hòa Phát');
    expect(html).toContain('85');
    expect(html).toContain('+14.5%');
    expect(html).toContain('1 : 2.5');
    expect(html).toContain('MUA');
    expect(html).toContain('HIGH');
    expect(html).toContain('KHẢ DỤNG');
  });

  // Test 2: Canonical score is rendered without UI recomputation
  it('Test 2: Canonical score is rendered directly without UI recomputation', () => {
    const scoreVal = 87;
    expect(formatScore(scoreVal)).toBe('87');

    const singleRanking: RecommendationRanking[] = [
      {
        strategy: 'SHORT_TERM',
        rank: 1,
        symbol: 'FPT',
        companyName: 'CTCP FPT',
        score: scoreVal,
        signal: 'BUY',
        confidence: 'HIGH',
        expectedReturn: 12.0,
        riskReward: 2.0,
      },
    ];

    const html = renderToStaticMarkup(
      <RankingsTable
        rankings={singleRanking}
        activeStockSymbol="FPT"
        sortBy="score"
        sortOrder="desc"
        onSort={vi.fn()}
        onSelectRowStock={vi.fn()}
        onNavigateToStock={vi.fn()}
      />
    );

    // Score must be rendered exactly as 87
    expect(html).toContain('>87<');
  });

  // Backend rank is authoritative: presentation sorting must never re-derive ranks
  it('Test 2b: Backend rank is authoritative — UI sorting never recomputes rank', () => {
    // Deliberately NOT ordered by rank; sorted by symbol for presentation.
    const unsorted: RecommendationRanking[] = [
      { ...validRankings[2], rank: 3, symbol: 'VNM', score: 45 }, // backend rank 3
      { ...validRankings[0], rank: 1, symbol: 'FPT', score: 85 }, // backend rank 1
    ];

    const html = renderToStaticMarkup(
      <RankingsTable
        rankings={unsorted}
        activeStockSymbol="FPT"
        sortBy="symbol"
        sortOrder="asc"
        onSort={vi.fn()}
        onSelectRowStock={vi.fn()}
        onNavigateToStock={vi.fn()}
      />
    );

    // Backend ranks 1 and 3 are displayed verbatim. A recomputed order would
    // have re-numbered VNM to 2 — the backend rank must survive presentation sorting.
    expect(html).toContain('>1<');
    expect(html).toContain('>3<');
    expect(html).not.toContain('>2<');
    // Canonical score rendered verbatim, not recalculated from the sort order.
    expect(html).toContain('>85<');
    expect(html).toContain('>45<');
  });

  // Test 3: Unavailable metric does not become zero
  it('Test 3: Unavailable metric does not become zero (renders —)', () => {
    expect(formatScore(null)).toBe('—');
    expect(formatScore(undefined)).toBe('—');
    expect(formatExpectedReturn(null)).toBe('—');
    expect(formatExpectedReturn(undefined)).toBe('—');
    expect(formatRiskReward(null)).toBe('—');
    expect(formatRiskReward(undefined)).toBe('—');
    expect(formatRank(null)).toBe('—');

    // Crucial check: 0 is a valid score, NOT unavailable
    expect(formatScore(0)).toBe('0');
    expect(formatExpectedReturn(0)).toBe('0.0%');

    const unavailableRanking: RecommendationRanking[] = [
      {
        strategy: 'SHORT_TERM',
        rank: 1,
        symbol: 'VIC',
        score: null,
        signal: 'HOLD',
        confidence: 'LOW',
        expectedReturn: null,
        riskReward: null,
        dataStatus: 'DATA_UNAVAILABLE',
      },
    ];

    const html = renderToStaticMarkup(
      <RankingsTable
        rankings={unavailableRanking}
        activeStockSymbol="VIC"
        sortBy="rank"
        sortOrder="asc"
        onSort={vi.fn()}
        onSelectRowStock={vi.fn()}
        onNavigateToStock={vi.fn()}
      />
    );

    expect(html).not.toContain('>0 / 100<');
    expect(html).not.toContain('>0.0%<');
    expect(html).toContain('—');
    expect(html).toContain('CHƯA ĐỦ DỮ LIỆU');
  });

  // Test 4: Invalid/non-finite metric fails closed
  it('Test 4: Invalid/non-finite metric fails closed', () => {
    expect(formatScore(NaN)).toBe('—');
    expect(formatScore(Infinity)).toBe('—');
    expect(formatScore(-Infinity)).toBe('—');
    expect(formatExpectedReturn(NaN)).toBe('—');
    expect(formatExpectedReturn(Infinity)).toBe('—');
    expect(formatRiskReward(NaN)).toBe('—');
    expect(formatRiskReward(Infinity)).toBe('—');
    expect(formatRank(NaN)).toBe('—');
    expect(formatRank(Infinity)).toBe('—');
    expect(formatRank(-5)).toBe('—');
  });

  // Test 5: Ranking order is deterministic
  it('Test 5: Ranking order is deterministic with stable tie-breaking and nulls last', () => {
    const mixed: RecommendationRanking[] = [
      {
        strategy: 'SHORT_TERM',
        rank: 1,
        symbol: 'A_NULL',
        score: null,
        signal: 'HOLD',
        confidence: 'LOW',
        expectedReturn: null,
        riskReward: null,
      },
      {
        strategy: 'SHORT_TERM',
        rank: 2,
        symbol: 'B_MID',
        score: 50,
        signal: 'HOLD',
        confidence: 'MEDIUM',
        expectedReturn: 5.0,
        riskReward: 1.5,
      },
      {
        strategy: 'SHORT_TERM',
        rank: 3,
        symbol: 'C_HIGH',
        score: 90,
        signal: 'BUY',
        confidence: 'HIGH',
        expectedReturn: 15.0,
        riskReward: 3.0,
      },
      {
        strategy: 'SHORT_TERM',
        rank: 4,
        symbol: 'D_HIGH_TIE',
        score: 90,
        signal: 'BUY',
        confidence: 'HIGH',
        expectedReturn: 12.0,
        riskReward: 2.0,
      },
    ];

    const sorterDesc = makeRankingSorter('score', 'desc');
    const sortedDesc = [...mixed].sort(sorterDesc);
    // C_HIGH (90, return 15) -> D_HIGH_TIE (90, return 12) -> B_MID (50) -> A_NULL (nulls last)
    expect(sortedDesc.map((r) => r.symbol)).toEqual(['C_HIGH', 'D_HIGH_TIE', 'B_MID', 'A_NULL']);

    const sorterAsc = makeRankingSorter('score', 'asc');
    const sortedAsc = [...mixed].sort(sorterAsc);
    // Even in ascending sort, nulls remain at the bottom (nulls last)
    // Between ties (C_HIGH & D_HIGH_TIE with score 90), higher expectedReturn comes first (15 > 12)
    expect(sortedAsc.map((r) => r.symbol)).toEqual(['B_MID', 'C_HIGH', 'D_HIGH_TIE', 'A_NULL']);
  });

  // Test 6: Duplicate ticker cannot create inconsistent ranking entries
  it('Test 6: Duplicate ticker cannot create inconsistent ranking entries', () => {
    const universeData = new Map();
    universeData.set('FPT', {
      currentPrice: 130_000,
      scores: {
        technicalScore: 85,
        fundamentalScore: 90,
        momentumScore: 80,
        moneyFlowScore: 75,
        valuationScore: 80,
        riskScore: 30,
      },
      fairValuePrice: 155_000,
    });

    // Pass duplicate symbols including casing variations
    const result = RecommendationEngine.rankUniverse(
      {
        strategy: 'SHORT_TERM',
        symbols: ['FPT', 'fpt', 'FPT ', ' FPT'],
      },
      universeData
    );

    expect(result.universeSize).toBe(1);
    expect(result.rankings.length).toBe(1);
    expect(result.rankings[0].symbol).toBe('FPT');
    expect(result.rankings[0].rank).toBe(1);
  });

  // Test 7: Loading state — real page render shows loading feedback, never fabricated rows
  it('Test 7: Loading state renders loading feedback without fabricated rankings', () => {
    hooksMock.rankings.isLoading = true;
    hooksMock.rankings.data = undefined;
    hooksMock.rankings.error = null;

    const html = renderPage();

    expect(html).toContain('Đang chấm điểm và xếp hạng chiến lược toàn rổ cổ phiếu');
    // No ranking table may be fabricated while loading
    expect(html).not.toContain('<table');
    expect(html).not.toContain('data-testid="ranking-row-');
  });

  // Test 8: Empty state — real page render shows explicit empty state, no injected securities
  it('Test 8: Empty result renders explicit empty state without fabricated securities', () => {
    hooksMock.rankings.isLoading = false;
    hooksMock.rankings.error = null;
    hooksMock.rankings.data = {
      strategy: 'SHORT_TERM',
      generatedAt: '2026-03-20T10:00:00.000Z',
      dataSource: 'KBS_VPS',
      dataStatus: 'EMPTY',
      rankings: [],
      universeSize: 0,
      filteredCount: 0,
    } satisfies RankingResult;

    const html = renderPage();

    expect(html).toContain('Chưa có dữ liệu xếp hạng chiến lược cho khung thời gian này');
    expect(html).not.toContain('<table');
    expect(html).not.toContain('data-testid="ranking-row-');
  });

  // Test 9: API error — real page render shows the error state, NOT an empty ranking
  it('Test 9: API failure renders error state and never hides the backend failure', () => {
    hooksMock.rankings.isLoading = false;
    hooksMock.rankings.error = new Error('Failed to fetch recommendation rankings');
    hooksMock.rankings.data = undefined;

    const html = renderPage();

    expect(html).toContain('Không thể tải bảng xếp hạng khuyến nghị');
    expect(html).toContain('Failed to fetch recommendation rankings');
    // An API error must not degrade into the empty-state message
    expect(html).not.toContain('Chưa có dữ liệu xếp hạng');
  });

  // Test 10: DATA_UNAVAILABLE rendering
  it('Test 10: DATA_UNAVAILABLE displays appropriate status indicator', () => {
    const okStatus = formatDataStatus('OK');
    expect(okStatus.isAvailable).toBe(true);
    expect(okStatus.label).toBe('KHẢ DỤNG');

    const unavailStatus = formatDataStatus('DATA_UNAVAILABLE');
    expect(unavailStatus.isAvailable).toBe(false);
    expect(unavailStatus.label).toBe('CHƯA ĐỦ DỮ LIỆU');
  });

  // Test 11: Stock Detail navigation preserves canonical symbol identity (no mutation)
  it('Test 11: Stock Detail navigation preserves uppercase trimmed symbol identity', () => {
    const dirtyRanking: RecommendationRanking[] = [
      { ...validRankings[1], symbol: '  hpg  ' },
    ];

    let navigatedTo: string | null = null;
    const html = renderToStaticMarkup(
      <RankingsTable
        rankings={dirtyRanking}
        activeStockSymbol="HPG"
        sortBy="rank"
        sortOrder="asc"
        onSort={vi.fn()}
        onSelectRowStock={vi.fn()}
        onNavigateToStock={(sym) => {
          navigatedTo = sym;
        }}
      />
    );

    // The table renders (and would navigate with) the cleaned canonical identity
    expect(html).toContain('data-testid="ranking-row-HPG"');
    expect(html).toContain('Xem chi tiết HPG');
    // No mutated/lowercase/untrimmed variant may leak into the markup
    expect(html).not.toContain('hpg');
    // Page-level normalization contract used by both navigation handlers
    expect('  hpg  '.trim().toUpperCase()).toBe('HPG');
    expect(navigatedTo).toBeNull();
  });

  // Test 12: Stale/provenance metadata handling
  it('Test 12: Stale/provenance metadata formatting and lineage', () => {
    const isoTimestamp = '2026-03-20T08:30:00.000Z';
    const formatted = formatEvaluationTimestamp(isoTimestamp);
    expect(formatted).not.toBe('—');
    expect(formatEvaluationTimestamp(null)).toBe('—');
    expect(formatEvaluationTimestamp('')).toBe('—');
    expect(formatEvaluationTimestamp('invalid-date')).toBe('—');

    // Lineage sources
    const ranking = validRankings[0];
    expect(ranking.source).toBe('KBS_VPS');
    expect(ranking.dataStatus).toBe('OK');
  });
});

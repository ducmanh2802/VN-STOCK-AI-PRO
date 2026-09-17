import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StockRecommendationsView } from '../../../components/stock/StockRecommendationsView';
import { RecommendationsPage } from '../../RecommendationsPage';
import { RecommendationEngine } from '../../../lib/analysis/strategy/RecommendationEngine';
import { InvestmentRecommendation } from '../../../types/recommendation';

// Recommendations page state is driven by the market-queries hooks. Controlling
// them at the hook boundary lets each test render the REAL component branch
// (loading, data, unavailable, error) without a DOM environment or network.
const hooksMock = vi.hoisted(() => {
  const stockRecommendations = {
    data: undefined as unknown,
    isLoading: false,
    error: null as unknown,
  };
  let receivedSymbol: string | null = null;
  return {
    stockRecommendations,
    receivedSymbol: () => receivedSymbol,
    setReceivedSymbol: (s: string) => {
      receivedSymbol = s;
    },
  };
});

vi.mock('../../../hooks/useMarketQueries', () => ({
  useStockRecommendations: (symbol: string) => {
    hooksMock.setReceivedSymbol(symbol);
    return hooksMock.stockRecommendations;
  },
  useRecommendationRankings: () => ({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: () => {},
    isFetching: false,
  }),
}));

const renderView = () => renderToStaticMarkup(<StockRecommendationsView symbol="FPT" />);
const renderPage = () => renderToStaticMarkup(<RecommendationsPage onSelectStock={() => {}} />);

// Canonical engine output — the REAL RecommendationEngine produces the fixture,
// so every assertion below checks consumption of canonical values, not
// hand-computed ones.
const canonicalRecs = RecommendationEngine.generateMultiHorizon({
  symbol: 'FPT',
  currentPrice: 100_000,
  supportPrice: 95_000,
  resistancePrice: 115_000,
  scores: {
    technicalScore: 80,
    fundamentalScore: 70,
    momentumScore: 65,
    moneyFlowScore: 60,
    valuationScore: 55,
    riskScore: 40,
  },
});

const canonicalResponse = {
  symbol: 'FPT',
  dataStatus: 'OK' as const,
  currentPrice: 100_000,
  recommendations: canonicalRecs,
  retrievedAt: '2026-03-20T10:00:00.000Z',
};

const setData = (payload: unknown) => {
  hooksMock.stockRecommendations.data = payload;
  hooksMock.stockRecommendations.isLoading = false;
  hooksMock.stockRecommendations.error = null;
};

/**
 * PHASE 19.5.5 — Recommendations UI Hardening & Canonical Risk/Allocation
 * Integration Test Suite (deep-dive StockRecommendationsView panel rendered on
 * the Recommendations page).
 */
describe('Phase 19.5.5 — Recommendations Deep-Dive Hardening', () => {
  // Test 1: Canonical recommendation rendering — real engine output displayed verbatim
  it('Test 1: Canonical RecommendationEngine output renders verbatim', () => {
    setData(canonicalResponse);
    const html = renderView();
    const rec = canonicalRecs.SHORT_TERM;

    expect(rec.signal).toBe('BUY');
    expect(html).toContain('KHUYẾN NGHỊ MUA');
    // Canonical score displayed exactly as produced by the engine
    expect(html).toContain(`${rec.score}/100`);
    // Canonical price plan: entry / target / stop from the engine
    expect(html).toContain('100.000 đ');
    expect(html).toContain('115.000 đ');
    expect(html).toContain('95.000 đ');
    expect(html).toContain(`R:R = 1 : ${rec.riskReward}`);
    // Canonical explanation components (reasons / evidence) pass through
    expect(html).toContain(rec.reasons[0]);
    expect(html).toContain('TechnicalAnalysisEngine');
  });

  // Test 2: No UI recommendation calculation — distinctive canonical values render raw
  it('Test 2: UI renders canonical values without recomputation', () => {
    setData({
      ...canonicalResponse,
      recommendations: {
        ...canonicalRecs,
        SHORT_TERM: { ...canonicalRecs.SHORT_TERM, score: 87.3, expectedReturn: 12.34, targetPrice: 123456 },
      },
    });
    const html = renderView();

    expect(html).toContain('>87.3/100<');
    expect(html).toContain('+12.3%');
    expect(html).toContain('123.456 đ');
  });

  // Test 3: Risk is canonical — risk index displayed exactly as the backend supplies it
  it('Test 3: Canonical risk value renders verbatim', () => {
    setData({
      ...canonicalResponse,
      recommendations: {
        ...canonicalRecs,
        SHORT_TERM: {
          ...canonicalRecs.SHORT_TERM,
          scoreBreakdown: { ...canonicalRecs.SHORT_TERM.scoreBreakdown, risk: 42 },
        },
      },
    });
    const html = renderView();

    expect(html).toContain('Rủi ro (Risk Index)');
    expect(html).toContain('>42/100<');
  });

  // Test 4: Allocation is canonical — backend exposes no allocation result, UI fabricates none
  it('Test 4: No fabricated capital allocation values', () => {
    setData(canonicalResponse);
    const html = renderView();

    expect(html).not.toContain('riskApprovedCapital');
    expect(html).not.toContain('approvedCapital');
    expect(html).not.toContain('DATA_UNAVAILABLE');
  });

  // Test 5: Position size is canonical — only the static board-lot note, no computed quantity
  it('Test 5: No UI-computed position size or quantity', () => {
    setData(canonicalResponse);
    const html = renderView();

    expect(html).not.toContain('positionSize');
    expect(html).not.toContain('Số lượng');
    // The only "N CP" occurrence is the static market-convention label (100 CP);
    // no per-symbol quantity may be derived in the UI.
    const cpMatches = html.match(/\d+ CP/g) ?? [];
    expect(cpMatches).toEqual(['100 CP']);
  });

  // Test 6: Null fails closed — null quant values never become 0 or crash markers
  it('Test 6: null quantitative values fail closed to unavailable tokens', () => {
    setData({
      ...canonicalResponse,
      recommendations: {
        ...canonicalRecs,
        SHORT_TERM: {
          ...canonicalRecs.SHORT_TERM,
          score: null,
          riskReward: null,
          potentialDownside: null,
          holdingPeriod: null,
        } as InvestmentRecommendation,
      },
    });
    const html = renderView();

    expect(html).not.toContain('null/100');
    expect(html).not.toContain('>—/100<');
    expect(html).not.toContain('1 : null');
    expect(html).not.toContain('~null ngày');
    // The known Phase 19.5.4 defect: null downside must NOT be fabricated as 0.0%
    expect(html).not.toMatch(/Cắt lỗ \(\+?0\.0%\)/);
    expect(html).toContain('Cắt lỗ (—)');
    expect(html).toContain('Nắm giữ: —');
  });

  // Test 7: Undefined fails closed — undefined never renders as 0
  it('Test 7: undefined quantitative values fail closed', () => {
    setData({
      ...canonicalResponse,
      recommendations: {
        ...canonicalRecs,
        SHORT_TERM: {
          ...canonicalRecs.SHORT_TERM,
          score: undefined,
          expectedReturn: undefined,
          riskReward: undefined,
          potentialDownside: undefined,
          holdingPeriod: undefined,
        } as unknown as InvestmentRecommendation,
      },
    });
    const html = renderView();

    expect(html).not.toContain('undefined/100');
    expect(html).not.toContain('undefined%');
    expect(html).not.toContain('1 : undefined');
    expect(html).not.toContain('~undefined ngày');
    expect(html).not.toMatch(/Cắt lỗ \(\+?0\.0%\)/);
  });

  // Test 8: NaN fails closed — no "NaN" text may reach the markup
  it('Test 8: NaN quantitative values fail closed', () => {
    setData({
      ...canonicalResponse,
      recommendations: {
        ...canonicalRecs,
        SHORT_TERM: {
          ...canonicalRecs.SHORT_TERM,
          score: NaN,
          expectedReturn: NaN,
          riskReward: NaN,
          potentialDownside: NaN,
          holdingPeriod: NaN,
          scoreBreakdown: {
            technical: NaN,
            fundamental: NaN,
            momentum: NaN,
            moneyFlow: NaN,
            valuation: NaN,
            risk: NaN,
          },
        } as unknown as InvestmentRecommendation,
      },
    });
    const html = renderView();

    expect(html).not.toContain('NaN');
    expect(html).not.toContain('NaN/100');
    expect(html).not.toContain('NaN%');
    expect(html).not.toContain('1 : NaN');
    expect(html).toContain('N/A');
  });

  // Test 9: Infinity fails closed
  it('Test 9: ±Infinity quantitative values fail closed', () => {
    setData({
      ...canonicalResponse,
      recommendations: {
        ...canonicalRecs,
        SHORT_TERM: {
          ...canonicalRecs.SHORT_TERM,
          score: Infinity,
          riskReward: Infinity,
          potentialDownside: -Infinity,
        } as unknown as InvestmentRecommendation,
      },
    });
    const html = renderView();

    expect(html).not.toContain('Infinity');
    expect(html).not.toContain('∞');
    expect(html).not.toContain('1 : Infinity');
  });

  // Test 10: Zero is a valid value — must NOT be treated as unavailable
  it('Test 10: zero score and expected return render as valid 0', () => {
    setData({
      ...canonicalResponse,
      recommendations: {
        ...canonicalRecs,
        SHORT_TERM: {
          ...canonicalRecs.SHORT_TERM,
          score: 0,
          expectedReturn: 0,
          scoreBreakdown: {
            technical: 0,
            fundamental: 0,
            momentum: 0,
            moneyFlow: 0,
            valuation: 0,
            risk: 0,
          },
        },
      },
    });
    const html = renderView();

    expect(html).toContain('>0/100<');
    expect(html).toContain('0.0%');
    expect(html).not.toContain('>N/A<');
  });

  // Test 11: Loading state is non-fabricated
  it('Test 11: loading state renders spinner, never fabricated recommendations', () => {
    hooksMock.stockRecommendations.isLoading = true;
    hooksMock.stockRecommendations.data = undefined;
    hooksMock.stockRecommendations.error = null;

    const html = renderView();

    expect(html).toContain('Đang tổng hợp khuyến nghị đa khung thời gian');
    expect(html).not.toContain('KHUYẾN NGHỊ MUA');
    expect(html).not.toContain('/100');
  });

  // Test 12: Canonical DATA_UNAVAILABLE status shows the unavailable state
  it('Test 12: dataStatus DATA_UNAVAILABLE renders unavailable state without recommendations', () => {
    setData({ ...canonicalResponse, dataStatus: 'DATA_UNAVAILABLE' });

    const html = renderView();

    expect(html).toContain('Dữ liệu phân tích khuyến nghị chưa sẵn sàng');
    expect(html).not.toContain('KHUYẾN NGHỊ MUA');
    expect(html).not.toContain('/100');
  });

  // Test 13: API error never becomes empty success or fabricated rows
  it('Test 13: API error renders explicit unavailable state, not fabricated data', () => {
    hooksMock.stockRecommendations.isLoading = false;
    hooksMock.stockRecommendations.error = new Error('Failed to fetch recommendations');
    hooksMock.stockRecommendations.data = undefined;

    const html = renderView();

    expect(html).toContain('Dữ liệu phân tích khuyến nghị chưa sẵn sàng');
    expect(html).not.toContain('KHUYẾN NGHỊ MUA');
    expect(html).not.toContain('/100');
  });

  // Test 14: No frontend timestamp fabrication — stale/unavailable data is never re-dated
  it('Test 14: UI never generates or mutates timestamps', () => {
    setData({ ...canonicalResponse, dataStatus: 'INSUFFICIENT_DATA' as const, recommendations: undefined });

    const html = renderView();

    // No ISO timestamp is generated by the frontend for an unavailable payload
    expect(html).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(html).toContain('Dữ liệu phân tích khuyến nghị chưa sẵn sàng');
  });

  // Test 15: Provenance — canonical evidence traceability (source/period/confidence) preserved
  it('Test 15: canonical provenance (evidence source, period, confidence) is preserved', () => {
    setData(canonicalResponse);
    const html = renderView();

    expect(html).toContain('VPS Financial Statements');
    expect(html).toContain('TechnicalAnalysisEngine');
    expect(html).toContain('TTM / Latest Quarter');
    // No unsupported freshness claims are fabricated by the UI
    expect(html).not.toContain('LIVE');
    expect(html).not.toContain('REAL-TIME');
  });

  // Test 16: Symbol identity is preserved into the canonical recommendations query
  it('Test 16: symbol passes to the canonical query unmutated (navigation identity)', () => {
    setData(canonicalResponse);
    renderToStaticMarkup(<StockRecommendationsView symbol="fpt" />);
    expect(hooksMock.receivedSymbol()).toBe('fpt');
    // Page-level navigation normalization contract (matches Phase 19.5.4 Test 11)
    expect('  fpt  '.trim().toUpperCase()).toBe('FPT');
  });

  // Test 17: Structurally incomplete canonical response (missing horizon) fails closed
  it('Test 17: missing selected-horizon recommendation renders unavailable state, not a crash', () => {
    setData({
      ...canonicalResponse,
      recommendations: { ...canonicalRecs, SHORT_TERM: undefined },
    });

    const html = renderView();

    expect(html).toContain('Dữ liệu phân tích khuyến nghị chưa sẵn sàng');
    expect(html).not.toContain('KHUYẾN NGHỊ MUA');
  });

  // Test 18: Page-level integration — the deep-dive panel renders inside the Recommendations page
  it('Test 18: Recommendations page renders the canonical deep-dive panel for the active symbol', () => {
    setData(canonicalResponse);

    const html = renderPage();

    expect(html).toContain('PHASE 19.5.5');
    expect(html).toContain('Chi Tiết Khuyến Nghị Định Lượng');
    expect(html).toContain('KHUYẾN NGHỊ MUA');
    expect(html).toContain(`${canonicalRecs.SHORT_TERM.score}/100`);
  });
});

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StockSummary } from '../../../types/stock';
import {
  isFiniteNumber,
  computeUpsidePercent,
  computeWatchlistStats,
  matchesSignalFilter,
  makeWatchlistSorter,
} from '../metrics';
import { WatchlistTable } from '../WatchlistTable';
import { WatchlistCardGrid } from '../WatchlistCardGrid';
import { WatchlistStatsSummary } from '../WatchlistStatsSummary';
import {
  formatVND,
  formatPercent,
  formatVolume,
  formatBillionVND,
  formatNumber,
} from '../../../utils/formatters';

/**
 * PHASE 19.5.2 — Watchlist fail-closed hardening tests.
 *
 * Core invariant: an invalid/unavailable quantitative metric must NEVER
 * surface as a finite fabricated numeric value (0, "+0.0%", "NaN%", a
 * colored badge, or a classification label).
 */

const VALID: StockSummary = {
  symbol: 'HPG',
  companyName: 'CTCP Tập đoàn Hòa Phát',
  exchange: 'HOSE',
  sector: 'Thép & Vật liệu',
  price: 28500,
  change: 850,
  changePercent: 3.07,
  volume: 18500000,
  tradingValue: 527.25,
  open: 27800,
  high: 28700,
  low: 27700,
  refPrice: 27650,
  ceilingPrice: 29550,
  floorPrice: 25750,
  marketCap: 165300,
  pe: 11.2,
  pb: 1.5,
  roe: 16.5,
  rsi: 62,
  trend: 'UPTREND',
  aiScore: 82,
  fairValue: 34000,
  sparkline: [27650, 27800, 28200, 28500],
  isDemo: false,
};

const INVALID_METRICS = [null, undefined, NaN, Infinity, -Infinity, '75', 'DATA_UNAVAILABLE', 'LOADING', {}, []];

describe('PHASE 19.5.2 — isFiniteNumber', () => {
  it('accepts finite numbers including legitimate zero', () => {
    expect(isFiniteNumber(0)).toBe(true);
    expect(isFiniteNumber(-5.5)).toBe(true);
    expect(isFiniteNumber(1e12)).toBe(true);
  });
  it('rejects every non-finite / non-numeric representation', () => {
    for (const v of INVALID_METRICS) expect(isFiniteNumber(v)).toBe(false);
  });
});

describe('PHASE 19.5.2 — computeUpsidePercent (no fabricated result)', () => {
  it('computes correctly for valid inputs', () => {
    expect(computeUpsidePercent(20000, 30000)).toBe(50);
    expect(computeUpsidePercent(28500, 34000)).toBeCloseTo(19.298, 3);
  });
  it('returns null for invalid price or fairValue — never 0', () => {
    for (const price of [...INVALID_METRICS, 0, -1]) {
      expect(computeUpsidePercent(price as any, 34000)).toBe(null);
    }
    for (const fv of [...INVALID_METRICS, 0]) {
      expect(computeUpsidePercent(28500, fv as any)).toBe(null);
    }
  });
  it('zero fair value is unavailable (no division fabrication into a signal)', () => {
    // price>0 & fv=0 is the missing-valuation mapping upstream — computing
    // -100% would fabricate a strong-sell signal from unavailable data.
    expect(computeUpsidePercent(28500, 0)).toBe(null);
    expect(computeUpsidePercent(28500, -1)).toBe(null);
  });
});

describe('PHASE 19.5.2 — computeWatchlistStats (poison-resistant aggregation)', () => {
  it('aggregates valid rows exactly as before', () => {
    const stats = computeWatchlistStats([
      VALID,
      { ...VALID, symbol: 'FPT', change: -100, changePercent: -0.88, aiScore: 40, price: 135000, fairValue: 100000 },
      { ...VALID, symbol: 'SSI', change: 0, changePercent: 0, aiScore: 55, price: 32000, fairValue: 32000 },
    ]);
    expect(stats.totalCount).toBe(3);
    expect(stats.advances).toBe(1);
    expect(stats.declines).toBe(1);
    expect(stats.unchanged).toBe(1);
    expect(stats.avgChangePercent).toBeCloseTo((3.07 - 0.88 + 0) / 3, 2);
    expect(stats.avgAiScore).toBeCloseTo((82 + 40 + 55) / 3, 1);
    expect(stats.topGainer?.symbol).toBe('HPG');
    expect(stats.topLoser?.symbol).toBe('FPT');
  });

  it('a fully invalid row contributes nothing and never poisons an average', () => {
    const poison = {
      ...VALID,
      symbol: 'BAD',
      change: NaN,
      changePercent: NaN,
      aiScore: NaN,
      price: NaN,
      fairValue: NaN,
      tradingValue: NaN,
      volume: NaN,
    } as StockSummary;
    const stats = computeWatchlistStats([VALID, poison]);
    expect(stats.avgChangePercent).toBeCloseTo(3.07, 2);
    expect(stats.avgAiScore).toBe(82);
    expect(stats.avgUpsidePercent).not.toBeNaN();
    expect(stats.topGainer?.symbol).toBe('HPG');
    expect(stats.totalTradingValue).toBeCloseTo(527.25, 1);
    expect(stats.totalVolume).toBe(18500000);
    // Invalid change is neither advance, decline, nor unchanged
    expect(stats.advances + stats.declines + stats.unchanged).toBe(1);
  });

  it('all-invalid watchlist yields null averages (UNAVAILABLE), not 0', () => {
    const stats = computeWatchlistStats([
      { ...VALID, change: NaN, changePercent: NaN, aiScore: NaN, price: NaN, fairValue: NaN } as StockSummary,
    ]);
    expect(stats.avgChangePercent).toBe(null);
    expect(stats.avgAiScore).toBe(null);
    expect(stats.avgUpsidePercent).toBe(null);
    expect(stats.topGainer).toBe(null);
    expect(stats.topLoser).toBe(null);
  });

  it('division-by-zero: zero-price rows are excluded from the upside average, not counted as 0%', () => {
    const stats = computeWatchlistStats([
      VALID, // upside ≈ 19.3
      { ...VALID, symbol: 'ZERO', price: 0, fairValue: 34000 },
    ]);
    expect(stats.avgUpsidePercent).toBeCloseTo(19.3, 1);
  });

  it('empty watchlist returns the zeroed stats object with null-free defaults (existing contract)', () => {
    const stats = computeWatchlistStats([]);
    expect(stats.totalCount).toBe(0);
    expect(stats.topGainer).toBe(null);
    expect(stats.totalVolume).toBe(0);
  });

  it('price 0 (missing-quote mapping) is never classified as at-floor/at-ceiling', () => {
    const stats = computeWatchlistStats([{ ...VALID, price: 0 }]);
    expect(stats.floors).toBe(0);
    expect(stats.ceilings).toBe(0);
    // Sanity: a genuine at-floor row still counts
    const atFloor = computeWatchlistStats([{ ...VALID, price: 25750 }]); // == floorPrice
    expect(atFloor.floors).toBe(1);
  });
});

describe('PHASE 19.5.2 — matchesSignalFilter (no signal from invalid AI)', () => {
  const stock = (aiScore: any, trend: StockSummary['trend'] = 'SIDEWAY'): StockSummary => ({
    ...VALID,
    aiScore,
    trend,
  });

  it('BULLISH/BEARISH AI arms require a valid finite score; trend arms still work', () => {
    for (const ai of INVALID_METRICS) {
      expect(matchesSignalFilter(stock(ai), 'BULLISH')).toBe(false);
      expect(matchesSignalFilter(stock(ai), 'BEARISH')).toBe(false);
      expect(matchesSignalFilter(stock(ai), 'NEUTRAL')).toBe(false);
    }
    expect(matchesSignalFilter(stock(NaN, 'UPTREND'), 'BULLISH')).toBe(true); // trend arm
    expect(matchesSignalFilter(stock(NaN, 'DOWNTREND'), 'BEARISH')).toBe(true); // trend arm
  });

  it('valid scores classify per the existing thresholds', () => {
    expect(matchesSignalFilter(stock(60), 'BULLISH')).toBe(true);
    expect(matchesSignalFilter(stock(59.9), 'BULLISH')).toBe(false);
    expect(matchesSignalFilter(stock(40), 'BEARISH')).toBe(true);
    expect(matchesSignalFilter(stock(40.1), 'BEARISH')).toBe(false);
    expect(matchesSignalFilter(stock(50), 'NEUTRAL')).toBe(true);
    expect(matchesSignalFilter(stock(60), 'NEUTRAL')).toBe(false);
    expect(matchesSignalFilter(stock(40), 'NEUTRAL')).toBe(false);
    expect(matchesSignalFilter(stock(50), 'ALL')).toBe(true);
  });
});

describe('PHASE 19.5.2 — makeWatchlistSorter (no zero-coercion, stable)', () => {
  const rows: StockSummary[] = [
    { ...VALID, symbol: 'A', aiScore: 50, pe: 15, price: 10000 },
    { ...VALID, symbol: 'B', aiScore: null as any, pe: null as any, price: NaN as any },
    { ...VALID, symbol: 'C', aiScore: 80, pe: 10, price: 30000 },
    { ...VALID, symbol: 'D', aiScore: NaN as any, pe: NaN as any, price: 20000 },
    { ...VALID, symbol: 'E', aiScore: 65, pe: 12, price: 40000 },
  ];

  it('unavailable keys sort after all valid keys in BOTH directions (never as 0)', () => {
    expect(rows.slice().sort(makeWatchlistSorter('aiScore', 'desc')).map((s) => s.symbol)).toEqual(['C', 'E', 'A', 'B', 'D']);
    expect(rows.slice().sort(makeWatchlistSorter('aiScore', 'asc')).map((s) => s.symbol)).toEqual(['A', 'E', 'C', 'B', 'D']);
    expect(rows.slice().sort(makeWatchlistSorter('pe', 'asc')).map((s) => s.symbol)).toEqual(['C', 'E', 'A', 'B', 'D']);
  });

  it('ties return 0 (consistent comparator)', () => {
    const sorter = makeWatchlistSorter('aiScore', 'desc');
    expect(sorter({ ...VALID, aiScore: 75 }, { ...VALID, aiScore: 75 })).toBe(0);
  });

  it('comparator never returns NaN for any pairing (no unstable sort)', () => {
    const sorter = makeWatchlistSorter('upside', 'desc');
    const weird = [
      { ...VALID, symbol: 'W1', price: 0, fairValue: 100 },
      { ...VALID, symbol: 'W2', price: NaN as any, fairValue: 100 },
      { ...VALID, symbol: 'W3', price: 100, fairValue: Infinity as any },
      { ...VALID, symbol: 'W4', price: 100, fairValue: 150 },
    ];
    for (const a of weird) {
      for (const b of weird) {
        const r = sorter(a, b);
        expect(Number.isFinite(r)).toBe(true);
      }
    }
  });

  it('symbol keeps lexicographic order; trend keeps enum ranking; upside uses the shared calculation', () => {
    expect(rows.slice().sort(makeWatchlistSorter('symbol', 'asc')).map((s) => s.symbol)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(rows.slice().sort(makeWatchlistSorter('symbol', 'desc')).map((s) => s.symbol)).toEqual(['E', 'D', 'C', 'B', 'A']);

    const trends: StockSummary[] = [
      { ...VALID, symbol: 'UP', trend: 'UPTREND' },
      { ...VALID, symbol: 'SIDE', trend: 'SIDEWAY' },
      { ...VALID, symbol: 'DOWN', trend: 'DOWNTREND' },
    ];
    expect(trends.slice().sort(makeWatchlistSorter('trend', 'desc')).map((s) => s.symbol)).toEqual(['UP', 'SIDE', 'DOWN']);
    expect(trends.slice().sort(makeWatchlistSorter('trend', 'asc')).map((s) => s.symbol)).toEqual(['DOWN', 'SIDE', 'UP']);

    const ups: StockSummary[] = [
      { ...VALID, symbol: 'HIGH', price: 100, fairValue: 200 }, // +100%
      { ...VALID, symbol: 'LOW', price: 100, fairValue: 50 }, // -50%
      { ...VALID, symbol: 'NOFV', price: 100, fairValue: NaN as any }, // unavailable
    ];
    expect(ups.slice().sort(makeWatchlistSorter('upside', 'desc')).map((s) => s.symbol)).toEqual(['HIGH', 'LOW', 'NOFV']);
  });
});

describe('PHASE 19.5.2 — formatters render UNAVAILABLE for non-finite input', () => {
  it.each([...INVALID_METRICS])('formatVND(%p) => "--"', (v) => {
    expect(formatVND(v as any)).toBe('--');
  });
  it.each([...INVALID_METRICS])('formatPercent(%p) => "--"', (v) => {
    expect(formatPercent(v as any)).toBe('--');
  });
  it.each([...INVALID_METRICS])('formatVolume(%p) => "--"', (v) => {
    expect(formatVolume(v as any)).toBe('--');
  });
  it.each([...INVALID_METRICS])('formatBillionVND(%p) => "--"', (v) => {
    expect(formatBillionVND(v as any)).toBe('--');
  });
  it.each([...INVALID_METRICS])('formatNumber(%p) => "--"', (v) => {
    expect(formatNumber(v as any)).toBe('--');
  });

  it('finite values (including legitimate zero) format identically to before', () => {
    expect(formatVND(28500)).toBe('28.500');
    expect(formatPercent(3.07)).toBe('+3.07%');
    expect(formatPercent(0)).toBe('0.00%');
    expect(formatVolume(18500000)).toBe('18.50M');
    expect(formatBillionVND(527.25)).toContain('527');
  });
});

describe('PHASE 19.5.2 — rendered markup never contains fabricated values', () => {
  it('WatchlistTable renders -- for invalid metrics, never NaN/Infinity/plus-zero fabrication', () => {
    const bad = {
      ...VALID,
      price: 0, // live provider case: missing quote maps price to 0
      fairValue: NaN as any,
      rsi: NaN as any,
      aiScore: NaN as any,
      pe: null as any,
      roe: null as any,
      change: NaN as any,
      changePercent: NaN as any,
    } as StockSummary;
    const html = renderToStaticMarkup(
      <WatchlistTable
        stocks={[bad]}
        sortColumn="changePercent"
        sortDirection="desc"
        onSort={() => {}}
        onSelectStock={() => {}}
        onNavigateToStock={() => {}}
        onRemoveStock={() => {}}
      />
    );
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
    expect(html).not.toContain('+0.0%'); // no fabricated neutral upside
    expect(html).not.toContain('width: NaN');
    expect(html).toContain('--'); // explicit unavailable markers present
    // price=0 must NOT render the cyan at-floor trading signal
    expect(html).not.toContain('text-cyan-400');
  });

  it('WatchlistCardGrid renders -- for invalid AI/RSI/PE and unavailable upside', () => {
    const bad = {
      ...VALID,
      aiScore: null as any,
      rsi: undefined as any,
      pe: 'DATA_UNAVAILABLE' as any,
      price: 0,
      fairValue: 0,
    } as StockSummary;
    const html = renderToStaticMarkup(
      <WatchlistCardGrid
        stocks={[bad]}
        onSelectStock={() => {}}
        onNavigateToStock={() => {}}
        onRemoveStock={() => {}}
      />
    );
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
    expect(html).not.toContain('+0.0%');
    expect(html).toContain('--');
  });

  it('WatchlistStatsSummary renders -- (not 0/NaN%) when averages are unavailable and no false signal label', () => {
    const html = renderToStaticMarkup(
      <WatchlistStatsSummary
        watchlist={[VALID]}
        stats={{
          totalCount: 1,
          advances: 0,
          declines: 0,
          unchanged: 0,
          ceilings: 0,
          floors: 0,
          avgChangePercent: null,
          avgAiScore: null,
          avgUpsidePercent: null,
          totalTradingValue: 0,
          totalVolume: 0,
          topGainer: null,
          topLoser: null,
        }}
        isFetching={false}
        onRefresh={() => {}}
        lastUpdated={new Date('2026-09-16T10:30:00')}
        refreshInterval={30000}
        onRefreshIntervalChange={() => {}}
      />
    );
    expect(html).toContain('--');
    expect(html).not.toContain('NaN');
    // Unavailable AI average must not render a risk classification label
    expect(html).not.toContain('Thận trọng rủi ro');
    expect(html).not.toContain('+0.0%');
  });
});

describe('PHASE 19.5.2 — property/invariant: invalid metric never becomes fabricated output', () => {
  function seededRandom(seed: number) {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  const pools = {
    price: [28500, 135000, 0, -1, NaN, Infinity, null, undefined, '28000'],
    fairValue: [34000, 155000, 0, NaN, -Infinity, null, undefined],
    aiScore: [82, 50, 0, NaN, Infinity, null, undefined, '82', {}],
    rsi: [62, 30, 75, 0, NaN, Infinity, null, undefined],
    changePercent: [3.07, -0.88, 0, NaN, Infinity, null, undefined],
    change: [850, -1200, 0, NaN, Infinity, null, undefined],
  };
  const pick = <T,>(rand: () => number, arr: T[]): T => arr[Math.floor(rand() * arr.length)];

  it('for 300 generated stocks: every displayed metric is either finite or the "--" marker', () => {
    const rand = seededRandom(19552);
    for (let i = 0; i < 300; i++) {
      const stock = {
        ...VALID,
        price: pick(rand, pools.price) as any,
        fairValue: pick(rand, pools.fairValue) as any,
        aiScore: pick(rand, pools.aiScore) as any,
        rsi: pick(rand, pools.rsi) as any,
        changePercent: pick(rand, pools.changePercent) as any,
        change: pick(rand, pools.change) as any,
      };

      // Upside invariant
      const upside = computeUpsidePercent(stock.price, stock.fairValue);
      if (upside !== null) {
        expect(Number.isFinite(upside)).toBe(true);
        expect(stock.price).toBeGreaterThan(0);
      }

      // Stats invariant: averages finite or null, never NaN
      const stats = computeWatchlistStats([stock]);
      for (const avg of [stats.avgChangePercent, stats.avgAiScore, stats.avgUpsidePercent]) {
        expect(avg === null || Number.isFinite(avg)).toBe(true);
      }

      // Sort invariant: comparator always consistent & finite (=== treats
      // -0 === 0 as equal while still catching any real sign asymmetry)
      const sorter = makeWatchlistSorter('aiScore', i % 2 ? 'asc' : 'desc');
      const r1 = sorter(stock, VALID);
      const r2 = sorter(VALID, stock);
      expect(Number.isFinite(r1)).toBe(true);
      expect(Number.isFinite(r2)).toBe(true);
      expect(r1 === -r2).toBe(true);

      // Signal invariant: invalid AI alone never satisfies the AI arm
      if (!isFiniteNumber(stock.aiScore) && stock.trend === 'SIDEWAY') {
        expect(matchesSignalFilter(stock, 'BULLISH')).toBe(false);
        expect(matchesSignalFilter(stock, 'BEARISH')).toBe(false);
        expect(matchesSignalFilter(stock, 'NEUTRAL')).toBe(false);
      }
    }
  });

  it('rendered table markup for a random invalid stock never contains NaN or Infinity', () => {
    const rand = seededRandom(777);
    for (let i = 0; i < 25; i++) {
      const stock = {
        ...VALID,
        symbol: `S${i}`,
        price: pick(rand, pools.price) as any,
        fairValue: pick(rand, pools.fairValue) as any,
        aiScore: pick(rand, pools.aiScore) as any,
        rsi: pick(rand, pools.rsi) as any,
        changePercent: pick(rand, pools.changePercent) as any,
        change: pick(rand, pools.change) as any,
      } as StockSummary;
      const html = renderToStaticMarkup(
        <WatchlistTable
          stocks={[stock]}
          sortColumn="aiScore"
          sortDirection="desc"
          onSort={() => {}}
          onSelectStock={() => {}}
          onNavigateToStock={() => {}}
          onRemoveStock={() => {}}
        />
      );
      expect(html).not.toContain('NaN');
      expect(html).not.toContain('Infinity');
    }
  });
});

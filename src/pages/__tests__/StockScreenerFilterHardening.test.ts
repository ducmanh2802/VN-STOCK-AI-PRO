import { describe, it, expect } from 'vitest';
import {
  passesAiScoreMinimum,
  passesPriceBounds,
  passesScreenerFilters,
  makeScreenerSorter,
  type ScreenerStock,
} from '../StockScreenerPage';

/**
 * PHASE 19.5.1 — Stock Screener user-facing hardening tests.
 *
 * Contract under test:
 *   ACTIVE QUANTITATIVE FILTER + INVALID INPUT = EXCLUDE
 * All active filters combine with AND semantics. Unavailable metrics must
 * never be coerced to 0 or another numeric placeholder.
 */

function makeStock(overrides: Partial<ScreenerStock> = {}): ScreenerStock {
  return {
    symbol: 'FPT',
    companyName: 'FPT Corporation',
    exchange: 'HOSE',
    price: 120000,
    change: 1200,
    changePercent: 1.5,
    volume: 1_000_000,
    sector: 'Công nghệ thông tin',
    aiScore: 80,
    technicalScore: 70,
    fundamentalScore: null,
    pe: null,
    roe: null,
    rsi: null,
    recommendation: 'BUY',
    ...overrides,
  };
}

const INACTIVE_FILTERS = {
  search: '',
  exchange: 'ALL',
  sector: 'ALL',
  minPrice: 0,
  maxPrice: 250000,
  minAiScore: 0,
};

describe('PHASE 19.5.1 — passesPriceBounds (fail-closed price filter)', () => {
  const [min, max] = [20000, 150000];

  it('PASS: valid price inside the range', () => {
    expect(passesPriceBounds(28000, min, max)).toBe(true);
    expect(passesPriceBounds(68000, min, max)).toBe(true);
  });

  it('PASS: exact boundaries are inclusive (existing < min || > max contract)', () => {
    expect(passesPriceBounds(20000, min, max)).toBe(true);
    expect(passesPriceBounds(150000, min, max)).toBe(true);
  });

  it('EXCLUDE: valid price outside the range', () => {
    expect(passesPriceBounds(19999.99, min, max)).toBe(false);
    expect(passesPriceBounds(150000.01, min, max)).toBe(false);
  });

  it('EXCLUDE: missing / non-finite / non-numeric prices never pass an active price filter', () => {
    expect(passesPriceBounds(null, min, max)).toBe(false);
    expect(passesPriceBounds(undefined, min, max)).toBe(false);
    expect(passesPriceBounds(NaN, min, max)).toBe(false);
    expect(passesPriceBounds(Infinity, min, max)).toBe(false);
    expect(passesPriceBounds(-Infinity, min, max)).toBe(false);
    expect(passesPriceBounds('28000', min, max)).toBe(false);
    expect(passesPriceBounds('', min, max)).toBe(false);
    expect(passesPriceBounds('DATA_UNAVAILABLE', min, max)).toBe(false);
    expect(passesPriceBounds({}, min, max)).toBe(false);
    expect(passesPriceBounds([], min, max)).toBe(false);
  });

  it('zero is admitted by the lower bound 0 (existing inclusive contract), not fabricated', () => {
    expect(passesPriceBounds(0, 0, 250000)).toBe(true);
    expect(passesPriceBounds(0, 1000, 250000)).toBe(false);
  });
});

describe('PHASE 19.5.1 — passesScreenerFilters (AND semantics, fail-closed)', () => {
  it('PASS: valid AI score + valid price with both filters active', () => {
    expect(
      passesScreenerFilters(makeStock({ aiScore: 88, price: 120000 }), { ...INACTIVE_FILTERS, minAiScore: 75 })
    ).toBe(true);
  });

  it('EXCLUDE: invalid AI score + valid price (active minAiScore)', () => {
    const filters = { ...INACTIVE_FILTERS, minAiScore: 75 };
    for (const aiScore of [null, undefined, NaN, Infinity, -Infinity, '88', 'DATA_UNAVAILABLE', {}, []] as any[]) {
      expect(passesScreenerFilters(makeStock({ aiScore, price: 120000 }), filters)).toBe(false);
    }
  });

  it('EXCLUDE: valid AI score + invalid price (price filter is always applied)', () => {
    for (const price of [null, undefined, NaN, Infinity, -Infinity, '120000', 'DATA_UNAVAILABLE'] as any[]) {
      expect(passesScreenerFilters(makeStock({ aiScore: 88, price }), INACTIVE_FILTERS)).toBe(false);
    }
  });

  it('EXCLUDE: invalid AI score + invalid price', () => {
    expect(
      passesScreenerFilters(makeStock({ aiScore: null, price: NaN } as any), { ...INACTIVE_FILTERS, minAiScore: 75 })
    ).toBe(false);
  });

  it('EXCLUDE: search fail with all quantitative metrics valid', () => {
    expect(passesScreenerFilters(makeStock({ aiScore: 90, price: 50000 }), { ...INACTIVE_FILTERS, search: 'VCB' })).toBe(false);
  });

  it('EXCLUDE: exchange fail with all other filters valid', () => {
    expect(
      passesScreenerFilters(makeStock({ aiScore: 90, price: 50000, exchange: 'HOSE' }), {
        ...INACTIVE_FILTERS,
        exchange: 'HNX',
      })
    ).toBe(false);
  });

  it('EXCLUDE: sector fail with all other filters valid', () => {
    expect(
      passesScreenerFilters(makeStock({ aiScore: 90, price: 50000, sector: 'Công nghệ thông tin' }), {
        ...INACTIVE_FILTERS,
        sector: 'Ngân hàng',
      })
    ).toBe(false);
  });

  it('EXCLUDE: missing sector cannot pass an active sector filter (fail-closed categorical)', () => {
    expect(
      passesScreenerFilters(makeStock({ sector: '' }), { ...INACTIVE_FILTERS, sector: 'Ngân hàng' })
    ).toBe(false);
  });

  it('inactive AI filter does not restrict unrated stocks', () => {
    for (const minAiScore of [0, null as any, undefined as any, -5]) {
      expect(passesScreenerFilters(makeStock({ aiScore: null, price: 50000 }), { ...INACTIVE_FILTERS, minAiScore })).toBe(true);
    }
  });

  it('inactive categorical filters do not restrict results', () => {
    expect(passesScreenerFilters(makeStock({ aiScore: null }), INACTIVE_FILTERS)).toBe(true);
  });

  it('does not duplicate or weaken the authoritative AI predicate', () => {
    const scoreInputs: unknown[] = [95, 75, 74.99, 60, 0, null, undefined, NaN, Infinity, '75', 'DATA_UNAVAILABLE', {}, []];
    for (const minAiScore of [75]) {
      for (const aiScore of scoreInputs) {
        const stock = makeStock({ aiScore: aiScore as any, price: 120000 });
        expect(passesScreenerFilters(stock, { ...INACTIVE_FILTERS, minAiScore })).toBe(
          passesAiScoreMinimum(aiScore, minAiScore)
        );
      }
    }
  });
});

describe('PHASE 19.5.1 — invariants over generated universe/config combinations', () => {
  // Deterministic LCG so the property test is reproducible (test tooling only —
  // no randomness ever enters the screener itself).
  function seededRandom(seed: number) {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  const pricePool: unknown[] = [12000, 28000, 68000, 120000, 180000, 250000, 0, NaN, Infinity, null, undefined, '28000', 'DATA_UNAVAILABLE'];
  const aiPool: unknown[] = [95, 88, 80, 75, 74.99, 60, 0, NaN, Infinity, null, undefined, '88', 'DATA_UNAVAILABLE', {}, []];
  const exchanges = ['HOSE', 'HNX', 'UPCOM'];
  const sectors = ['Công nghệ thông tin', 'Ngân hàng', 'Chứng khoán', ''];
  const symbols = ['FPT', 'VCB', 'SSI', 'HPG', 'VNM'];

  it('included(s) => every active predicate is true (and predicate-fail => excluded)', () => {
    const rand = seededRandom(19531);
    const filterConfigs = [
      { ...INACTIVE_FILTERS },
      { ...INACTIVE_FILTERS, minAiScore: 75 },
      { ...INACTIVE_FILTERS, minAiScore: 60, minPrice: 20000 },
      { ...INACTIVE_FILTERS, minPrice: 20000, maxPrice: 150000 },
      { ...INACTIVE_FILTERS, exchange: 'HOSE' },
      { ...INACTIVE_FILTERS, sector: 'Ngân hàng' },
      { ...INACTIVE_FILTERS, search: 'FPT' },
      { ...INACTIVE_FILTERS, minAiScore: 75, minPrice: 20000, maxPrice: 150000, exchange: 'HOSE', search: 'FPT' },
    ];

    for (let i = 0; i < 300; i++) {
      const stock = makeStock({
        symbol: symbols[Math.floor(rand() * symbols.length)],
        companyName: `Corp ${i}`,
        exchange: exchanges[Math.floor(rand() * exchanges.length)],
        sector: sectors[Math.floor(rand() * sectors.length)],
        price: pricePool[Math.floor(rand() * pricePool.length)] as any,
        aiScore: aiPool[Math.floor(rand() * aiPool.length)] as any,
      });
      const filters = filterConfigs[Math.floor(rand() * filterConfigs.length)];
      const included = passesScreenerFilters(stock, filters);

      const searchPass =
        !filters.search ||
        stock.symbol.toLowerCase().includes(filters.search.toLowerCase()) ||
        stock.companyName.toLowerCase().includes(filters.search.toLowerCase());
      const exchangePass = filters.exchange === 'ALL' || stock.exchange === filters.exchange;
      const sectorPass =
        filters.sector === 'ALL' ||
        (!!stock.sector && stock.sector.includes(filters.sector.replace('Ngân hàng', 'Tài chính')));

      const allActivePredicatesPass =
        searchPass &&
        exchangePass &&
        sectorPass &&
        passesPriceBounds(stock.price, filters.minPrice, filters.maxPrice) &&
        passesAiScoreMinimum(stock.aiScore, filters.minAiScore);

      // Core invariant: inclusion requires EVERY active predicate to hold.
      expect(included).toBe(allActivePredicatesPass);
    }
  });

  it('active AI threshold: no invalid/missing/non-finite score is ever included', () => {
    const filters = { ...INACTIVE_FILTERS, minAiScore: 75 };
    for (const aiScore of aiPool) {
      if (passesScreenerFilters(makeStock({ aiScore: aiScore as any }), filters)) {
        expect(passesAiScoreMinimum(aiScore, 75)).toBe(true);
        expect(typeof aiScore).toBe('number');
        expect(Number.isFinite(aiScore as any)).toBe(true);
      }
    }
    expect(passesScreenerFilters(makeStock({ aiScore: NaN }), filters)).toBe(false);
    expect(passesScreenerFilters(makeStock({ aiScore: null }), filters)).toBe(false);
    expect(passesScreenerFilters(makeStock({ aiScore: '88' as any }), filters)).toBe(false);
  });

  it('active price bounds: no invalid/missing/non-finite price is ever included', () => {
    for (const price of pricePool) {
      if (passesScreenerFilters(makeStock({ price: price as any }), INACTIVE_FILTERS)) {
        expect(typeof price).toBe('number');
        expect(Number.isFinite(price as any)).toBe(true);
      }
    }
    expect(passesScreenerFilters(makeStock({ price: NaN as any }), INACTIVE_FILTERS)).toBe(false);
    expect(passesScreenerFilters(makeStock({ price: null as any }), INACTIVE_FILTERS)).toBe(false);
    expect(passesScreenerFilters(makeStock({ price: '120000' as any }), INACTIVE_FILTERS)).toBe(false);
  });
});

describe('PHASE 19.5.1 — makeScreenerSorter (no zero-coercion of unavailable metrics)', () => {
  it('sorts finite scores numerically and places unavailable scores after all valid values (desc)', () => {
    const sorter = makeScreenerSorter('aiScore', 'desc');
    const stocks = [
      makeStock({ symbol: 'A', aiScore: 60 }),
      makeStock({ symbol: 'B', aiScore: null }),
      makeStock({ symbol: 'C', aiScore: 90 }),
      makeStock({ symbol: 'D', aiScore: NaN as any }),
      makeStock({ symbol: 'E', aiScore: 0 }),
    ];
    const order = [...stocks].sort(sorter).map((s) => s.symbol);
    expect(order).toEqual(['C', 'A', 'E', 'B', 'D']);
  });

  it('asc order keeps valid values ascending with unavailable last (never fabricated as 0-first)', () => {
    const sorter = makeScreenerSorter('aiScore', 'asc');
    const stocks = [
      makeStock({ symbol: 'A', aiScore: 60 }),
      makeStock({ symbol: 'B', aiScore: null }),
      makeStock({ symbol: 'C', aiScore: 90 }),
      makeStock({ symbol: 'E', aiScore: 0 }),
    ];
    const order = [...stocks].sort(sorter).map((s) => s.symbol);
    expect(order).toEqual(['E', 'A', 'C', 'B']);
  });

  it('returns 0 for ties (consistent comparator) and handles non-finite without producing NaN', () => {
    const sorter = makeScreenerSorter('aiScore', 'desc');
    expect(sorter(makeStock({ aiScore: 75 }), makeStock({ aiScore: 75 }))).toBe(0);
    const mixed = [
      makeStock({ aiScore: null }),
      makeStock({ aiScore: NaN as any }),
      makeStock({ aiScore: undefined as any }),
    ];
    for (const a of mixed) {
      for (const b of mixed) {
        const result = sorter(a, b);
        expect(Number.isFinite(result)).toBe(true);
        expect(Math.abs(result)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('preserves lexicographic symbol sorting for string keys', () => {
    const stocks = [makeStock({ symbol: 'VCB' }), makeStock({ symbol: 'FPT' }), makeStock({ symbol: 'SSI' })];
    expect([...stocks].sort(makeScreenerSorter('symbol', 'asc')).map((s) => s.symbol)).toEqual(['FPT', 'SSI', 'VCB']);
    expect([...stocks].sort(makeScreenerSorter('symbol', 'desc')).map((s) => s.symbol)).toEqual(['VCB', 'SSI', 'FPT']);
  });
});

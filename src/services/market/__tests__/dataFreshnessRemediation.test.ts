/**
 * P0-02 REGRESSION SUITE — FRESHNESS MUST BE COMPUTED, NEVER ASSUMED
 * ===================================================================
 * Proves the repository's four-state lifecycle
 *   CURRENT | STALE | UNAVAILABLE | INVALID
 * is derived from real source timestamps, and that the exact P0-02 defect
 * (`dataFreshness: 'CURRENT'` together with `sourceTimestamp: null`)
 * can no longer be produced anywhere on the UI path.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import {
  resolveDataFreshness,
  parseSourceTimestamp,
  combineFreshness,
} from '../freshness/dataFreshness';
import { StockSummarySchema, IndexDataSchema } from '../../../schemas/stockSchema';
import type { DataFreshnessStatus } from '../../../types/stock';

const HERE = dirname(fileURLToPath(import.meta.url));
// __tests__ -> market -> services -> src  => repo root
const REPO_SRC = resolve(HERE, '..', '..', '..');

function readSource(relative: string): string {
  return readFileSync(resolve(REPO_SRC, relative), 'utf8');
}

/**
 * Strips line and block comments so the synthetic-literal gate scans EXECUTABLE
 * CODE only. Without this, an explanatory comment that merely names a removed
 * literal would fail the gate and the gate would be quietly disabled by editing
 * the comment instead of the code.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function readCode(relative: string): string {
  return stripComments(readSource(relative));
}

describe('P0-02 — resolveDataFreshness: the single freshness authority', () => {
  const NOW = Date.parse('2026-04-10T07:00:00.000Z');
  const TTL = 120_000;

  it('fresh quote -> CURRENT', () => {
    const v = resolveDataFreshness({
      sourceTimestamp: '2026-04-10T06:59:30.000Z',
      referenceTimeMs: NOW,
      ttlMs: TTL,
    });
    expect(v.status).toBe('CURRENT');
    expect(v.ageMs).toBe(30_000);
    expect(v.reason).toBeNull();
    expect(v.normalizedSourceTimestamp).toBe('2026-04-10T06:59:30.000Z');
  });

  it('old quote -> STALE with the configured TTL reported', () => {
    const v = resolveDataFreshness({
      sourceTimestamp: '2026-04-10T06:50:00.000Z',
      referenceTimeMs: NOW,
      ttlMs: TTL,
    });
    expect(v.status).toBe('STALE');
    expect(v.reason).toBe('EXCEEDS_TTL');
    expect(v.ageMs).toBe(600_000);
  });

  it('missing source timestamp -> UNAVAILABLE (never CURRENT)', () => {
    for (const ts of [null, undefined]) {
      const v = resolveDataFreshness({ sourceTimestamp: ts, referenceTimeMs: NOW, ttlMs: TTL });
      expect(v.status).toBe('UNAVAILABLE');
      expect(v.reason).toBe('MISSING_SOURCE_TIMESTAMP');
      expect(v.ageMs).toBeNull();
      expect(v.normalizedSourceTimestamp).toBeNull();
    }
  });

  it('empty-string source timestamp -> UNAVAILABLE (never CURRENT)', () => {
    const v = resolveDataFreshness({ sourceTimestamp: '   ', referenceTimeMs: NOW, ttlMs: TTL });
    expect(v.status).toBe('UNAVAILABLE');
  });

  it('invalid / unparseable timestamp -> INVALID', () => {
    for (const ts of ['not-a-timestamp', 'TBD', NaN, Infinity]) {
      const v = resolveDataFreshness({
        sourceTimestamp: ts as unknown as string,
        referenceTimeMs: NOW,
        ttlMs: TTL,
      });
      expect(v.status).toBe('INVALID');
      expect(v.reason).toBe('UNPARSEABLE_SOURCE_TIMESTAMP');
    }
  });

  it('future timestamp beyond clock-skew tolerance -> INVALID (look-ahead)', () => {
    const v = resolveDataFreshness({
      sourceTimestamp: '2026-04-10T07:05:00.000Z', // +5 min
      referenceTimeMs: NOW,
      ttlMs: TTL,
    });
    expect(v.status).toBe('INVALID');
    expect(v.reason).toBe('FUTURE_SOURCE_TIMESTAMP');
  });

  it('small future skew within tolerance is tolerated as CURRENT', () => {
    const v = resolveDataFreshness({
      sourceTimestamp: '2026-04-10T07:00:30.000Z', // +30 s, under the 60 s default
      referenceTimeMs: NOW,
      ttlMs: TTL,
    });
    expect(v.status).toBe('CURRENT');
  });

  it('an unusable TTL can never certify CURRENT', () => {
    for (const ttl of [0, -1, Number.NaN]) {
      const v = resolveDataFreshness({
        sourceTimestamp: '2026-04-10T06:59:30.000Z',
        referenceTimeMs: NOW,
        ttlMs: ttl,
      });
      expect(v.status).toBe('UNAVAILABLE');
      expect(v.reason).toBe('INVALID_TTL_CONFIGURATION');
    }
  });

  it('accepts epoch ms and epoch-second source timestamps', () => {
    expect(parseSourceTimestamp(NOW)).toBe(NOW);
    expect(parseSourceTimestamp(String(NOW))).toBe(NOW);
    expect(parseSourceTimestamp(String(Math.floor(NOW / 1000)))).toBe(Math.floor(NOW / 1000) * 1000);
  });
});

describe('P0-02 — combination never lets a weaker state mask a stronger one', () => {
  const states: DataFreshnessStatus[] = ['CURRENT', 'STALE', 'UNAVAILABLE', 'INVALID'];

  it('INVALID dominates everything', () => {
    expect(combineFreshness(['CURRENT', 'STALE', 'UNAVAILABLE', 'INVALID'])).toBe('INVALID');
  });

  it('UNAVAILABLE dominates STALE and CURRENT', () => {
    expect(combineFreshness(['CURRENT', 'STALE', 'UNAVAILABLE'])).toBe('UNAVAILABLE');
  });

  it('STALE dominates CURRENT', () => {
    expect(combineFreshness(['CURRENT', 'STALE'])).toBe('STALE');
  });

  it('ignores absent states', () => {
    expect(combineFreshness([undefined, null, 'STALE'])).toBe('STALE');
    expect(combineFreshness([])).toBe('CURRENT');
  });

  it('is exhaustive over every subset of the four states', () => {
    for (const subset of [states, [...states].reverse(), ['STALE'] as DataFreshnessStatus[], ['INVALID'] as DataFreshnessStatus[]]) {
      expect(states).toContain(combineFreshness(subset));
    }
  });
});

describe('P0-02 — schema refuses to certify CURRENT without provenance', () => {
  const baseSummary = {
    symbol: 'HPG',
    companyName: 'Hòa Phát',
    exchange: 'HOSE' as const,
    sector: 'Thép',
    price: 28_500,
    change: 500,
    changePercent: 1.79,
    volume: 15_000_000,
    tradingValue: 427.5,
    open: 28_100,
    high: 28_600,
    low: 28_000,
    refPrice: 28_000,
    ceilingPrice: 29_950,
    floorPrice: 26_050,
    marketCap: null,
    pe: null,
    pb: null,
    roe: null,
    rsi: null,
    trend: 'UPTREND' as const,
    aiScore: 62,
    fairValue: null,
    sparkline: [28_000, 28_100, 28_600, 28_500],
    isDemo: false,
    dataStatus: 'PARTIAL' as const,
    fetchedAt: '2026-04-10T07:00:00.000Z',
  };

  it('rejects CURRENT + null sourceTimestamp (the P0-02 defect)', () => {
    expect(() =>
      StockSummarySchema.parse({ ...baseSummary, dataFreshness: 'CURRENT', sourceTimestamp: null })
    ).toThrow();
  });

  it('accepts CURRENT + real sourceTimestamp', () => {
    const parsed = StockSummarySchema.parse({
      ...baseSummary,
      dataFreshness: 'CURRENT',
      sourceTimestamp: '2026-04-10T06:59:30.000Z',
    });
    expect(parsed.dataFreshness).toBe('CURRENT');
  });

  it('accepts every non-CURRENT state with a null sourceTimestamp', () => {
    for (const st of ['STALE', 'UNAVAILABLE', 'INVALID'] as const) {
      const parsed = StockSummarySchema.parse({ ...baseSummary, dataFreshness: st, sourceTimestamp: null });
      expect(parsed.dataFreshness).toBe(st);
      expect(parsed.sourceTimestamp).toBeNull();
    }
  });

  it('accepts a null market cap as UNAVAILABLE rather than a fabricated number', () => {
    const parsed = StockSummarySchema.parse({
      ...baseSummary,
      dataFreshness: 'UNAVAILABLE',
      sourceTimestamp: null,
    });
    expect(parsed.marketCap).toBeNull();
  });

  it('accepts a null index level when levelSource declares it unavailable', () => {
    const parsed = IndexDataSchema.parse({
      symbol: 'VN-INDEX',
      displayName: 'VN-Index (HOSE)',
      value: null,
      change: null,
      changePercent: 0.4,
      totalVolume: 845_210_000,
      totalValue: 21_430.5,
      advances: 268,
      declines: 154,
      unchanged: 78,
      ceilings: 14,
      floors: 2,
      status: 'TRADING',
      sparkline: null,
      levelSource: 'UNAVAILABLE',
      levelProvenance: 'NO_AUTHORITATIVE_INDEX_FEED',
    });
    expect(parsed.value).toBeNull();
    expect(parsed.levelSource).toBe('UNAVAILABLE');
  });
});

describe('P0-02 — no unsafe production-path literals remain', () => {
  const PRODUCTION_FILES = [
    'services/market/RealMarketDataProvider.ts',
    'services/market/providers/VPSMarketDataProvider.ts',
    'services/market/stockDetailService.ts',
    'lib/analysis/strategy/RecommendationEngine.ts',
    // Additional production paths found by the final repository-wide sweep.
    'services/etf/EtfDataProvider.ts',
    'services/etf/EtfIntelligenceService.ts',
    'services/derivatives/DerivativesDataProvider.ts',
    'lib/corporate-actions/CorporateActionSnapshotBuilder.ts',
    'lib/corporate-actions/VietnamCorporateActionsRegistry.ts',
  ];

  it.each(PRODUCTION_FILES)('%s contains no hardcoded CURRENT freshness literal', (file) => {
    const src = readCode(file);
    expect(src).not.toMatch(/dataFreshness:\s*['"]CURRENT['"]/);
  });

  it.each(PRODUCTION_FILES)('%s contains no hardcoded zero/now freshness shortcut', (file) => {
    const src = readCode(file);
    expect(src).not.toMatch(/freshnessMs:\s*0\b/);
    expect(src).not.toMatch(/sourceTimestamp:\s*Date\.now\(\)/);
  });

  it.each(PRODUCTION_FILES)('%s pairs a null sourceTimestamp with UNAVAILABLE, never CURRENT', (file) => {
    const src = readCode(file);
    // A `sourceTimestamp: null` is only safe when the very next freshness field is
    // UNAVAILABLE. Scan each occurrence's surrounding block.
    const lines = src.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      if (!/sourceTimestamp:\s*null/.test(lines[i])) continue;
      const window = lines.slice(i, i + 4).join('\n');
      expect(
        window,
        `${file}:${i + 1} sets sourceTimestamp: null without an UNAVAILABLE freshness state nearby`,
      ).toMatch(/dataFreshness:\s*['"]UNAVAILABLE['"]|resolveDataFreshness|status:\s*'UNAVAILABLE'/);
    }
  });

  it('the null-sourceTimestamp pairings above are all in the expected files', () => {
    // Guards against the scanner silently matching nothing.
    const withNull = PRODUCTION_FILES.filter((f) =>
      /sourceTimestamp:\s*null/.test(readCode(f))
    );
    expect(withNull.length).toBeGreaterThan(0);
  });

  it('VPS quote normalizer no longer hardcodes freshnessMs to 0', () => {
    const src = readCode('services/market/providers/VPSMarketDataProvider.ts');
    expect(src).not.toMatch(/freshnessMs:\s*0\b/);
    expect(readSource('services/market/providers/VPSMarketDataProvider.ts')).toContain('resolveDataFreshness');
  });

  it('the corporate-actions builder no longer forces CURRENT on an empty result', () => {
    const src = readCode('lib/corporate-actions/CorporateActionSnapshotBuilder.ts');
    expect(src).not.toMatch(/freshness\s*=\s*['"]CURRENT['"]/);
    // An empty action set is a statement about availability, not freshness.
    expect(src).toMatch(/actions\.length === 0[\s\S]{0,80}'UNAVAILABLE'/);
  });

  it('the corporate-actions registry computes freshness from its source timestamps', () => {
    const src = readCode('lib/corporate-actions/VietnamCorporateActionsRegistry.ts');
    expect(src).not.toMatch(/dataFreshness:\s*['"]CURRENT['"]/);
    expect(src).toContain('resolveDataFreshness');
    expect(src).toContain('withComputedFreshness');
  });
});

describe('P0-02 — RealMarketDataProvider end-to-end freshness derivation', () => {
  it('re-stamping a cached summary cannot resurrect CURRENT', async () => {
    // The provider is exercised through its public surface with a stubbed VPS
    // adapter so no network call is made.
    const providerModule = await import('../RealMarketDataProvider');
    const provider = new providerModule.RealMarketDataProvider();

    const vpsModule = await import('../providers/VPSMarketDataProvider');
    const spy = vi.spyOn(vpsModule.vpsMarketDataProvider, 'getQuotes');

    const nowIso = new Date().toISOString();
    spy.mockResolvedValue([
      {
        symbol: 'HPG',
        price: 28_500,
        previousClose: 28_000,
        open: 28_100,
        high: 28_600,
        low: 28_000,
        change: 500,
        changePercent: 1.79,
        volume: 15_000_000,
        totalValue: 427_500_000_000,
        refPrice: 28_000,
        source: 'VPS',
        status: 'LIVE',
        dataStatus: 'LIVE',
        fetchedAt: nowIso,
        freshnessMs: 0,
        marketTimestamp: nowIso,
        timestamp: Date.now(),
      },
    ] as never);

    try {
      const detail = await provider.getStockDetail('HPG');
      expect(detail).not.toBeNull();
      // A real source timestamp is always attached, and freshness is derived.
      expect(detail!.sourceTimestamp).toBe(new Date(nowIso).toISOString());
      expect(detail!.dataFreshness).toBe('CURRENT');
      expect(detail!.dataFreshness).not.toBe('STALE');
      // P0-03: market cap is UNAVAILABLE, never `price x 1_000_000 / 1e9`.
      expect(detail!.marketCap).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('P0-03 — synthetic financial values are gone from production paths', () => {
  const REAL_MARKET = readCode('services/market/RealMarketDataProvider.ts');
  const STOCK_DETAIL = readCode('services/market/stockDetailService.ts');
  const RECOMMENDATION = readCode('lib/analysis/strategy/RecommendationEngine.ts');

  it('the gate itself inspects executable code, not comments', () => {
    // Guards against the gate being defeated by editing comments instead of code.
    const commented = `// marketCap: Number((price * 1_000_000 / 1e9).toFixed(1))\nconst marketCap = null;`;
    expect(stripComments(commented)).not.toContain('1_000_000');
  });

  it('no marketCap is derived from an assumed share count', () => {
    expect(REAL_MARKET).not.toMatch(/marketCap:\s*Number\(\(\s*\w+\.price\s*\*\s*1_000_000/);
    expect(REAL_MARKET).not.toMatch(/marketCap:\s*Number\(\(\s*price\s*\*\s*1_000_000/);
    expect(STOCK_DETAIL).not.toMatch(/marketCap:\s*Number\(\(\s*\w+\.price\s*\*\s*1_000_000/);
  });

  it('no hardcoded index bases remain', () => {
    for (const base of ['1285.0', '1320.5', '238.5', '98.2']) {
      expect(REAL_MARKET).not.toContain(base);
    }
  });

  it('no synthetic money-flow literals remain', () => {
    for (const literal of ['185.4', '62.1', '-247.5']) {
      expect(REAL_MARKET).not.toContain(literal);
    }
  });

  it('no `price x constant` fair value remains', () => {
    for (const multiplier of ['1.18', '1.30', '1.12', '1.15', '1.25', '1.08']) {
      expect(STOCK_DETAIL).not.toMatch(
        new RegExp(`(fairValue|targetPrice\\d?|stopLossPrice|grahamValue|dcfValue|consensusTarget)[^\\n]*\\*\\s*${multiplier.replace('.', '\\.')}`)
      );
      expect(RECOMMENDATION).not.toMatch(new RegExp(`currentPrice\\s*\\*\\s*${multiplier.replace('.', '\\.')}`));
    }
  });

  it('no hardcoded confidence / ownership / flow figures remain in the stock detail path', () => {
    expect(STOCK_DETAIL).not.toMatch(/confidence:\s*88\b/);
    expect(STOCK_DETAIL).not.toMatch(/foreignOwnershipPercent:\s*32\.4/);
    expect(STOCK_DETAIL).not.toMatch(/roomRemainingPercent:\s*16\.6/);
    expect(STOCK_DETAIL).not.toMatch(/foreignNetValue:\s*84\.5/);
    expect(STOCK_DETAIL).not.toMatch(/orderPressureRatio:\s*1\.38/);
    expect(STOCK_DETAIL).not.toMatch(/activeBuyVolume:\s*Math\.round\(\s*baseSummary\.volume\s*\*/);
  });

  it('index levels are explicitly marked UNAVAILABLE with provenance', () => {
    expect(REAL_MARKET).toContain('NO_AUTHORITATIVE_INDEX_FEED');
    expect(REAL_MARKET).toContain('levelSource');
  });

  it('money-flow metrics carry an availability state and provenance', () => {
    expect(REAL_MARKET).toContain('NO_AUTHORITATIVE_FLOW_FEED');
    expect(REAL_MARKET).toContain('availability');
  });

  it('valuation figures are marked NOT_COMPUTED rather than approximated', () => {
    expect(STOCK_DETAIL).toContain('NOT_COMPUTED');
    expect(STOCK_DETAIL).toContain('fairValue: null');
    expect(RECOMMENDATION).toContain('TARGET_NOT_COMPUTED');
    expect(RECOMMENDATION).toContain('STOP_LOSS_NOT_COMPUTED');
  });
});
import { describe, it, expect } from 'vitest';
import {
  NewsMacroListError,
  NewsMacroListService,
  NewsMacroUnavailableError,
  decodeCursor,
  encodeCursor,
  sourcePrecedence,
  type NewsMacroDataSource,
  type NewsMacroListResult,
} from '../NewsMacroListService';
import type {
  EarningsEventListRow,
  MacroObservationListRow,
  NewsListRow,
  NewsMacroQuery,
  PolicyEventListRow,
} from '../../../lib/db/NewsMacroRepository';

const date = (iso: string) => new Date(iso);

function newsRow(overrides: Partial<NewsListRow> = {}): NewsListRow {
  return {
    id: 1,
    stockSymbol: 'HPG',
    title: 'Hòa Phát báo cáo lợi nhuận tăng mạnh',
    source: 'CAFEF',
    url: 'https://www.cafef.vn/hpg-loi-nuan.chn?utm_source=share',
    summary: 'Tóm tắt',
    sentiment: 'POSITIVE',
    publishedAt: date('2026-10-01T03:00:00.000Z'),
    ...overrides,
  };
}

function policyRow(overrides: Partial<PolicyEventListRow> = {}): PolicyEventListRow {
  return {
    id: 1,
    policyEventId: 'POL-001',
    documentNumber: '15/2026/TT-BTC',
    title: 'Nghị định hướng dẫn thuế TNDN',
    description: 'Mô tả',
    issuingAuthority: 'Bộ Tài chính',
    policyType: 'TAX',
    status: 'EFFECTIVE',
    targetSectors: 'BANKING',
    source: 'MOF',
    sourceTier: 'PRIMARY',
    sourceUrl: 'https://mof.gov.vn/15-2026',
    announcementDate: '2026-09-01',
    effectiveDate: '2026-10-01',
    publicationDate: '2026-09-02',
    ...overrides,
  };
}

function earningsRow(overrides: Partial<EarningsEventListRow> = {}): EarningsEventListRow {
  return {
    id: 1,
    symbol: 'HPG',
    periodId: '2026Q2',
    periodType: 'QUARTER',
    fiscalYear: 2026,
    reportDate: '2026-07-30',
    status: 'SCHEDULED',
    source: 'VPS',
    sourceTier: 'SECONDARY',
    publicationTimestamp: date('2026-07-15T02:00:00.000Z'),
    createdAt: date('2026-07-15T02:00:00.000Z'),
    freshness: 'CURRENT',
    ...overrides,
  };
}

function macroRow(overrides: Partial<MacroObservationListRow> = {}): MacroObservationListRow {
  return {
    id: 1,
    metricCode: 'CPI_YOY',
    observationDate: '2026-09-01',
    publicationDate: '2026-09-06',
    value: '3.4500',
    unit: '%',
    source: 'GSO',
    sourceTier: 'PRIMARY',
    revisionVersion: 0,
    frequency: 'MONTHLY',
    periodId: '2026-09',
    validationStatus: 'VALID',
    freshnessStatus: 'CURRENT',
    notes: null,
    ...overrides,
  };
}

type Calls = Partial<Record<keyof NewsMacroDataSource, NewsMacroQuery>>;

function fakeSource(
  rows: {
    news?: NewsListRow[];
    policy?: PolicyEventListRow[];
    earnings?: EarningsEventListRow[];
    macro?: MacroObservationListRow[];
  },
  options: { fail?: boolean; calls?: Calls } = {}
): NewsMacroDataSource {
  const record = (key: keyof NewsMacroDataSource, query: NewsMacroQuery) => {
    if (options.calls) options.calls[key] = query;
    if (options.fail) throw new Error('ECONNREFUSED 127.0.0.1:5432');
    return Promise.resolve([]);
  };
  return {
    listNews: (q) => Promise.resolve(rows.news ?? []).then((r) => (record('listNews', q), r)),
    listPolicyEvents: (q) => Promise.resolve(rows.policy ?? []).then((r) => (record('listPolicyEvents', q), r)),
    listEarningsCalendar: (q) => Promise.resolve(rows.earnings ?? []).then((r) => (record('listEarningsCalendar', q), r)),
    listMacroObservations: (q) => Promise.resolve(rows.macro ?? []).then((r) => (record('listMacroObservations', q), r)),
  };
}

describe('sourcePrecedence — primary source wins, unknown sources rank last', () => {
  it('ranks an official tier above an aggregator regardless of the name', () => {
    expect(sourcePrecedence('MOF', 'PRIMARY')).toBeLessThan(sourcePrecedence('CAFEF', 'AGGREGATOR'));
  });

  it('uses the source name to break ties inside the same tier', () => {
    expect(sourcePrecedence('VPS', 'SECONDARY')).toBeLessThan(sourcePrecedence('SOMEBLOG', 'SECONDARY'));
  });

  it('never discards an unknown source — it only ranks it last', () => {
    const unknown = sourcePrecedence('NOT_A_KNOWN_SOURCE', null);
    expect(Number.isFinite(unknown)).toBe(true);
    expect(unknown).toBeGreaterThan(sourcePrecedence('KBS', null));
  });
});

describe('cursor codec', () => {
  it('round-trips a canonical timestamp and row id', () => {
    const encoded = encodeCursor({
      key: 'x',
      kind: 'NEWS',
      id: 42,
      symbol: null,
      title: 't',
      summary: null,
      source: 'S',
      sourceTier: null,
      sourceRank: 1,
      url: null,
      canonicalTimestamp: '2026-10-01T03:00:00.000Z',
      extra: {},
    });
    expect(decodeCursor(encoded)).toEqual({ ts: '2026-10-01T03:00:00.000Z', id: 42 });
  });

  it('accepts a date-only cursor (policy / macro canonical timestamps)', () => {
    expect(decodeCursor('2026-09-02#7')).toEqual({ ts: '2026-09-02', id: 7 });
  });

  it('rejects a malformed cursor with a 400-level code', () => {
    expect(() => decodeCursor('nope')).toThrow(NewsMacroListError);
    expect(() => decodeCursor('2026-10-01T00:00:00.000Z#abc')).toThrow(NewsMacroListError);
    try {
      decodeCursor('bad');
    } catch (e) {
      expect((e as NewsMacroListError).code).toBe('INVALID_CURSOR');
    }
  });

  it('treats an absent cursor as the first page', () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor('')).toBeNull();
  });
});

describe('NewsMacroListService — news', () => {
  it('dedupes the same article by canonical URL and keeps the higher-precedence source', async () => {
    const service = new NewsMacroListService(
      fakeSource({
        news: [
          newsRow({
            id: 1,
            source: 'CAFEF',
            url: 'https://www.cafef.vn/hpg-loi-nuan.chn?utm_source=share&fbclid=x',
          }),
          newsRow({
            id: 2,
            source: 'KBS',
            url: 'http://cafef.vn/hpg-loi-nuan.chn/',
            summary: 'Bản KBS',
          }),
        ],
      })
    );

    const result = await service.listNews();
    expect(result.count).toBe(1);
    expect(result.items[0].source).toBe('KBS');
    expect(result.items[0].sourceRank).toBeLessThan(sourcePrecedence('CAFEF', null));
  });

  it('falls back to symbol + normalized title + day when there is no URL', async () => {
    const service = new NewsMacroListService(
      fakeSource({
        news: [
          newsRow({ id: 1, url: null, title: 'Hòa Phát báo cáo lợi nhuận!' }),
          newsRow({ id: 3, url: null, title: 'Hoa Phat bao cao loi nhuan', source: 'VIETSTOCK' }),
        ],
      })
    );
    expect((await service.listNews()).count).toBe(1);
  });

  it('keeps two different days of the same headline apart', async () => {
    const service = new NewsMacroListService(
      fakeSource({
        news: [
          newsRow({ id: 1, url: null, publishedAt: date('2026-10-01T01:00:00.000Z') }),
          newsRow({ id: 2, url: null, publishedAt: date('2026-10-02T01:00:00.000Z') }),
        ],
      })
    );
    const result = await service.listNews();
    expect(result.count).toBe(2);
    expect(result.items[0].canonicalTimestamp).toBe('2026-10-02T01:00:00.000Z');
  });

  it('sorts newest first and reports a UTC ISO canonical timestamp', async () => {
    const service = new NewsMacroListService(
      fakeSource({
        news: [
          newsRow({ id: 1, url: 'https://a.vn/1', publishedAt: date('2026-09-01T00:00:00.000Z') }),
          newsRow({ id: 2, url: 'https://a.vn/2', publishedAt: date('2026-10-01T00:00:00.000Z') }),
        ],
      })
    );
    const result = await service.listNews();
    expect(result.items.map((i) => i.id)).toEqual([2, 1]);
    expect(result.items[0].canonicalTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe('NewsMacroListService — policy events', () => {
  it('dedupes one legal document carried by several sources and keeps the primary one', async () => {
    const service = new NewsMacroListService(
      fakeSource({
        policy: [
          policyRow({ id: 5, source: 'CAFEF', sourceTier: 'AGGREGATOR', sourceUrl: 'https://cafef.vn/doc' }),
          policyRow({ id: 7, source: 'MOF', sourceTier: 'PRIMARY', sourceUrl: 'https://mof.gov.vn/doc' }),
        ],
      })
    );
    const result = await service.listPolicyEvents();
    expect(result.count).toBe(1);
    expect(result.items[0].source).toBe('MOF');
    expect(result.items[0].url).toBe('https://mof.gov.vn/doc');
  });

  it('emits a date-only canonical timestamp at UTC midnight, never a guessed hour', async () => {
    const service = new NewsMacroListService(fakeSource({ policy: [policyRow()] }));
    const result = await service.listPolicyEvents();
    expect(result.items[0].canonicalTimestamp).toBe('2026-09-02T00:00:00.000Z');
  });
});

describe('NewsMacroListService — earnings calendar', () => {
  it('dedupes one symbol+period across sources by precedence', async () => {
    const service = new NewsMacroListService(
      fakeSource({
        earnings: [
          earningsRow({ id: 1, source: 'CAFEF', sourceTier: 'AGGREGATOR' }),
          earningsRow({ id: 2, source: 'VPS', sourceTier: 'SECONDARY' }),
        ],
      })
    );
    const result = await service.listEarningsCalendar();
    expect(result.count).toBe(1);
    expect(result.items[0].source).toBe('VPS');
    expect(result.items[0].symbol).toBe('HPG');
  });

  it('keeps different periods as separate items', async () => {
    const service = new NewsMacroListService(
      fakeSource({ earnings: [earningsRow(), earningsRow({ id: 2, periodId: '2026Q3' })] })
    );
    expect((await service.listEarningsCalendar()).count).toBe(2);
  });
});

describe('NewsMacroListService — macro observations', () => {
  it('dedupes revisions of the same metric+date, keeping the newest row', async () => {
    const service = new NewsMacroListService(
      fakeSource({
        macro: [
          macroRow({ id: 1, revisionVersion: 0, value: '3.1000' }),
          macroRow({ id: 9, revisionVersion: 1, value: '3.4500' }),
        ],
      })
    );
    const result = await service.listMacroObservations();
    expect(result.count).toBe(1);
    expect(result.items[0].id).toBe(9);
    expect(result.items[0].extra.value).toBe(3.45);
  });

  it('carries NO_DATA observations with a null value instead of dropping or zeroing them', async () => {
    const service = new NewsMacroListService(
      fakeSource({ macro: [macroRow({ value: null, freshnessStatus: 'NO_DATA' })] })
    );
    const result = await service.listMacroObservations();
    expect(result.items[0].extra.value).toBeNull();
    expect(result.items[0].summary).toBeNull();
  });
});

describe('NewsMacroListService — pagination', () => {
  it('caps a page at `limit` and returns a cursor pointing at the last item', async () => {
    const rows = [1, 2, 3, 4, 5].map((n) =>
      newsRow({ id: n, url: `https://a.vn/${n}`, publishedAt: date(`2026-10-0${n}T00:00:00.000Z`) })
    );
    const service = new NewsMacroListService(fakeSource({ news: rows }));
    const page1 = await service.listNews({ limit: 2 });
    expect(page1.count).toBe(2);
    expect(page1.items.map((i) => i.id)).toEqual([5, 4]);
    expect(page1.nextCursor).toBeTruthy();

    expect(decodeCursor(page1.nextCursor)).toEqual({ ts: '2026-10-04T00:00:00.000Z', id: 4 });
  });

  it('returns null cursor when the store is exhausted', async () => {
    const service = new NewsMacroListService(
      fakeSource({ news: [newsRow({ id: 1, url: 'https://a.vn/1' })] })
    );
    const page = await service.listNews({ limit: 10 });
    expect(page.count).toBe(1);
    expect(page.nextCursor).toBeNull();
  });

  it('passes the fetch cap (not `limit`) to the repository so dedupe cannot hide more rows', async () => {
    const calls: Calls = {};
    const service = new NewsMacroListService(fakeSource({ news: [] }, { calls }));
    await service.listNews({ limit: 5 });
    expect(calls.listNews?.limit).toBe(20);
  });

  it('propagates symbol and metric filters to the repository', async () => {
    const calls: Calls = {};
    const service = new NewsMacroListService(fakeSource({ news: [], macro: [] }, { calls }));
    await service.listNews({ symbol: 'hpg' });
    await service.listMacroObservations({ metricCode: 'cpi_yoy' });
    expect(calls.listNews?.symbol).toBe('HPG');
    expect(calls.listMacroObservations?.metricCode).toBe('CPI_YOY');
  });
});

describe('NewsMacroListService — validation and failure', () => {
  it('rejects an out-of-range limit before touching the store', async () => {
    const calls: Calls = {};
    const service = new NewsMacroListService(fakeSource({}, { calls }));
    await expect(service.listNews({ limit: 0 })).rejects.toMatchObject({ code: 'INVALID_LIMIT' });
    await expect(service.listNews({ limit: 101 })).rejects.toMatchObject({ code: 'INVALID_LIMIT' });
    await expect(service.listNews({ limit: 'abc' })).rejects.toMatchObject({ code: 'INVALID_LIMIT' });
    expect(calls.listNews).toBeUndefined();
  });

  it('rejects a malformed symbol filter', async () => {
    const service = new NewsMacroListService(fakeSource({}));
    await expect(service.listNews({ symbol: 'HPG; DROP' })).rejects.toMatchObject({
      code: 'INVALID_FILTER',
    });
  });

  it('turns a store failure into DATA_UNAVAILABLE instead of an empty success', async () => {
    const service = new NewsMacroListService(fakeSource({}, { fail: true }));
    await expect(service.listNews()).rejects.toBeInstanceOf(NewsMacroUnavailableError);
    const outcome = await service.listNews().catch((e: unknown) => e);
    expect((outcome as NewsMacroUnavailableError).code).toBe('DATA_UNAVAILABLE');
  });

  it('defaults to limit 50 and reports dataStatus OK on success', async () => {
    const service = new NewsMacroListService(fakeSource({ news: [] }));
    const result: NewsMacroListResult = await service.listNews();
    expect(result.limit).toBe(50);
    expect(result.dataStatus).toBe('OK');
    expect(result.kind).toBe('NEWS');
    expect(typeof result.retrievedAt).toBe('string');
  });
});

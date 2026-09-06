import { afterEach, describe, expect, it, vi } from 'vitest';
import { VpsProvider, VpsApiError } from '../../VpsProvider.ts';

/**
 * PHASE 8.5C STEP 15 — VPS provider unit tests.
 * Quote fixture is the REAL live payload captured from
 * https://bgapidatafeed.vps.com.vn/getliststockdata/HPG on 2026-09-06.
 * Fundamentals fixture follows the REAL getliststockbaseinfo/HPG structure.
 */

const REAL_QUOTE_PAYLOAD = [
  {
    id: 2100,
    boardId: 'G1',
    marketId: 'STO',
    hashValue: 'HPG',
    transId: 'STO:VN000000HPG4:MT:128173',
    c: 23.1,
    f: 20.1,
    r: 21.6,
    sym: 'HPG',
    lastPrice: 21.7,
    lastVolume: 20,
    lot: 1392090,
    ot: '0.10',
    changePc: '0.46',
    avePrice: '21.7',
    highPrice: '21.8',
    lowPrice: '21.6',
    g1: '21.7|56280|i',
    mp: null,
    lv: 0,
    closePrice: '21600.0',
    ptVol: '0',
    oi: '0',
    oichange: '0',
    openPrice: '21.75',
    fBVol: '129368',
    fBValue: '2.8088076E7',
    fSVolume: '459197',
    fSValue: '9.96509442E7',
    fRoom: '230019025.50',
    sType: 'S',
  },
];

const REAL_BASEINFO_SHAPE = {
  symbol: 'HPG',
  coban: {},
  ttQuy: [
    { TermCode: 'Q3', TermName: 'Quý 3', YearPeriod: 2020, PeriodEnd: '202009', Row: 4 },
    { TermCode: 'Q4', TermName: 'Quý 4', YearPeriod: 2020, PeriodEnd: '202112', Row: 3 },
    { TermCode: 'Q1', TermName: 'Quý 1', YearPeriod: 2021, PeriodEnd: '202103', Row: 2 },
    { TermCode: 'Q2', TermName: 'Quý 2', YearPeriod: 2021, PeriodEnd: '202106', Row: 1 },
  ],
  ketquaKDQuy: [
    { NameEn: 'Net revenue', Value1: 35118355, Value2: 31176875, Value3: 25778071, Value4: 24685562 },
    { NameEn: 'Gross profit', Value1: 11477059, Value2: 8183042, Value3: 6267237, Value4: 5169065 },
    { NameEn: 'Operating profit', Value1: 10323744, Value2: 7683337, Value3: 5331723, Value4: 4240988 },
    { NameEn: 'Profit after tax', Value1: 9745151, Value2: 7005559, Value3: 4660721, Value4: 3785123 },
    { NameEn: 'Net profit', Value1: 9721407, Value2: 6977554, Value3: 4637855, Value4: 3772707 },
  ],
  candoiKTQuy: [
    { NameEn: 'Current assets', Value1: 82425690, Value2: 63943159, Value3: 56800329, Value4: 43319363 },
    { NameEn: 'Total assets', Value1: 159809151, Value2: 138982270, Value3: 131511437, Value4: 117472262 },
    { NameEn: 'Liabilities', Value1: 85824712, Value2: 72760709, Value3: 72291648, Value4: 62484991 },
    { NameEn: "Owner's equity", Value1: 73984439, Value2: 66221560, Value3: 59219789, Value4: 54987271 },
    { NameEn: 'Minority interest', Value1: null, Value2: null, Value3: null, Value4: null },
  ],
  chisoTCQuy: [
    { NameEn: 'Trailing EPS', Value1: 6915, Value2: 5472, Value3: 4056, Value4: 3495, Unit: 'VNĐ' },
    { NameEn: 'Book value per share', Value1: 16541, Value2: 19987, Value3: 17873, Value4: 16596, Unit: 'VNĐ' },
    { NameEn: 'P/E', Value1: 7.45, Value2: 8.55, Value3: 10.22, Value4: 7.55, Unit: 'Lần' },
    { NameEn: 'ROS', Value1: 27.75, Value2: 22.47, Value3: 18.08, Value4: 15.33, Unit: '%' },
    { NameEn: 'ROEA', Value1: 13.87, Value2: 11.12, Value3: 8.12, Value4: 7.01, Unit: '%' },
    { NameEn: 'ROAA', Value1: 6.51, Value2: 5.16, Value3: 3.73, Value4: 3.28, Unit: '%' },
  ],
  ttNam: [{}, {}, {}, {}],
  ketquaKDNam: [{ NameEn: 'Net revenue', Value1: 90118503, Value2: 63658193, Value3: 55836458, Value4: 46161692 }],
  candoiKTNam: [{ NameEn: 'Total assets', Value1: 131511434 }],
  chisoTCNam: [{ NameEn: 'Trailing EPS', Value1: 4507 }],
};

function jsonResponse(body: unknown, status = 200): Response {

describe('VpsProvider.getQuote', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses the real quote payload with correct unit normalization', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(REAL_QUOTE_PAYLOAD)));

    const quote = await VpsProvider.getQuote('hpg'); // case-insensitive

    expect(quote.symbol).toBe('HPG');
    expect(quote.source).toBe('VPS');
    // kVND -> VND (source-verified)
    expect(quote.lastPrice).toBe(21700);
    expect(quote.openPrice).toBe(21750);
    expect(quote.highPrice).toBe(21800);
    expect(quote.lowPrice).toBe(21600);
    expect(quote.averagePrice).toBe(21700);
    expect(quote.ceilingPrice).toBe(23100);
    expect(quote.floorPrice).toBe(20100);
    // closePrice is already VND (reference / previous close)
    expect(quote.referencePrice).toBe(21600);
    // lots -> shares, kVND -> VND
    expect(quote.matchedVolumeShares).toBe(13920900);
    expect(quote.foreignBuyVolumeShares).toBe(1293680);
    expect(quote.foreignBuyValueVnd).toBe(28088076000);
    expect(quote.foreignSellVolumeShares).toBe(4591970);
    expect(quote.foreignSellValueVnd).toBe(99650944200);
    expect(quote.foreignRoomShares).toBeCloseTo(230019025.5, 1);
    // change derived from two real source fields: 21700 - 21600
    expect(quote.change).toBe(100);
    expect(quote.changePercent).toBeCloseTo(0.46);
  });

  it('falls back to r (kVND) when closePrice is absent', async () => {
    const partial = [{ ...REAL_QUOTE_PAYLOAD[0], closePrice: null }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(partial)));
    const quote = await VpsProvider.getQuote('HPG');
    expect(quote.referencePrice).toBe(21600);
  });

  it('uses null (never fake values) for fields the source does not report', async () => {
    const minimal = [{ sym: 'HPG', lastPrice: 21.7 }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(minimal)));
    const quote = await VpsProvider.getQuote('HPG');
    expect(quote.lastPrice).toBe(21700);
    expect(quote.openPrice).toBeNull();
    expect(quote.highPrice).toBeNull();
    expect(quote.lowPrice).toBeNull();
    expect(quote.matchedVolumeShares).toBeNull();
    expect(quote.foreignBuyVolumeShares).toBeNull();
    expect(quote.ceilingPrice).toBeNull();
    expect(quote.change).toBeNull();
  });

  it('throws NO_DATA for an empty array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])));
    await expect(VpsProvider.getQuote('HPG')).rejects.toMatchObject({ name: 'VpsApiError', reason: 'NO_DATA' });
  });

  it('throws NO_DATA when lastPrice is missing/invalid (no fabricated price)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([{ sym: 'HPG' }])));
    await expect(VpsProvider.getQuote('HPG')).rejects.toMatchObject({ reason: 'NO_DATA' });
  });

  it('throws MALFORMED for a non-array payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ message: 'error' })));
    await expect(VpsProvider.getQuote('HPG')).rejects.toMatchObject({ reason: 'MALFORMED' });
  });

  it('throws MALFORMED for non-JSON payloads', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html/>', { status: 200 })));
    await expect(VpsProvider.getQuote('HPG')).rejects.toMatchObject({ reason: 'MALFORMED' });
  });

  it('throws HTTP error on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('err', { status: 503 })));
    await expect(VpsProvider.getQuote('HPG')).rejects.toMatchObject({
      name: 'VpsApiError',
      reason: 'HTTP',
      statusCode: 503,
    });
  });

  it('throws VpsApiError on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(VpsProvider.getQuote('HPG')).rejects.toBeInstanceOf(VpsApiError);
  });
});

describe('VpsProvider.getFundamentals', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses the real base-info structure into slot-based series', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(REAL_BASEINFO_SHAPE)));

    const f = await VpsProvider.getFundamentals('HPG');

    expect(f.symbol).toBe('HPG');
    expect(f.dataStatus).toBe('OK');
    expect(f.statementUnit).toBe('MILLION_VND');
    // Values pass through as reported
    expect(f.quarterly.netRevenue).toEqual([35118355, 31176875, 25778071, 24685562]);
    expect(f.quarterly.grossProfit[0]).toBe(11477059);
    expect(f.quarterly.netProfit).toEqual([9721407, 6977554, 4637855, 3772707]);
    expect(f.quarterly.totalAssets[0]).toBe(159809151);
    expect(f.quarterly.liabilities[0]).toBe(85824712);
    expect(f.quarterly.equity[0]).toBe(73984439);
    expect(f.quarterly.eps).toEqual([6915, 5472, 4056, 3495]);
    expect(f.quarterly.bvps[0]).toBe(16541);
    expect(f.quarterly.pe[0]).toBeCloseTo(7.45);
    expect(f.quarterly.roe[0]).toBeCloseTo(13.87); // source ROEA
    expect(f.quarterly.roa[0]).toBeCloseTo(6.51); // source ROAA
    expect(f.quarterly.ros[0]).toBeCloseTo(27.75);
    expect(f.annual.netRevenue[0]).toBe(90118503);
    // Period metadata is VERBATIM from the source and flagged AMBIGUOUS
    expect(f.periodMetadata.mappingStatus).toBe('AMBIGUOUS');
    expect(f.periodMetadata.isCurrentPeriodConfirmed).toBe(false);
    expect(f.quarterlyPeriods[0]).toMatchObject({ slot: 'V1', termCode: 'Q2', sourceLabel: 'Quý 2 2021' });
    expect(f.annualPeriods.every((p) => p.sourceLabel === null)).toBe(true);
  });

  it('maps missing rows to null slots instead of fabricating values', async () => {
    const sparse = { symbol: 'XYZ', ketquaKDQuy: [{ NameEn: 'Net revenue', Value1: 1000 }] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(sparse)));
    const f = await VpsProvider.getFundamentals('XYZ');
    expect(f.quarterly.netRevenue).toEqual([1000, null, null, null]);
    expect(f.quarterly.eps).toEqual([null, null, null, null]);
    expect(f.annual.netRevenue).toEqual([null, null, null, null]);
  });

  it('throws NO_DATA when the source reports no numeric data at all', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ symbol: 'XYZ', ttQuy: [] })));
    await expect(VpsProvider.getFundamentals('XYZ')).rejects.toMatchObject({ reason: 'NO_DATA' });
  });

  it('throws MALFORMED for array payloads and non-JSON payloads', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])));
    await expect(VpsProvider.getFundamentals('HPG')).rejects.toMatchObject({ reason: 'MALFORMED' });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('oops', { status: 200 })));
    await expect(VpsProvider.getFundamentals('HPG')).rejects.toMatchObject({ reason: 'MALFORMED' });
  });

  it('throws HTTP error on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('err', { status: 500 })));
    await expect(VpsProvider.getFundamentals('HPG')).rejects.toMatchObject({ reason: 'HTTP', statusCode: 500 });
  });
});
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
}
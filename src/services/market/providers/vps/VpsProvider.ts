import type {
  VpsFinancialSeries,
  VpsNormalizedFundamentals,
  VpsNormalizedQuote,
  VpsPeriodLabel,
  VpsRawBaseInfo,
  VpsRawQuote,
  VpsRawStatementRow,
} from './types.ts';
import { VPS_VALUE_SLOTS } from './types.ts';
import {
  normalizeVpsLotVolume,
  normalizeVpsPercent,
  normalizeVpsPrice,
  normalizeVpsReferencePrice,
  normalizeVpsValueThousands,
  parseVpsNumeric,
} from './normalize.ts';

const VPS_QUOTE_URL = 'https://bgapidatafeed.vps.com.vn/getliststockdata';
const VPS_BASE_INFO_URL = 'https://bgapidatafeed.vps.com.vn/getliststockbaseinfo';
const DEFAULT_TIMEOUT_MS = 15_000;

export type VpsErrorReason = 'INVALID_SYMBOL' | 'NETWORK' | 'TIMEOUT' | 'HTTP' | 'MALFORMED' | 'NO_DATA';

export class VpsApiError extends Error {
  constructor(
    message: string,
    public readonly reason: VpsErrorReason,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'VpsApiError';
  }
}

export interface VpsFetchOptions {
  /** Timeout for the HTTP request in milliseconds. */
  timeoutMs?: number;
}

function assertValidSymbol(symbol: string): string {
  const sym = symbol.toUpperCase().trim();
  if (!/^[A-Z0-9_.]{1,20}$/.test(sym)) {
    throw new VpsApiError(`Invalid VPS symbol format: "${symbol}"`, 'INVALID_SYMBOL');
  }
  return sym;
}

async function fetchJson(url: string, sym: string, options?: VpsFetchOptions): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new VpsApiError(
        `VPS request timed out after ${options?.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms for ${sym}`,
        'TIMEOUT'
      );
    }
    throw new VpsApiError(
      `VPS network error for ${sym}: ${err instanceof Error ? err.message : String(err)}`,
      'NETWORK'
    );
  }
  clearTimeout(timer);

  if (!response.ok) {
    throw new VpsApiError(`VPS HTTP ${response.status} ${response.statusText} for ${sym}`, 'HTTP', response.status);
  }

  try {
    return await response.json();
  } catch {
    throw new VpsApiError(`VPS returned non-JSON payload for ${sym}`, 'MALFORMED', response.status);
  }
}

/** Finds a statement row by its English name (exact match) or null. */
function findRow(rows: VpsRawStatementRow[] | undefined, nameEn: string): VpsRawStatementRow | null {
  if (!Array.isArray(rows)) return null;
  return rows.find((r) => typeof r?.NameEn === 'string' && r.NameEn.trim() === nameEn) ?? null;
}

/** Extracts the 4 slot values (V1..V4) of a row; null where the source reports nothing. */
function rowValues(row: VpsRawStatementRow | null): (number | null)[] {
  // Vendor statement payload uses Value1..Value4 (NOT V1..V4). VPS_VALUE_SLOTS
  // ('V1'..'V4') is only used to map period slots in buildPeriodLabels, so the
  // value fields are read here verbatim. Fixes "no numeric data" on real payloads.
  return (['Value1', 'Value2', 'Value3', 'Value4'] as (keyof VpsRawStatementRow)[]).map((field) =>
    parseVpsNumeric(row?.[field])
  );
}

function emptySeries(): VpsFinancialSeries {
  return {
    netRevenue: [null, null, null, null],
    grossProfit: [null, null, null, null],
    operatingProfit: [null, null, null, null],
    netProfit: [null, null, null, null],
    totalAssets: [null, null, null, null],
    liabilities: [null, null, null, null],
    equity: [null, null, null, null],
    eps: [null, null, null, null],
    bvps: [null, null, null, null],
    pe: [null, null, null, null],
    ros: [null, null, null, null],
    roe: [null, null, null, null],
    roa: [null, null, null, null],
  };
}

function buildSeries(
  income: VpsRawStatementRow[] | undefined,
  balance: VpsRawStatementRow[] | undefined,
  ratios: VpsRawStatementRow[] | undefined
): VpsFinancialSeries {
  const series = emptySeries();
  series.netRevenue = rowValues(findRow(income, 'Net revenue'));
  series.grossProfit = rowValues(findRow(income, 'Gross profit'));
  series.operatingProfit = rowValues(findRow(income, 'Operating profit'));
  series.netProfit = rowValues(findRow(income, 'Net profit'));
  series.totalAssets = rowValues(findRow(balance, 'Total assets'));
  series.liabilities = rowValues(findRow(balance, 'Liabilities'));
  series.equity = rowValues(findRow(balance, "Owner's equity"));
  series.eps = rowValues(findRow(ratios, 'Trailing EPS'));
  series.bvps = rowValues(findRow(ratios, 'Book value per share'));
  series.pe = rowValues(findRow(ratios, 'P/E'));
  series.ros = rowValues(findRow(ratios, 'ROS'));
  series.roe = rowValues(findRow(ratios, 'ROEA'));
  series.roa = rowValues(findRow(ratios, 'ROAA'));
  return series;
}

/**
 * Maps the source's period metadata (ttQuy / ttNam) onto value slots V1..V4
 * using the source's own Row field. The mapping is exposed VERBATIM and flagged
 * AMBIGUOUS by the caller — the metadata is demonstrably inconsistent with the
 * values, so nothing here may be presented as the current period.
 */
function buildPeriodLabels(periods: VpsRawBaseInfo['ttQuy']): VpsPeriodLabel[] {
  return VPS_VALUE_SLOTS.map((slot) => {
    const slotIndex = Number(slot.slice(1)); // V1 -> 1
    const match = (periods ?? []).find((p) => parseVpsNumeric(p?.Row) === slotIndex);
    if (!match) {
      return { slot, sourceLabel: null, termCode: null, yearPeriod: null, periodEnd: null };
    }
    const year = parseVpsNumeric(match.YearPeriod);
    return {
      slot,
      sourceLabel:
        match.TermName && year !== null ? `${match.TermName} ${year}` : (match.TermName ?? null),
      termCode: match.TermCode ?? null,
      yearPeriod: year,
      periodEnd: match.PeriodEnd ?? null,
    };
  });
}

function seriesIsEntirelyEmpty(series: VpsFinancialSeries): boolean {
  const keys = Object.keys(series) as (keyof VpsFinancialSeries)[];
  return keys.every((key) => series[key].every((v) => v === null));
}

/**
 * VPS Securities realtime quote + fundamentals provider.
 *
 * Uses native fetch (no axios / no SDK dependency).
 * No fake fallback: any failure surfaces as VpsApiError, missing source fields
 * surface as null — never fabricated values.
 */
export class VpsProvider {
  /**
   * Fetches and normalizes the realtime quote for a symbol.
   * Throws VpsApiError (reason NO_DATA / MALFORMED / HTTP / ...) on failure.
   */
  static async getQuote(symbol: string, options?: VpsFetchOptions): Promise<VpsNormalizedQuote> {
    const sym = assertValidSymbol(symbol);
    const payload = await fetchJson(`${VPS_QUOTE_URL}/${encodeURIComponent(sym)}`, sym, options);

    if (!Array.isArray(payload)) {
      throw new VpsApiError(`VPS quote payload is not an array for ${sym}`, 'MALFORMED');
    }
    if (payload.length === 0) {
      throw new VpsApiError(`VPS quote list is empty for ${sym}`, 'NO_DATA');
    }

    const raw = payload[0] as VpsRawQuote;
    if (typeof raw !== 'object' || raw === null) {
      throw new VpsApiError(`VPS quote entry is not an object for ${sym}`, 'MALFORMED');
    }

    const lastPrice = normalizeVpsPrice(raw.lastPrice);
    if (lastPrice === null || lastPrice <= 0) {
      throw new VpsApiError(`VPS quote has no usable lastPrice for ${sym}`, 'NO_DATA');
    }

    const referencePrice = normalizeVpsReferencePrice(raw.closePrice);
    const referenceFromR = normalizeVpsPrice(raw.r);
    // Prefer closePrice (already VND); fall back to r (kVND) — both are real source fields.
    const resolvedReference = referencePrice ?? referenceFromR;

    const change = resolvedReference !== null ? Math.round(lastPrice - resolvedReference) : null;
    const changePercent = normalizeVpsPercent(raw.changePc);

    return {
      symbol: typeof raw.sym === 'string' && raw.sym.trim() ? raw.sym.trim().toUpperCase() : sym,
      source: 'VPS',
      fetchedAt: new Date().toISOString(),
      lastPrice,
      openPrice: normalizeVpsPrice(raw.openPrice),
      highPrice: normalizeVpsPrice(raw.highPrice),
      lowPrice: normalizeVpsPrice(raw.lowPrice),
      averagePrice: normalizeVpsPrice(raw.avePrice),
      referencePrice: resolvedReference,
      ceilingPrice: normalizeVpsPrice(raw.c),
      floorPrice: normalizeVpsPrice(raw.f),
      change,
      changePercent,
      matchedVolumeShares: normalizeVpsLotVolume(raw.lot),
      foreignBuyVolumeShares: normalizeVpsLotVolume(raw.fBVol),
      foreignBuyValueVnd: normalizeVpsValueThousands(raw.fBValue),
      foreignSellVolumeShares: normalizeVpsLotVolume(raw.fSVolume),
      foreignSellValueVnd: normalizeVpsValueThousands(raw.fSValue),
      foreignRoomShares: parseVpsNumeric(raw.fRoom),
    };
  }

  /**
   * Fetches and normalizes quarterly/annual fundamentals for a symbol.
   *
   * Honesty rules:
   *   - Values are passed through as reported (statement unit: MILLION VND).
   *   - Period metadata is exposed verbatim and flagged AMBIGUOUS; nothing is
   *     labeled as the current period.
   *   - Missing rows / values become null — never fabricated.
   *   - If the source reports no numeric data at all, throws NO_DATA.
   */
  static async getFundamentals(
    symbol: string,
    options?: VpsFetchOptions
  ): Promise<VpsNormalizedFundamentals> {
    const sym = assertValidSymbol(symbol);
    const payload = await fetchJson(`${VPS_BASE_INFO_URL}/${encodeURIComponent(sym)}`, sym, options);

    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      throw new VpsApiError(`VPS base-info payload is not an object for ${sym}`, 'MALFORMED');
    }

    const raw = payload as VpsRawBaseInfo;

    const quarterly = buildSeries(raw.ketquaKDQuy, raw.candoiKTQuy, raw.chisoTCQuy);
    const annual = buildSeries(raw.ketquaKDNam, raw.candoiKTNam, raw.chisoTCNam);

    if (seriesIsEntirelyEmpty(quarterly) && seriesIsEntirelyEmpty(annual)) {
      throw new VpsApiError(`VPS base-info returned no numeric data for ${sym}`, 'NO_DATA');
    }

    return {
      symbol: typeof raw.symbol === 'string' && raw.symbol.trim() ? raw.symbol.trim().toUpperCase() : sym,
      source: 'VPS',
      fetchedAt: new Date().toISOString(),
      statementUnit: 'MILLION_VND',
      quarterly,
      annual,
      quarterlyPeriods: buildPeriodLabels(raw.ttQuy),
      annualPeriods: buildPeriodLabels(raw.ttNam),
      periodMetadata: {
        mappingStatus: 'AMBIGUOUS',
        isCurrentPeriodConfirmed: false,
        notes: [
          'Source exposes four value slots (V1..V4) without reliable period metadata.',
          'Verified 2026-09-06: ttQuy labels (e.g. "Quý 2 2021" for V1) do not align with the reported values, and ttNam (annual) provides no labels at all — the metadata appears stale.',
          'Do NOT treat slot V1 as the current period. Values are real, their period mapping is not.',
        ],
      },
      dataStatus: 'OK',
    };
  }
}
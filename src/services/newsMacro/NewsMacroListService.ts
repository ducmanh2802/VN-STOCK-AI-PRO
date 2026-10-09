/**
 * NEWS / MACRO LIST SERVICE (shared by the four list routes)
 * =========================================================
 * One canonical pipeline for GET /api/news, /api/policy-events,
 * GET /api/earnings-calendar and GET /api/macro/observations:
 *
 *   validate → read rows → canonicalize → DEDUPE → sort → paginate
 *
 * DEDUPE POLICY (all four lists share it):
 *   - Every row gets a CANONICAL KEY: a stable identity that is independent
 *     of which provider stored it. Two rows describing the same article /
 *     document / period / observation collapse to one item.
 *   - Winner = primary-source precedence (sourceTier first, then the known
 *     source name), then the newest row (larger id, then later timestamp).
 *   - The winner's own source, URL, title and timestamps are kept — a merged
 *     record never mixes fields from two different rows.
 *   - Canonical timestamps are ISO-8601 in UTC. Date-only sources (policy
 *     publicationDate, macro publicationDate) become `<date>T00:00:00.000Z`,
 *     never a locally guessed time of day.
 *
 * FAIL-CLOSED: a repository error (Postgres down, not configured, query
 * failure) is re-thrown as NewsMacroUnavailableError. Nothing is fabricated
 * and no empty-with-200 shortcut is taken; the router maps it to 503 with
 * `dataStatus: "DATA_UNAVAILABLE"` and `items: []`.
 */

import { NewsMacroRepository } from '../../lib/db/NewsMacroRepository.ts';
import type {
  EarningsEventListRow,
  MacroObservationListRow,
  NewsListRow,
  NewsMacroCursor,
  NewsMacroQuery,
  PolicyEventListRow,
} from '../../lib/db/NewsMacroRepository.ts';

export type NewsMacroKind = 'NEWS' | 'POLICY_EVENT' | 'EARNINGS_EVENT' | 'MACRO_OBSERVATION';

export interface NewsMacroListItem {
  /** Canonical dedupe key — see `canonicalKey` rules per kind. */
  readonly key: string;
  readonly kind: NewsMacroKind;
  /** Source row id (ordering / cursor tie-break only). */
  readonly id: number;
  readonly symbol: string | null;
  readonly title: string;
  readonly summary: string | null;
  readonly source: string;
  readonly sourceTier: string | null;
  /** Lower = higher precedence. Exposed so clients can audit the winner. */
  readonly sourceRank: number;
  readonly url: string | null;
  readonly canonicalTimestamp: string;
  readonly extra: Readonly<Record<string, string | number | null>>;
}

export interface NewsMacroListResult {
  readonly kind: NewsMacroKind;
  readonly items: readonly NewsMacroListItem[];
  readonly count: number;
  readonly limit: number;
  readonly nextCursor: string | null;
  readonly dataStatus: 'OK';
  readonly retrievedAt: string;
}

export interface NewsMacroListParams {
  readonly limit?: number | string | null;
  readonly symbol?: string | null;
  readonly cursor?: string | null;
  readonly metricCode?: string | null;
  readonly policyType?: string | null;
  readonly status?: string | null;
}

/** Caller error — the router answers 400 with this code. */
export class NewsMacroListError extends Error {
  readonly code: 'INVALID_LIMIT' | 'INVALID_CURSOR' | 'INVALID_FILTER';
  constructor(code: NewsMacroListError['code'], message: string) {
    super(message);
    this.name = 'NewsMacroListError';
    this.code = code;
  }
}

/** Store unavailable — the router answers 503, never an empty 200. */
export class NewsMacroUnavailableError extends Error {
  readonly code = 'DATA_UNAVAILABLE' as const;
  constructor(message = 'Data store unavailable') {
    super(message);
    this.name = 'NewsMacroUnavailableError';
  }
}

/**
 * Repository seam. `NewsMacroRepository` satisfies it structurally; tests
 * inject a fake so dedupe/precedence/pagination are verifiable offline.
 */
export interface NewsMacroDataSource {
  listNews(query: NewsMacroQuery): Promise<NewsListRow[]>;
  listPolicyEvents(query: NewsMacroQuery): Promise<PolicyEventListRow[]>;
  listEarningsCalendar(query: NewsMacroQuery): Promise<EarningsEventListRow[]>;
  listMacroObservations(query: NewsMacroQuery): Promise<MacroObservationListRow[]>;
}

export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 100;
/** Rows pulled per request — always well above `limit` so dedupe cannot masquerade as end-of-list. */
const FETCH_MULTIPLIER = 4;
const FETCH_CAP = 400;

// ---------------------------------------------------------------------------
// Source precedence
// ---------------------------------------------------------------------------

/**
 * Source tier first (that is what "primary source" means in this schema),
 * then a known source name. Unknown sources sort last — they are never
 * discarded, only ranked behind an official one.
 */
const TIER_RANK: Readonly<Record<string, number>> = {
  PRIMARY: 0,
  OFFICIAL: 0,
  REGULATOR: 0,
  STATISTICS: 0,
  SECONDARY: 1,
  TERTIARY: 2,
  AGGREGATOR: 3,
  UNKNOWN: 4,
};

const SOURCE_RANK: Readonly<Record<string, number>> = {
  SBV: 0,
  FED: 0,
  FRED: 0,
  US_TREASURY: 0,
  MOF: 0,
  GSO: 0,
  SSC: 0,
  HOSE: 0,
  HNX: 0,
  VPS: 1,
  KBS: 1,
  VIETCAP: 1,
  HSC: 1,
  CAFEF: 2,
  VIETSTOCK: 2,
  NDH: 2,
  DEFAULT: 10,
};

export function sourcePrecedence(source: string | null | undefined, tier: string | null | undefined): number {
  const tierRank = TIER_RANK[(tier ?? 'UNKNOWN').toUpperCase()] ?? TIER_RANK.UNKNOWN;
  const sourceRank = SOURCE_RANK[(source ?? '').toUpperCase()] ?? SOURCE_RANK.DEFAULT;
  return tierRank * 100 + sourceRank;
}

// ---------------------------------------------------------------------------
// Canonical identity
// ---------------------------------------------------------------------------

/** Lowercase host, drop `www.` and tracking params, drop a trailing slash. */
function canonicalUrl(raw: string): string {
  try {
    const url = new URL(raw.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const keep = [...url.searchParams.entries()]
      .filter(([k]) => !/^(utm_[a-z]+|fbclid|gclid|ref)$/i.test(k))
      .map(([k, v]) => `${k}=${v}`)
      .sort();
    const path = url.pathname.replace(/\/+$/, '');
    const query = keep.length > 0 ? `?${keep.join('&')}` : '';
    return `${host}${path}${query}`;
  } catch {
    return raw.trim().toLowerCase();
  }
}

/**
 * Diacritics are folded so the same Vietnamese headline stored by two
 * providers ("Hòa Phát…" / "Hoa Phat…") still collapses to one canonical key.
 */
function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function dateOnlyIso(date: string | null | undefined): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return `${date}T00:00:00.000Z`;
}

function isoOf(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function newsKey(row: NewsListRow, publishedIso: string): string {
  if (row.url && row.url.trim()) return `news:url:${canonicalUrl(row.url)}`;
  const day = publishedIso.slice(0, 10);
  return `news:title:${row.stockSymbol ?? '-'}:${normalizeTitle(row.title)}:${day}`;
}

function policyKey(row: PolicyEventListRow): string {
  const doc = row.documentNumber.trim();
  if (doc) return `policy:doc:${normalizeTitle(doc)}`;
  return `policy:id:${row.policyEventId}`;
}

function earningsKey(row: EarningsEventListRow): string {
  return `earnings:${row.symbol.toUpperCase()}:${row.periodId}`;
}

function macroKey(row: MacroObservationListRow): string {
  return `macro:${row.metricCode.toUpperCase()}:${row.observationDate}`;
}

// ---------------------------------------------------------------------------
// Cursor
// ---------------------------------------------------------------------------

const CURSOR_TS_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z)?$/;

export function encodeCursor(item: NewsMacroListItem): string {
  return `${item.canonicalTimestamp}#${item.id}`;
}

export function decodeCursor(raw: string | null | undefined): NewsMacroCursor | null {
  if (!raw) return null;
  const [ts, idPart] = raw.split('#');
  if (!ts || !idPart || !CURSOR_TS_PATTERN.test(ts) || !/^\d+$/.test(idPart)) {
    throw new NewsMacroListError('INVALID_CURSOR', 'cursor must be "<ISO timestamp>#<row id>".');
  }
  return { ts, id: Number(idPart) };
}

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,9}$/;
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,49}$/;

function readLimit(limit: NewsMacroListParams['limit']): number {
  if (limit === undefined || limit === null || limit === '') return DEFAULT_LIST_LIMIT;
  const n = typeof limit === 'number' ? limit : Number(limit);
  if (!Number.isInteger(n) || n < 1 || n > MAX_LIST_LIMIT) {
    throw new NewsMacroListError('INVALID_LIMIT', `limit must be an integer between 1 and ${MAX_LIST_LIMIT}.`);
  }
  return n;
}

function readFilter(value: string | null | undefined, pattern: RegExp, label: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  const upper = value.trim().toUpperCase();
  if (!pattern.test(upper)) {
    throw new NewsMacroListError('INVALID_FILTER', `${label} has an unsupported format.`);
  }
  return upper;
}

function sortItems(items: NewsMacroListItem[]): NewsMacroListItem[] {
  return [...items].sort((a, b) => {
    if (a.canonicalTimestamp !== b.canonicalTimestamp) {
      return a.canonicalTimestamp < b.canonicalTimestamp ? 1 : -1;
    }
    if (a.id !== b.id) return b.id - a.id;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
}

/** Keeps the primary-source winner; ties fall back to row id, then timestamp. */
function dedupe(items: NewsMacroListItem[]): NewsMacroListItem[] {
  const byKey = new Map<string, NewsMacroListItem>();
  for (const item of items) {
    const current = byKey.get(item.key);
    if (!current) {
      byKey.set(item.key, item);
      continue;
    }
    const beats =
      item.sourceRank < current.sourceRank ||
      (item.sourceRank === current.sourceRank &&
        (item.id > current.id ||
          (item.id === current.id && item.canonicalTimestamp > current.canonicalTimestamp)));
    if (beats) byKey.set(item.key, item);
  }
  return [...byKey.values()];
}

export class NewsMacroListService {
  constructor(private readonly source: NewsMacroDataSource) {}

  async listNews(params: NewsMacroListParams = {}): Promise<NewsMacroListResult> {
    return this.run('NEWS', params, (row) => {
      const r = row as NewsListRow;
      const ts = isoOf(r.publishedAt) ?? '1970-01-01T00:00:00.000Z';
      return {
        key: newsKey(r, ts),
        kind: 'NEWS' as const,
        id: r.id,
        symbol: r.stockSymbol,
        title: r.title,
        summary: r.summary,
        source: r.source,
        sourceTier: null,
        sourceRank: sourcePrecedence(r.source, null),
        url: r.url,
        canonicalTimestamp: ts,
        extra: { sentiment: r.sentiment },
      };
    });
  }

  async listPolicyEvents(params: NewsMacroListParams = {}): Promise<NewsMacroListResult> {
    return this.run('POLICY_EVENT', params, (row) => {
      const r = row as PolicyEventListRow;
      return {
        key: policyKey(r),
        kind: 'POLICY_EVENT' as const,
        id: r.id,
        symbol: null,
        title: r.title,
        summary: r.description,
        source: r.source,
        sourceTier: r.sourceTier,
        sourceRank: sourcePrecedence(r.source, r.sourceTier),
        url: r.sourceUrl,
        canonicalTimestamp: dateOnlyIso(r.publicationDate) ?? '1970-01-01T00:00:00.000Z',
        extra: {
          policyEventId: r.policyEventId,
          documentNumber: r.documentNumber,
          issuingAuthority: r.issuingAuthority,
          policyType: r.policyType,
          status: r.status,
          announcementDate: r.announcementDate,
          effectiveDate: r.effectiveDate,
          targetSectors: r.targetSectors,
        },
      };
    });
  }

  async listEarningsCalendar(params: NewsMacroListParams = {}): Promise<NewsMacroListResult> {
    return this.run('EARNINGS_EVENT', params, (row) => {
      const r = row as EarningsEventListRow;
      const ts = isoOf(r.publicationTimestamp) ?? isoOf(r.createdAt) ?? '1970-01-01T00:00:00.000Z';
      return {
        key: earningsKey(r),
        kind: 'EARNINGS_EVENT' as const,
        id: r.id,
        symbol: r.symbol.toUpperCase(),
        title: `${r.symbol.toUpperCase()} — ${r.periodType} ${r.periodId}`,
        summary: r.reportDate ? `Ngày báo cáo ${r.reportDate}` : null,
        source: r.source ?? 'UNKNOWN',
        sourceTier: r.sourceTier,
        sourceRank: sourcePrecedence(r.source, r.sourceTier),
        url: null,
        canonicalTimestamp: ts,
        extra: {
          periodId: r.periodId,
          periodType: r.periodType,
          fiscalYear: r.fiscalYear,
          reportDate: r.reportDate,
          status: r.status,
          freshness: r.freshness,
        },
      };
    });
  }

  async listMacroObservations(params: NewsMacroListParams = {}): Promise<NewsMacroListResult> {
    return this.run('MACRO_OBSERVATION', params, (row) => {
      const r = row as MacroObservationListRow;
      return {
        key: macroKey(r),
        kind: 'MACRO_OBSERVATION' as const,
        id: r.id,
        symbol: null,
        title: `${r.metricCode} — ${r.observationDate}`,
        summary: r.value === null ? null : `${r.value} ${r.unit}`,
        source: r.source,
        sourceTier: r.sourceTier,
        sourceRank: sourcePrecedence(r.source, r.sourceTier),
        url: null,
        canonicalTimestamp: dateOnlyIso(r.publicationDate) ?? '1970-01-01T00:00:00.000Z',
        extra: {
          metricCode: r.metricCode,
          observationDate: r.observationDate,
          value: r.value === null ? null : Number(r.value),
          unit: r.unit,
          frequency: r.frequency,
          revisionVersion: r.revisionVersion,
          validationStatus: r.validationStatus,
          freshnessStatus: r.freshnessStatus,
          periodId: r.periodId,
          notes: r.notes,
        },
      };
    });
  }

  // -------------------------------------------------------------------------

  private async run(
    kind: NewsMacroKind,
    params: NewsMacroListParams,
    canonicalize: (row: unknown) => NewsMacroListItem
  ): Promise<NewsMacroListResult> {
    const limit = readLimit(params.limit);
    const cursor = decodeCursor(params.cursor);
    const query: NewsMacroQuery = {
      limit: Math.min(limit * FETCH_MULTIPLIER, FETCH_CAP),
      cursor,
      symbol: readFilter(params.symbol, SYMBOL_PATTERN, 'symbol'),
      metricCode: readFilter(params.metricCode, CODE_PATTERN, 'metricCode'),
      policyType: readFilter(params.policyType, CODE_PATTERN, 'policyType'),
      status: readFilter(params.status, CODE_PATTERN, 'status'),
    };

    let rows: unknown[];
    try {
      rows = await this.readRows(kind, query);
    } catch (error) {
      if (error instanceof NewsMacroListError) throw error;
      throw new NewsMacroUnavailableError(
        error instanceof Error ? error.message : 'Data store unavailable'
      );
    }

    const items = sortItems(dedupe(rows.map(canonicalize)));
    const page = items.slice(0, limit);
    const hasMore = items.length > limit || rows.length === query.limit;

    return {
      kind,
      items: page,
      count: page.length,
      limit,
      nextCursor: hasMore && page.length > 0 ? encodeCursor(page[page.length - 1]) : null,
      dataStatus: 'OK',
      retrievedAt: new Date().toISOString(),
    };
  }

  private readRows(kind: NewsMacroKind, query: NewsMacroQuery): Promise<unknown[]> {
    switch (kind) {
      case 'NEWS':
        return this.source.listNews(query);
      case 'POLICY_EVENT':
        return this.source.listPolicyEvents(query);
      case 'EARNINGS_EVENT':
        return this.source.listEarningsCalendar(query);
      case 'MACRO_OBSERVATION':
        return this.source.listMacroObservations(query);
      default:
        return Promise.reject(new NewsMacroListError('INVALID_FILTER', 'Unknown list kind.'));
    }
  }
}

/** Default service bound to the real Postgres-backed repository (lazy — no connection at import). */
let defaultService: NewsMacroListService | null = null;

export function getNewsMacroListService(source?: NewsMacroDataSource): NewsMacroListService {
  if (source) return new NewsMacroListService(source);
  if (!defaultService) defaultService = new NewsMacroListService(NewsMacroRepository);
  return defaultService;
}

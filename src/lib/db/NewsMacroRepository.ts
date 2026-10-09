/**
 * NEWS / MACRO LIST REPOSITORY (shared by the four list routes)
 * ============================================================
 * READ-ONLY data access for the four list endpoints:
 *   GET /api/news
 *   GET /api/policy-events
 *   GET /api/earnings-calendar
 *   GET /api/macro/observations
 *
 * SAFETY:
 *   - Read-only. Never inserts, upserts, or fabricates rows.
 *   - No synthetic seeds, no fallback dataset. A failed query throws; the
 *     service layer converts that into an explicit DATA_UNAVAILABLE response.
 *   - The repository returns RAW persisted rows plus a `symbol` resolved from
 *     the stocks table where the row only carries a foreign key. Canonical
 *     keys, source precedence, dedupe and pagination live in the service so
 *     every list route shares exactly one policy.
 *
 * CURSOR: each list orders by (canonical timestamp DESC, id DESC). The cursor
 * is `<timestamp>#<id>` and is applied here so deep pagination stays correct
 * instead of being clipped by a fetch cap.
 */

import { and, desc, eq, sql } from 'drizzle-orm';
import type { SQL, SQLWrapper } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { earningsCalendar, macroObservations, news, policyEvents, stocks } from '../../db/schema.ts';

/** `<canonical timestamp>#<row id>` — see `encodeCursor` in the service. */
export interface NewsMacroCursor {
  readonly ts: string;
  readonly id: number;
}

export interface NewsMacroQuery {
  readonly limit: number;
  readonly cursor?: NewsMacroCursor | null;
  readonly symbol?: string | null;
  readonly metricCode?: string | null;
  readonly policyType?: string | null;
  readonly status?: string | null;
}

export interface NewsListRow {
  readonly id: number;
  readonly stockSymbol: string | null;
  readonly title: string;
  readonly source: string;
  readonly url: string | null;
  readonly summary: string | null;
  readonly sentiment: string | null;
  readonly publishedAt: Date;
}

export interface PolicyEventListRow {
  readonly id: number;
  readonly policyEventId: string;
  readonly documentNumber: string;
  readonly title: string;
  readonly description: string;
  readonly issuingAuthority: string;
  readonly policyType: string;
  readonly status: string;
  readonly targetSectors: string;
  readonly source: string;
  readonly sourceTier: string | null;
  readonly sourceUrl: string | null;
  readonly announcementDate: string;
  readonly effectiveDate: string | null;
  readonly publicationDate: string;
}

export interface EarningsEventListRow {
  readonly id: number;
  readonly symbol: string;
  readonly periodId: string;
  readonly periodType: string;
  readonly fiscalYear: number;
  readonly reportDate: string | null;
  readonly status: string;
  readonly source: string | null;
  readonly sourceTier: string | null;
  readonly publicationTimestamp: Date | null;
  readonly createdAt: Date;
  readonly freshness: string;
}

export interface MacroObservationListRow {
  readonly id: number;
  readonly metricCode: string;
  readonly observationDate: string;
  readonly publicationDate: string;
  readonly value: string | null;
  readonly unit: string;
  readonly source: string;
  readonly sourceTier: string | null;
  readonly revisionVersion: number;
  readonly frequency: string;
  readonly periodId: string | null;
  readonly validationStatus: string;
  readonly freshnessStatus: string;
  readonly notes: string | null;
}

/**
 * `(col, id)` cursor predicate: strictly older than the cursor, or the same
 * timestamp with a smaller row id — matching the ORDER BY exactly so no row
 * is skipped or repeated across pages.
 */
function cursorCondition(
  column: SQLWrapper,
  idColumn: SQLWrapper,
  cursor: NewsMacroCursor | null | undefined
): SQL | undefined {
  if (!cursor) return undefined;
  return sql`(${column} < ${cursor.ts} OR (${column} = ${cursor.ts} AND ${idColumn} < ${cursor.id}))`;
}

/**
 * Query builders are exposed separately from the executing `list*` methods so
 * the generated SQL (tables, cursor predicate, filters, LIMIT) can be asserted
 * in tests WITHOUT a live Postgres — the one verification a DB-less environment
 * can still perform on this layer.
 */
export class NewsMacroRepository {
  /** Newest news articles (optionally one symbol), ordered by publishedAt DESC, id DESC. */
  static buildNewsQuery(query: NewsMacroQuery) {
    const conditions: (SQL | undefined)[] = [
      cursorCondition(news.publishedAt, news.id, query.cursor),
      query.symbol ? eq(stocks.symbol, query.symbol) : undefined,
    ].filter(Boolean) as (SQL | undefined)[];

    return db
      .select({
        id: news.id,
        stockSymbol: stocks.symbol,
        title: news.title,
        source: news.source,
        url: news.url,
        summary: news.summary,
        sentiment: news.sentiment,
        publishedAt: news.publishedAt,
      })
      .from(news)
      .leftJoin(stocks, eq(news.stockId, stocks.id))
      .where(and(...conditions))
      .orderBy(desc(news.publishedAt), desc(news.id))
      .limit(query.limit);
  }

  static async listNews(query: NewsMacroQuery): Promise<NewsListRow[]> {
    return (await NewsMacroRepository.buildNewsQuery(query)) as NewsListRow[];
  }

  /** Newest policy documents, ordered by publicationDate DESC, id DESC. */
  static buildPolicyEventsQuery(query: NewsMacroQuery) {
    const conditions: (SQL | undefined)[] = [
      cursorCondition(policyEvents.publicationDate, policyEvents.id, query.cursor),
      query.policyType ? eq(policyEvents.policyType, query.policyType) : undefined,
      query.status ? eq(policyEvents.status, query.status) : undefined,
    ].filter(Boolean) as (SQL | undefined)[];

    return db
      .select()
      .from(policyEvents)
      .where(and(...conditions))
      .orderBy(desc(policyEvents.publicationDate), desc(policyEvents.id))
      .limit(query.limit);
  }

  static async listPolicyEvents(query: NewsMacroQuery): Promise<PolicyEventListRow[]> {
    return (await NewsMacroRepository.buildPolicyEventsQuery(query)) as unknown as PolicyEventListRow[];
  }

  /** Canonical publication expression: publicationTimestamp, else row creation. */
  static publishedExpression() {
    return sql<Date>`COALESCE(${earningsCalendar.publicationTimestamp}, ${earningsCalendar.createdAt})`;
  }

  /**
   * Newest earnings-calendar entries, ordered by canonical publication
   * timestamp (publicationTimestamp, else row creation) DESC, id DESC.
   */
  static buildEarningsCalendarQuery(query: NewsMacroQuery) {
    const published = NewsMacroRepository.publishedExpression();
    const conditions: (SQL | undefined)[] = [
      cursorCondition(published, earningsCalendar.id, query.cursor),
      query.symbol ? eq(earningsCalendar.symbol, query.symbol) : undefined,
      query.status ? eq(earningsCalendar.status, query.status) : undefined,
    ].filter(Boolean) as (SQL | undefined)[];

    return db
      .select()
      .from(earningsCalendar)
      .where(and(...conditions))
      .orderBy(desc(published), desc(earningsCalendar.id))
      .limit(query.limit);
  }

  static async listEarningsCalendar(query: NewsMacroQuery): Promise<EarningsEventListRow[]> {
    return (await NewsMacroRepository.buildEarningsCalendarQuery(query)) as unknown as EarningsEventListRow[];
  }

  /** Newest macro observations, ordered by publicationDate DESC, id DESC. */
  static buildMacroObservationsQuery(query: NewsMacroQuery) {
    const conditions: (SQL | undefined)[] = [
      cursorCondition(macroObservations.publicationDate, macroObservations.id, query.cursor),
      query.metricCode ? eq(macroObservations.metricCode, query.metricCode.toUpperCase()) : undefined,
    ].filter(Boolean) as (SQL | undefined)[];

    return db
      .select()
      .from(macroObservations)
      .where(and(...conditions))
      .orderBy(desc(macroObservations.publicationDate), desc(macroObservations.id))
      .limit(query.limit);
  }

  static async listMacroObservations(query: NewsMacroQuery): Promise<MacroObservationListRow[]> {
    return (await NewsMacroRepository.buildMacroObservationsQuery(
      query
    )) as unknown as MacroObservationListRow[];
  }
}

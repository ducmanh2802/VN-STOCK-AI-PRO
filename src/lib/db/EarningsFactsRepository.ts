/**
 * PHASE 24 — EARNINGS FACTS REPOSITORY
 * ====================================
 * Append-only persistence for versioned financial facts and the earnings
 * calendar.
 *
 * SAFETY: unlike the legacy `financial_statements` upsert (which overwrites by
 * (stockId, year, quarter, statementType)), this repository NEVER overwrites or
 * deletes history. Duplicate filings are ignored via `onConflictDoNothing`;
 * amended/restated filings are inserted as NEW rows with a new reportId.
 */

import { and, asc, desc, eq } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { financialFactsV2, earningsCalendar } from '../../db/schema.ts';

export type FinancialFactV2Row = InferSelectModel<typeof financialFactsV2>;
export type NewFinancialFactV2Row = InferInsertModel<typeof financialFactsV2>;
export type EarningsCalendarRow = InferSelectModel<typeof earningsCalendar>;
export type NewEarningsCalendarRow = InferInsertModel<typeof earningsCalendar>;

export class EarningsFactsRepository {
  /**
   * Appends a fact. Returns the inserted row, or null when the exact filing
   * already exists (duplicate). Never updates existing rows.
   */
  static async appendFact(record: NewFinancialFactV2Row): Promise<FinancialFactV2Row | null> {
    const inserted = await db
      .insert(financialFactsV2)
      .values(record)
      .onConflictDoNothing({
        target: [
          financialFactsV2.symbol,
          financialFactsV2.statementType,
          financialFactsV2.reportType,
          financialFactsV2.periodId,
          financialFactsV2.metric,
          financialFactsV2.source,
          financialFactsV2.reportId,
          financialFactsV2.publicationDate,
        ],
      })
      .returning();
    return inserted[0] ?? null;
  }

  /** All versions of a logical fact, newest first (append-only history). */
  static async getVersions(
    symbol: string,
    statementType: string,
    reportType: string,
    periodId: string,
    metric?: string
  ): Promise<FinancialFactV2Row[]> {
    const conditions = [
      eq(financialFactsV2.symbol, symbol.toUpperCase()),
      eq(financialFactsV2.statementType, statementType),
      eq(financialFactsV2.reportType, reportType),
      eq(financialFactsV2.periodId, periodId),
    ];
    if (metric) conditions.push(eq(financialFactsV2.metric, metric));

    return db
      .select()
      .from(financialFactsV2)
      .where(and(...conditions))
      .orderBy(desc(financialFactsV2.restatementVersion), desc(financialFactsV2.publicationDate));
  }

  /** Upserts an earnings-calendar row (date/status may legitimately be amended). */
  static async upsertCalendar(record: NewEarningsCalendarRow): Promise<EarningsCalendarRow> {
    const rows = await db
      .insert(earningsCalendar)
      .values(record)
      .onConflictDoUpdate({
        target: [earningsCalendar.symbol, earningsCalendar.periodId, earningsCalendar.source],
        set: {
          reportDate: record.reportDate,
          status: record.status,
          freshness: record.freshness,
          publicationTimestamp: record.publicationTimestamp,
          reasonCode: record.reasonCode,
        },
      })
      .returning();
    return rows[0];
  }

  /** Retrieves the earnings calendar for a symbol, earliest report date first. */
  static async getCalendar(symbol: string): Promise<EarningsCalendarRow[]> {
    return db
      .select()
      .from(earningsCalendar)
      .where(eq(earningsCalendar.symbol, symbol.toUpperCase()))
      // Fail-closed contract (P24-D4): earliest report date first; rows without
      // a report date sort last (PostgreSQL ASC default is NULLS LAST).
      .orderBy(asc(earningsCalendar.reportDate));
  }
}

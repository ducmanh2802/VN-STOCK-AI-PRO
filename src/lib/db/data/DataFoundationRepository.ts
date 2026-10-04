/**
 * DATA FOUNDATION REPOSITORIES
 * =============================
 * Instrument registry (upsert on instrument_id, PIT reads) +
 * corporate-action events (append-only on event_id).
 * Mirrors EarningsFactsRepository/MacroRepository conventions:
 * unique indexes + onConflictDoNothing (never overwrite).
 */
import { and, lte, sql } from 'drizzle-orm';
import { db } from '../../../db/index.ts';
import { corporateActionEvents, instruments } from '../../../db/schema.ts';
import type { CorporateActionRecord, InstrumentIdentity } from '../../data/index.ts';

function toInstrumentRow(i: InstrumentIdentity) {
  return {
    instrumentId: i.instrumentId,
    symbol: i.symbol,
    exchange: i.exchange,
    assetClass: i.assetClass,
    currency: i.currency,
    country: i.country,
    sector: i.sector ?? null,
    industry: i.industry ?? null,
    status: i.status,
    validFrom: i.validFrom,
    validTo: i.validTo,
    isin: i.isin ?? null,
    previousSymbols: JSON.stringify(i.previousSymbols ?? []),
  };
}

function fromInstrumentRow(r: typeof instruments.$inferSelect): InstrumentIdentity {
  let prev: string[] = [];
  try {
    const parsed: unknown = JSON.parse(r.previousSymbols ?? '[]');
    if (Array.isArray(parsed)) prev = parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    prev = [];
  }
  return {
    instrumentId: r.instrumentId,
    symbol: r.symbol,
    exchange: r.exchange as InstrumentIdentity['exchange'],
    assetClass: r.assetClass as InstrumentIdentity['assetClass'],
    currency: 'VND',
    country: 'VN',
    sector: r.sector,
    industry: r.industry,
    status: r.status as InstrumentIdentity['status'],
    validFrom: r.validFrom,
    validTo: r.validTo,
    isin: r.isin,
    previousSymbols: prev,
  };
}

export class InstrumentRepository {
  static async upsert(list: readonly InstrumentIdentity[]): Promise<void> {
    if (!db) return;
    for (const i of list) {
      await db
        .insert(instruments)
        .values(toInstrumentRow(i))
        .onConflictDoNothing({ target: instruments.instrumentId });
    }
  }

  static async getAsOf(instrumentId: string, asOf: string): Promise<InstrumentIdentity | null> {
    if (!db) return null;
    const rows = await db
      .select()
      .from(instruments)
      .where(
        and(
          sql`${instruments.instrumentId} = ${instrumentId}`,
          lte(instruments.validFrom, asOf)
        )
      );
    const eligible = rows.filter((r) => !r.validTo || asOf <= (r.validTo as string));
    eligible.sort((a, b) => ((a.validFrom as string) < (b.validFrom as string) ? 1 : -1));
    const top = eligible[0];
    return top ? fromInstrumentRow(top) : null;
  }
}

function toCorporateActionRow(e: CorporateActionRecord) {
  return {
    eventId: e.eventId,
    instrumentId: e.instrumentId,
    kind: e.kind,
    status: e.status,
    announcementDate: e.announcementDate,
    recordDate: e.recordDate,
    exDate: e.exDate,
    paymentDate: e.paymentDate,
    effectiveDate: e.effectiveDate,
    ratioOld: e.ratioOld !== null && e.ratioOld !== undefined ? String(e.ratioOld) : null,
    ratioNew: e.ratioNew !== null && e.ratioNew !== undefined ? String(e.ratioNew) : null,
    cashAmountVnd: e.cashAmountVnd !== null && e.cashAmountVnd !== undefined ? String(e.cashAmountVnd) : null,
    issuePriceVnd: e.issuePriceVnd !== null && e.issuePriceVnd !== undefined ? String(e.issuePriceVnd) : null,
    symbolChangeFrom: e.symbolChangeFrom,
    symbolChangeTo: e.symbolChangeTo,
    source: e.source,
    sourceTier: e.sourceTier,
    dataVersion: e.dataVersion,
  };
}

export class CorporateActionEventRepository {
  static async append(events: readonly CorporateActionRecord[]): Promise<void> {
    if (!db) return;
    for (const e of events) {
      await db
        .insert(corporateActionEvents)
        .values(toCorporateActionRow(e))
        .onConflictDoNothing({ target: corporateActionEvents.eventId });
    }
  }
}

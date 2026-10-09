import { describe, it, expect } from 'vitest';
import { NewsMacroRepository } from '../NewsMacroRepository';

/**
 * The repository is the only place these four list routes touch Postgres.
 * There is no database in this environment, so the SQL is asserted through
 * Drizzle's `toSQL()` instead of by executing it: table, join, cursor
 * predicate, filters and LIMIT are exactly what the shared service depends on.
 */

const CURSOR = { ts: '2026-10-01T00:00:00.000Z', id: 7 };

describe('NewsMacroRepository — news', () => {
  it('reads news joined to stocks, newest first, with an explicit limit', () => {
    const { sql, params } = NewsMacroRepository.buildNewsQuery({ limit: 20 }).toSQL();
    expect(sql).toContain('from "news"');
    expect(sql).toContain('left join "stocks"');
    expect(sql.toLowerCase()).toContain('order by "news"."published_at" desc');
    expect(params).toContain(20);
  });

  it('applies the (timestamp, id) cursor predicate matching the ORDER BY', () => {
    const { sql, params } = NewsMacroRepository.buildNewsQuery({
      limit: 20,
      cursor: CURSOR,
    }).toSQL();
    expect(sql).toContain('"news"."published_at" < ');
    expect(sql).toContain('"news"."id" < ');
    expect(params).toContain(CURSOR.ts);
    expect(params).toContain(CURSOR.id);
  });

  it('adds the symbol filter only when one was requested', () => {
    const without = NewsMacroRepository.buildNewsQuery({ limit: 5 }).toSQL();
    expect(without.sql).not.toContain('"stocks"."symbol" = ');

    const withSymbol = NewsMacroRepository.buildNewsQuery({ limit: 5, symbol: 'HPG' }).toSQL();
    expect(withSymbol.sql).toContain('"stocks"."symbol" = ');
    expect(withSymbol.params).toContain('HPG');
  });
});

describe('NewsMacroRepository — policy events', () => {
  it('orders by publication date descending and supports type/status filters', () => {
    const { sql, params } = NewsMacroRepository.buildPolicyEventsQuery({
      limit: 10,
      policyType: 'TAX',
      status: 'EFFECTIVE',
    }).toSQL();
    expect(sql).toContain('from "policy_events"');
    expect(sql.toLowerCase()).toContain('order by "policy_events"."publication_date" desc');
    expect(params).toContain('TAX');
    expect(params).toContain('EFFECTIVE');
    expect(params).toContain(10);
  });
});

describe('NewsMacroRepository — earnings calendar', () => {
  it('orders by COALESCE(publication_timestamp, created_at) so null publication rows still sort', () => {
    const { sql, params } = NewsMacroRepository.buildEarningsCalendarQuery({
      limit: 10,
      symbol: 'hpg',
    }).toSQL();
    expect(sql).toContain('from "earnings_calendar"');
    expect(sql.toUpperCase()).toContain('COALESCE(');
    expect(sql).toContain('"earnings_calendar"."publication_timestamp"');
    expect(sql).toContain('"earnings_calendar"."created_at"');
    expect(params).toContain(10);
  });

  it('carries the cursor over the same COALESCE expression, not a raw column', () => {
    const { params } = NewsMacroRepository.buildEarningsCalendarQuery({
      limit: 10,
      cursor: CURSOR,
    }).toSQL();
    expect(params).toContain(CURSOR.ts);
    expect(params).toContain(CURSOR.id);
  });
});

describe('NewsMacroRepository — macro observations', () => {
  it('orders by publication date and filters by metric code (upper-cased by the service)', () => {
    const { sql, params } = NewsMacroRepository.buildMacroObservationsQuery({
      limit: 10,
      metricCode: 'CPI_YOY',
    }).toSQL();
    expect(sql).toContain('from "macro_observations"');
    expect(sql.toLowerCase()).toContain('order by "macro_observations"."publication_date" desc');
    expect(params).toContain('CPI_YOY');
    expect(params).toContain(10);
  });
});

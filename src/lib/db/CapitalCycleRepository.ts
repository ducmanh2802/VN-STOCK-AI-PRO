/**
 * PHASE 26 — CAPITAL CYCLE & POLICY REPOSITORY
 * ============================================
 * READ-ONLY persistence access for the Phase 26 tables and the TTM revenue
 * bridge into Phase 24 `financial_facts_v2`.
 *
 * SAFETY:
 *   - Read-only. Never inserts, upserts, or fabricates rows.
 *   - No synthetic seeds, no fallbacks, no default "canonical" datasets.
 *   - Callers receive raw persisted rows (or empty arrays); mapping to the
 *     Phase 26 domain contracts and all fail-closed decisions live in the
 *     service/provider layer so provenance stays traceable.
 */

import { and, desc, eq, inArray, isNotNull, lte } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  policyEvents,
  strategicProjects,
  projectBeneficiaries,
  legalGovernanceEvents,
  financialFactsV2,
} from '../../db/schema.ts';

export type PolicyEventRow = InferSelectModel<typeof policyEvents>;
export type StrategicProjectRow = InferSelectModel<typeof strategicProjects>;
export type ProjectBeneficiaryRow = InferSelectModel<typeof projectBeneficiaries>;
export type LegalGovernanceEventRow = InferSelectModel<typeof legalGovernanceEvents>;
type FinancialFactV2Row = InferSelectModel<typeof financialFactsV2>;

/** Canonical Phase-24 income-statement revenue metric aliases. */
const REVENUE_METRIC_ALIASES = ['NET_REVENUE', 'REVENUE'] as const;

/** Converts a Postgres numeric cell (string) to a finite number, else null. */
function num(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export class CapitalCycleRepository {
  /** Policies whose publication date is available at or before `asOfDate`. */
  static async getPolicyEvents(asOfDate: string): Promise<PolicyEventRow[]> {
    return db
      .select()
      .from(policyEvents)
      .where(lte(policyEvents.publicationDate, asOfDate))
      .orderBy(desc(policyEvents.announcementDate));
  }

  /** Strategic projects whose publication date is available at or before `asOfDate`. */
  static async getStrategicProjects(asOfDate: string): Promise<StrategicProjectRow[]> {
    return db
      .select()
      .from(strategicProjects)
      .where(lte(strategicProjects.publicationDate, asOfDate))
      .orderBy(desc(strategicProjects.publicationDate));
  }

  /** Beneficiary relationships whose publication date is available at or before `asOfDate`. */
  static async getBeneficiaries(asOfDate: string): Promise<ProjectBeneficiaryRow[]> {
    return db
      .select()
      .from(projectBeneficiaries)
      .where(lte(projectBeneficiaries.publicationDate, asOfDate))
      .orderBy(desc(projectBeneficiaries.awardDate));
  }

  /** Governance events whose publication date is available at or before `asOfDate`. */
  static async getGovernanceEvents(asOfDate: string): Promise<LegalGovernanceEventRow[]> {
    return db
      .select()
      .from(legalGovernanceEvents)
      .where(lte(legalGovernanceEvents.publicationDate, asOfDate))
      .orderBy(desc(legalGovernanceEvents.eventDate));
  }

  /**
   * Trailing-twelve-month revenue for a symbol, computed ONLY from facts whose
   * publication date is at or before `asOfDate` (lookahead-safe).
   *
   * Fail-closed: returns null unless a directly reported TTM fact exists or all
   * four most recent quarters are available as finite values. Partial data is
   * never annualised or extrapolated.
   */
  static async getTtmRevenue(symbol: string, asOfDate: string): Promise<number | null> {
    const rows = await db
      .select()
      .from(financialFactsV2)
      .where(
        and(
          eq(financialFactsV2.symbol, symbol.toUpperCase()),
          eq(financialFactsV2.statementType, 'INCOME_STATEMENT'),
          inArray(financialFactsV2.metric, [...REVENUE_METRIC_ALIASES]),
          isNotNull(financialFactsV2.publicationDate),
          lte(financialFactsV2.publicationDate, asOfDate)
        )
      )
      .orderBy(desc(financialFactsV2.periodEnd));

    if (rows.length === 0) return null;

    // 1. Prefer a directly reported TTM fact.
    const ttm = rows.find((r) => /^TTM/i.test(r.periodId) && num(r.value) !== null);
    if (ttm) return num(ttm.value);

    // 2. Otherwise sum the four most recent distinct quarters (latest version wins).
    const byPeriod = new Map<string, FinancialFactV2Row>();
    for (const r of rows) {
      if (r.quarter === null) continue;
      const prev = byPeriod.get(r.periodId);
      if (
        !prev ||
        r.restatementVersion > prev.restatementVersion ||
        (r.restatementVersion === prev.restatementVersion &&
          String(r.publicationDate) > String(prev.publicationDate))
      ) {
        byPeriod.set(r.periodId, r);
      }
    }
    const quarters = Array.from(byPeriod.values())
      .sort((a, b) => (String(a.periodEnd) < String(b.periodEnd) ? 1 : -1))
      .slice(0, 4);
    if (quarters.length < 4) return null;

    let total = 0;
    for (const q of quarters) {
      const v = num(q.value);
      if (v === null) return null;
      total += v;
    }
    return Number.isFinite(total) ? total : null;
  }
}

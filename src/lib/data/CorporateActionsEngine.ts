/**
 * DATA-02 — CORPORATE ACTION VALIDATION + ADJUSTMENT
 * ==================================================
 * Independent corporate-action representation; raw bars stay immutable.
 * Adjustment modes explicit: RAW | ADJUSTED (TOTAL_RETURN/PRICE_RETURN reserved,
 * NOT implemented — unsupported semantics must not be invented).
 *
 * Adjustment math reuses the Phase 23 canonical formula (never rewritten):
 *   P_ex = (P_prev - C + I * P_issue) / (1 + S + B + I)
 *   split: P_ex = P_prev * old/new; OTM rights (P_issue >= P_prev) -> I = 0.
 *   k = P_ex / P_prev; K_tau = prod_{t > tau}(k); P_adj = P_raw * K; V_adj = round(V_raw / K).
 */

import type { CanonicalBar, CorporateActionRecord, AdjustmentMode } from './types.ts';

export interface CorporateActionIssue {
  readonly eventId: string;
  readonly code: string;
  readonly detail: string;
}

export class CorporateActionValidator {
  static validate(
    events: readonly CorporateActionRecord[]
  ): { readonly valid: readonly CorporateActionRecord[]; readonly issues: readonly CorporateActionIssue[] } {
    const valid: CorporateActionRecord[] = [];
    const issues: CorporateActionIssue[] = [];
    const seen = new Set<string>();
    const push = (e: CorporateActionRecord, code: string, detail: string) =>
      issues.push({ eventId: e.eventId, code, detail });

    const byInstrument = new Map<string, CorporateActionRecord[]>();
    for (const e of events) {
      let failed = false;
      const dupKey = `${e.instrumentId}|${e.kind}|${e.exDate ?? ''}|${e.ratioOld ?? ''}|${e.ratioNew ?? ''}|${e.cashAmountVnd ?? ''}`;
      if (seen.has(dupKey)) {
        push(e, 'DUPLICATE_EVENT', 'identical instrument+kind+exDate+terms already seen');
        failed = true;
      } else {
        seen.add(dupKey);
      }
      if (!e.eventId) {
        push(e, 'MISSING_EVENT_ID', 'eventId required');
        failed = true;
      }
      const dates = [e.announcementDate, e.recordDate, e.exDate, e.paymentDate, e.effectiveDate].filter(
        (d): d is string => !!d
      );
      for (const d of dates) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
          push(e, 'IMPOSSIBLE_DATE', `malformed date ${d}`);
          failed = true;
        }
      }
      if (e.announcementDate && e.exDate && e.announcementDate > e.exDate) {
        push(e, 'IMPOSSIBLE_DATES', 'announcementDate after exDate');
        failed = true;
      }
      if (e.exDate && e.recordDate && e.exDate >= e.recordDate) {
        push(e, 'IMPOSSIBLE_DATES', 'exDate must precede recordDate (T+2)');
        failed = true;
      }
      if (
        e.kind === 'CASH_DIVIDEND' || e.kind === 'DIVIDEND'
      ) {
        if (e.cashAmountVnd === null || e.cashAmountVnd === undefined) {
          push(e, 'MISSING_REQUIRED_DATE_OR_VALUE', 'cash dividend requires cashAmountVnd');
          failed = true;
        } else if (!(e.cashAmountVnd > 0)) {
          push(e, 'NEGATIVE_DIVIDEND', 'cashAmountVnd must be > 0');
          failed = true;
        }
      }
      if (
        e.kind === 'STOCK_SPLIT' || e.kind === 'REVERSE_SPLIT' ||
        e.kind === 'STOCK_DIVIDEND' || e.kind === 'BONUS' || e.kind === 'RIGHTS_ISSUE'
      ) {
        if (e.ratioOld === null || e.ratioNew === null || e.ratioOld === undefined || e.ratioNew === undefined) {
          push(e, 'MISSING_REQUIRED_DATE_OR_VALUE', 'ratio action requires ratioOld+ratioNew');
          failed = true;
        } else if (!(e.ratioOld > 0 && e.ratioNew > 0)) {
          push(e, 'INVALID_SPLIT_RATIO', 'ratios must be > 0');
          failed = true;
        }
      }
      if (e.kind === 'SYMBOL_CHANGE' && (!e.symbolChangeFrom || !e.symbolChangeTo)) {
        push(e, 'MISSING_REQUIRED_DATE_OR_VALUE', 'symbol change requires from+to');
        failed = true;
      }
      if (e.sourceTier === 'TIER_4_UNVERIFIED') {
        push(e, 'UNVERIFIED_SOURCE', 'TIER_4 excluded from models');
        failed = true;
      }
      if (!failed) {
        valid.push(e);
        const arr = byInstrument.get(e.instrumentId) ?? [];
        arr.push(e);
        byInstrument.set(e.instrumentId, arr);
      }
    }

    for (const [instrumentId, arr] of byInstrument) {
      const withEx = arr.filter((a) => a.exDate).sort((a, b) => (a.exDate! < b.exDate! ? -1 : 1));
      for (let i = 1; i < withEx.length; i += 1) {
        if (withEx[i].exDate === withEx[i - 1].exDate && withEx[i].kind === withEx[i - 1].kind) {
          issues.push({
            eventId: withEx[i].eventId,
            code: 'OVERLAPPING_EVENTS',
            detail: `same-kind events share exDate ${withEx[i].exDate} on ${instrumentId}`,
          });
        }
      }
      const symChanges = arr.filter((a) => a.kind === 'SYMBOL_CHANGE');
      for (let i = 1; i < symChanges.length; i += 1) {
        if (symChanges[i].symbolChangeFrom !== symChanges[i - 1].symbolChangeTo) {
          issues.push({
            eventId: symChanges[i].eventId,
            code: 'CONFLICTING_SYMBOL_CHANGE',
            detail: `chain break on ${instrumentId}`,
          });
        }
      }
    }
    return { valid, issues };
  }
}

export interface AdjustmentFactor {
  readonly exDate: string;
  readonly factor: number;
}

export class AdjustmentEngine {
  static factorForEvent(
    e: CorporateActionRecord,
    prevClose: number
  ): number | null {
    if (!(prevClose > 0)) return null;
    if (e.status === 'CANCELLED') return null;
    if (e.kind === 'STOCK_SPLIT' || e.kind === 'REVERSE_SPLIT') {
      if (!e.ratioOld || !e.ratioNew || e.ratioOld <= 0 || e.ratioNew <= 0) return null;
      return e.ratioOld / e.ratioNew;
    }
    if (
      e.kind === 'CASH_DIVIDEND' || e.kind === 'DIVIDEND' || e.kind === 'STOCK_DIVIDEND' ||
      e.kind === 'BONUS' || e.kind === 'RIGHTS_ISSUE' || e.kind === 'MERGER' || e.kind === 'DEMERGER'
    ) {
      const C = e.kind === 'CASH_DIVIDEND' || e.kind === 'DIVIDEND' ? (e.cashAmountVnd ?? 0) : 0;
      const S = e.kind === 'STOCK_DIVIDEND' && e.ratioOld && e.ratioNew
        ? e.ratioNew / e.ratioOld
        : 0;
      const B = e.kind === 'BONUS' && e.ratioOld && e.ratioNew ? e.ratioNew / e.ratioOld : 0;
      let I = e.kind === 'RIGHTS_ISSUE' && e.ratioOld && e.ratioNew ? e.ratioNew / e.ratioOld : 0;
      const P_issue = e.issuePriceVnd ?? 0;
      if (e.kind === 'RIGHTS_ISSUE' && P_issue >= prevClose) I = 0;
      const pEx = (prevClose - C + I * P_issue) / (1 + S + B + I);
      if (!Number.isFinite(pEx) || pEx <= 0) return null;
      return pEx / prevClose;
    }
    return 1;
  }

  static adjust(
    bars: readonly CanonicalBar[],
    events: readonly CorporateActionRecord[],
    prevCloses: Readonly<Record<string, number>>,
    mode: AdjustmentMode
  ): readonly CanonicalBar[] {
    if (mode === 'RAW') return [...bars];
    const factors: AdjustmentFactor[] = [];
    for (const e of events) {
      if (!e.exDate) continue;
      const prev = prevCloses[e.exDate];
      if (!(prev > 0)) continue;
      const k = AdjustmentEngine.factorForEvent(e, prev);
      if (k === null || !Number.isFinite(k) || k <= 0) continue;
      factors.push({ exDate: e.exDate, factor: k });
    }
    factors.sort((a, b) => (a.exDate < b.exDate ? -1 : 1));
    return bars.map((bar) => {
      let K = 1;
      for (const f of factors) {
        if (f.exDate > bar.date) K *= f.factor;
      }
      if (K === 1) return bar;
      return {
        ...bar,
        open: bar.open * K,
        high: bar.high * K,
        low: bar.low * K,
        close: bar.close * K,
        volume: Math.round(bar.volume / K),
      };
    });
  }
}

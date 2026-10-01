/**
 * PHASE 23 — CORPORATE ACTIONS HISTORICAL ADJUSTMENT ENGINE
 * ==========================================================
 * Computes exact ex-right reference prices and cumulative backward adjustment factors (K_t).
 *
 * CANONICAL RULES (HOSE / HNX / VSDC):
 * 1. Reference Price Formula on Ex-Right Date (Ngày GDKHQ):
 *    P_ex = (P_prev - C + I * P_issue) / (1 + S + B + I)
 *    Where:
 *      P_prev:   Closing price on session immediately preceding the Ex-Date.
 *      C:        Cash dividend in VND per share.
 *      S:        Stock dividend ratio (newShares / oldShares).
 *      B:        Bonus shares ratio (newShares / oldShares).
 *      I:        Rights issue ratio (newShares / oldShares).
 *      P_issue:  Subscription price for rights issue in VND.
 *
 * 2. OTM Rights Safety Invariant:
 *    If P_issue >= P_prev (Rights are At-the-Money or Out-of-the-Money),
 *    the rights issue provides no price discount relative to the open market.
 *    Under HOSE/HNX regulations, no dilution factor is applied for OTM rights (I = 0 in adjustment, k_t = 1.0).
 *
 * 3. Stock Split / Reverse Split:
 *    P_ex = P_prev * (oldShares / newShares) -> k_t = oldShares / newShares.
 *
 * 4. Backward Adjustment Multiplier:
 *    k_t = P_ex / P_prev
 *    Cumulative factor for any historical bar at date tau prior to ex-dates:
 *    K_tau = Product_{t > tau} (k_t)
 *    P_adj = P_raw * K_tau
 *    V_adj = round(V_raw / K_tau)
 *
 * 5. Non-Destructive Invariant:
 *    Raw KBS OHLCV bars are strictly immutable. Returns new AdjustedPriceBar[] objects.
 */

import type { CandlePoint } from '../indicators/types.ts';
import type {
  CorporateAction,
  CorporateActionAdjustmentFactor,
  AdjustedPriceBar,
} from './types.ts';

export interface ExReferencePriceInput {
  prevClose: number;
  cashAmountVnd?: number | null;
  stockDividendRatio?: number | null;
  bonusRatio?: number | null;
  rightsRatio?: number | null;
  issuePriceVnd?: number | null;
}

export interface ExReferencePriceResult {
  exReferencePrice: number;
  prevClose: number;
  factor: number;                   // Multiplier k_t = P_ex / P_prev
  inverseFactor: number;            // Volume multiplier 1 / k_t
  isOtmRightsSuppressed: boolean;
  formulaDescription: string;
}

export class CorporateActionAdjustmentEngine {
  /**
   * Computes the official ex-right reference price and single-event adjustment factor.
   */
  public static calculateExReferencePrice(input: ExReferencePriceInput): ExReferencePriceResult {
    const { prevClose } = input;

    if (!Number.isFinite(prevClose) || prevClose <= 0) {
      throw new Error(`Invalid prevClose: "${prevClose}". Must be a positive finite number.`);
    }

    const c = input.cashAmountVnd !== undefined && input.cashAmountVnd !== null ? input.cashAmountVnd : 0;
    if (!Number.isFinite(c) || c < 0) {
      throw new Error(`Invalid cashAmountVnd: "${c}". Cannot be negative.`);
    }

    const s = input.stockDividendRatio !== undefined && input.stockDividendRatio !== null ? input.stockDividendRatio : 0;
    if (!Number.isFinite(s) || s < 0) {
      throw new Error(`Invalid stockDividendRatio: "${s}". Cannot be negative.`);
    }

    const b = input.bonusRatio !== undefined && input.bonusRatio !== null ? input.bonusRatio : 0;
    if (!Number.isFinite(b) || b < 0) {
      throw new Error(`Invalid bonusRatio: "${b}". Cannot be negative.`);
    }

    let i = input.rightsRatio !== undefined && input.rightsRatio !== null ? input.rightsRatio : 0;
    if (!Number.isFinite(i) || i < 0) {
      throw new Error(`Invalid rightsRatio: "${i}". Cannot be negative.`);
    }

    const pIssue = input.issuePriceVnd !== undefined && input.issuePriceVnd !== null ? input.issuePriceVnd : 0;
    if (!Number.isFinite(pIssue) || pIssue < 0) {
      throw new Error(`Invalid issuePriceVnd: "${pIssue}". Cannot be negative.`);
    }

    // OTM Rights Check:
    // If rights issue subscription price >= prevClose, exercising rights confers no discount.
    // Under HOSE/HNX trading rules, rights component does not reduce reference price.
    let isOtmRightsSuppressed = false;
    if (i > 0 && pIssue >= prevClose) {
      isOtmRightsSuppressed = true;
      i = 0; // Suppress rights dilution factor
    }

    const denominator = 1 + s + b + i;
    if (denominator <= 0) {
      throw new Error(`Invalid denominator in reference price calculation: ${denominator}.`);
    }

    const numerator = prevClose - c + (i * pIssue);
    if (numerator <= 0) {
      throw new Error(
        `Invalid numerator in reference price calculation: ${numerator} (cash dividend exceeds price).`
      );
    }

    const exReferencePrice = numerator / denominator;
    const factor = exReferencePrice / prevClose;
    const inverseFactor = 1 / factor;

    const formulaDescription = isOtmRightsSuppressed
      ? `(P_prev - C) / (1 + S + B) [OTM Rights Suppressed: issuePrice ${pIssue} >= prevClose ${prevClose}]`
      : `(P_prev - C + I * P_issue) / (1 + S + B + I)`;

    return {
      exReferencePrice: Number(exReferencePrice.toFixed(4)),
      prevClose,
      factor: Number(factor.toFixed(6)),
      inverseFactor: Number(inverseFactor.toFixed(6)),
      isOtmRightsSuppressed,
      formulaDescription,
    };
  }

  /**
   * Generates single-event adjustment factor for a given corporate action.
   */
  public static computeActionAdjustmentFactor(
    action: CorporateAction,
    prevClosePrice: number
  ): CorporateActionAdjustmentFactor | null {
    // Cancelled actions do not adjust prices
    if (action.status === 'CANCELLED') {
      return null;
    }

    // Informational governance events do not adjust prices
    if (action.actionType === 'SHAREHOLDER_MEETING' || action.actionType === 'WRITTEN_CONSULTATION') {
      return {
        exDate: action.dates.exDate,
        actionId: action.id,
        actionType: action.actionType,
        factor: 1.0,
        inverseFactor: 1.0,
        prevClosePrice,
        exReferencePrice: prevClosePrice,
        formulaApplied: 'NO_ADJUSTMENT (Governance Event)',
      };
    }

    if (action.actionType === 'STOCK_SPLIT' || action.actionType === 'REVERSE_SPLIT') {
      if (!action.ratio || action.ratio.newShares <= 0 || action.ratio.oldShares <= 0) {
        throw new Error(`Missing or invalid ratio for ${action.actionType}: ${action.id}`);
      }
      const factor = action.ratio.oldShares / action.ratio.newShares;
      const exRef = prevClosePrice * factor;
      return {
        exDate: action.dates.exDate,
        actionId: action.id,
        actionType: action.actionType,
        factor: Number(factor.toFixed(6)),
        inverseFactor: Number((1 / factor).toFixed(6)),
        prevClosePrice,
        exReferencePrice: Number(exRef.toFixed(4)),
        formulaApplied: `P_prev * (oldShares / newShares) [${action.actionType}]`,
      };
    }

    // Cash, Stock, Bonus, Rights
    const res = this.calculateExReferencePrice({
      prevClose: prevClosePrice,
      cashAmountVnd: action.actionType === 'CASH_DIVIDEND' ? action.cashAmountVnd : null,
      stockDividendRatio: action.actionType === 'STOCK_DIVIDEND' ? action.ratio?.ratioDecimal : null,
      bonusRatio: action.actionType === 'BONUS_ISSUE' ? action.ratio?.ratioDecimal : null,
      rightsRatio: action.actionType === 'RIGHTS_ISSUE' ? action.ratio?.ratioDecimal : null,
      issuePriceVnd: action.actionType === 'RIGHTS_ISSUE' ? action.issuePriceVnd : null,
    });

    return {
      exDate: action.dates.exDate,
      actionId: action.id,
      actionType: action.actionType,
      factor: res.factor,
      inverseFactor: res.inverseFactor,
      prevClosePrice,
      exReferencePrice: res.exReferencePrice,
      formulaApplied: res.formulaDescription,
    };
  }

  /**
   * Adjusts historical price series backward using cumulative adjustment factors.
   * STRICTLY NON-DESTRUCTIVE: Input bars array is never mutated.
   */
  public static adjustPriceSeries(
    rawBars: CandlePoint[],
    factors: CorporateActionAdjustmentFactor[]
  ): AdjustedPriceBar[] {
    if (!rawBars || rawBars.length === 0) {
      return [];
    }

    // Filter out neutral or cancelled factors (factor === 1.0) and sort factors by exDate ascending
    const activeFactors = (factors || [])
      .filter((f) => f && Number.isFinite(f.factor) && f.factor > 0 && Math.abs(f.factor - 1.0) > 1e-6)
      .sort((a, b) => a.exDate.localeCompare(b.exDate));

    // If no active factors, return copy with factor = 1.0
    if (activeFactors.length === 0) {
      return rawBars.map((b) => ({
        ...b,
        rawOpen: b.open,
        rawHigh: b.high,
        rawLow: b.low,
        rawClose: b.close,
        rawVolume: b.volume,
        cumulativeAdjustmentFactor: 1.0,
      }));
    }

    // Sort raw bars ascending by time/date
    const sortedBars = [...rawBars].sort((a, b) => String(a.time).localeCompare(String(b.time)));

    return sortedBars.map((bar) => {
      const barDate = String(bar.time).slice(0, 10);

      // Cumulative factor for this bar is the product of all factors whose exDate is STRICTLY AFTER this bar date
      // K_tau = Product_{t > tau} (k_t)
      let cumulativeFactor = 1.0;
      for (const f of activeFactors) {
        if (f.exDate > barDate) {
          cumulativeFactor *= f.factor;
        }
      }

      cumulativeFactor = Number(cumulativeFactor.toFixed(6));

      const adjOpen = Number((bar.open * cumulativeFactor).toFixed(2));
      const adjHigh = Number((bar.high * cumulativeFactor).toFixed(2));
      const adjLow = Number((bar.low * cumulativeFactor).toFixed(2));
      const adjClose = Number((bar.close * cumulativeFactor).toFixed(2));
      const adjVolume = cumulativeFactor > 0 ? Math.round(bar.volume / cumulativeFactor) : bar.volume;

      return {
        time: bar.time,
        open: adjOpen,
        high: adjHigh,
        low: adjLow,
        close: adjClose,
        volume: adjVolume,
        rawOpen: bar.open,
        rawHigh: bar.high,
        rawLow: bar.low,
        rawClose: bar.close,
        rawVolume: bar.volume,
        cumulativeAdjustmentFactor: cumulativeFactor,
      };
    });
  }
}

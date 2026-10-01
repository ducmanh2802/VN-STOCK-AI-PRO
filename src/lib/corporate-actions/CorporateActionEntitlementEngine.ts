/**
 * PHASE 23 — CORPORATE ACTIONS ENTITLEMENT ENGINE
 * ===============================================
 * Deterministic calculation of rights, stock allocations, and fractional shares.
 *
 * CANONICAL RULES (VSDC):
 * 1. Ratio Semantics: "A:B" represents "A existing shares entitle holder to B new shares/rights".
 *    Denominator A > 0, Numerator B >= 0.
 * 2. Fractional Share Policy:
 *    - Standard VSDC rule: FLOOR (Làm tròn xuống hàng đơn vị, phần lẻ thập phân hủy bỏ).
 *    - Example: Holder of 150 shares under 100:8 ratio -> 150 * 0.08 = 12.0 shares.
 *    - Example: Holder of 115 shares under 100:8 ratio -> 115 * 0.08 = 9.2 -> 9 whole shares, 0.2 fractional cancelled.
 */

import type { CorporateActionRatio, FractionalSharePolicy } from './types.ts';

export interface EntitlementCalculationResult {
  holdingShares: number;
  theoreticalEntitlement: number;
  wholeShares: number;
  fractionalShares: number;
  fractionalPolicyApplied: FractionalSharePolicy;
  cashEntitlementVnd: number | null;
}

export class CorporateActionEntitlementEngine {
  /**
   * Safely parses a raw ratio expression string (e.g. "100:8", "10:1", "20:3").
   */
  public static parseRatio(rawExpression: string): CorporateActionRatio {
    if (typeof rawExpression !== 'string' || !rawExpression.trim()) {
      throw new Error(`Invalid ratio expression: empty or non-string.`);
    }

    const clean = rawExpression.trim().replace(/\s+/g, '');
    const parts = clean.split(/[:/]/);

    if (parts.length !== 2) {
      throw new Error(
        `Invalid ratio format "${rawExpression}". Expected format "oldShares:newShares" (e.g. "100:8").`
      );
    }

    const oldShares = Number(parts[0]);
    const newShares = Number(parts[1]);

    if (!Number.isFinite(oldShares) || !Number.isFinite(newShares)) {
      throw new Error(`Invalid ratio numbers in "${rawExpression}": must be finite numbers.`);
    }

    if (oldShares <= 0) {
      throw new Error(`Invalid ratio denominator in "${rawExpression}": oldShares must be strictly positive.`);
    }

    if (newShares < 0) {
      throw new Error(`Invalid ratio numerator in "${rawExpression}": newShares cannot be negative.`);
    }

    const ratioDecimal = newShares / oldShares;

    return {
      oldShares,
      newShares,
      ratioDecimal,
      rawExpression: clean,
    };
  }

  /**
   * Calculates entitlement for a given holding balance and action ratio.
   */
  public static calculateEntitlement(params: {
    holdingShares: number;
    ratio: CorporateActionRatio;
    policy?: FractionalSharePolicy;
    cashAmountVnd?: number | null;
  }): EntitlementCalculationResult {
    const { holdingShares, ratio, policy = 'FLOOR', cashAmountVnd } = params;

    if (!Number.isFinite(holdingShares) || holdingShares < 0) {
      throw new Error(`Invalid holdingShares: "${holdingShares}". Must be a non-negative finite number.`);
    }

    if (!ratio || !Number.isFinite(ratio.ratioDecimal) || ratio.ratioDecimal < 0) {
      throw new Error(`Invalid ratio provided to calculateEntitlement.`);
    }

    // Theoretical exact allocation
    const theoreticalEntitlement = holdingShares * ratio.ratioDecimal;

    let wholeShares = 0;
    let fractionalShares = 0;

    switch (policy) {
      case 'FLOOR':
      case 'CANCEL': {
        wholeShares = Math.floor(theoreticalEntitlement);
        fractionalShares = Number((theoreticalEntitlement - wholeShares).toFixed(6));
        break;
      }
      case 'ROUND': {
        wholeShares = Math.round(theoreticalEntitlement);
        fractionalShares = Number((theoreticalEntitlement - wholeShares).toFixed(6));
        break;
      }
      case 'CASH_IN_LIEU':
      case 'NONE':
      default: {
        wholeShares = Math.floor(theoreticalEntitlement);
        fractionalShares = Number((theoreticalEntitlement - wholeShares).toFixed(6));
        break;
      }
    }

    // Cash entitlement if cash dividend applies
    let cashEntitlement: number | null = null;
    if (cashAmountVnd !== undefined && cashAmountVnd !== null) {
      if (!Number.isFinite(cashAmountVnd) || cashAmountVnd < 0) {
        throw new Error(`Invalid cashAmountVnd: "${cashAmountVnd}". Must be non-negative.`);
      }
      cashEntitlement = holdingShares * cashAmountVnd;
    }

    return {
      holdingShares,
      theoreticalEntitlement: Number(theoreticalEntitlement.toFixed(6)),
      wholeShares,
      fractionalShares,
      fractionalPolicyApplied: policy,
      cashEntitlementVnd: cashEntitlement,
    };
  }
}

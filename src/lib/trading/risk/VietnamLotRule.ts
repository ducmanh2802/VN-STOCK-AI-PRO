/**
 * PHASE 18.1 — VIETNAMESE MARKET LOT RULES
 * =========================================
 * Canonical board lot definitions for Vietnam stock exchanges (HOSE & HNX).
 * Standard board lot rule: Multiples of 100 shares.
 * Fractional shares or quantities < 100 are non-standard / odd lots.
 */

export const VN_STANDARD_LOT_SIZE = 100;

export class VietnamLotRule {
  /**
   * Standard board lot size on HOSE / HNX.
   */
  static readonly LOT_SIZE = VN_STANDARD_LOT_SIZE;

  /**
   * Checks if a quantity is a valid standard board lot (positive integer multiple of 100).
   */
  static isValidLot(quantity: number, lotSize: number = VN_STANDARD_LOT_SIZE): boolean {
    if (
      typeof quantity !== 'number' ||
      !Number.isFinite(quantity) ||
      Number.isNaN(quantity) ||
      quantity < lotSize ||
      !Number.isInteger(quantity)
    ) {
      return false;
    }
    return quantity % lotSize === 0;
  }

  /**
   * Rounds raw share quantity down to the nearest board lot (multiple of 100).
   * Returns 0 if quantity is less than lot size or non-positive.
   */
  static roundDownToLot(rawShares: number, lotSize: number = VN_STANDARD_LOT_SIZE): number {
    if (
      typeof rawShares !== 'number' ||
      !Number.isFinite(rawShares) ||
      Number.isNaN(rawShares) ||
      rawShares < lotSize
    ) {
      return 0;
    }
    return Math.floor(rawShares / lotSize) * lotSize;
  }

  /**
   * Calculates the number of whole board lots.
   */
  static toLotCount(shares: number, lotSize: number = VN_STANDARD_LOT_SIZE): number {
    const validShares = this.roundDownToLot(shares, lotSize);
    return Math.floor(validShares / lotSize);
  }
}

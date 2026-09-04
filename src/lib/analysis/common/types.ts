export interface CandleInput {
  time?: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type SafeNumber = number | null;

/**
 * Validates a number to ensure it's finite, not NaN, not Infinity.
 */
export function isValidNumber(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && !Number.isNaN(val);
}

/**
 * Safely parses or clamps a number, returning null if invalid.
 */
export function sanitizeNumber(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val) && !Number.isNaN(val)) {
    return val;
  }
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    return Number.isFinite(parsed) && !Number.isNaN(parsed) ? parsed : null;
  }
  return null;
}

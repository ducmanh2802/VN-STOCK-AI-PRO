/**
 * VIETNAM EQUITY PRICE-LIMIT RULES
 * ================================
 * Statutory daily price bands and tick sizes for listed equities, used to VALIDATE
 * observed prices. Nothing here fabricates a price: limits are only ever derived from
 * a reference price the source supplied.
 *
 *   Standard daily band (fraction of the reference price):
 *     HOSE ±7%, HNX ±10%, UPCoM ±15%.
 *   Widest special band an exchange applies (first trading day, or resumption after a
 *   long suspension): HOSE ±20%, HNX ±30%, UPCoM ±40%. A session band wider than this
 *   cannot be a real exchange band.
 *   Tick (price step) for equities: HOSE 10 VND below 10,000, 50 VND from 10,000 to
 *   49,950, 100 VND from 50,000; HNX and UPCoM 100 VND.
 *
 * Exchange-supplied session limits (reference / ceiling / floor) always take precedence
 * over these rules; the rules are the fallback when the session limits are missing and
 * the consistency bound when they are present.
 */

export type VnExchange = 'HOSE' | 'HNX' | 'UPCOM';

export const STANDARD_DAILY_BAND: Readonly<Record<VnExchange, number>> = {
  HOSE: 0.07,
  HNX: 0.1,
  UPCOM: 0.15,
};

export const MAX_SPECIAL_DAILY_BAND: Readonly<Record<VnExchange, number>> = {
  HOSE: 0.2,
  HNX: 0.3,
  UPCOM: 0.4,
};

/** Upper bound over every exchange, for instruments whose exchange is unknown. */
export const MAX_ANY_DAILY_BAND = Math.max(...Object.values(MAX_SPECIAL_DAILY_BAND));

export function asVnExchange(value: unknown): VnExchange | null {
  const v = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return v === 'HOSE' || v === 'HNX' || v === 'UPCOM' ? v : null;
}

export function equityTickSize(exchange: VnExchange, price: number): number {
  if (exchange !== 'HOSE') return 100;
  if (price < 10_000) return 10;
  if (price < 50_000) return 50;
  return 100;
}

/**
 * Standard-band limits for a reference price, rounded INTO the band on the tick grid
 * (ceiling rounded down, floor rounded up), as the exchanges do.
 */
export function standardLimitsFor(
  exchange: VnExchange,
  referencePrice: number
): { ceiling: number; floor: number } {
  const band = STANDARD_DAILY_BAND[exchange];
  const rawCeiling = referencePrice * (1 + band);
  const rawFloor = referencePrice * (1 - band);
  const ceilingTick = equityTickSize(exchange, rawCeiling);
  const floorTick = equityTickSize(exchange, rawFloor);
  return {
    ceiling: Math.floor(rawCeiling / ceilingTick + 1e-9) * ceilingTick,
    floor: Math.ceil(rawFloor / floorTick - 1e-9) * floorTick,
  };
}

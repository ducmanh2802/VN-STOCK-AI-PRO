/**
 * VPS numeric normalization helpers.
 *
 * The VPS feed mixes numbers, strings ("21.8", "21600.0") and scientific
 * notation strings ("2.8088076E7") in the same payload, and expresses most
 * quote prices in THOUSANDS of VND. See `types.ts` for the full unit semantics
 * verified against KBS on 2026-09-06.
 */

/** Parses any raw VPS scalar (number | numeric string | scientific string) into a finite number, else null. */
export function parseVpsNumeric(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed === '') return null;
    // Number() handles both plain decimal strings and "2.8088076E7" notation.
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Normalizes a VPS quote price expressed in THOUSANDS of VND (kVND) into
 * the application standard VND/share.
 *
 * Verified mapping (source-confirmed, see types.ts):
 *   21.7  -> 21700
 *   21.75 -> 21750
 *   21.6  -> 21600
 *   23.1  -> 23100
 *
 * NOT applied blindly to every field: `closePrice` is already VND and must go
 * through `normalizeVpsReferencePrice` instead. Returns null for missing or
 * non-numeric input — callers must surface null, never a fabricated value.
 */
export function normalizeVpsPrice(raw: unknown): number | null {
  const kVnd = parseVpsNumeric(raw);
  if (kVnd === null) return null;
  return Math.round(kVnd * 1000);
}

/**
 * `closePrice` from the VPS quote is ALREADY expressed in VND and holds the
 * reference / previous-session close (e.g. "21600.0" == 21,600 VND).
 * It must NOT be multiplied by 1000.
 */
export function normalizeVpsReferencePrice(raw: unknown): number | null {
  const vnd = parseVpsNumeric(raw);
  if (vnd === null || vnd < 0) return null;
  return Math.round(vnd);
}

/**
 * VPS volumes (`lot`, `fBVol`, `fSVolume`) are expressed in LOTS where
 * 1 lot = 10 shares (verified: lot=1392090 -> 13,920,900 shares == KBS volume
 * for the same session). Returns shares, or null when absent/invalid.
 */
export function normalizeVpsLotVolume(raw: unknown): number | null {
  const lots = parseVpsNumeric(raw);
  if (lots === null || lots < 0) return null;
  return Math.round(lots * 10);
}

/**
 * VPS money values (`fBValue`, `fSValue`) are expressed in THOUSANDS of VND.
 * Returns VND, or null when absent/invalid.
 */
export function normalizeVpsValueThousands(raw: unknown): number | null {
  const kVnd = parseVpsNumeric(raw);
  if (kVnd === null || kVnd < 0) return null;
  return Math.round(kVnd * 1000);
}

/** Parses a plain number/percent (no unit conversion). Returns null when invalid. */
export function normalizeVpsPercent(raw: unknown): number | null {
  const value = parseVpsNumeric(raw);
  return value === null ? null : value;
}
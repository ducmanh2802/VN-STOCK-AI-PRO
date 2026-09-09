/** Shared small helpers for engines. */
import { n, round2 } from './helpers.ts';

/** Percentage of a part over a whole (%). Null when whole <= 0 or inputs missing. */
export function pctOf(part: number | null | undefined, whole: number | null | undefined): number | null {
  const p = n(part);
  const w = n(whole);
  if (p === null || w === null || w === 0) return null;
  return round2((p / w) * 100);
}
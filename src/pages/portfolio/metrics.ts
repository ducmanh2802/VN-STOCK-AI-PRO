export const UNAVAILABLE = '—';

export function isFiniteNumber(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val);
}

export function formatAmount(val: number | null | undefined): string {
  if (!isFiniteNumber(val)) return UNAVAILABLE;
  return new Intl.NumberFormat('vi-VN').format(val) + ' ₫';
}

export function formatMillionsVND(val: number | null | undefined): string {
  if (!isFiniteNumber(val)) return UNAVAILABLE;
  const inMillions = val / 1_000_000;
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(inMillions) + ' tr ₫';
}

export function formatSignedMillionsVND(val: number | null | undefined): string {
  if (!isFiniteNumber(val)) return UNAVAILABLE;
  const inMillions = val / 1_000_000;
  const sign = inMillions > 0 ? '+' : '';
  return sign + new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(inMillions) + ' tr ₫';
}

export function formatPercent(val: number | null | undefined, digits = 2): string {
  if (!isFiniteNumber(val)) return UNAVAILABLE;
  return val.toFixed(digits) + '%';
}

export function formatSignedPercent(val: number | null | undefined, digits = 2): string {
  if (!isFiniteNumber(val)) return UNAVAILABLE;
  const sign = val > 0 ? '+' : '';
  return sign + val.toFixed(digits) + '%';
}

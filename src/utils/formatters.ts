export function formatVND(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(Math.round(value));
}

export function formatNumber(value: number, decimals?: number): string {
  if (decimals !== undefined) {
    return new Intl.NumberFormat('vi-VN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  }
  return new Intl.NumberFormat('vi-VN').format(value);
}

export function formatIndexPoint(value: number): string {
  return new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number, includeSign = true): string {
  const sign = value > 0 && includeSign ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function formatPointChange(value: number, includeSign = true): string {
  const sign = value > 0 && includeSign ? '+' : '';
  return `${sign}${value.toFixed(2)}`;
}

export function formatVolume(val: number): string {
  if (val >= 1_000_000_000) {
    return `${(val / 1_000_000_000).toFixed(2)}B`;
  }
  if (val >= 1_000_000) {
    return `${(val / 1_000_000).toFixed(2)}M`;
  }
  if (val >= 1_000) {
    return `${(val / 1_000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat('vi-VN').format(val);
}

export function formatBillionVND(val: number): string {
  return `${new Intl.NumberFormat('vi-VN', {
    maximumFractionDigits: 1,
  }).format(val)} tỷ`;
}

export function getPriceChangeColor(change: number): string {
  if (change > 0) return 'text-emerald-400';
  if (change < 0) return 'text-rose-400';
  return 'text-amber-400';
}

export function getPriceChangeBg(change: number): string {
  if (change > 0) return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25';
  if (change < 0) return 'bg-rose-500/10 text-rose-400 border border-rose-500/25';
  return 'bg-amber-500/10 text-amber-400 border border-amber-500/25';
}

export function formatVND(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('vi-VN').format(value) + ' ₫';
}

export function formatPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('vi-VN').format(value);
}

export function formatVolume(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value >= 1_000_000) {
    return (value / 1_000_000).toFixed(2) + ' tr';
  }
  if (value >= 1_000) {
    return (value / 1_000).toFixed(1) + ' k';
  }
  return new Intl.NumberFormat('vi-VN').format(value);
}

export function formatBillionVND(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value >= 1_000_000_000) {
    return (value / 1_000_000_000).toFixed(2) + ' tỷ ₫';
  }
  if (value >= 1_000_000) {
    return (value / 1_000_000).toFixed(2) + ' tr ₫';
  }
  return (value / 1_000_000_000).toFixed(2) + ' tỷ ₫';
}

export function formatPercent(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const prefix = value > 0 ? '+' : '';
  return prefix + value.toFixed(digits) + '%';
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toFixed(digits);
}

export function formatLargeNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1_000_000_000_000) {
    return (value / 1_000_000_000_000).toFixed(2) + ' nghìn tỷ';
  }
  if (Math.abs(value) >= 1_000_000_000) {
    return (value / 1_000_000_000).toFixed(2) + ' tỷ';
  }
  if (Math.abs(value) >= 1_000_000) {
    return (value / 1_000_000).toFixed(2) + ' tr';
  }
  return new Intl.NumberFormat('vi-VN').format(value);
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString('vi-VN');
  } catch {
    return dateString;
  }
}

export function formatTimestamp(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return isoString;
  }
}

export function formatIndexPoint(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toFixed(digits);
}

export function formatPointChange(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const prefix = value > 0 ? '+' : '';
  return prefix + value.toFixed(digits);
}

export function getPriceChangeColor(change: number | null | undefined): string {
  if (change == null || !Number.isFinite(change)) return 'text-terminal-text-muted';
  if (change > 0) return 'text-terminal-up';
  if (change < 0) return 'text-terminal-down';
  return 'text-terminal-warning';
}


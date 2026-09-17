import React from 'react';
import { formatVND, formatVolume } from '../../utils/formatters';
import { Minus, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { isFiniteNumber, isPositiveFiniteNumber } from './metrics';

export interface StockPriceSummaryProps {
  price: number;
  change: number;
  changePercent: number;
  /** Optional since Phase 8.5C: only shown when the real source provides them. */
  refPrice?: number;
  ceilingPrice?: number;
  floorPrice?: number;
  open?: number;
  high?: number;
  low?: number;
  volume: number;
  tradingValue: number;
  high52Week?: number;
  low52Week?: number;
  avgVolume20D?: number;
  foreignOwnershipPercent?: number;
  /** PHASE 8.5C: when set, render an explicit "real data unavailable" panel instead of (mock) numbers. */
  realtimeUnavailableReason?: string | null;
  /** PHASE 8.5C: small source tag, e.g. "VPS" — shown next to the price when real data is used. */
  dataSourceLabel?: string | null;
}

export const StockPriceSummary: React.FC<StockPriceSummaryProps> = ({
  price,
  change,
  changePercent,
  refPrice,
  ceilingPrice,
  floorPrice,
  open,
  high,
  low,
  volume,
  tradingValue,
  high52Week,
  low52Week,
  avgVolume20D,
  realtimeUnavailableReason,
  dataSourceLabel,
}) => {
  // PHASE 8.5C STEP 8: if the realtime source failed, NEVER fall back to mock
  // numbers — render an explicit unavailable state.
  if (realtimeUnavailableReason || !isPositiveFiniteNumber(price)) {
    return (
      <div
        id="stock-price-summary"
        className="p-4 rounded-xl bg-terminal-surface border border-amber-400/30 space-y-2"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold uppercase font-mono tracking-wider text-terminal-text-primary">
            Giá Realtime
          </span>
          <span className="text-[10px] font-mono text-red-400">✕ VPS không khả dụng</span>
        </div>
        <div className="text-xs text-terminal-text-muted font-mono">
          Không hiển thị giá giả. Lý do: {realtimeUnavailableReason || 'Dữ liệu thị giá chưa sẵn sàng'}
        </div>
        <div className="text-[10px] text-terminal-text-muted font-mono">
          Lịch sử giá & phân tích kỹ thuật vẫn dùng dữ liệu thật từ KBS.
        </div>
      </div>
    );
  }
  const hasChange = isFiniteNumber(change);
  const hasChangePercent = isFiniteNumber(changePercent);
  const isUp = hasChange && change > 0;
  const isDown = hasChange && change < 0;
  const isCeiling = isPositiveFiniteNumber(ceilingPrice) && price >= ceilingPrice;
  const isFloor = isPositiveFiniteNumber(floorPrice) && price <= floorPrice;

  const priceColorClass = isCeiling
    ? 'text-terminal-ceil'
    : isFloor
    ? 'text-terminal-floor'
    : isUp
    ? 'text-terminal-up'
    : isDown
    ? 'text-terminal-down'
    : 'text-terminal-ref';

  const badgeBgClass = isCeiling
    ? 'bg-terminal-ceil/15 border-terminal-ceil/30 text-terminal-ceil'
    : isFloor
    ? 'bg-terminal-floor/15 border-terminal-floor/30 text-terminal-floor'
    : isUp
    ? 'bg-terminal-up/15 border-terminal-up/30 text-terminal-up'
    : isDown
    ? 'bg-terminal-down/15 border-terminal-down/30 text-terminal-down'
    : 'bg-terminal-ref/15 border-terminal-ref/30 text-terminal-ref';

  // Calculate 52-week position percentage
  const hasHigh52 = isPositiveFiniteNumber(high52Week);
  const hasLow52 = isPositiveFiniteNumber(low52Week);
  const has52Range = hasHigh52 && hasLow52 && high52Week > low52Week;
  const range52 = has52Range ? high52Week - low52Week : 0;
  const position52 =
    has52Range && range52 > 0
      ? Math.min(100, Math.max(0, (((price - low52Week) / range52) * 100)))
      : null;

  return (
    <div
      id="stock-price-summary"
      className="p-4 rounded-xl bg-terminal-surface border border-terminal-border shadow-sm space-y-4"
    >
      {/* Top Banner: Big Price & Primary Metrics */}
      <div className="flex flex-wrap items-baseline justify-between gap-4 pb-3 border-b border-terminal-border/70">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className={`text-3xl sm:text-4xl font-bold font-mono tracking-tight ${priceColorClass}`}>
            {formatVND(price)}
          </span>
          {dataSourceLabel && (
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-400/10 border border-emerald-400/30 text-emerald-400"
              title={`Giá thật từ ${dataSourceLabel}`}
            >
              {dataSourceLabel} ✓
            </span>
          )}

          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs sm:text-sm font-mono font-bold border ${badgeBgClass}`}>
            {isUp ? (
              <ArrowUpRight className="w-4 h-4" />
            ) : isDown ? (
              <ArrowDownRight className="w-4 h-4" />
            ) : (
              <Minus className="w-4 h-4" />
            )}
            <span>
              {hasChange ? (change > 0 ? `+${formatVND(change)}` : formatVND(change)) : '--'}
            </span>
            <span>
              ({hasChangePercent ? (changePercent > 0 ? `+${changePercent.toFixed(2)}` : changePercent.toFixed(2)) : '--'}%)
            </span>
            {isCeiling && <span className="font-extrabold uppercase ml-1">TRẦN</span>}
            {isFloor && <span className="font-extrabold uppercase ml-1">SÀN</span>}
          </div>
        </div>

        {/* 3 Core Thresholds: Ceiling, Reference, Floor (only when the real source provides them) */}
        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-terminal-ceil/10 border border-terminal-ceil/25 text-terminal-ceil">
            <span className="text-[10px] text-terminal-text-muted">TRẦN:</span>
            <span className="font-bold">{isPositiveFiniteNumber(ceilingPrice) ? formatVND(ceilingPrice) : '—'}</span>
          </div>

          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-terminal-ref/10 border border-terminal-ref/25 text-terminal-ref">
            <span className="text-[10px] text-terminal-text-muted">TC:</span>
            <span className="font-bold">{isPositiveFiniteNumber(refPrice) ? formatVND(refPrice) : '—'}</span>
          </div>

          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-terminal-floor/10 border border-terminal-floor/25 text-terminal-floor">
            <span className="text-[10px] text-terminal-text-muted">SÀN:</span>
            <span className="font-bold">{isPositiveFiniteNumber(floorPrice) ? formatVND(floorPrice) : '—'}</span>
          </div>
        </div>
      </div>

      {/* Grid of Key Price Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
        {/* Open */}
        <div className="p-2.5 rounded-lg bg-terminal-bg border border-terminal-border/80">
          <div className="text-terminal-text-muted mb-0.5">Mở cửa</div>
          <div className="font-mono font-semibold text-terminal-text-primary">
            {isPositiveFiniteNumber(open) ? formatVND(open) : '—'}
          </div>
        </div>

        {/* Session High */}
        <div className="p-2.5 rounded-lg bg-terminal-bg border border-terminal-border/80">
          <div className="text-terminal-text-muted mb-0.5">Cao nhất phiên</div>
          <div className="font-mono font-semibold text-terminal-up">
            {isPositiveFiniteNumber(high) ? formatVND(high) : '—'}
          </div>
        </div>

        {/* Session Low */}
        <div className="p-2.5 rounded-lg bg-terminal-bg border border-terminal-border/80">
          <div className="text-terminal-text-muted mb-0.5">Thấp nhất phiên</div>
          <div className="font-mono font-semibold text-terminal-down">
            {isPositiveFiniteNumber(low) ? formatVND(low) : '—'}
          </div>
        </div>

        {/* Volume */}
        <div className="p-2.5 rounded-lg bg-terminal-bg border border-terminal-border/80">
          <div className="text-terminal-text-muted mb-0.5">Khối lượng (CP)</div>
          <div className="font-mono font-semibold text-terminal-text-primary">
            {isFiniteNumber(volume) && volume >= 0 ? formatVolume(volume) : '—'}
          </div>
        </div>

        {/* Value */}
        <div className="p-2.5 rounded-lg bg-terminal-bg border border-terminal-border/80">
          <div className="text-terminal-text-muted mb-0.5">Giá trị khớp lệnh</div>
          <div className="font-mono font-semibold text-terminal-accent">
            {isFiniteNumber(tradingValue) && tradingValue >= 0 ? `${tradingValue.toFixed(1)} tỷ VND` : '—'}
          </div>
        </div>

        {/* Avg Volume 20D */}
        <div className="p-2.5 rounded-lg bg-terminal-bg border border-terminal-border/80">
          <div className="text-terminal-text-muted mb-0.5">KL trung bình 20P</div>
          <div className="font-mono font-semibold text-terminal-text-secondary">
            {isPositiveFiniteNumber(avgVolume20D) ? formatVolume(avgVolume20D) : '—'}
          </div>
        </div>
      </div>

      {/* 52-Week Range Bar */}
      {has52Range && position52 !== null && (
        <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-border/80 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-terminal-text-muted">
            <span>Biên độ 52 tuần: <strong className="text-terminal-down font-mono">{formatVND(low52Week!)}</strong></span>
            <span className="font-mono text-terminal-text-secondary">Vị trí: {position52.toFixed(0)}%</span>
            <span>Đỉnh 52 tuần: <strong className="text-terminal-up font-mono">{formatVND(high52Week!)}</strong></span>
          </div>
          <div className="relative w-full h-2 rounded-full bg-terminal-surface-subtle overflow-hidden">
            <div
              className="absolute left-0 top-0 bottom-0 bg-linear-to-r from-terminal-down via-terminal-ref to-terminal-up rounded-full"
              style={{ width: '100%' }}
            />
            <div
              className="absolute top-0 bottom-0 w-2.5 h-2.5 -mt-0.5 bg-white border-2 border-terminal-accent rounded-full shadow-sm -translate-x-1/2"
              style={{ left: `${position52}%` }}
              title={`Thị giá hiện tại: ${formatVND(price)}`}
            />
          </div>
        </div>
      )}
    </div>
  );
};


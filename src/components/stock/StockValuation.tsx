import React from 'react';
import { ValuationData } from '../../types/stockDetail';
import { formatVND } from '../../utils/formatters';
import { Scale } from 'lucide-react';
import { isFiniteNumber, isPositiveFiniteNumber } from './metrics';

export interface StockValuationProps {
  valuation: ValuationData;
}

export const StockValuation: React.FC<StockValuationProps> = ({ valuation }) => {
  const isUndervalued = valuation.valuationRating === 'UNDERVALUED';
  const isOvervalued = valuation.valuationRating === 'OVERVALUED';

  const hasValidPrice = isPositiveFiniteNumber(valuation.currentPrice);
  const hasValidFairValue = isPositiveFiniteNumber(valuation.fairValue);
  const hasValidDcf = isPositiveFiniteNumber(valuation.dcfValue);
  const hasValidPeMultiple = isPositiveFiniteNumber(valuation.peMultipleValue);
  const hasValidGraham = isPositiveFiniteNumber(valuation.grahamValue);
  const hasValidConsensus = isPositiveFiniteNumber(valuation.consensusTarget);
  const hasValidMarginOfSafety = isFiniteNumber(valuation.marginOfSafety);

  // Calculate percentage range position for current price vs fair value only if both are valid
  const canShowVisualBar = hasValidPrice && hasValidFairValue;
  const minVal = canShowVisualBar
    ? Math.min(valuation.currentPrice, valuation.fairValue, hasValidDcf ? valuation.dcfValue : valuation.fairValue) * 0.9
    : 0;
  const maxVal = canShowVisualBar
    ? Math.max(valuation.currentPrice, valuation.fairValue, hasValidDcf ? valuation.dcfValue : valuation.fairValue) * 1.1
    : 0;
  const range = maxVal - minVal;

  const currentPricePct = canShowVisualBar && range > 0
    ? Math.max(0, Math.min(100, ((valuation.currentPrice - minVal) / range) * 100))
    : 50;
  const fairValuePct = canShowVisualBar && range > 0
    ? Math.max(0, Math.min(100, ((valuation.fairValue - minVal) / range) * 100))
    : 50;

  const ratingLabel = !hasValidFairValue
    ? 'CHƯA ĐỦ DỮ LIỆU'
    : isUndervalued
    ? 'ĐỊNH GIÁ HẤP DẪN'
    : isOvervalued
    ? 'ĐỊNH GIÁ CAO'
    : 'ĐỊNH GIÁ HỢP LÝ';

  const ratingColor = !hasValidFairValue
    ? 'bg-terminal-surface-subtle text-terminal-text-muted border-terminal-border'
    : isUndervalued
    ? 'bg-terminal-up/15 text-terminal-up border-terminal-up/30'
    : isOvervalued
    ? 'bg-terminal-down/15 text-terminal-down border-terminal-down/30'
    : 'bg-terminal-ref/15 text-terminal-ref border-terminal-ref/30';

  return (
    <div
      id="stock-valuation"
      className="p-4 rounded-xl bg-terminal-surface border border-terminal-border shadow-sm space-y-4"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-terminal-border/70">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-terminal-accent/15 border border-terminal-accent/30 text-terminal-accent">
            <Scale className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold uppercase font-mono tracking-wider text-terminal-text-primary">
            Định Giá & Giá Trị Nội Tại (Valuation Models)
          </h3>
        </div>

        <span className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold border ${ratingColor}`}>
          {ratingLabel}
        </span>
      </div>

      {/* Main Comparison: Current Price vs Fair Value & Margin of Safety */}
      <div className="p-3.5 rounded-lg bg-terminal-bg border border-terminal-border/80 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <div className="text-xs text-terminal-text-muted mb-0.5">Giá thị trường hiện tại</div>
            <div className="text-2xl font-bold font-mono text-terminal-text-primary">
              {hasValidPrice ? formatVND(valuation.currentPrice) : '--'}
            </div>
          </div>

          <div className="text-center sm:text-right">
            <div className="text-xs text-terminal-text-muted mb-0.5">Giá trị hợp lý AI (Fair Value)</div>
            <div className="text-2xl font-bold font-mono text-terminal-accent">
              {hasValidFairValue ? formatVND(valuation.fairValue) : '--'}
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs text-terminal-text-muted mb-0.5">Biên an toàn (Margin of Safety)</div>
            <div
              className={`text-2xl font-bold font-mono ${
                !hasValidMarginOfSafety
                  ? 'text-terminal-text-muted'
                  : valuation.marginOfSafety >= 0
                  ? 'text-terminal-up'
                  : 'text-terminal-down'
              }`}
            >
              {!hasValidMarginOfSafety
                ? '--'
                : valuation.marginOfSafety >= 0
                ? `+${valuation.marginOfSafety}%`
                : `${valuation.marginOfSafety}%`}
            </div>
          </div>
        </div>

        {/* Visual Bar: Price vs Fair Value */}
        {canShowVisualBar ? (
          <div className="space-y-1 pt-1">
            <div className="relative w-full h-3 rounded-full bg-terminal-surface-subtle overflow-hidden">
              <div
                className="absolute left-0 top-0 bottom-0 bg-terminal-accent/30 rounded-full"
                style={{ width: `${fairValuePct}%` }}
              />
              {/* Fair Value line marker */}
              <div
                className="absolute top-0 bottom-0 w-1 bg-terminal-accent z-10"
                style={{ left: `${fairValuePct}%` }}
                title={`Fair Value: ${formatVND(valuation.fairValue)}`}
              />
              {/* Current Price circle marker */}
              <div
                className="absolute top-0 bottom-0 w-3 h-3 bg-white border-2 border-terminal-up rounded-full shadow z-20 -translate-x-1/2"
                style={{ left: `${currentPricePct}%` }}
                title={`Thị giá: ${formatVND(valuation.currentPrice)}`}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono text-terminal-text-muted">
              <span>Vùng chiết khấu cao</span>
              <span className="text-terminal-accent font-semibold">
                Fair Value: {formatVND(valuation.fairValue)}
              </span>
              <span>Vùng định giá quá mức</span>
            </div>
          </div>
        ) : (
          <div className="py-2 text-center text-xs text-terminal-text-muted font-mono">
            Chưa đủ dữ liệu định giá hợp lệ để xác định biên độ an toàn trực quan.
          </div>
        )}

        <div className="text-xs text-terminal-text-secondary italic pt-1">
          "{valuation.valuationNote || 'Không có ghi chú định giá'}"
        </div>
      </div>

      {/* Breakdown across valuation methodologies */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        {/* DCF Discounted Cash Flow */}
        <div className="p-2.5 rounded-lg bg-terminal-bg border border-terminal-border/80">
          <div className="text-terminal-text-muted mb-1">Mô hình DCF (FCFF)</div>
          <div className="font-mono font-bold text-terminal-text-primary text-sm">
            {hasValidDcf ? formatVND(valuation.dcfValue) : '--'}
          </div>
          <div className="text-[10px] text-terminal-text-muted mt-1">
            {hasValidDcf ? 'WACC: 11.5% · g: 3.5%' : 'Thiếu dữ liệu FCF'}
          </div>
        </div>

        {/* P/E Multiple */}
        <div className="p-2.5 rounded-lg bg-terminal-bg border border-terminal-border/80">
          <div className="text-terminal-text-muted mb-1">Định giá theo P/E mục tiêu</div>
          <div className="font-mono font-bold text-terminal-text-primary text-sm">
            {hasValidPeMultiple ? formatVND(valuation.peMultipleValue) : '--'}
          </div>
          <div className="text-[10px] text-terminal-text-muted mt-1">
            {hasValidPeMultiple ? 'P/E mục tiêu: 14.5x' : 'Thiếu EPS dương'}
          </div>
        </div>

        {/* Graham Number */}
        <div className="p-2.5 rounded-lg bg-terminal-bg border border-terminal-border/80">
          <div className="text-terminal-text-muted mb-1">Chỉ số Benjamin Graham</div>
          <div className="font-mono font-bold text-terminal-text-primary text-sm">
            {hasValidGraham ? formatVND(valuation.grahamValue) : '--'}
          </div>
          <div className="text-[10px] text-terminal-text-muted mt-1">
            {hasValidGraham ? '√(22.5 × EPS × BVPS)' : 'Thiếu EPS hoặc BVPS'}
          </div>
        </div>

        {/* Consensus Target */}
        <div className="p-2.5 rounded-lg bg-terminal-bg border border-terminal-border/80">
          <div className="text-terminal-text-muted mb-1">Mục tiêu CTCK đồng thuận</div>
          <div className="font-mono font-bold text-terminal-up text-sm">
            {hasValidConsensus ? formatVND(valuation.consensusTarget) : '--'}
          </div>
          <div className="text-[10px] text-terminal-text-muted mt-1">
            {hasValidConsensus ? 'Đồng thuận 6 CTCK lớn' : 'Chưa có dự phóng CTCK'}
          </div>
        </div>
      </div>
    </div>
  );
};


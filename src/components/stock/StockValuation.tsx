import React from 'react';
import { ValuationData } from '../../types/stockDetail';
import { formatVND } from '../../utils/formatters';
import { Scale, CheckCircle, AlertCircle, ArrowUpRight, TrendingUp, ShieldCheck } from 'lucide-react';

export interface StockValuationProps {
  valuation: ValuationData;
}

export const StockValuation: React.FC<StockValuationProps> = ({ valuation }) => {
  const isUndervalued = valuation.valuationRating === 'UNDERVALUED';
  const isOvervalued = valuation.valuationRating === 'OVERVALUED';

  // Calculate percentage range position for current price vs fair value
  const minVal = Math.min(valuation.currentPrice, valuation.fairValue, valuation.dcfValue) * 0.9;
  const maxVal = Math.max(valuation.currentPrice, valuation.fairValue, valuation.dcfValue) * 1.1;
  const range = maxVal - minVal;

  const currentPricePct = ((valuation.currentPrice - minVal) / range) * 100;
  const fairValuePct = ((valuation.fairValue - minVal) / range) * 100;

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

        <span
          className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold border ${
            isUndervalued
              ? 'bg-terminal-up/15 text-terminal-up border-terminal-up/30'
              : isOvervalued
              ? 'bg-terminal-down/15 text-terminal-down border-terminal-down/30'
              : 'bg-terminal-ref/15 text-terminal-ref border-terminal-ref/30'
          }`}
        >
          {isUndervalued ? 'ĐỊNH GIÁ HẤP DẪN' : isOvervalued ? 'ĐỊNH GIÁ CAO' : 'ĐỊNH GIÁ HỢP LÝ'}
        </span>
      </div>

      {/* Main Comparison: Current Price vs Fair Value & Margin of Safety */}
      <div className="p-3.5 rounded-lg bg-terminal-bg border border-terminal-border/80 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <div className="text-xs text-terminal-text-muted mb-0.5">Giá thị trường hiện tại</div>
            <div className="text-2xl font-bold font-mono text-terminal-text-primary">
              {formatVND(valuation.currentPrice)}
            </div>
          </div>

          <div className="text-center sm:text-right">
            <div className="text-xs text-terminal-text-muted mb-0.5">Giá trị hợp lý AI (Fair Value)</div>
            <div className="text-2xl font-bold font-mono text-terminal-accent">
              {formatVND(valuation.fairValue)}
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs text-terminal-text-muted mb-0.5">Biên an toàn (Margin of Safety)</div>
            <div
              className={`text-2xl font-bold font-mono ${
                valuation.marginOfSafety >= 0 ? 'text-terminal-up' : 'text-terminal-down'
              }`}
            >
              {valuation.marginOfSafety >= 0
                ? `+${valuation.marginOfSafety}%`
                : `${valuation.marginOfSafety}%`}
            </div>
          </div>
        </div>

        {/* Visual Bar: Price vs Fair Value */}
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

        <div className="text-xs text-terminal-text-secondary italic pt-1">
          "{valuation.valuationNote}"
        </div>
      </div>

      {/* Breakdown across valuation methodologies */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        {/* DCF Discounted Cash Flow */}
        <div className="p-2.5 rounded-lg bg-terminal-bg border border-terminal-border/80">
          <div className="text-terminal-text-muted mb-1">Mô hình DCF (FCFF)</div>
          <div className="font-mono font-bold text-terminal-text-primary text-sm">
            {formatVND(valuation.dcfValue)}
          </div>
          <div className="text-[10px] text-terminal-up mt-1">WACC: 11.5% · g: 3.5%</div>
        </div>

        {/* P/E Multiple */}
        <div className="p-2.5 rounded-lg bg-terminal-bg border border-terminal-border/80">
          <div className="text-terminal-text-muted mb-1">Định giá theo P/E mục tiêu</div>
          <div className="font-mono font-bold text-terminal-text-primary text-sm">
            {formatVND(valuation.peMultipleValue)}
          </div>
          <div className="text-[10px] text-terminal-text-muted mt-1">P/E mục tiêu: 14.5x</div>
        </div>

        {/* Graham Number */}
        <div className="p-2.5 rounded-lg bg-terminal-bg border border-terminal-border/80">
          <div className="text-terminal-text-muted mb-1">Chỉ số Benjamin Graham</div>
          <div className="font-mono font-bold text-terminal-text-primary text-sm">
            {formatVND(valuation.grahamValue)}
          </div>
          <div className="text-[10px] text-terminal-text-muted mt-1">√(22.5 × EPS × BVPS)</div>
        </div>

        {/* Consensus Target */}
        <div className="p-2.5 rounded-lg bg-terminal-bg border border-terminal-border/80">
          <div className="text-terminal-text-muted mb-1">Mục tiêu CTCK đồng thuận</div>
          <div className="font-mono font-bold text-terminal-up text-sm">
            {formatVND(valuation.consensusTarget)}
          </div>
          <div className="text-[10px] text-terminal-up mt-1">Đồng thuận 6 CTCK lớn</div>
        </div>
      </div>
    </div>
  );
};

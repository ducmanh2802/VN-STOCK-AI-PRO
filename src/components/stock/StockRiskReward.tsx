import React, { useState } from 'react';
import { RiskRewardData } from '../../types/stockDetail';
import { formatVND } from '../../utils/formatters';
import { ShieldAlert, Target, Calculator, ArrowUpRight, ArrowDownRight, CheckCircle2 } from 'lucide-react';

export interface StockRiskRewardProps {
  riskReward: RiskRewardData;
  currentPrice: number;
}

export const StockRiskReward: React.FC<StockRiskRewardProps> = ({ riskReward, currentPrice }) => {
  // Interactive Position Sizing Calculator state
  const [totalCapital, setTotalCapital] = useState<number>(100000000); // 100 million VND default
  const [riskPercent, setRiskPercent] = useState<number>(2); // 2% risk rule

  const riskPerShare = Math.max(100, currentPrice - riskReward.stopLossPrice);
  const maxAllowableRiskAmount = (totalCapital * riskPercent) / 100;
  const calculatedShares = Math.floor(maxAllowableRiskAmount / riskPerShare);
  // Round to nearest 100 shares (standard lot on HOSE/HNX)
  const lotShares = Math.floor(calculatedShares / 100) * 100;
  const totalInvestment = lotShares * currentPrice;

  return (
    <div
      id="stock-risk-reward"
      className="p-4 rounded-xl bg-terminal-surface border border-terminal-border shadow-sm space-y-4"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-terminal-border/70">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-terminal-accent/15 border border-terminal-accent/30 text-terminal-accent">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold uppercase font-mono tracking-wider text-terminal-text-primary">
            Kế Hoạch Quản Trị Rủi Ro & Lợi Nhuận (Risk/Reward)
          </h3>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-terminal-accent/10 border border-terminal-accent/30 text-terminal-accent font-mono text-xs font-bold">
          <span>R:R = {riskReward.riskRewardRatio}</span>
        </div>
      </div>

      {/* 4 Core Trade Execution Levels */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        {/* Entry Price */}
        <div className="p-2.5 rounded-lg bg-terminal-bg border border-terminal-border/80">
          <div className="text-terminal-text-muted mb-0.5">Vùng mua (Entry)</div>
          <div className="font-mono font-bold text-terminal-text-primary text-base">
            {formatVND(riskReward.entryPrice)}
          </div>
          <div className="text-[10px] text-terminal-text-muted mt-0.5">Thị giá hiện tại</div>
        </div>

        {/* Stop Loss */}
        <div className="p-2.5 rounded-lg bg-terminal-bg border border-terminal-down/30">
          <div className="text-terminal-down mb-0.5 flex items-center gap-1">
            <ArrowDownRight className="w-3 h-3" /> Cắt lỗ (Stop Loss)
          </div>
          <div className="font-mono font-bold text-terminal-down text-base">
            {formatVND(riskReward.stopLossPrice)}
          </div>
          <div className="text-[10px] text-terminal-down mt-0.5 font-mono">
            {riskReward.maxRiskPercent}% rủi ro
          </div>
        </div>

        {/* Target 1 */}
        <div className="p-2.5 rounded-lg bg-terminal-bg border border-terminal-up/30">
          <div className="text-terminal-up mb-0.5 flex items-center gap-1">
            <ArrowUpRight className="w-3 h-3" /> Mục tiêu 1 (TP1)
          </div>
          <div className="font-mono font-bold text-terminal-up text-base">
            {formatVND(riskReward.targetPrice1)}
          </div>
          <div className="text-[10px] text-terminal-up mt-0.5 font-mono">
            +{riskReward.potentialGainPercent}% tiềm năng
          </div>
        </div>

        {/* Target 2 */}
        <div className="p-2.5 rounded-lg bg-terminal-bg border border-terminal-up/30">
          <div className="text-terminal-up mb-0.5 flex items-center gap-1">
            <Target className="w-3 h-3" /> Mục tiêu 2 (TP2)
          </div>
          <div className="font-mono font-bold text-terminal-up text-base">
            {formatVND(riskReward.targetPrice2)}
          </div>
          <div className="text-[10px] text-terminal-up mt-0.5 font-mono">
            +{(( (riskReward.targetPrice2 - currentPrice) / currentPrice ) * 100).toFixed(1)}% kỳ vọng
          </div>
        </div>
      </div>

      {/* Visual Risk vs Reward Bar */}
      <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-border/80 space-y-2">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-terminal-down">
            Rủi ro tối đa: {formatVND(riskReward.riskAmount)}/CP ({riskReward.maxRiskPercent}%)
          </span>
          <span className="text-terminal-up">
            Lợi nhuận kỳ vọng: +{formatVND(riskReward.rewardAmount)}/CP (+{riskReward.potentialGainPercent}%)
          </span>
        </div>

        <div className="w-full h-3 rounded-full overflow-hidden flex bg-terminal-surface-subtle">
          <div
            className="bg-terminal-down h-full"
            style={{ width: `${Math.min(40, Math.abs(riskReward.maxRiskPercent) * 4)}%` }}
            title={`Rủi ro: ${riskReward.maxRiskPercent}%`}
          />
          <div className="w-1 bg-terminal-border h-full" />
          <div
            className="bg-terminal-up h-full"
            style={{ width: `${Math.min(90, riskReward.potentialGainPercent * 3)}%` }}
            title={`Lợi nhuận: +${riskReward.potentialGainPercent}%`}
          />
        </div>
      </div>

      {/* Interactive Position Sizing Calculator */}
      <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-border/80 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-terminal-text-primary uppercase tracking-wide">
            <Calculator className="w-3.5 h-3.5 text-terminal-accent" />
            Tính Toán Quy Mô Vị Thế Tối Ưu (Position Sizing)
          </div>
          <span className="text-[10px] font-mono text-terminal-text-muted">
            Quy tắc 2% vốn tối đa
          </span>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
          <div>
            <label className="text-terminal-text-muted block mb-1">
              Tổng vốn tài khoản (VND):
            </label>
            <input
              type="number"
              step="10000000"
              value={totalCapital}
              onChange={(e) => setTotalCapital(Math.max(1000000, Number(e.target.value)))}
              className="w-full px-2.5 py-1.5 rounded bg-terminal-surface border border-terminal-border text-terminal-text-primary font-bold focus:outline-hidden focus:border-terminal-accent"
            />
          </div>

          <div>
            <label className="text-terminal-text-muted block mb-1">
              Mức chấp nhận rủi ro mỗi lệnh (%):
            </label>
            <div className="flex items-center gap-2">
              {[1, 1.5, 2, 3].map((pct) => (
                <button
                  key={pct}
                  onClick={() => setRiskPercent(pct)}
                  className={`px-2.5 py-1 rounded text-xs transition-colors ${
                    riskPercent === pct
                      ? 'bg-terminal-accent text-white font-bold'
                      : 'bg-terminal-surface text-terminal-text-secondary border border-terminal-border hover:text-terminal-text-primary'
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Output */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-2.5 rounded bg-terminal-surface/60 border border-terminal-border/60 text-xs font-mono">
          <div>
            <span className="text-terminal-text-muted text-[11px] block">Số cổ phiếu khuyến nghị:</span>
            <strong className="text-base text-terminal-accent">{lotShares.toLocaleString()} CP</strong>
            <span className="text-[10px] text-terminal-text-muted block">(Lô chẵn 100)</span>
          </div>

          <div>
            <span className="text-terminal-text-muted text-[11px] block">Tổng giá trị giải ngân:</span>
            <strong className="text-sm text-terminal-text-primary">
              {formatVND(totalInvestment)}
            </strong>
            <span className="text-[10px] text-terminal-text-muted block">
              ({((totalInvestment / totalCapital) * 100).toFixed(1)}% tài khoản)
            </span>
          </div>

          <div>
            <span className="text-terminal-text-muted text-[11px] block">Rủi ro tối đa nếu cắt lỗ:</span>
            <strong className="text-sm text-terminal-down">
              -{formatVND(lotShares * riskPerShare)}
            </strong>
            <span className="text-[10px] text-terminal-down block">
              (Đúng {riskPercent}% tổng vốn)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

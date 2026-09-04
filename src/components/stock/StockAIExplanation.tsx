import React from 'react';
import { StockAIExplanationData } from '../../types/stockDetail';
import { Sparkles, LineChart, BarChart4, Globe2, AlertTriangle, ShieldCheck } from 'lucide-react';

export interface StockAIExplanationProps {
  explanation: StockAIExplanationData;
  symbol: string;
}

export const StockAIExplanation: React.FC<StockAIExplanationProps> = ({
  explanation,
  symbol,
}) => {
  return (
    <div
      id="stock-ai-explanation"
      className="p-4 rounded-xl bg-terminal-surface border border-terminal-border shadow-sm space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-terminal-border/70">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-terminal-accent/15 border border-terminal-accent/30 text-terminal-accent">
            <Sparkles className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold uppercase font-mono tracking-wider text-terminal-text-primary">
            Luận Điểm Đầu Tư & Phân Tích Chuyên Sâu (AI Synthesis)
          </h3>
        </div>
        <span className="text-[11px] font-mono text-terminal-text-muted">
          Tổng hợp đa chiều Kỹ thuật · Cơ bản · Vĩ mô
        </span>
      </div>

      {/* 1. Executive Thesis */}
      <div className="p-3.5 rounded-lg bg-terminal-bg border border-terminal-accent/25 space-y-1.5">
        <div className="text-xs font-bold font-mono text-terminal-accent uppercase tracking-wider flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          Luận điểm cốt lõi (Executive Summary)
        </div>
        <p className="text-xs sm:text-sm text-terminal-text-primary leading-relaxed">
          {explanation.executiveThesis}
        </p>
      </div>

      {/* 2. Three Pillar Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Technical Pillar */}
        <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-border/80 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold font-mono text-sky-400 uppercase">
            <LineChart className="w-3.5 h-3.5" />
            1. Góc nhìn Kỹ thuật
          </div>
          <p className="text-xs text-terminal-text-secondary leading-relaxed">
            {explanation.technicalThesis}
          </p>
        </div>

        {/* Fundamental Pillar */}
        <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-border/80 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold font-mono text-emerald-400 uppercase">
            <BarChart4 className="w-3.5 h-3.5" />
            2. Góc nhìn Cơ bản & LN
          </div>
          <p className="text-xs text-terminal-text-secondary leading-relaxed">
            {explanation.fundamentalThesis}
          </p>
        </div>

        {/* Macro Pillar */}
        <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-border/80 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold font-mono text-amber-400 uppercase">
            <Globe2 className="w-3.5 h-3.5" />
            3. Vĩ mô & Ngành
          </div>
          <p className="text-xs text-terminal-text-secondary leading-relaxed">
            {explanation.macroThesis}
          </p>
        </div>
      </div>

      {/* 3. Key Risks Checklist */}
      <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-down/20 space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-bold font-mono text-terminal-down uppercase">
          <AlertTriangle className="w-3.5 h-3.5" />
          Yếu tố rủi ro cần theo dõi sát sao:
        </div>
        <ul className="space-y-1 text-xs text-terminal-text-secondary">
          {explanation.keyRisks.map((risk, idx) => (
            <li key={idx} className="flex items-start gap-1.5">
              <span className="text-terminal-down font-mono text-xs mt-0.5">•</span>
              <span>{risk}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

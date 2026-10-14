import React, { useState } from 'react';
import type { InvestmentHorizon } from '../types/recommendation';
import { HORIZON_LABELS } from '../types/recommendation';
import { RecommendationEngine } from '../lib/analysis/strategy/RecommendationEngine';
import { VIETNAM_STOCKS_UNIVERSE } from '../services/market/stockUniverse';
import { Sparkles, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { formatVND, formatPercent } from '../utils/formatters';

export interface RecommendationsPageProps {
  onSelectStock: (symbol: string) => void;
}

export const RecommendationsPage: React.FC<RecommendationsPageProps> = ({ onSelectStock }) => {
  const [horizon, setHorizon] = useState<InvestmentHorizon>('SHORT_TERM');

  const ranking = RecommendationEngine.rank({
    horizon,
    limit: 12,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-terminal-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h1 className="page-title">Khuyến Nghị Đầu Tư Đa Khung Thời Gian (AI Recommendations)</h1>
            <p className="text-xs text-terminal-text-muted">
              Kết hợp mô hình định lượng Technical + Fundamental + Money Flow + Risk/Reward
            </p>
          </div>
        </div>

        {/* Horizon Selector */}
        <div className="flex items-center gap-1 bg-terminal-surface border border-terminal-border p-1 rounded">
          {(['SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM'] as InvestmentHorizon[]).map((h) => (
            <button
              key={h}
              onClick={() => setHorizon(h)}
              className={`px-3 py-1 text-xs font-mono font-medium rounded transition-colors ${
                horizon === h
                  ? 'bg-terminal-accent text-white font-bold'
                  : 'text-terminal-text-muted hover:text-terminal-text'
              }`}
            >
              {HORIZON_LABELS[h].vi}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {ranking.rankings.map((rec: any) => {
          const meta = VIETNAM_STOCKS_UNIVERSE.find((s) => s.symbol === rec.symbol);
          return (
            <div
              key={rec.symbol}
              onClick={() => onSelectStock(rec.symbol)}
              className="bg-terminal-surface border border-terminal-border rounded p-4 space-y-3 cursor-pointer hover:border-terminal-accent transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base font-bold text-terminal-text">{rec.symbol}</span>
                  <Badge variant="subtle" size="xs">
                    {meta?.exchange ?? 'HOSE'}
                  </Badge>
                </div>
                <Badge
                  variant={rec.signal === 'BUY' ? 'up' : rec.signal === 'SELL' ? 'down' : 'subtle'}
                  size="xs"
                >
                  {rec.signal}
                </Badge>
              </div>


              <div className="text-xs text-terminal-text-muted truncate">
                {meta?.companyName ?? rec.symbol}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-terminal-border/60 text-xs">
                <div>
                  <span className="text-terminal-text-muted block text-[10px] font-mono">ĐIỂM COMPOSITE</span>
                  <span className="font-mono font-bold text-terminal-accent text-sm">{rec.score} / 100</span>
                </div>
                <div>
                  <span className="text-terminal-text-muted block text-[10px] font-mono">KỲ VỌNG LỢI NHUẬN</span>
                  <span className="font-mono font-bold text-emerald-400 text-sm">
                    {rec.targetReturn ? `+${rec.targetReturn.toFixed(1)}%` : '—'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

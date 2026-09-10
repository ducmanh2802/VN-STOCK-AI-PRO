import React, { useState } from 'react';
import {
  Sparkles,
  TrendingUp,
  Target,
  ShieldAlert,
  ArrowUpRight,
  Filter,
  CheckCircle2,
  ChevronRight,
  Layers,
  Scale,
} from 'lucide-react';
import { InvestmentHorizon, HORIZON_LABELS, RecommendationSignal } from '../types/recommendation';
import { useRecommendationRankings } from '../hooks/useMarketQueries';
import { StockRecommendationsView } from '../components/stock/StockRecommendationsView';

interface RecommendationsPageProps {
  onSelectStock: (symbol: string) => void;
}

export const RecommendationsPage: React.FC<RecommendationsPageProps> = ({ onSelectStock }) => {
  const [strategy, setStrategy] = useState<InvestmentHorizon>('SHORT_TERM');
  const [activeTabStock, setActiveTabStock] = useState<string>('FPT');
  const [signalFilter, setSignalFilter] = useState<RecommendationSignal | 'ALL'>('ALL');

  const { data, isLoading } = useRecommendationRankings(strategy);

  const rankings = data?.rankings || [];
  const filteredRankings = signalFilter === 'ALL'
    ? rankings
    : rankings.filter((r) => r.signal === signalFilter);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-emerald-950/40 border border-emerald-500/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold text-white font-mono">AI INVESTMENT RECOMMENDATIONS</h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              PHASE 17
            </span>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl font-sans leading-relaxed">
            Hệ thống chấm điểm chiến lược đa khung thời gian (StrategyScorer + SignalEngine + RiskRewardEngine) dựa trên dữ liệu giao dịch thực tế từ KBS & VPS.
          </p>
        </div>

        {/* Horizon Tabs */}
        <div className="flex items-center bg-slate-950 p-1.5 rounded-xl border border-slate-800 shrink-0">
          {(['SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM'] as InvestmentHorizon[]).map((hz) => {
            const isSelected = strategy === hz;
            return (
              <button
                key={hz}
                onClick={() => setStrategy(hz)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-mono transition-all ${
                  isSelected
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {HORIZON_LABELS[hz].split(' ')[0]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Universe Strategy Rankings Table */}
      <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Bảng Xếp Hạng Khuyến Nghị Theo Chiến Lược ({HORIZON_LABELS[strategy]})
            </h3>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Tổng số mã phân tích: {data?.universeSize ?? 10} mã | Đạt tiêu chuẩn: {filteredRankings.length} mã
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-mono">
            <span className="text-slate-500 px-1.5 text-[11px] flex items-center gap-1">
              <Filter className="w-3 h-3" /> Lọc:
            </span>
            {(['ALL', 'BUY', 'HOLD', 'SELL'] as const).map((sig) => (
              <button
                key={sig}
                onClick={() => setSignalFilter(sig)}
                className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                  signalFilter === sig
                    ? sig === 'BUY'
                      ? 'bg-emerald-500 text-slate-950'
                      : sig === 'SELL'
                      ? 'bg-rose-500 text-white'
                      : sig === 'HOLD'
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {sig === 'ALL' ? 'Tất cả' : sig === 'BUY' ? 'MUA' : sig === 'HOLD' ? 'GIỮ' : 'BÁN'}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="py-12 text-center text-xs font-mono text-slate-400">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Đang chấm điểm xếp hạng chiến lược toàn rổ cổ phiếu...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/40">
                  <th className="py-3 px-3 w-12 text-center">Hạng</th>
                  <th className="py-3 px-3">Mã CP</th>
                  <th className="py-3 px-3">Tín Hiệu</th>
                  <th className="py-3 px-3">Điểm Chiến Lược</th>
                  <th className="py-3 px-3">Kỳ Vọng LN</th>
                  <th className="py-3 px-3">Tỷ Lệ R:R</th>
                  <th className="py-3 px-3">Độ Tin Cậy</th>
                  <th className="py-3 px-3 text-right">Chi Tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredRankings.map((rank) => {
                  const isSelected = activeTabStock === rank.symbol;
                  return (
                    <tr
                      key={rank.symbol}
                      onClick={() => setActiveTabStock(rank.symbol)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-emerald-950/20' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-3 px-3 text-center font-bold text-slate-400">
                        {rank.rank <= 3 ? (
                          <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 inline-flex items-center justify-center font-bold">
                            {rank.rank}
                          </span>
                        ) : (
                          rank.rank
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-bold text-white text-sm hover:text-emerald-400">
                          {rank.symbol}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2.5 py-0.5 rounded text-[11px] font-bold ${
                            rank.signal === 'BUY'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : rank.signal === 'SELL'
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          }`}
                        >
                          {rank.signal === 'BUY' ? 'MUA' : rank.signal === 'SELL' ? 'BÁN' : 'GIỮ'}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-emerald-400 text-sm">
                            {rank.score !== null ? `${rank.score}` : 'N/A'}
                          </span>
                          <span className="text-[10px] text-slate-500">/ 100</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 font-semibold text-emerald-400">
                        {rank.expectedReturn ? `+${rank.expectedReturn.toFixed(1)}%` : '—'}
                      </td>
                      <td className="py-3 px-3 text-slate-300">
                        {rank.riskReward ? `1 : ${rank.riskReward}` : '—'}
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] border border-slate-700">
                          {rank.confidence}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectStock(rank.symbol);
                          }}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-emerald-600 hover:text-slate-950 text-slate-300 text-[11px] font-medium transition-all inline-flex items-center gap-1"
                        >
                          Xem mã <ArrowUpRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Deep-dive Stock Recommendation Panel for Selected Stock */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-200 font-mono uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            Chi Tiết Khuyến Nghị Định Lượng: <span className="text-emerald-400">{activeTabStock}</span>
          </h3>
          <button
            onClick={() => onSelectStock(activeTabStock)}
            className="text-xs font-mono text-emerald-400 hover:underline flex items-center gap-1"
          >
            Mở trang phân tích đầy đủ {activeTabStock} <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <StockRecommendationsView symbol={activeTabStock} />
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Target,
  Clock,
  Compass,
  CheckCircle2,
  AlertTriangle,
  FileSearch,
  Scale,
  Activity,
  Layers,
  Sparkles,
} from 'lucide-react';
import { InvestmentHorizon, HORIZON_LABELS, InvestmentRecommendation } from '../../types/recommendation';
import { useStockRecommendations } from '../../hooks/useMarketQueries';

interface StockRecommendationsViewProps {
  symbol: string;
}

export const StockRecommendationsView: React.FC<StockRecommendationsViewProps> = ({ symbol }) => {
  const [selectedHorizon, setSelectedHorizon] = useState<InvestmentHorizon>('SHORT_TERM');
  const { data, isLoading, error } = useStockRecommendations(symbol);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-slate-900/60 border border-slate-800 rounded-xl space-y-3">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-mono text-slate-400">Đang tổng hợp khuyến nghị đa khung thời gian cho {symbol}...</p>
      </div>
    );
  }

  if (error || !data || data.dataStatus === 'DATA_UNAVAILABLE') {
    return (
      <div className="p-8 bg-slate-900/60 border border-slate-800 rounded-xl text-center space-y-3">
        <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
        <p className="text-base font-bold text-slate-200 font-mono">Dữ liệu phân tích khuyến nghị chưa sẵn sàng</p>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Cần đủ dữ liệu giao dịch thực tế từ KBS và báo cáo tài chính VPS để kích hoạt Engine khuyến nghị.
        </p>
      </div>
    );
  }

  const recs = data.recommendations;
  if (!recs) {
    return null;
  }

  const currentRec: InvestmentRecommendation = recs[selectedHorizon];

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case 'BUY':
        return {
          bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
          badge: 'bg-emerald-500 text-slate-950 font-bold',
          scoreText: 'text-emerald-400',
        };
      case 'SELL':
        return {
          bg: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
          badge: 'bg-rose-500 text-white font-bold',
          scoreText: 'text-rose-400',
        };
      default:
        return {
          bg: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
          badge: 'bg-amber-500 text-slate-950 font-bold',
          scoreText: 'text-amber-400',
        };
    }
  };

  const signalStyle = getSignalColor(currentRec.signal);

  const formatVND = (val?: number | null) => {
    if (val === null || val === undefined) return '—';
    return new Intl.NumberFormat('vi-VN').format(val) + ' đ';
  };

  const formatPercent = (val?: number | null) => {
    if (val === null || val === undefined) return '—';
    const prefix = val > 0 ? '+' : '';
    return `${prefix}${val.toFixed(1)}%`;
  };

  return (
    <div className="space-y-6">
      {/* Header with Horizon Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white font-mono">AI INVESTMENT RECOMMENDATION</h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-800">
                PHASE 17 REAL ENGINE
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Tổng hợp điểm chiến lược, tỷ lệ R:R và luận điểm đa khung thời gian cho {symbol}
            </p>
          </div>
        </div>

        {/* Horizon Switcher Tabs */}
        <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800">
          {(['SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM'] as InvestmentHorizon[]).map((hz) => {
            const isSelected = selectedHorizon === hz;
            return (
              <button
                key={hz}
                onClick={() => setSelectedHorizon(hz)}
                className={`px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-all ${
                  isSelected
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {HORIZON_LABELS[hz].split(' ')[0]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Signal & Overview Bento Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Card 1: Core Action Signal & Score */}
        <div className={`p-6 rounded-xl border ${signalStyle.bg} flex flex-col justify-between space-y-5`}>
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-400">Tín Hiệu Khuyến Nghị</span>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700">
                Độ tin cậy: {currentRec.confidence}
              </span>
            </div>

            <div className="flex items-baseline gap-3 mb-2">
              <span className={`px-4 py-1.5 rounded-lg text-lg font-black font-mono tracking-wide ${signalStyle.badge}`}>
                {currentRec.signal === 'BUY' ? 'KHUYẾN NGHỊ MUA' : currentRec.signal === 'SELL' ? 'KHUYẾN NGHỊ BÁN' : 'THEO DÕI / GIỮ'}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-2">
              Khung thời gian: <strong className="text-white">{HORIZON_LABELS[selectedHorizon]}</strong>
            </p>
          </div>

          <div className="pt-4 border-t border-slate-800/60 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-mono text-slate-400 uppercase">Điểm Chiến Lược</p>
              <p className={`text-3xl font-black font-mono ${signalStyle.scoreText}`}>
                {currentRec.score !== null ? `${currentRec.score}/100` : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-mono text-slate-400 uppercase text-right">Kỳ Vọng LN</p>
              <p className="text-xl font-bold font-mono text-emerald-400 text-right">
                {formatPercent(currentRec.expectedReturn)}
              </p>
            </div>
          </div>
        </div>

        {/* Card 2: Risk / Reward & Price Levels */}
        <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Scale className="w-4 h-4 text-emerald-400" />
              Kế Hoạch Giá & Tỷ Lệ R:R
            </span>
            <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60">
              R:R = 1 : {currentRec.riskReward ?? 'N/A'}
            </span>
          </div>

          <div className="space-y-3 text-xs font-mono">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
              <span className="text-slate-400">Giá hiện tại / Vùng vào</span>
              <span className="font-bold text-white">{formatVND(currentRec.entryPrice)}</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-800/40">
              <div className="flex items-center gap-1.5 text-emerald-400">
                <Target className="w-3.5 h-3.5" />
                <span>Mục tiêu giá ({formatPercent(currentRec.potentialUpside)})</span>
              </div>
              <span className="font-bold text-emerald-400">{formatVND(currentRec.targetPrice)}</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-rose-950/30 border border-rose-800/40">
              <div className="flex items-center gap-1.5 text-rose-400">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Cắt lỗ ({formatPercent(- (currentRec.potentialDownside ?? 0))})</span>
              </div>
              <span className="font-bold text-rose-400">{formatVND(currentRec.stopLoss)}</span>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              Nắm giữ: ~{currentRec.holdingPeriod} ngày
            </span>
            <span className="text-slate-300 font-medium">Lô chuẩn 100 CP</span>
          </div>
        </div>

        {/* Card 3: Component Score Breakdown */}
        <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-blue-400" />
              Trọng Số & Thành Phần Điểm
            </span>
          </div>

          <div className="space-y-2.5">
            {[
              { label: 'Kỹ thuật (Technical)', val: currentRec.scoreBreakdown.technical, color: 'bg-blue-500' },
              { label: 'Cơ bản (Fundamental)', val: currentRec.scoreBreakdown.fundamental, color: 'bg-emerald-500' },
              { label: 'Động lượng (Momentum)', val: currentRec.scoreBreakdown.momentum, color: 'bg-indigo-500' },
              { label: 'Dòng tiền (Money Flow)', val: currentRec.scoreBreakdown.moneyFlow, color: 'bg-purple-500' },
              { label: 'Định giá (Valuation)', val: currentRec.scoreBreakdown.valuation, color: 'bg-cyan-500' },
              { label: 'Rủi ro (Risk Index)', val: currentRec.scoreBreakdown.risk, color: 'bg-amber-500' },
            ].map((item) => (
              <div key={item.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400">{item.label}</span>
                  <span className="font-bold text-slate-200">{item.val !== null ? `${item.val}/100` : 'N/A'}</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${item.color} rounded-full transition-all duration-500`}
                    style={{ width: `${item.val ?? 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Rationale & Warnings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Key Reasons */}
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
          <h4 className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Luận Điểm Đầu Tư Then Chốt
          </h4>
          <ul className="space-y-2">
            {currentRec.reasons.map((reason, idx) => (
              <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-300 font-sans leading-relaxed">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 mt-1.5" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Warnings & Risk Controls */}
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
          <h4 className="text-xs font-mono font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Cảnh Báo & Quản Trị Rủi Ro
          </h4>
          <ul className="space-y-2">
            {currentRec.warnings.map((warning, idx) => (
              <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-300 font-sans leading-relaxed">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 mt-1.5" />
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Evidence Traceability Matrix ("WHY?") */}
      {currentRec.evidence && currentRec.evidence.length > 0 && (
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <FileSearch className="w-4 h-4 text-emerald-400" />
              Truy Xuất Bằng Chứng Định Lượng (Evidence Traceability)
            </h4>
            <span className="text-[11px] font-mono text-slate-400">100% Deterministic Engine</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/40">
                  <th className="py-2.5 px-3">Yếu Tố / Chỉ Số</th>
                  <th className="py-2.5 px-3">Giá Trị</th>
                  <th className="py-2.5 px-3">Kỳ Dữ Liệu</th>
                  <th className="py-2.5 px-3">Nguồn Dữ Liệu</th>
                  <th className="py-2.5 px-3">Công Thức / Cơ Sở Phân Tích</th>
                  <th className="py-2.5 px-3 text-right">Mức Tin Cậy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {currentRec.evidence.map((ev, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-white">{ev.metric}</td>
                    <td className="py-2.5 px-3 text-emerald-400 font-bold">{ev.value}</td>
                    <td className="py-2.5 px-3 text-slate-400">{ev.period ?? 'N/A'}</td>
                    <td className="py-2.5 px-3 text-slate-300">{ev.source}</td>
                    <td className="py-2.5 px-3 text-slate-400 max-w-xs truncate">{ev.calculation ?? 'N/A'}</td>
                    <td className="py-2.5 px-3 text-right">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] border border-slate-700">
                        {ev.confidence}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

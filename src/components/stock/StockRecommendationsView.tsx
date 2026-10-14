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
import { isFiniteNumber, isPositiveFiniteNumber } from './metrics';

interface StockRecommendationsViewProps {
  symbol: string;
}

export const StockRecommendationsView: React.FC<StockRecommendationsViewProps> = ({ symbol }) => {
  const [selectedHorizon, setSelectedHorizon] = useState<InvestmentHorizon>('SHORT_TERM');
  const { data, isLoading, error } = useStockRecommendations(symbol);

  // Canonical fail-closed panel: recommendation unavailable → explicit unavailable
  // state, never fabricated values (Phase 19.5.5).
  const unavailablePanel = (
    <div className="p-8 bg-terminal-text/60 border border-slate-800 rounded-sm text-center space-y-3">
      <AlertTriangle className="w-8 h-8 text-terminal-ref mx-auto" />
      <p className="text-base font-bold text-terminal-text-muted font-mono">Dữ liệu phân tích khuyến nghị chưa sẵn sàng</p>
      <p className="text-xs text-terminal-text-secondary max-w-md mx-auto">
        Cần đủ dữ liệu giao dịch thực tế từ KBS và báo cáo tài chính VPS để kích hoạt Engine khuyến nghị.
      </p>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-terminal-text/60 border border-terminal-text/80 rounded-sm space-y-3">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-mono text-terminal-text-secondary">Đang tổng hợp khuyến nghị đa khung thời gian cho {symbol}...</p>
      </div>
    );
  }

  if (error || !data || data.dataStatus === 'DATA_UNAVAILABLE') {
    return unavailablePanel;
  }

  const recs = data.recommendations;
  if (!recs) {
    return unavailablePanel;
  }

  const currentRec: InvestmentRecommendation | undefined = recs[selectedHorizon];
  if (!currentRec) {
    return unavailablePanel;
  }

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case 'BUY':
        return {
          bg: 'bg-terminal-up/10 border-terminal-up/30 text-terminal-up',
          badge: 'bg-terminal-up text-terminal-text-primary font-bold',
          scoreText: 'text-terminal-up',
        };
      case 'SELL':
        return {
          bg: 'bg-terminal-down/10 border-terminal-down/30 text-terminal-down',
          badge: 'bg-terminal-down/10 text-terminal-text-primary font-bold',
          scoreText: 'text-terminal-down',
        };
      default:
        return {
          bg: 'bg-terminal-ref/10 border-terminal-ref/30 text-terminal-ref',
          badge: 'bg-terminal-ref/10 text-terminal-text-primary font-bold',
          scoreText: 'text-terminal-ref',
        };
    }
  };

  const signalStyle = getSignalColor(currentRec.signal);

  // Fail-closed formatters: null / undefined / NaN / ±Infinity → '—' (never 0, never "NaN").
  const formatVND = (val?: number | null) => {
    if (!isFiniteNumber(val)) return '—';
    return new Intl.NumberFormat('vi-VN').format(val) + ' đ';
  };

  const formatPercent = (val?: number | null) => {
    if (!isFiniteNumber(val)) return '—';
    const prefix = val > 0 ? '+' : '';
    return `${prefix}${val.toFixed(1)}%`;
  };

return (
    <div className="space-y-6">
      {/* Header with Horizon Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-terminal-text/80 border border-slate-800 rounded-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-terminal-up/10 border border-terminal-up/20 flex items-center justify-center text-terminal-up">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white font-mono">AI INVESTMENT RECOMMENDATION</h3>
                <span className="px-2 py-0.5 rounded text-2xs font-mono bg-terminal-up text-terminal-up border border-terminal-up/20">
                PHASE 17 REAL ENGINE
              </span>
            </div>
            <p className="text-xs text-terminal-text-secondary">
              Tổng hợp điểm chiến lược, tỷ lệ R:R và luận điểm đa khung thời gian cho {symbol}
            </p>
          </div>
        </div>

        {/* Horizon Switcher Tabs */}
        <div className="flex items-center bg-terminal-text p-1 rounded-lg border border-slate-800">
          {(['SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM'] as InvestmentHorizon[]).map((hz) => {
            const isSelected = selectedHorizon === hz;
            return (
              <button
                key={hz}
                onClick={() => setSelectedHorizon(hz)}
className={`px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-all ${
              isSelected
                ? 'bg-terminal-up text-terminal-text-primary font-bold shadow-sm'
                : 'text-terminal-text-secondary hover:text-terminal-text'}
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
        <div className={`p-6 rounded-sm border ${signalStyle.bg} flex flex-col justify-between space-y-5`}>
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-mono uppercase tracking-wider text-terminal-text">Tín Hiệu Khuyến Nghị</span>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-terminal-text/80 text-terminal-text border border-slate-700">
                Độ tin cậy: {currentRec.confidence}
              </span>
            </div>

            <div className="flex items-baseline gap-3 mb-2">
              <span className={`px-4 py-1.5 rounded-lg text-lg font-black font-mono tracking-wide ${signalStyle.badge}`}>
                {currentRec.signal === 'BUY' ? 'KHUYẾN NGHỊ MUA' : currentRec.signal === 'SELL' ? 'KHUYẾN NGHỊ BÁN' : 'THEO DÕI / GIỮ'}
              </span>
            </div>
            <p className="text-xs text-terminal-text font-mono mt-2">
              Khung thời gian: <strong className="text-white">{HORIZON_LABELS[selectedHorizon]}</strong>
            </p>
          </div>

          <div className="pt-4 border-t border-slate-800/60 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-mono text-terminal-text uppercase">Điểm Chiến Lược</p>
              <p className={`text-3xl font-black font-mono ${signalStyle.scoreText}`}>
                {isFiniteNumber(currentRec.score) ? `${currentRec.score}/100` : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-mono text-terminal-text uppercase text-right">Kỳ Vọng LN</p>
              <p className="text-xl font-bold font-mono text-emerald-400 text-right">
                {formatPercent(currentRec.expectedReturn)}
              </p>
            </div>
          </div>
        </div>

        {/* Card 2: Risk / Reward & Price Levels */}
        <div className="p-6 rounded-sm bg-terminal-text/80 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-terminal-text flex items-center gap-1.5">
              <Scale className="w-4 h-4 text-emerald-400" />
              Kế Hoạch Giá & Tỷ Lệ R:R
            </span>
<span className="text-xs font-mono font-bold text-terminal-up bg-terminal-up/80 px-2 py-0.5 rounded border border-terminal-up/60">
                R:R = 1 : {isPositiveFiniteNumber(currentRec.riskReward) ? currentRec.riskReward : 'N/A'}
            </span>
          </div>

          <div className="space-y-3 text-xs font-mono">
<div className="flex items-center justify-between p-2.5 rounded-lg bg-terminal-text/60 border border-slate-800">
                <span className="text-terminal-text-secondary">Giá hiện tại / Vùng vào</span>
                <span className="font-bold text-white">{formatVND(currentRec.entryPrice)}</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-terminal-up/30 border border-emerald-800/40">
              <div className="flex items-center gap-1.5 text-emerald-400">
                <Target className="w-3.5 h-3.5" />
                <span>Mục tiêu giá ({formatPercent(currentRec.potentialUpside)})</span>
              </div>
              <span className="font-bold text-emerald-400">{formatVND(currentRec.targetPrice)}</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-terminal-down/30 border border-rose-800/40">
              <div className="flex items-center gap-1.5 text-rose-400">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Cắt lỗ ({formatPercent(isFiniteNumber(currentRec.potentialDownside) ? -currentRec.potentialDownside : null)})</span>
              </div>
              <span className="font-bold text-rose-400">{formatVND(currentRec.stopLoss)}</span>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between text-[11px] font-mono text-terminal-text">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-terminal-text" />
              {isFiniteNumber(currentRec.holdingPeriod) ? `Nắm giữ: ~${currentRec.holdingPeriod} ngày` : 'Nắm giữ: —'}
            </span>
            <span className="text-terminal-text font-medium">Lô chuẩn 100 CP</span>
          </div>
        </div>

        {/* Card 3: Component Score Breakdown */}
        <div className="p-6 rounded-sm bg-terminal-text/80 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-terminal-text flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-blue-400" />
              Trọng Số & Thành Phần Điểm
            </span>
          </div>

          <div className="space-y-2.5">
            {[
              { label: 'Kỹ thuật (Technical)', val: currentRec.scoreBreakdown.technical, color: 'bg-terminal-accent-text' },
              { label: 'Cơ bản (Fundamental)', val: currentRec.scoreBreakdown.fundamental, color: 'bg-terminal-up' },
              { label: 'Động lượng (Momentum)', val: currentRec.scoreBreakdown.momentum, color: 'bg-terminal-accent-text' },
              { label: 'Dòng tiền (Money Flow)', val: currentRec.scoreBreakdown.moneyFlow, color: 'bg-terminal-ceiling' },
              { label: 'Định giá (Valuation)', val: currentRec.scoreBreakdown.valuation, color: 'bg-terminal-floor' },
              { label: 'Rủi ro (Risk Index)', val: currentRec.scoreBreakdown.risk, color: 'bg-terminal-ref' },
            ].map((item) => (
              <div key={item.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-terminal-text">{item.label}</span>
                  <span className="font-bold text-terminal-text-muted">{isFiniteNumber(item.val) ? `${item.val}/100` : 'N/A'}</span>
                </div>
                <div className="w-full h-1.5 bg-terminal-text rounded-full overflow-hidden">
                  <div
                    className={`h-full ${item.color} rounded-full transition-all duration-500`}
                    style={{ width: `${isFiniteNumber(item.val) ? item.val : 0}%` }}
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
        <div className="p-5 rounded-sm bg-terminal-text/60 border border-slate-800 space-y-3">
          <h4 className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Luận Điểm Đầu Tư Then Chốt
          </h4>
          <ul className="space-y-2">
            {currentRec.reasons.map((reason, idx) => (
              <li key={idx} className="flex items-start gap-2.5 text-xs text-terminal-text font-sans leading-relaxed">
                <span className="w-1.5 h-1.5 rounded-full bg-terminal-up shrink-0 mt-1.5" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Warnings & Risk Controls */}
        <div className="p-5 rounded-sm bg-terminal-text/60 border border-slate-800 space-y-3">
          <h4 className="text-xs font-mono font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Cảnh Báo & Quản Trị Rủi Ro
          </h4>
          <ul className="space-y-2">
            {currentRec.warnings.map((warning, idx) => (
              <li key={idx} className="flex items-start gap-2.5 text-xs text-terminal-text font-sans leading-relaxed">
                <span className="w-1.5 h-1.5 rounded-full bg-terminal-ref shrink-0 mt-1.5" />
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Evidence Traceability Matrix ("WHY?") */}
      {currentRec.evidence && currentRec.evidence.length > 0 && (
        <div className="p-5 rounded-sm bg-terminal-text/60 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-mono font-bold text-terminal-text uppercase tracking-wider flex items-center gap-2">
              <FileSearch className="w-4 h-4 text-emerald-400" />
              Truy Xuất Bằng Chứng Định Lượng (Evidence Traceability)
            </h4>
            <span className="text-[11px] font-mono text-terminal-text">100% Deterministic Engine</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-terminal-text bg-terminal-text/40">
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
                  <tr key={idx} className="hover:bg-terminal-text/30 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-white">{ev.metric}</td>
                    <td className="py-2.5 px-3 text-emerald-400 font-bold">{ev.value ?? 'N/A'}</td>
                    <td className="py-2.5 px-3 text-terminal-text">{ev.period ?? 'N/A'}</td>
                    <td className="py-2.5 px-3 text-terminal-text">{ev.source}</td>
                    <td className="py-2.5 px-3 text-terminal-text max-w-xs truncate">{ev.calculation ?? 'N/A'}</td>
                    <td className="py-2.5 px-3 text-right">
                      <span className="px-2 py-0.5 rounded bg-terminal-text text-terminal-text text-[10px] border border-slate-700">
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

import React from "react";
import { TrendingUp, TrendingDown, Minus, Shield, AlertTriangle, Target } from "lucide-react";

export interface StockAnalysisCardProps {
  analysis: Record<string, unknown> | null;
  isLoading: boolean;
}

const signalColor: Record<string, string> = {
  STRONG_BUY: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
  BUY: "text-green-400 bg-green-400/10 border-green-400/30",
  HOLD: "text-amber-400 bg-amber-400/10 border-amber-400/30",
  SELL: "text-red-400 bg-red-400/10 border-red-400/30",
  STRONG_SELL: "text-red-500 bg-red-500/10 border-red-500/30",
};

const signalIcon: Record<string, React.ReactNode> = {
  STRONG_BUY: <TrendingUp className="w-5 h-5" />,
  BUY: <TrendingUp className="w-5 h-5" />,
  HOLD: <Minus className="w-5 h-5" />,
  SELL: <TrendingDown className="w-5 h-5" />,
  STRONG_SELL: <TrendingDown className="w-5 h-5" />,
};

export const StockAnalysisCard: React.FC<StockAnalysisCardProps> = ({ analysis, isLoading }) => {
  if (isLoading) {
    return <div className="p-4 rounded-xl bg-terminal-surface border border-terminal-border text-center text-xs text-terminal-text-muted font-mono">Đang phán tích kỹ thuật...</div>;
  }
  if (!analysis || analysis.dataStatus === "DATA_UNAVAILABLE") {
    return <div className="p-4 rounded-xl bg-terminal-surface border border-terminal-border text-center text-xs text-terminal-text-muted font-mono">Dữ liệu không khả dụng</div>;
  }
  if (analysis.dataStatus === "INSUFFICIENT_DATA") {
    return <div className="p-4 rounded-xl bg-terminal-surface border border-amber-400/30 text-center text-xs text-amber-400 font-mono">Chưa đủ dữ liệu</div>;
  }
  const signal = (analysis.signal as string) || "HOLD";
  const score = (analysis.score as number) || 0;
  const confidence = (analysis.confidence as number) || 0;
  const indicators = (analysis.indicators as Record<string, unknown>) || {};
  const support = (analysis.support as Array<{price: number; strength: number}>) || [];
  const resistance = (analysis.resistance as Array<{price: number; strength: number}>) || [];
  const reasons = (analysis.reasons as string[]) || [];
  const risks = (analysis.risks as string[]) || [];
  const colorClass = signalColor[signal] || signalColor.HOLD;
  const icon = signalIcon[signal] || signalIcon.HOLD;
  return (
    <div className="rounded-xl bg-terminal-surface border border-terminal-border shadow-sm overflow-hidden">
      <div className="p-4 border-b border-terminal-border/70 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-terminal-accent/15 border border-terminal-accent/30 text-terminal-accent"><Target className="w-4 h-4" /></div>
          <h3 className="text-sm font-bold uppercase font-mono tracking-wider text-terminal-text-primary">Phân Tích Kỹ Thuật</h3>
        </div>
      </div>
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg border ${colorClass}`}>{icon}</div>
            <div className={`text-2xl font-bold font-mono ${colorClass.split(" ")[0]}`}>{score}</div>
          </div>
          <div className="text-right">
            <div className={`px-3 py-1 rounded-lg border font-mono font-bold text-sm ${colorClass}`}>{signal.replace("_", " ")}</div>
            <div className="text-[10px] text-terminal-text-muted mt-1">Confidence: {confidence}%</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="p-2 rounded bg-terminal-bg border border-terminal-border/80"><span className="text-terminal-text-muted block">RSI(14)</span><span className="font-bold font-mono text-amber-400">{indicators.rsi14 != null ? String(indicators.rsi14) : "N/A"}</span></div>
          <div className="p-2 rounded bg-terminal-bg border border-terminal-border/80"><span className="text-terminal-text-muted block">MACD</span><span className="font-bold font-mono text-blue-400">{indicators.macdLine != null ? String(indicators.macdLine) : "N/A"}</span></div>
          <div className="p-2 rounded bg-terminal-bg border border-terminal-border/80"><span className="text-terminal-text-muted block">Vol</span><span className="font-bold font-mono text-emerald-400">{indicators.volumeRatio != null ? String(indicators.volumeRatio) + "x" : "N/A"}</span></div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded bg-terminal-bg border border-terminal-border/80"><span className="text-terminal-text-muted block mb-1">Hỗ trợ</span>{support.length > 0 ? support.slice(0,2).map((s,i) => <div key={i} className="font-mono text-emerald-400">{s.price?.toLocaleString("vi-VN")}</div>) : <span className="text-terminal-text-muted">N/A</span>}</div>
          <div className="p-2 rounded bg-terminal-bg border border-terminal-border/80"><span className="text-terminal-text-muted block mb-1">Kháng cự</span>{resistance.length > 0 ? resistance.slice(0,2).map((r,i) => <div key={i} className="font-mono text-red-400">{r.price?.toLocaleString("vi-VN")}</div>) : <span className="text-terminal-text-muted">N/A</span>}</div>
        </div>
        {reasons.length > 0 && <div className="space-y-1"><div className="flex items-center gap-1 text-xs font-bold text-terminal-text-primary"><Shield className="w-3 h-3" /> Lý do</div>{reasons.slice(0,4).map((r,i) => <div key={i} className="text-[11px] text-terminal-text-secondary pl-4">• {r}</div>)}</div>}
        {risks.length > 0 && <div className="space-y-1"><div className="flex items-center gap-1 text-xs font-bold text-amber-400"><AlertTriangle className="w-3 h-3" /> Rủi ro</div>{risks.slice(0,4).map((r,i) => <div key={i} className="text-[11px] text-terminal-text-secondary pl-4">• {r}</div>)}</div>}
      </div>
    </div>
  );
};

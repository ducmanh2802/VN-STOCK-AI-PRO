import React from 'react';
import type { CapitalAllocationResult } from '../../lib/analysis/capitalAllocation';
import { Landmark } from 'lucide-react';

export const StockCapitalAllocation: React.FC<{ analysis: CapitalAllocationResult }> = ({ analysis }) => (
  <section className="p-4 rounded-xl bg-terminal-surface border border-terminal-border space-y-3">
    <div className="flex items-center gap-2 text-sm font-bold uppercase font-mono tracking-wider text-terminal-text-primary">
      <Landmark className="w-4 h-4 text-terminal-accent" /> Phân bổ vốn
    </div>
    {analysis.dataStatus === 'DATA_UNAVAILABLE' ? (
      <div className="text-xs font-mono text-amber-400">DATA_UNAVAILABLE — {analysis.unavailableReasons.join(' ')}</div>
    ) : <>
      <div className="text-2xl font-bold font-mono text-terminal-up">{analysis.score}/100</div>
      <p className="text-xs text-terminal-text-secondary">{analysis.explanations[0]?.summary}</p>
      <div className="grid grid-cols-2 gap-2 text-xs font-mono"><span>Cổ tức / 1.000 tỷ: {analysis.normalizedPer1000Billion.dividend?.toFixed(0)}</span><span>Giữ lại: {analysis.normalizedPer1000Billion.retained?.toFixed(0)}</span></div>
    </>}
    <p className="text-[10px] text-terminal-text-muted">Nguồn: BCTC thực tế; không suy diễn dòng tiền khi thiếu dữ liệu.</p>
  </section>
);

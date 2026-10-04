import React, { useState } from 'react';
import type { MacroCausalChain } from '../../../lib/analysis/macro/types.ts';
import { ArrowRight, Layers, CheckCircle2 } from 'lucide-react';

export interface MacroImpactMapProps {
  chains: readonly MacroCausalChain[];
}

export const MacroImpactMap: React.FC<MacroImpactMapProps> = ({ chains }) => {
  const [selectedChainId, setSelectedChainId] = useState<string>(chains[0]?.id ?? '');

  const activeChain = chains.find((c) => c.id === selectedChainId) ?? chains[0];

  if (!activeChain) {
    return <div className="text-xs text-slate-500 font-mono">Chưa có sơ đồ tác động truyền dẫn</div>;
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded p-3 space-y-3">
      {/* Chain Selector */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-800/80 pb-2.5">
        <div className="text-xs font-semibold font-mono text-slate-400 mr-1 flex items-center gap-1">
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          <span>Chuỗi truyền dẫn:</span>
        </div>
        {chains.map((chain) => (
          <button
            key={chain.id}
            onClick={() => setSelectedChainId(chain.id)}
            className={`px-2.5 py-1 text-xs font-mono rounded transition-colors ${
              selectedChainId === chain.id
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 font-semibold'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            {chain.title}
          </button>
        ))}
      </div>

      {/* Causal Transmission Pipeline Steps */}
      <div className="space-y-2">
        <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
          Cơ chế lan truyền vĩ mô sang thị trường chứng khoán Việt Nam:
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          {activeChain.steps.map((step) => (
            <div
              key={step.order}
              className="p-2.5 rounded bg-slate-950/90 border border-slate-800 flex flex-col justify-between space-y-1.5 relative group hover:border-slate-700"
            >
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-cyan-400 font-bold">Bước {step.order}</span>
                <span
                  className={`px-1 py-0.2 rounded font-semibold text-[9px] ${
                    step.direction === 'POSITIVE'
                      ? 'bg-emerald-950 text-emerald-400'
                      : step.direction === 'NEGATIVE'
                      ? 'bg-rose-950 text-rose-400'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {step.direction}
                </span>
              </div>
              <div className="text-xs font-bold text-white font-mono">{step.node}</div>
              <p className="text-[11px] text-slate-400 leading-snug">{step.impact}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Explanation & Sector Impacts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 border-t border-slate-800/80">
        <div className="md:col-span-2 p-2.5 rounded bg-slate-950/60 border border-slate-800/60 space-y-1">
          <div className="text-[11px] font-mono text-slate-400 font-semibold">Tóm lược phân tích:</div>
          <p className="text-xs text-slate-300 leading-relaxed">{activeChain.explanationVi}</p>
        </div>

        <div className="p-2.5 rounded bg-slate-950/60 border border-slate-800/60 space-y-1">
          <div className="text-[11px] font-mono text-slate-400 font-semibold">Ngành chịu tác động chính:</div>
          <div className="space-y-1">
            {activeChain.affectedSectors.map((sec, i) => (
              <div key={i} className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-300">{sec.sector}</span>
                <span
                  className={`text-[10px] font-bold ${
                    sec.impact === 'POSITIVE'
                      ? 'text-emerald-400'
                      : sec.impact === 'NEGATIVE'
                      ? 'text-rose-400'
                      : 'text-amber-400'
                  }`}
                >
                  {sec.impact}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

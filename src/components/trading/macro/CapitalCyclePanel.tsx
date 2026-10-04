/**
 * PHASE 26 — INDUSTRY CAPITAL CYCLE PANEL
 * =======================================
 * Institutional financial terminal panel displaying the 6-stage capital cycle
 * state, driver diagnostics, and non-recommendation analytical notes.
 */

import React from 'react';
import type { IndustryCapitalCycleSnapshot } from '../../../lib/capital-cycle/types.ts';

interface CapitalCyclePanelProps {
  snapshot: IndustryCapitalCycleSnapshot | null;
}

export const CapitalCyclePanel: React.FC<CapitalCyclePanelProps> = ({ snapshot }) => {
  if (!snapshot) {
    return (
      <div className="bg-[#0f172a] border border-slate-800 rounded-lg p-4 text-xs text-slate-500 italic">
        Capital cycle intelligence unavailable for this sector.
      </div>
    );
  }

  const { stage, cycleScore, drivers, keyObservations } = snapshot;

  const stageColorMap: Record<string, string> = {
    EARLY_CYCLE: 'bg-indigo-950 text-indigo-400 border-indigo-800/40',
    ACCELERATING: 'bg-emerald-950 text-emerald-400 border-emerald-800/40',
    EXPANDING: 'bg-cyan-950 text-cyan-400 border-cyan-800/40',
    PEAKING: 'bg-amber-950 text-amber-400 border-amber-800/40',
    DECELERATING: 'bg-orange-950 text-orange-400 border-orange-800/40',
    CAPITAL_DESTRUCTION: 'bg-rose-950 text-rose-400 border-rose-800/40',
    UNKNOWN: 'bg-slate-800 text-slate-400 border-slate-700',
  };

  return (
    <div className="bg-[#0f172a] border border-slate-800 rounded-lg p-4 space-y-4 text-slate-200">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-cyan-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Industry Capital Cycle — {snapshot.sectorName}
          </h3>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-[11px] font-mono text-slate-400">
            Score: <strong className="text-cyan-400 font-bold">{cycleScore ?? 'N/A'}/100</strong>
          </span>
          <span
            className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
              stageColorMap[stage] || stageColorMap.UNKNOWN
            }`}
          >
            {stage}
          </span>
        </div>
      </div>

      {/* Drivers Matrix */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
        <div className="bg-[#1e293b]/70 border border-slate-700/60 rounded p-2">
          <div className="text-slate-400 text-[10px]">Policy Support</div>
          <div className="font-mono font-bold text-slate-200">
            {drivers.policySupportScore !== null ? `${drivers.policySupportScore}/100` : 'N/A'}
          </div>
        </div>
        <div className="bg-[#1e293b]/70 border border-slate-700/60 rounded p-2">
          <div className="text-slate-400 text-[10px]">Disbursement Velocity</div>
          <div className="font-mono font-bold text-slate-200">
            {drivers.publicInvestmentVelocity !== null ? `${(drivers.publicInvestmentVelocity * 100).toFixed(0)}%` : 'N/A'}
          </div>
        </div>
        <div className="bg-[#1e293b]/70 border border-slate-700/60 rounded p-2">
          <div className="text-slate-400 text-[10px]">Private Capex Trend</div>
          <div className="font-mono font-bold text-slate-200">
            {drivers.privateCapexTrend}
          </div>
        </div>
        <div className="bg-[#1e293b]/70 border border-slate-700/60 rounded p-2">
          <div className="text-slate-400 text-[10px]">Capacity Utilization</div>
          <div className="font-mono font-bold text-slate-200">
            {drivers.industryCapacityUtilizationPercent !== null ? `${drivers.industryCapacityUtilizationPercent}%` : 'N/A'}
          </div>
        </div>
      </div>

      {/* Key Observations */}
      {keyObservations.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <h4 className="text-[10px] font-semibold text-slate-400 uppercase">
            Diagnostic Observations
          </h4>
          <ul className="space-y-1 text-xs text-slate-300">
            {keyObservations.map((obs, idx) => (
              <li key={idx} className="flex items-start space-x-1.5">
                <span className="text-cyan-400">•</span>
                <span>{obs}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-[10px] text-slate-500 italic border-t border-slate-800/80 pt-2">
        * Chu kỳ vốn ngành mang tính phân tích mô tả hiện trạng cung cầu và đầu tư, không cấu thành khuyến nghị mua/bán cổ phiếu.
      </div>
    </div>
  );
};

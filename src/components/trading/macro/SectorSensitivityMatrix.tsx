import React from 'react';
import type { SectorMacroSensitivity } from '../../../lib/analysis/macro/types.ts';
import { Table, Layers } from 'lucide-react';

export interface SectorSensitivityMatrixProps {
  sensitivities: readonly SectorMacroSensitivity[];
  onSelectStock?: (symbol: string) => void;
}

export const SectorSensitivityMatrix: React.FC<SectorSensitivityMatrixProps> = ({
  sensitivities,
  onSelectStock,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded p-3 space-y-2.5">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
        <div className="flex items-center gap-2">
          <Table className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-semibold font-mono uppercase text-slate-200">
            Ma trận Độ nhạy Vĩ mô theo Nhóm ngành (Sector Sensitivity Matrix)
          </h3>
        </div>
        <span className="text-[10px] font-mono text-slate-500">Mô hình định lượng chuẩn ICB</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead>
            <tr className="border-b border-slate-800 text-[11px] text-slate-400 bg-slate-950/60">
              <th className="py-2 px-3 font-semibold">Ngành</th>
              <th className="py-2 px-3 font-semibold">Yếu tố Vĩ mô Chi phối</th>
              <th className="py-2 px-2.5 font-semibold text-center">Độ nhạy</th>
              <th className="py-2 px-2.5 font-semibold text-center">Chiều hướng</th>
              <th className="py-2 px-3 font-semibold">Cơ sở Phân tích (Rationale)</th>
              <th className="py-2 px-3 font-semibold">Mã đại diện</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {sensitivities.map((s) => (
              <tr key={s.sectorId} className="hover:bg-slate-800/40 transition-colors">
                <td className="py-2.5 px-3 font-bold text-white whitespace-nowrap">{s.sectorNameVi}</td>
                <td className="py-2.5 px-3 text-cyan-300 whitespace-nowrap">{s.primaryDriver}</td>
                <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      s.sensitivity === 'HIGH'
                        ? 'bg-rose-950/80 text-rose-400 border border-rose-800/50'
                        : s.sensitivity === 'MEDIUM'
                        ? 'bg-amber-950/80 text-amber-400 border border-amber-800/50'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {s.sensitivity}
                  </span>
                </td>
                <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      s.direction === 'POSITIVE'
                        ? 'text-emerald-400'
                        : s.direction === 'NEGATIVE'
                        ? 'text-rose-400'
                        : 'text-amber-400'
                    }`}
                  >
                    {s.direction === 'POSITIVE' ? 'Thuận (+)' : s.direction === 'NEGATIVE' ? 'Nghịch (-)' : 'Phân hóa'}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-[11px] text-slate-400 leading-relaxed max-w-md">
                  {s.rationaleVi}
                </td>
                <td className="py-2.5 px-3 whitespace-nowrap">
                  <div className="flex flex-wrap gap-1">
                    {s.keyStocks.map((sym) => (
                      <button
                        key={sym}
                        onClick={() => onSelectStock?.(sym)}
                        className="px-1.5 py-0.5 rounded bg-slate-950 hover:bg-slate-800 text-[10px] text-slate-300 hover:text-cyan-400 border border-slate-800 transition-colors"
                      >
                        {sym}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

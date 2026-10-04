import React from 'react';
import type { MacroRegimeResult, CentralBankPolicy } from '../../../lib/analysis/macro/types.ts';
import type { MacroRegimeSnapshot } from '../../../lib/macro-regime/types.ts';
import { ShieldCheck, Activity, Landmark, Compass, CheckCircle2 } from 'lucide-react';

export interface MacroRegimeCardProps {
  regime: MacroRegimeResult;
  centralBanks: readonly CentralBankPolicy[];
  macroRegimeSnapshot?: MacroRegimeSnapshot | null;
}

export const MacroRegimeCard: React.FC<MacroRegimeCardProps> = ({ regime, centralBanks, macroRegimeSnapshot }) => {
  const { score, subScores, keyFactorsVi, rationaleVi } = regime;

  const getSubScoreColor = (val: number) => {
    if (val >= 65) return 'bg-emerald-500 text-emerald-400';
    if (val <= 40) return 'bg-rose-500 text-rose-400';
    return 'bg-cyan-500 text-cyan-400';
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded p-3 space-y-3">
      {/* Top Title & Overall Score */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-semibold font-mono uppercase text-slate-200">
            Chế độ Vĩ mô Tổng thể: <span className="text-cyan-400">{regime.regime}</span>
          </h3>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-slate-400">Điểm tổng hợp:</span>
          <span className="font-bold text-white tabular-nums bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
            {score}/100
          </span>
        </div>
      </div>

      {/* 6 Sub-Scores Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono">
        <div className="p-2 rounded bg-slate-950/80 border border-slate-800/70 space-y-1">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Thanh khoản (25%)</span>
            <span className="font-semibold text-slate-200 tabular-nums">{subScores.liquidity}</span>
          </div>
          <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-full ${getSubScoreColor(subScores.liquidity).split(' ')[0]}`} style={{ width: `${subScores.liquidity}%` }} />
          </div>
        </div>

        <div className="p-2 rounded bg-slate-950/80 border border-slate-800/70 space-y-1">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Lãi suất (20%)</span>
            <span className="font-semibold text-slate-200 tabular-nums">{subScores.interestRates}</span>
          </div>
          <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-full ${getSubScoreColor(subScores.interestRates).split(' ')[0]}`} style={{ width: `${subScores.interestRates}%` }} />
          </div>
        </div>

        <div className="p-2 rounded bg-slate-950/80 border border-slate-800/70 space-y-1">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Áp lực Tỷ giá (20%)</span>
            <span className="font-semibold text-slate-200 tabular-nums">{subScores.fxPressure}</span>
          </div>
          <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-full ${getSubScoreColor(subScores.fxPressure).split(' ')[0]}`} style={{ width: `${subScores.fxPressure}%` }} />
          </div>
        </div>

        <div className="p-2 rounded bg-slate-950/80 border border-slate-800/70 space-y-1">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Hàng hóa & Lạm phát (15%)</span>
            <span className="font-semibold text-slate-200 tabular-nums">{subScores.commodities}</span>
          </div>
          <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-full ${getSubScoreColor(subScores.commodities).split(' ')[0]}`} style={{ width: `${subScores.commodities}%` }} />
          </div>
        </div>

        <div className="p-2 rounded bg-slate-950/80 border border-slate-800/70 space-y-1">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Rủi ro Toàn cầu (10%)</span>
            <span className="font-semibold text-slate-200 tabular-nums">{subScores.globalRisk}</span>
          </div>
          <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-full ${getSubScoreColor(subScores.globalRisk).split(' ')[0]}`} style={{ width: `${subScores.globalRisk}%` }} />
          </div>
        </div>

        <div className="p-2 rounded bg-slate-950/80 border border-slate-800/70 space-y-1">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Khối ngoại (10%)</span>
            <span className="font-semibold text-slate-200 tabular-nums">{subScores.foreignFlow}</span>
          </div>
          <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-full ${getSubScoreColor(subScores.foreignFlow).split(' ')[0]}`} style={{ width: `${subScores.foreignFlow}%` }} />
          </div>
        </div>
      </div>

      {/* Rationale & Key Factors */}
      <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800/60 text-xs space-y-1.5">
        <p className="text-slate-300 font-medium leading-relaxed">{rationaleVi}</p>
        <div className="space-y-1 pt-1 border-t border-slate-900">
          {keyFactorsVi.map((factor, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[11px] text-slate-400">
              <span className="text-cyan-400">·</span>
              <span>{factor}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Central Banks Policy Table */}
      <div className="space-y-1.5 pt-1">
        <div className="text-[11px] font-semibold font-mono uppercase text-slate-400 flex items-center gap-1.5">
          <Landmark className="w-3.5 h-3.5 text-cyan-400" />
          <span>Lãi suất Điều hành các NHTW Chủ chốt</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-1.5">
          {centralBanks.map((cb) => (
            <div key={cb.code} className="p-2 rounded bg-slate-950/80 border border-slate-800/80 text-xs font-mono space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-200">{cb.code}</span>
                <span
                  className={`text-[9px] px-1 py-0.2 rounded font-semibold ${
                    cb.stance === 'DOVISH'
                      ? 'bg-emerald-950 text-emerald-400'
                      : cb.stance === 'HAWKISH'
                      ? 'bg-rose-950 text-rose-400'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {cb.stance}
                </span>
              </div>
              <div className="text-sm font-bold text-white tabular-nums">
                {cb.policyRate !== null ? `${cb.policyRate.toFixed(2)}%` : '--'}
              </div>
              <p className="text-[9px] text-slate-500 truncate" title={cb.name}>
                {cb.name}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Phase 27 Economic Cycle Quadrant & 5 Sub-States */}
      {macroRegimeSnapshot && (
        <div className="pt-2 border-t border-slate-800/80 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold font-mono uppercase text-slate-300">
              <Compass className="w-3.5 h-3.5 text-amber-400" />
              <span>Chu kỳ Kinh tế Vĩ mô (Phase 27):</span>
              <span className="text-amber-400 font-bold">{macroRegimeSnapshot.macroRegime}</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
              <span>Độ bao phủ: <strong className="text-slate-200">{macroRegimeSnapshot.dataCoverage}</strong></span>
              <span>·</span>
              <span>Tin cậy: <strong className="text-slate-200">{macroRegimeSnapshot.confidencePercent}%</strong></span>
              <span>·</span>
              <span>Trạng thái: <strong className="text-emerald-400">{macroRegimeSnapshot.dataFreshness}</strong></span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-xs font-mono">
            <div className="p-2 rounded bg-slate-950 border border-slate-800 space-y-0.5">
              <div className="text-[10px] text-slate-500 uppercase">Tăng trưởng</div>
              <div className="text-xs font-bold text-emerald-400">{macroRegimeSnapshot.growthState}</div>
            </div>
            <div className="p-2 rounded bg-slate-950 border border-slate-800 space-y-0.5">
              <div className="text-[10px] text-slate-500 uppercase">Lạm phát</div>
              <div className="text-xs font-bold text-cyan-400">{macroRegimeSnapshot.inflationState}</div>
            </div>
            <div className="p-2 rounded bg-slate-950 border border-slate-800 space-y-0.5">
              <div className="text-[10px] text-slate-500 uppercase">Tiền tệ</div>
              <div className="text-xs font-bold text-indigo-400">{macroRegimeSnapshot.monetaryState}</div>
            </div>
            <div className="p-2 rounded bg-slate-950 border border-slate-800 space-y-0.5">
              <div className="text-[10px] text-slate-500 uppercase">Khu vực Đối ngoại</div>
              <div className="text-xs font-bold text-purple-400">{macroRegimeSnapshot.externalSectorState}</div>
            </div>
            <div className="p-2 rounded bg-slate-950 border border-slate-800 space-y-0.5">
              <div className="text-[10px] text-slate-500 uppercase">Điều kiện Tài chính</div>
              <div className="text-xs font-bold text-amber-400">{macroRegimeSnapshot.financialConditionsState}</div>
            </div>
          </div>

          {macroRegimeSnapshot.transition?.isShift && (
            <div className="p-2 rounded bg-amber-950/40 border border-amber-800/60 text-[11px] font-mono text-amber-300">
              {macroRegimeSnapshot.transition.shiftDescriptionVi}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

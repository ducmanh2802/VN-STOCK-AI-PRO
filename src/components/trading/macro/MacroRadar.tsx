import React, { useState } from 'react';
import type { MacroRadarSnapshot, MacroMetricRecord } from '../../../lib/analysis/macro/types.ts';
import { MacroMetric } from './MacroMetric.tsx';
import { MacroRegimeCard } from './MacroRegimeCard.tsx';
import { MacroImpactMap } from './MacroImpactMap.tsx';
import { SectorSensitivityMatrix } from './SectorSensitivityMatrix.tsx';
import { MacroEventCalendar } from './MacroEventCalendar.tsx';
import { ChevronDown, ChevronUp, Globe, AlertTriangle, Layers, Calendar, BarChart2 } from 'lucide-react';

export interface MacroRadarProps {
  snapshot?: MacroRadarSnapshot | null;
  isLoading?: boolean;
  onSelectMetric?: (metric: MacroMetricRecord) => void;
  selectedMetricCode?: string;
  defaultExpanded?: boolean;
}

export const MacroRadar: React.FC<MacroRadarProps> = ({
  snapshot,
  isLoading = false,
  onSelectMetric,
  selectedMetricCode,
  defaultExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [activeTab, setActiveTab] = useState<'REGIME' | 'IMPACT' | 'SECTORS' | 'CALENDAR'>('REGIME');

  if (isLoading) {
    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded p-3 text-xs font-mono text-slate-400 flex items-center justify-between animate-pulse">
        <span className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-cyan-400 animate-spin" />
          Đang đồng bộ dữ liệu Vĩ mô toàn cầu & Việt Nam...
        </span>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded p-2 text-xs font-mono text-slate-500">
        Chưa có dữ liệu Macro Radar
      </div>
    );
  }

  const { benchmarkRadar, regime, centralBanks, impactChains, sectorSensitivities, upcomingEvents, activeAlerts } = snapshot;

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-md overflow-hidden transition-all duration-200">
      {/* Top Bar / Header */}
      <div className="bg-slate-900/90 px-3 py-2 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-cyan-400 font-semibold text-xs tracking-wider uppercase font-mono">
            <Globe className="w-3.5 h-3.5" />
            <span>Macro Radar</span>
          </div>

          <span className="text-slate-600">|</span>

          {/* Quick Regime Badge */}
          <div className="inline-flex items-center gap-1.5 text-xs font-mono">
            <span className="text-slate-400 text-[11px]">Chế độ vĩ mô:</span>
            <span
              className={`px-1.5 py-0.2 rounded text-[11px] font-semibold ${
                regime.regime === 'EXPANDING' || regime.regime === 'ACCOMMODATIVE'
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50'
                  : regime.regime === 'CAUTIOUS' || regime.regime === 'INFLATIONARY'
                  ? 'bg-amber-950 text-amber-400 border border-amber-800/50'
                  : regime.regime === 'TIGHTENING' || regime.regime === 'ELEVATED_RISK'
                  ? 'bg-rose-950 text-rose-400 border border-rose-800/50'
                  : 'bg-slate-800 text-slate-300'
              }`}
            >
              {regime.regime}
            </span>
          </div>

          {activeAlerts.length > 0 && (
            <div className="hidden sm:flex items-center gap-1 text-[11px] font-mono text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40">
              <AlertTriangle className="w-3 h-3" />
              <span>{activeAlerts.length} cảnh báo vĩ mô</span>
            </div>
          )}
        </div>

        {/* Action button to expand deep macro analysis */}
        <button
          onClick={() => setIsExpanded((prev) => !prev)}
          className="flex items-center gap-1 text-[11px] font-mono text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 px-2 py-1 rounded transition-colors"
        >
          <span>{isExpanded ? 'Thu gọn' : 'Chi tiết vĩ mô'}</span>
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Benchmark Metric Grid (Always visible 8 core metrics) */}
      <div className="p-2 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5 bg-slate-950/70">
        {benchmarkRadar.map((metric) => (
          <MacroMetric
            key={metric.id}
            metric={metric}
            onClick={() => onSelectMetric?.(metric)}
            isSelected={selectedMetricCode === metric.code}
          />
        ))}
      </div>

      {/* Expanded Deep Analysis Panel */}
      {isExpanded && (
        <div className="border-t border-slate-800 bg-slate-900/60 p-3 space-y-3">
          {/* Sub-Tabs */}
          <div className="flex items-center gap-1 border-b border-slate-800 pb-2">
            <button
              onClick={() => setActiveTab('REGIME')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-mono rounded transition-colors ${
                activeTab === 'REGIME'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>Mô hình Chế độ Vĩ mô</span>
            </button>
            <button
              onClick={() => setActiveTab('IMPACT')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-mono rounded transition-colors ${
                activeTab === 'IMPACT'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Sơ đồ Tác động Truyền dẫn</span>
            </button>
            <button
              onClick={() => setActiveTab('SECTORS')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-mono rounded transition-colors ${
                activeTab === 'SECTORS'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Độ nhạy Ngành (Sensitivity)</span>
            </button>
            <button
              onClick={() => setActiveTab('CALENDAR')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-mono rounded transition-colors ${
                activeTab === 'CALENDAR'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Lịch Sự kiện Vĩ mô</span>
            </button>
          </div>

          {/* Tab Content */}
          <div className="pt-1">
            {activeTab === 'REGIME' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="lg:col-span-2">
                  <MacroRegimeCard regime={regime} centralBanks={centralBanks} />
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded p-3 space-y-2">
                  <div className="text-xs font-semibold font-mono uppercase text-slate-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    <span>Cảnh báo Vĩ mô Trọng yếu</span>
                  </div>
                  {activeAlerts.length === 0 ? (
                    <p className="text-xs text-slate-500 font-mono py-4 text-center">
                      Không có chỉ báo nào vi phạm ngưỡng biến động bất thường.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {activeAlerts.map((alert) => (
                        <div
                          key={alert.id}
                          className="p-2 rounded bg-slate-950 border border-amber-500/30 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between font-mono text-[11px]">
                            <span className="font-semibold text-amber-400">{alert.metricName}</span>
                            <span className="text-slate-500">{alert.severity}</span>
                          </div>
                          <p className="text-slate-300 text-[11px] leading-relaxed">{alert.messageVi}</p>
                          <p className="text-slate-400 text-[10px] italic">{alert.impactSummaryVi}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'IMPACT' && <MacroImpactMap chains={impactChains} />}

            {activeTab === 'SECTORS' && <SectorSensitivityMatrix sensitivities={sectorSensitivities} />}

            {activeTab === 'CALENDAR' && <MacroEventCalendar events={upcomingEvents} />}
          </div>
        </div>
      )}
    </div>
  );
};

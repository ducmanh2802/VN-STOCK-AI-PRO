import React from 'react';
import type { MacroCalendarEvent } from '../../../lib/analysis/macro/types.ts';
import { Calendar, Clock, AlertCircle } from 'lucide-react';

export interface MacroEventCalendarProps {
  events: readonly MacroCalendarEvent[];
}

export const MacroEventCalendar: React.FC<MacroEventCalendarProps> = ({ events }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded p-3 space-y-2.5">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-semibold font-mono uppercase text-slate-200">
            Lịch Công bố Dữ liệu & Sự kiện Vĩ mô (Macroeconomic Calendar)
          </h3>
        </div>
        <span className="text-[10px] font-mono text-slate-500">Giờ Việt Nam (ICT / GMT+7)</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead>
            <tr className="border-b border-slate-800 text-[11px] text-slate-400 bg-slate-950/60">
              <th className="py-2 px-3 font-semibold">Thời gian</th>
              <th className="py-2 px-2.5 font-semibold text-center">Quốc gia</th>
              <th className="py-2 px-3 font-semibold">Sự kiện / Chỉ số</th>
              <th className="py-2 px-2.5 font-semibold text-center">Mức độ</th>
              <th className="py-2 px-3 font-semibold text-right">Thực tế (Actual)</th>
              <th className="py-2 px-3 font-semibold text-right">Dự báo (Forecast)</th>
              <th className="py-2 px-3 font-semibold text-right">Kỳ trước (Previous)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {events.map((evt) => (
              <tr key={evt.id} className="hover:bg-slate-800/40 transition-colors">
                <td className="py-2.5 px-3 whitespace-nowrap text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span>{evt.date}</span>
                    {evt.time && <span className="text-slate-500 text-[10px]">({evt.time})</span>}
                  </div>
                </td>
                <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                  <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] font-bold text-slate-300">
                    {evt.country}
                  </span>
                </td>
                <td className="py-2.5 px-3">
                  <div className="font-semibold text-white">{evt.eventNameVi}</div>
                  <div className="text-[10px] text-slate-500">{evt.eventName}</div>
                </td>
                <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      evt.importance === 'HIGH'
                        ? 'bg-rose-950/80 text-rose-400 border border-rose-800/50'
                        : evt.importance === 'MEDIUM'
                        ? 'bg-amber-950/80 text-amber-400 border border-amber-800/50'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {evt.importance === 'HIGH' ? 'Rất cao' : evt.importance === 'MEDIUM' ? 'Trung bình' : 'Thấp'}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right font-bold tabular-nums whitespace-nowrap">
                  {evt.actual !== null ? (
                    <span className="text-cyan-400">{evt.actual}</span>
                  ) : (
                    <span className="text-slate-600">--</span>
                  )}
                </td>
                <td className="py-2.5 px-3 text-right text-slate-400 tabular-nums whitespace-nowrap">
                  {evt.forecast !== null ? evt.forecast : '--'}
                </td>
                <td className="py-2.5 px-3 text-right text-slate-500 tabular-nums whitespace-nowrap">
                  {evt.previous !== null ? evt.previous : '--'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

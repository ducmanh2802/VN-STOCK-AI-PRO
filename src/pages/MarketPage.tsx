import { IndexData } from '../types/market';
import { SectorHeatmapItem, TopMover } from '../types/stock';
import { MarketOverview } from '../components/dashboard/MarketOverview';
import { MarketHeatmap } from '../components/dashboard/MarketHeatmap';
import { TopMovers } from '../components/dashboard/TopMovers';
import { DemoBadge } from '../components/common/DemoBadge';
import { formatBillionVND, formatPercent } from '../utils/formatters';

interface MarketPageProps {
  indices: IndexData[];
  sectors: SectorHeatmapItem[];
  gainers: TopMover[];
  losers: TopMover[];
  active: TopMover[];
  onSelectStock: (symbol: string) => void;
}

export function MarketPage({
  indices,
  sectors,
  gainers,
  losers,
  active,
  onSelectStock,
}: MarketPageProps) {
  return (
    <div id="page-market" className="space-y-6">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-white font-mono uppercase tracking-tight">
            Thị Trường & Các Nhóm Ngành
          </h1>
          <p className="text-xs text-slate-400">
            Chi tiết các chỉ số HOSE, HNX, UPCOM và diễn biến dòng tiền các phân khúc ngành
          </p>
        </div>
        <DemoBadge size="md" />
      </div>

      <MarketOverview indices={indices} />

      <MarketHeatmap sectors={sectors} onSelectStock={onSelectStock} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopMovers
          gainers={gainers}
          losers={losers}
          active={active}
          onSelectStock={onSelectStock}
        />

        {/* Sector Distribution Summary */}
        <div className="p-4 rounded-lg bg-[#111622] border border-slate-800 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="text-sm font-bold font-mono text-slate-200 uppercase">
              Thống Kê Vốn Hóa & Hiệu Suất Ngành
            </h3>
            <span className="text-[10px] font-mono text-slate-400">11 Ngành Trọng Điểm</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 px-2">Ngành</th>
                  <th className="py-2 px-2 text-right">Hiệu suất</th>
                  <th className="py-2 px-2 text-right">Vốn hóa</th>
                  <th className="py-2 px-2 text-center">Mã dẫn dắt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {sectors.map((sec) => (
                  <tr key={sec.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2 px-2 font-semibold text-slate-200">{sec.name}</td>
                    <td
                      className={`py-2 px-2 text-right font-bold ${
                        sec.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {formatPercent(sec.changePercent)}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-300">
                      {formatBillionVND(sec.marketCap)}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <button
                        onClick={() => onSelectStock(sec.leaderSymbol)}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-300 transition-colors font-bold"
                      >
                        {sec.leaderSymbol}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

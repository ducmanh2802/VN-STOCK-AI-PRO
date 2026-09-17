import React from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, ArrowUpRight } from 'lucide-react';
import { RecommendationRanking } from '../../types/recommendation';
import {
  RankingSortKey,
  SortDirection,
  formatRank,
  formatScore,
  formatExpectedReturn,
  formatRiskReward,
  formatDataStatus,
  isFiniteNumber,
} from './metrics';

export interface RankingsTableProps {
  rankings: RecommendationRanking[];
  activeStockSymbol: string;
  sortBy: RankingSortKey;
  sortOrder: SortDirection;
  onSort: (key: RankingSortKey) => void;
  onSelectRowStock: (symbol: string) => void;
  onNavigateToStock: (symbol: string) => void;
}

export const RankingsTable: React.FC<RankingsTableProps> = ({
  rankings,
  activeStockSymbol,
  sortBy,
  sortOrder,
  onSort,
  onSelectRowStock,
  onNavigateToStock,
}) => {
  const renderSortIndicator = (key: RankingSortKey) => {
    if (sortBy !== key) {
      return <ArrowUpDown className="w-3 h-3 text-slate-600 opacity-60 group-hover:opacity-100" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-emerald-400" />
    ) : (
      <ArrowDown className="w-3 h-3 text-emerald-400" />
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs font-mono" aria-label="Bảng xếp hạng chiến lược khuyến nghị">
        <thead>
          <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/40 select-none">
            <th
              onClick={() => onSort('rank')}
              className="py-3 px-3 w-16 text-center cursor-pointer hover:text-slate-200 group"
              title="Sắp xếp theo thứ hạng"
            >
              <div className="flex items-center justify-center gap-1">
                Hạng {renderSortIndicator('rank')}
              </div>
            </th>
            <th
              onClick={() => onSort('symbol')}
              className="py-3 px-3 cursor-pointer hover:text-slate-200 group"
              title="Sắp xếp theo mã cổ phiếu"
            >
              <div className="flex items-center gap-1">
                Mã CP / Doanh nghiệp {renderSortIndicator('symbol')}
              </div>
            </th>
            <th
              onClick={() => onSort('signal')}
              className="py-3 px-3 cursor-pointer hover:text-slate-200 group"
              title="Sắp xếp theo tín hiệu"
            >
              <div className="flex items-center gap-1">
                Tín Hiệu {renderSortIndicator('signal')}
              </div>
            </th>
            <th
              onClick={() => onSort('score')}
              className="py-3 px-3 cursor-pointer hover:text-slate-200 group"
              title="Sắp xếp theo điểm chiến lược"
            >
              <div className="flex items-center gap-1">
                Điểm Chiến Lược {renderSortIndicator('score')}
              </div>
            </th>
            <th
              onClick={() => onSort('expectedReturn')}
              className="py-3 px-3 cursor-pointer hover:text-slate-200 group"
              title="Sắp xếp theo kỳ vọng lợi nhuận"
            >
              <div className="flex items-center gap-1">
                Kỳ Vọng LN {renderSortIndicator('expectedReturn')}
              </div>
            </th>
            <th
              onClick={() => onSort('riskReward')}
              className="py-3 px-3 cursor-pointer hover:text-slate-200 group"
              title="Sắp xếp theo tỷ lệ lợi nhuận / rủi ro"
            >
              <div className="flex items-center gap-1">
                Tỷ Lệ R:R {renderSortIndicator('riskReward')}
              </div>
            </th>
            <th
              onClick={() => onSort('confidence')}
              className="py-3 px-3 cursor-pointer hover:text-slate-200 group"
              title="Sắp xếp theo độ tin cậy"
            >
              <div className="flex items-center gap-1">
                Độ Tin Cậy {renderSortIndicator('confidence')}
              </div>
            </th>
            <th
              onClick={() => onSort('status')}
              className="py-3 px-3 cursor-pointer hover:text-slate-200 group"
              title="Sắp xếp theo trạng thái dữ liệu"
            >
              <div className="flex items-center gap-1">
                Trạng Thái {renderSortIndicator('status')}
              </div>
            </th>
            <th className="py-3 px-3 text-right">Chi Tiết</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {rankings.map((rank) => {
            const cleanSymbol = (rank.symbol || '').trim().toUpperCase();
            const isSelected = activeStockSymbol.toUpperCase() === cleanSymbol;
            const rankDisplay = formatRank(rank.rank);
            const isTopThree = isFiniteNumber(rank.rank) && rank.rank >= 1 && rank.rank <= 3;
            const scoreDisplay = formatScore(rank.score);
            const expectedReturnDisplay = formatExpectedReturn(rank.expectedReturn);
            const riskRewardDisplay = formatRiskReward(rank.riskReward);
            const statusInfo = formatDataStatus(rank.dataStatus || (isFiniteNumber(rank.score) ? 'OK' : 'DATA_UNAVAILABLE'));

            return (
              <tr
                key={cleanSymbol}
                onClick={() => onSelectRowStock(cleanSymbol)}
                className={`cursor-pointer transition-colors ${
                  isSelected ? 'bg-emerald-950/20' : 'hover:bg-slate-800/40'
                }`}
                data-testid={`ranking-row-${cleanSymbol}`}
              >
                <td className="py-3 px-3 text-center font-bold text-slate-400">
                  {isTopThree ? (
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 inline-flex items-center justify-center font-bold">
                      {rankDisplay}
                    </span>
                  ) : (
                    rankDisplay
                  )}
                </td>
                <td className="py-3 px-3">
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigateToStock(cleanSymbol);
                      }}
                      className="font-bold text-white text-sm hover:text-emerald-400 text-left transition-colors cursor-pointer inline-block"
                      title={`Xem chi tiết ${cleanSymbol}`}
                    >
                      {cleanSymbol}
                    </button>
                    {rank.companyName && (
                      <span className="text-[11px] text-slate-400 truncate max-w-[220px]" title={rank.companyName}>
                        {rank.companyName}
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-3 px-3">
                  <span
                    className={`px-2.5 py-0.5 rounded text-[11px] font-bold ${
                      rank.signal === 'BUY'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : rank.signal === 'SELL'
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : rank.signal === 'HOLD'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {rank.signal === 'BUY' ? 'MUA' : rank.signal === 'SELL' ? 'BÁN' : rank.signal === 'HOLD' ? 'GIỮ' : '—'}
                  </span>
                </td>
                <td className="py-3 px-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-emerald-400 text-sm">
                      {scoreDisplay}
                    </span>
                    {scoreDisplay !== '—' && (
                      <span className="text-[10px] text-slate-500">/ 100</span>
                    )}
                  </div>
                </td>
                <td
                  className={`py-3 px-3 font-semibold ${
                    isFiniteNumber(rank.expectedReturn)
                      ? rank.expectedReturn > 0
                        ? 'text-emerald-400'
                        : rank.expectedReturn < 0
                        ? 'text-rose-400'
                        : 'text-slate-300'
                      : 'text-slate-500'
                  }`}
                >
                  {expectedReturnDisplay}
                </td>
                <td className="py-3 px-3 text-slate-300">
                  {riskRewardDisplay}
                </td>
                <td className="py-3 px-3">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] border border-slate-700">
                    {rank.confidence || '—'}
                  </span>
                </td>
                <td className="py-3 px-3">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                      statusInfo.isAvailable
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    }`}
                  >
                    {statusInfo.label}
                  </span>
                </td>
                <td className="py-3 px-3 text-right">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigateToStock(cleanSymbol);
                    }}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-emerald-600 hover:text-slate-950 text-slate-300 text-[11px] font-medium transition-all inline-flex items-center gap-1 cursor-pointer"
                  >
                    Xem mã <ArrowUpRight className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

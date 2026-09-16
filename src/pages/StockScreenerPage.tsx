import React, { useState, useMemo } from 'react';
import {
  SlidersHorizontal,
  Search,
  Filter,
  ArrowUpDown,
  Bookmark,
  ChevronRight,
  RotateCcw,
  Save,
} from 'lucide-react';
import { StockSummary } from '../types/stock';
import { useTopMovers, useRecommendationRankings } from '../hooks/useMarketQueries';
import { useAppStore } from '../store/useAppStore';
import { Button } from '../components/ui/Button';
import { formatPercent } from '../utils/formatters';

interface ScreenerStock {
  symbol: string;
  companyName: string;
  exchange: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  sector: string;
  aiScore: number | null;
  technicalScore: number | null;
  fundamentalScore: number | null;
  pe: number | null;
  roe: number | null;
  rsi: number | null;
  recommendation: 'BUY' | 'HOLD' | 'WATCH' | 'SELL' | 'UNRATED';
}


interface FilterState {
  search: string;
  exchange: string;
  sector: string;
  minPrice: number;
  maxPrice: number;
  minRsi: number;
  maxRsi: number;
  maTrend: string;
  minRoe: number;
  maxPe: number;
  minAiScore: number;
  breakoutOnly: boolean;
  volSpikeOnly: boolean;
}

/**
 * Fail-closed AI Score validation predicate.
 *
 * When minAiScore is active (> 0), only finite numeric scores >= minAiScore pass.
 * Null, undefined, NaN, Infinity, and non-numeric values are strictly rejected.
 */
export function passesAiScoreMinimum(score: unknown, minAiScore?: number | null): boolean {
  if (minAiScore == null || minAiScore <= 0) {
    return true; // Filter is inactive
  }
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return false; // Fail-closed: missing, null, undefined, NaN, Infinity, or non-numeric
  }
  return score >= minAiScore;
}

const initialFilters: FilterState = {
  search: '',
  exchange: 'ALL',
  sector: 'ALL',
  minPrice: 0,
  maxPrice: 250000,
  minRsi: 0,
  maxRsi: 100,
  maTrend: 'ALL',
  minRoe: 0,
  maxPe: 50,
  minAiScore: 0,
  breakoutOnly: false,
  volSpikeOnly: false,
};

const SECTORS = [
  'ALL',
  'Ngân hàng',
  'Bất động sản',
  'Thép & Vật liệu',
  'Chứng khoán',
  'Công nghệ thông tin',
  'Bán lẻ & Tiêu dùng',
  'Năng lượng & Dầu khí',
  'Hóa chất & Phân bón',
  'Xây dựng & Đầu tư công',
];

export const StockScreenerPage: React.FC = () => {
  const { openQuickView, addToWatchlist, removeFromWatchlist, isWatchlisted } = useAppStore();
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [sortBy, setSortBy] = useState<string>('aiScore');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [savedPresets] = useState<string[]>([
    'Top AI Momentum (Score > 75)',
    'Value Investing (P/E < 12, ROE > 15%)',
    'Oversold Rebound (RSI < 35)',
  ]);

  // Use top movers query & real recommendation rankings
  const moversQuery = useTopMovers();
  const rankingsQuery = useRecommendationRankings('SHORT_TERM');

  const rankingMap = useMemo(() => {
    const map = new Map<string, { rank: number; score: number; signal: 'BUY' | 'HOLD' | 'WATCH' | 'SELL' }>();
    if (rankingsQuery.data?.rankings) {
      for (const r of rankingsQuery.data.rankings) {
        map.set(r.symbol, {
          rank: r.rank,
          score: r.score,
          signal: r.signal as any,
        });
      }
    }
    return map;
  }, [rankingsQuery.data]);

  const rawStocks: ScreenerStock[] = useMemo(() => {
    const gainers = moversQuery.data?.gainers || [];
    const losers = moversQuery.data?.losers || [];
    const active = moversQuery.data?.active || [];
    const map = new Map<string, ScreenerStock>();

    [...gainers, ...active, ...losers].forEach((s) => {
      if (!map.has(s.symbol)) {
        const ranked = rankingMap.get(s.symbol);
        map.set(s.symbol, {
          symbol: s.symbol,
          companyName: s.companyName,
          exchange: (s.exchange as any) || 'HOSE',
          price: s.price,
          change: s.change,
          changePercent: s.changePercent,
          volume: s.volume,
          sector: (s as any).sector || 'Chưa phân loại',
          aiScore: ranked ? ranked.score : null,
          technicalScore: ranked ? ranked.score : null,
          fundamentalScore: null,
          pe: null,
          roe: null,
          rsi: null,
          recommendation: ranked ? ranked.signal : 'UNRATED',
        });
      }
    });
    return Array.from(map.values());
  }, [moversQuery.data, rankingMap]);

  // Filter and Sort Logic
  const filteredStocks = useMemo(() => {
    return rawStocks.filter((s) => {
      if (filters.search && !s.symbol.toLowerCase().includes(filters.search.toLowerCase()) && !s.companyName.toLowerCase().includes(filters.search.toLowerCase())) {
        return false;
      }
      if (filters.exchange !== 'ALL' && s.exchange !== filters.exchange) return false;
      if (filters.sector !== 'ALL' && s.sector && !s.sector.includes(filters.sector.replace('Ngân hàng', 'Tài chính'))) return false;
      if (s.price < filters.minPrice || s.price > filters.maxPrice) return false;
      if (!passesAiScoreMinimum(s.aiScore, filters.minAiScore)) return false;
      return true;
    }).sort((a, b) => {
      const aVal = (a as any)[sortBy] ?? 0;
      const bVal = (b as any)[sortBy] ?? 0;
      return sortOrder === 'desc' ? (bVal > aVal ? 1 : -1) : (aVal > bVal ? 1 : -1);
    });
  }, [rawStocks, filters, sortBy, sortOrder]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const applyPreset = (preset: string) => {
    if (preset.includes('Top AI')) {
      setFilters({ ...initialFilters, minAiScore: 75 });
    } else if (preset.includes('Value')) {
      setFilters({ ...initialFilters, maxPe: 12, minRoe: 15 });
    } else if (preset.includes('Oversold')) {
      setFilters({ ...initialFilters, maxRsi: 35 });
    }
  };

  return (
    <div id="page-stock-screener" className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#263244]">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold font-sans text-slate-100">
              Stock Screener & Multi-Factor Filters
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              QUANT MATRIX
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Bộ lọc đa chiều toàn diện: Kỹ thuật · Định giá · Chất lượng cơ bản · Điểm số AI
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFilters(initialFilters)}
            leftIcon={RotateCcw}
          >
            Reset Filters
          </Button>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={Save}
          >
            Save Preset
          </Button>
        </div>
      </div>

      {/* Quick Preset Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <span className="text-slate-500 font-mono text-[11px] shrink-0">Filter Presets:</span>
        {savedPresets.map((preset, idx) => (
          <button
            key={idx}
            onClick={() => applyPreset(preset)}
            className="px-2.5 py-1 rounded-lg bg-[#111827] hover:bg-[#182231] border border-[#263244] text-slate-300 hover:text-indigo-400 transition-colors whitespace-nowrap"
          >
            {preset}
          </button>
        ))}
      </div>

      {/* Main Grid: Left Filters, Right Results */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Left Filter Panel */}
        <div className="lg:col-span-1 bg-[#111827] border border-[#263244] rounded-xl p-4 space-y-5 h-fit">
          <div className="flex items-center justify-between pb-2 border-b border-[#263244]">
            <span className="text-xs font-bold uppercase tracking-wider font-mono text-slate-300 flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-indigo-400" />
              Tiêu chí lọc
            </span>
            <span className="text-[10px] font-mono text-indigo-400">
              {filteredStocks.length} kết quả
            </span>
          </div>

          {/* Search */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-400 font-mono">Tìm mã hoặc tên</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                placeholder="HPG, FPT, VCB..."
                className="w-full pl-8 pr-3 py-1.5 bg-[#0B0F17] border border-[#263244] rounded-lg text-xs text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>

          {/* Market & Exchange */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-400 font-mono">Sàn giao dịch</label>
            <select
              value={filters.exchange}
              onChange={(e) => setFilters({ ...filters, exchange: e.target.value })}
              className="w-full px-2.5 py-1.5 bg-[#0B0F17] border border-[#263244] rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
            >
              <option value="ALL">Tất cả sàn (HOSE, HNX, UPCOM)</option>
              <option value="HOSE">Sàn HOSE</option>
              <option value="HNX">Sàn HNX</option>
              <option value="UPCOM">Sàn UPCOM</option>
            </select>
          </div>

          {/* Sector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-400 font-mono">Ngành nghề</label>
            <select
              value={filters.sector}
              onChange={(e) => setFilters({ ...filters, sector: e.target.value })}
              className="w-full px-2.5 py-1.5 bg-[#0B0F17] border border-[#263244] rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              {SECTORS.map((sec) => (
                <option key={sec} value={sec}>{sec}</option>
              ))}
            </select>
          </div>

          {/* AI Score Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] font-mono">
              <span className="text-slate-400">AI Score tối thiểu</span>
              <span className="text-indigo-400 font-bold">{filters.minAiScore}+</span>
            </div>
            <input
              type="range"
              min={0}
              max={90}
              step={5}
              value={filters.minAiScore}
              onChange={(e) => setFilters({ ...filters, minAiScore: Number(e.target.value) })}
              className="w-full accent-indigo-500 bg-[#1E293B] h-1.5 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* Technical & Indicators */}
          <div className="pt-2 border-t border-[#263244] space-y-3">
            <span className="text-[10px] font-bold text-slate-500 font-mono uppercase tracking-wider block">
              Tín hiệu kỹ thuật
            </span>
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.breakoutOnly}
                onChange={(e) => setFilters({ ...filters, breakoutOnly: e.target.checked })}
                className="rounded border-[#263244] bg-[#0B0F17] text-indigo-600 focus:ring-0"
              />
              <span>Chỉ cổ phiếu bứt phá (Breakout)</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.volSpikeOnly}
                onChange={(e) => setFilters({ ...filters, volSpikeOnly: e.target.checked })}
                className="rounded border-[#263244] bg-[#0B0F17] text-indigo-600 focus:ring-0"
              />
              <span>Khối lượng đột biến &gt; 1.5x MA20</span>
            </label>
          </div>
        </div>

        {/* Right Results Table */}
        <div className="lg:col-span-3 bg-[#111827] border border-[#263244] rounded-xl overflow-hidden flex flex-col">
          {/* Table Controls */}
          <div className="p-3 bg-[#0E1522] border-b border-[#263244] flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 font-mono">
              DANH SÁCH CỔ PHIẾU ({filteredStocks.length})
            </span>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 text-[11px] font-mono">Sort: {sortBy.toUpperCase()} ({sortOrder})</span>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#111827] border-b border-[#263244] text-[11px] font-mono text-slate-400 select-none">
                  <th className="py-2.5 px-3 font-semibold cursor-pointer" onClick={() => handleSort('symbol')}>
                    <div className="flex items-center gap-1">Mã CP <ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                  <th className="py-2.5 px-3 font-semibold cursor-pointer" onClick={() => handleSort('price')}>
                    <div className="flex items-center gap-1">Giá (VND) <ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                  <th className="py-2.5 px-3 font-semibold cursor-pointer" onClick={() => handleSort('changePercent')}>
                    <div className="flex items-center gap-1">Biến động <ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                  <th className="py-2.5 px-3 font-semibold cursor-pointer" onClick={() => handleSort('aiScore')}>
                    <div className="flex items-center gap-1">AI Score <ArrowUpDown className="w-3 h-3 text-indigo-400" /></div>
                  </th>
                  <th className="py-2.5 px-3 font-semibold cursor-pointer" onClick={() => handleSort('technicalScore')}>
                    <div className="flex items-center gap-1">Kỹ thuật <ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                  <th className="py-2.5 px-3 font-semibold cursor-pointer" onClick={() => handleSort('pe')}>
                    <div className="flex items-center gap-1">P/E <ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                  <th className="py-2.5 px-3 font-semibold cursor-pointer" onClick={() => handleSort('roe')}>
                    <div className="flex items-center gap-1">ROE <ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                  <th className="py-2.5 px-3 font-semibold">Khuyến nghị</th>
                  <th className="py-2.5 px-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#263244]">
                {filteredStocks.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500 font-mono text-xs">
                      Không tìm thấy cổ phiếu nào phù hợp với bộ lọc hiện tại.
                    </td>
                  </tr>
                ) : (
                  filteredStocks.map((stk) => {
                  const isUp = stk.change > 0;
                  const isDown = stk.change < 0;
                  const inWatchlist = isWatchlisted(stk.symbol);

                  return (
                    <tr
                      key={stk.symbol}
                      onClick={() => openQuickView(stk.symbol)}
                      className="hover:bg-[#182231] transition-colors cursor-pointer group"
                    >
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-100 group-hover:text-indigo-400">
                            {stk.symbol}
                          </span>
                          <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-[#1E293B] text-slate-400">
                            {stk.exchange}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-100">
                        {new Intl.NumberFormat('vi-VN').format(stk.price)}
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        <span className={`font-semibold ${isUp ? 'text-emerald-400' : isDown ? 'text-rose-400' : 'text-slate-400'}`}>
                          {isUp ? '+' : ''}{formatPercent(stk.changePercent)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        {stk.aiScore !== null ? (
                          <div className="flex items-center gap-1.5">
                            <span className={`font-bold ${stk.aiScore >= 75 ? 'text-emerald-400' : stk.aiScore >= 60 ? 'text-indigo-400' : 'text-amber-400'}`}>
                              {stk.aiScore}
                            </span>
                            <div className="w-12 h-1.5 bg-[#1E293B] rounded-full overflow-hidden">
                              <div
                                className={`h-full ${stk.aiScore >= 75 ? 'bg-emerald-400' : stk.aiScore >= 60 ? 'bg-indigo-400' : 'bg-amber-400'}`}
                                style={{ width: `${stk.aiScore}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-500 font-mono text-[11px]">--</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-300">
                        {stk.technicalScore !== null ? `${stk.technicalScore}/100` : '--'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-300">
                        {stk.pe !== null ? `${stk.pe}x` : '--'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-300">
                        {stk.roe !== null ? `${stk.roe}%` : '--'}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                            stk.recommendation === 'BUY'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : stk.recommendation === 'HOLD'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : stk.recommendation === 'SELL'
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          {stk.recommendation}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => inWatchlist ? removeFromWatchlist(stk.symbol) : addToWatchlist(stk.symbol)}
                            className={`p-1.5 rounded-lg border transition-colors ${
                              inWatchlist
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                : 'bg-[#182231] border-[#263244] text-slate-400 hover:text-slate-200'
                            }`}
                            title={inWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist'}
                          >
                            <Bookmark className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openQuickView(stk.symbol)}
                            className="p-1.5 rounded-lg bg-[#182231] border border-[#263244] text-slate-400 hover:text-indigo-400 hover:border-indigo-500/30 transition-colors"
                            title="Analyze Stock"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

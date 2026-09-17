import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  TrendingUp,
  Filter,
  ChevronRight,
  Layers,
  AlertCircle,
  Clock,
  Database,
  RefreshCw,
  Search,
  CheckCircle2,
} from 'lucide-react';
import { InvestmentHorizon, HORIZON_LABELS, RecommendationSignal } from '../types/recommendation';
import { useRecommendationRankings } from '../hooks/useMarketQueries';
import { StockRecommendationsView } from '../components/stock/StockRecommendationsView';
import { RankingsTable } from './recommendations/RankingsTable';
import {
  makeRankingSorter,
  RankingSortKey,
  SortDirection,
  formatEvaluationTimestamp,
} from './recommendations/metrics';

interface RecommendationsPageProps {
  onSelectStock: (symbol: string) => void;
}

export const RecommendationsPage: React.FC<RecommendationsPageProps> = ({ onSelectStock }) => {
  const [strategy, setStrategy] = useState<InvestmentHorizon>('SHORT_TERM');
  const [activeTabStock, setActiveTabStock] = useState<string>('FPT');
  const [signalFilter, setSignalFilter] = useState<RecommendationSignal | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<RankingSortKey>('rank');
  const [sortOrder, setSortOrder] = useState<SortDirection>('asc');

  const { data, isLoading, error, refetch, isFetching } = useRecommendationRankings(strategy);

  const rankings = useMemo(() => {
    return Array.isArray(data?.rankings) ? data.rankings : [];
  }, [data?.rankings]);

  const sortedAndFilteredRankings = useMemo(() => {
    let filtered = rankings;

    // Filter by signal if specified
    if (signalFilter !== 'ALL') {
      filtered = filtered.filter((r) => r.signal === signalFilter);
    }

    // Filter by search query (symbol or company name)
    const cleanSearch = searchQuery.trim().toLowerCase();
    if (cleanSearch) {
      filtered = filtered.filter((r) => {
        const sym = (r.symbol || '').toLowerCase();
        const comp = (r.companyName || '').toLowerCase();
        return sym.includes(cleanSearch) || comp.includes(cleanSearch);
      });
    }

    const sorter = makeRankingSorter(sortBy, sortOrder);
    return [...filtered].sort(sorter);
  }, [rankings, signalFilter, searchQuery, sortBy, sortOrder]);

  const handleSort = (key: RankingSortKey) => {
    if (sortBy === key) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortOrder(key === 'rank' || key === 'symbol' || key === 'companyName' ? 'asc' : 'desc');
    }
  };

  const handleNavigateToStock = (symbol: string) => {
    const clean = (symbol || '').trim().toUpperCase();
    if (clean) {
      onSelectStock(clean);
    }
  };

  const handleSelectRowStock = (symbol: string) => {
    const clean = (symbol || '').trim().toUpperCase();
    if (clean) {
      setActiveTabStock(clean);
    }
  };

  const resetFilters = () => {
    setSignalFilter('ALL');
    setSearchQuery('');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-emerald-950/40 border border-emerald-500/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold text-white font-mono">AI INVESTMENT RECOMMENDATIONS</h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              PHASE 19.5.5
            </span>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl font-sans leading-relaxed">
            Hệ thống xếp hạng và chấm điểm chiến lược đa khung thời gian (StrategyScorer + SignalEngine + RiskRewardEngine) dựa trên dữ liệu giao dịch thực tế từ KBS & VPS.
          </p>
        </div>

        {/* Horizon Tabs */}
        <div className="flex items-center bg-slate-950 p-1.5 rounded-xl border border-slate-800 shrink-0">
          {(['SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM'] as InvestmentHorizon[]).map((hz) => {
            const isSelected = strategy === hz;
            return (
              <button
                key={hz}
                onClick={() => setStrategy(hz)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {HORIZON_LABELS[hz].split(' ')[0]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Universe Strategy Rankings Table */}
      <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Bảng Xếp Hạng Khuyến Nghị Theo Chiến Lược ({HORIZON_LABELS[strategy]})
            </h3>
            <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-400 mt-1">
              <span>
                Tổng số mã phân tích: <strong className="text-slate-200">{data?.universeSize ?? rankings.length}</strong> mã
              </span>
              <span>•</span>
              <span>
                Hiển thị: <strong className="text-emerald-400">{sortedAndFilteredRankings.length}</strong> mã
              </span>
              {data?.generatedAt && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-slate-400">
                    <Clock className="w-3 h-3 text-slate-500" />
                    Đánh giá lúc: {formatEvaluationTimestamp(data.generatedAt)}
                  </span>
                </>
              )}
              {data?.dataSource && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-slate-400">
                    <Database className="w-3 h-3 text-emerald-500/80" />
                    Nguồn: {data.dataSource === 'KBS_VPS' ? 'KBS & VPS' : data.dataSource}
                  </span>
                </>
              )}
              {data?.dataStatus && (
                <>
                  <span>•</span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-mono border ${
                      data.dataStatus === 'OK'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    }`}
                  >
                    {data.dataStatus === 'OK' ? 'CHUẨN HÓA ĐỒNG BỘ' : data.dataStatus}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Controls: Search, Filter, Refresh */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm mã hoặc tên CT..."
                className="pl-8 pr-3 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-44"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-mono">
              <span className="text-slate-500 px-1.5 text-[11px] flex items-center gap-1">
                <Filter className="w-3 h-3" /> Lọc:
              </span>
              {(['ALL', 'BUY', 'HOLD', 'SELL'] as const).map((sig) => (
                <button
                  key={sig}
                  onClick={() => setSignalFilter(sig)}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                    signalFilter === sig
                      ? sig === 'BUY'
                        ? 'bg-emerald-500 text-slate-950'
                        : sig === 'SELL'
                        ? 'bg-rose-500 text-white'
                        : sig === 'HOLD'
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {sig === 'ALL' ? 'Tất cả' : sig === 'BUY' ? 'MUA' : sig === 'HOLD' ? 'GIỮ' : 'BÁN'}
                </button>
              ))}
            </div>

            {/* Refresh Button */}
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              title="Làm mới dữ liệu xếp hạng"
              className="p-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-400 hover:text-emerald-400 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Table / States */}
        {isLoading ? (
          <div className="py-12 text-center text-xs font-mono text-slate-400">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Đang chấm điểm và xếp hạng chiến lược toàn rổ cổ phiếu...
          </div>
        ) : error ? (
          <div className="py-8 px-4 text-center rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs font-mono text-rose-300 flex flex-col items-center justify-center gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400" />
              <span>Không thể tải bảng xếp hạng khuyến nghị: {(error as Error)?.message || 'Lỗi mạng hoặc máy chủ'}</span>
            </div>
            <button
              onClick={() => refetch()}
              className="px-3 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40 text-xs font-mono transition-colors cursor-pointer"
            >
              Thử lại
            </button>
          </div>
        ) : sortedAndFilteredRankings.length === 0 ? (
          <div className="py-12 text-center text-xs font-mono text-slate-400 bg-slate-950/20 rounded-lg border border-slate-800/60 p-6 space-y-2">
            <p className="text-slate-300 font-semibold">
              {rankings.length === 0
                ? 'Chưa có dữ liệu xếp hạng chiến lược cho khung thời gian này.'
                : 'Không có mã nào thỏa mãn điều kiện lọc.'}
            </p>
            <p className="text-slate-500 text-[11px]">
              {rankings.length === 0
                ? 'Vui lòng kiểm tra lại kết nối nguồn dữ liệu định lượng.'
                : 'Thử chuyển bộ lọc tín hiệu về "Tất cả" hoặc xóa ô tìm kiếm.'}
            </p>
            {(signalFilter !== 'ALL' || searchQuery.trim() !== '') && (
              <button
                onClick={resetFilters}
                className="mt-2 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded text-xs font-mono inline-block cursor-pointer"
              >
                Đặt lại bộ lọc & tìm kiếm
              </button>
            )}
          </div>
        ) : (
          <RankingsTable
            rankings={sortedAndFilteredRankings}
            activeStockSymbol={activeTabStock}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            onSelectRowStock={handleSelectRowStock}
            onNavigateToStock={handleNavigateToStock}
          />
        )}
      </div>

      {/* Deep-dive Stock Recommendation Panel for Selected Stock */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-200 font-mono uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            Chi Tiết Khuyến Nghị Định Lượng: <span className="text-emerald-400">{activeTabStock}</span>
          </h3>
          <button
            onClick={() => handleNavigateToStock(activeTabStock)}
            className="text-xs font-mono text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
          >
            Mở trang phân tích đầy đủ {activeTabStock} <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <StockRecommendationsView symbol={activeTabStock} />
      </div>
    </div>
  );
};

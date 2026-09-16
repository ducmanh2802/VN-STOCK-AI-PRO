import React, { useState, FormEvent } from 'react';
import { StockSummary } from '../../types/stock';
import {
  CategoryGroupId,
  CategoryGroupOption,
  ExchangeFilter,
  SignalFilter,
  TrendFilter,
  ViewMode,
} from './types';
import {
  Search,
  Plus,
  Table,
  LayoutGrid,
  Download,
  Copy,
  Check,
  Filter,
  X,
  Sparkles,
} from 'lucide-react';

interface WatchlistToolbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedGroup: CategoryGroupId;
  onGroupChange: (groupId: CategoryGroupId) => void;
  exchangeFilter: ExchangeFilter;
  onExchangeFilterChange: (ex: ExchangeFilter) => void;
  signalFilter: SignalFilter;
  onSignalFilterChange: (sig: SignalFilter) => void;
  trendFilter: TrendFilter;
  onTrendFilterChange: (t: TrendFilter) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onAddStock: (symbol: string) => void;
  onOpenAddModal: () => void;
  onExportCSV: () => void;
  onExportJSON: () => void;
  onCopySummary: () => void;
  isCopied: boolean;
  watchlistSymbols: string[];
  totalStocksCount: number;
  filteredCount: number;
}

const CATEGORY_GROUPS: CategoryGroupOption[] = [
  { id: 'all', label: 'Tất cả danh mục' },
  { id: 'vn30', label: 'VN30 Bluechips', isVN30Only: true },
  { id: 'banking', label: 'Ngân hàng', sectorId: 'banking' },
  { id: 'financial_services', label: 'Chứng khoán', sectorId: 'financial_services' },
  { id: 'real_estate', label: 'Bất động sản', sectorId: 'real_estate' },
  { id: 'materials', label: 'Thép & Vật liệu', sectorId: 'materials' },
  { id: 'energy', label: 'Dầu khí & Năng lượng', sectorId: 'energy' },
  { id: 'retail', label: 'Bán lẻ & Tiêu dùng', sectorId: 'retail' },
  { id: 'technology', label: 'Công nghệ', sectorId: 'technology' },
];

const POPULAR_QUICK_PICKS = [
  'HPG', 'FPT', 'VCB', 'SSI', 'MBB', 'MWG', 'DGC', 'GAS', 'PLX', 'TCB', 'VHM', 'VIC', 'VND', 'DXG', 'NKG', 'BSR', 'PNJ'
];

export const WatchlistToolbar: React.FC<WatchlistToolbarProps> = ({
  searchQuery,
  onSearchChange,
  selectedGroup,
  onGroupChange,
  exchangeFilter,
  onExchangeFilterChange,
  signalFilter,
  onSignalFilterChange,
  trendFilter,
  onTrendFilterChange,
  viewMode,
  onViewModeChange,
  onAddStock,
  onOpenAddModal,
  onExportCSV,
  onExportJSON,
  onCopySummary,
  isCopied,
  watchlistSymbols,
  totalStocksCount,
  filteredCount,
}) => {
  const [quickInput, setQuickInput] = useState('');
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);

  const handleQuickAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!quickInput.trim()) return;
    onAddStock(quickInput.trim().toUpperCase());
    setQuickInput('');
  };

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    selectedGroup !== 'all' ||
    exchangeFilter !== 'ALL' ||
    signalFilter !== 'ALL' ||
    trendFilter !== 'ALL';

  const clearAllFilters = () => {
    onSearchChange('');
    onGroupChange('all');
    onExchangeFilterChange('ALL');
    onSignalFilterChange('ALL');
    onTrendFilterChange('ALL');
  };

  return (
    <div className="space-y-3 bg-terminal-surface border border-terminal-border rounded-lg p-3">
      {/* 1. Category Group Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-terminal-border">
        {CATEGORY_GROUPS.map((grp) => {
          const isActive = selectedGroup === grp.id;
          return (
            <button
              key={grp.id}
              onClick={() => onGroupChange(grp.id)}
              className={`px-3 py-1.5 rounded text-xs font-mono whitespace-nowrap transition-all flex items-center gap-1.5 ${
                isActive
                  ? 'bg-terminal-accent text-white font-bold shadow-xs'
                  : 'bg-terminal-bg text-terminal-text-secondary hover:bg-terminal-surface-hover hover:text-terminal-text-primary border border-terminal-border'
              }`}
            >
              {grp.id === 'vn30' && <Sparkles className="w-3 h-3 text-amber-300" />}
              <span>{grp.label}</span>
            </button>
          );
        })}
      </div>

      {/* 2. Main Search & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
        {/* Search Input */}
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-terminal-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Lọc mã CP, tên công ty, nhóm ngành trong danh mục..."
              className="w-full pl-8 pr-8 py-1.5 bg-terminal-bg border border-terminal-border rounded text-xs text-terminal-text-primary placeholder-terminal-text-muted focus:outline-none focus:border-terminal-accent font-mono"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-terminal-text-muted hover:text-terminal-text-primary"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Filter Toggle Button */}
          <button
            onClick={() => setIsFiltersExpanded((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded border text-xs font-mono flex items-center gap-1.5 transition-colors ${
              isFiltersExpanded || hasActiveFilters
                ? 'bg-terminal-surface-subtle text-terminal-accent border-terminal-accent/40 font-semibold'
                : 'bg-terminal-bg text-terminal-text-secondary border-terminal-border hover:bg-terminal-surface-hover'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Bộ lọc</span>
            {hasActiveFilters && (
              <span className="w-1.5 h-1.5 rounded-full bg-terminal-accent" />
            )}
          </button>
        </div>

        {/* Quick Add Form + Modal Button */}
        <form onSubmit={handleQuickAdd} className="flex items-center gap-1.5">
          <input
            type="text"
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value.toUpperCase())}
            placeholder="Nhập mã (VD: VCB, HPG)"
            className="w-36 px-2.5 py-1.5 text-xs font-mono uppercase bg-terminal-bg border border-terminal-border rounded text-terminal-text-primary placeholder-terminal-text-muted focus:outline-none focus:border-terminal-accent"
          />
          <button
            type="submit"
            className="px-3 py-1.5 bg-terminal-accent hover:bg-terminal-accent-hover text-white rounded text-xs font-medium flex items-center gap-1 transition-colors shadow-xs"
            title="Thêm mã nhanh vào danh mục"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm</span>
          </button>
          <button
            type="button"
            onClick={onOpenAddModal}
            className="px-2.5 py-1.5 bg-terminal-surface-subtle hover:bg-terminal-surface-hover border border-terminal-border text-terminal-text-primary rounded text-xs font-mono transition-colors"
            title="Mở bảng tra cứu & thêm nhiều mã"
          >
            Tra cứu
          </button>
        </form>

        {/* View Mode & Export Tools */}
        <div className="flex items-center gap-1.5">
          {/* View switcher */}
          <div className="flex items-center bg-terminal-bg border border-terminal-border rounded p-0.5">
            <button
              onClick={() => onViewModeChange('table')}
              className={`p-1 rounded text-xs transition-colors ${
                viewMode === 'table'
                  ? 'bg-terminal-surface-subtle text-terminal-accent shadow-xs'
                  : 'text-terminal-text-muted hover:text-terminal-text-primary'
              }`}
              title="Chế độ xem Bảng Terminal Bloomberg"
            >
              <Table className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onViewModeChange('grid')}
              className={`p-1 rounded text-xs transition-colors ${
                viewMode === 'grid'
                  ? 'bg-terminal-surface-subtle text-terminal-accent shadow-xs'
                  : 'text-terminal-text-muted hover:text-terminal-text-primary'
              }`}
              title="Chế độ xem Thẻ Phân Tích (Card Grid)"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Copy Summary */}
          <button
            onClick={onCopySummary}
            className="p-1.5 rounded bg-terminal-bg border border-terminal-border hover:bg-terminal-surface-hover text-terminal-text-muted hover:text-terminal-text-primary transition-colors"
            title="Sao chép báo cáo tóm tắt danh mục"
          >
            {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {/* Export CSV / JSON */}
          <div className="relative group">
            <button
              className="p-1.5 rounded bg-terminal-bg border border-terminal-border hover:bg-terminal-surface-hover text-terminal-text-muted hover:text-terminal-text-primary transition-colors flex items-center gap-1"
              title="Xuất dữ liệu danh mục"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <div className="absolute right-0 mt-1 w-32 bg-terminal-surface border border-terminal-border rounded-md shadow-lg py-1 hidden group-hover:block z-30 text-xs font-mono">
              <button
                onClick={onExportCSV}
                className="w-full text-left px-3 py-1.5 hover:bg-terminal-surface-hover text-terminal-text-primary transition-colors"
              >
                Xuất file CSV
              </button>
              <button
                onClick={onExportJSON}
                className="w-full text-left px-3 py-1.5 hover:bg-terminal-surface-hover text-terminal-text-primary transition-colors"
              >
                Xuất file JSON
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Expandable Advanced Filter Row */}
      {isFiltersExpanded && (
        <div className="pt-2 border-t border-terminal-border/60 flex flex-wrap items-center gap-3 text-xs font-mono">
          {/* Exchange Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-terminal-text-muted">Sàn:</span>
            <div className="flex items-center gap-1">
              {(['ALL', 'HOSE', 'HNX', 'UPCOM'] as ExchangeFilter[]).map((ex) => (
                <button
                  key={ex}
                  onClick={() => onExchangeFilterChange(ex)}
                  className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                    exchangeFilter === ex
                      ? 'bg-terminal-accent text-white font-bold'
                      : 'bg-terminal-bg text-terminal-text-muted hover:text-terminal-text-primary border border-terminal-border'
                  }`}
                >
                  {ex === 'ALL' ? 'Tất cả' : ex}
                </button>
              ))}
            </div>
          </div>

          {/* Signal Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-terminal-text-muted">Tín hiệu AI:</span>
            <div className="flex items-center gap-1">
              {(['ALL', 'BULLISH', 'NEUTRAL', 'BEARISH'] as SignalFilter[]).map((sig) => (
                <button
                  key={sig}
                  onClick={() => onSignalFilterChange(sig)}
                  className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                    signalFilter === sig
                      ? 'bg-terminal-accent text-white font-bold'
                      : 'bg-terminal-bg text-terminal-text-muted hover:text-terminal-text-primary border border-terminal-border'
                  }`}
                >
                  {sig === 'ALL'
                    ? 'Tất cả'
                    : sig === 'BULLISH'
                    ? 'Tích cực'
                    : sig === 'NEUTRAL'
                    ? 'Trung tính'
                    : 'Tiêu cực'}
                </button>
              ))}
            </div>
          </div>

          {/* Trend Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-terminal-text-muted">Xu hướng:</span>
            <div className="flex items-center gap-1">
              {(['ALL', 'UPTREND', 'SIDEWAY', 'DOWNTREND'] as TrendFilter[]).map((tr) => (
                <button
                  key={tr}
                  onClick={() => onTrendFilterChange(tr)}
                  className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                    trendFilter === tr
                      ? 'bg-terminal-accent text-white font-bold'
                      : 'bg-terminal-bg text-terminal-text-muted hover:text-terminal-text-primary border border-terminal-border'
                  }`}
                >
                  {tr === 'ALL'
                    ? 'Tất cả'
                    : tr === 'UPTREND'
                    ? 'Uptrend'
                    : tr === 'SIDEWAY'
                    ? 'Sideway'
                    : 'Downtrend'}
                </button>
              ))}
            </div>
          </div>

          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="ml-auto text-terminal-text-muted hover:text-rose-400 text-[11px] flex items-center gap-1 transition-colors"
            >
              <X className="w-3 h-3" />
              <span>Xóa bộ lọc</span>
            </button>
          )}
        </div>
      )}

      {/* 4. Quick Picks Suggestions Ribbon */}
      <div className="flex items-center gap-2 text-xs text-terminal-text-muted overflow-x-auto pt-1 border-t border-terminal-border/40 scrollbar-none">
        <span className="text-[11px] font-mono text-terminal-text-muted uppercase whitespace-nowrap">
          Gợi ý mã hàng đầu:
        </span>
        {POPULAR_QUICK_PICKS.map((sym) => {
          const isAdded = watchlistSymbols.some((s) => s.toUpperCase() === sym);
          return (
            <button
              key={sym}
              onClick={() => {
                if (!isAdded) onAddStock(sym);
              }}
              disabled={isAdded}
              className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors shrink-0 ${
                isAdded
                  ? 'bg-terminal-surface-subtle text-terminal-text-muted/60 cursor-default border border-transparent'
                  : 'bg-terminal-bg text-terminal-text-secondary hover:bg-terminal-surface-hover hover:text-terminal-accent border border-terminal-border'
              }`}
            >
              {sym} {isAdded ? '✓' : '+'}
            </button>
          );
        })}
      </div>

      {/* Filter result status count */}
      {hasActiveFilters && (
        <div className="text-[11px] font-mono text-terminal-text-muted flex items-center justify-between">
          <span>
            Đang hiển thị <strong className="text-terminal-text-primary">{filteredCount}</strong> / {totalStocksCount} mã theo dõi
          </span>
        </div>
      )}
    </div>
  );
};

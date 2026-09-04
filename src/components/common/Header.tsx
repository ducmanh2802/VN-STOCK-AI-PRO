import { useState, useRef, useEffect } from 'react';
import { IndexData, MarketStatus } from '../../types/market';
import { StockSummary } from '../../types/stock';
import { DemoBadge } from './DemoBadge';
import { Badge } from '../ui/Badge';
import { formatPercent, getPriceChangeColor } from '../../utils/formatters';
import { Search, Activity, Menu, X, ChevronRight, TrendingUp } from 'lucide-react';

interface HeaderProps {
  indices: IndexData[];
  marketStatus: MarketStatus;
  onSelectStock: (symbol: string) => void;
  onSearchQuery: (query: string) => Promise<StockSummary[]>;
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
}

export function Header({
  indices,
  marketStatus,
  onSelectStock,
  onSearchQuery,
  onToggleSidebar,
  isSidebarOpen,
}: HeaderProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<StockSummary[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Close search dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchChange = async (val: string) => {
    setSearchTerm(val);
    if (val.trim().length > 0) {
      setIsSearching(true);
      const results = await onSearchQuery(val);
      setSearchResults(results);
      setIsSearching(false);
      setIsDropdownOpen(true);
    } else {
      setSearchResults([]);
      setIsDropdownOpen(false);
    }
  };

  const handleSelectResult = (symbol: string) => {
    onSelectStock(symbol);
    setSearchTerm('');
    setIsDropdownOpen(false);
  };

  return (
    <header
      id="main-app-header"
      className="sticky top-0 z-40 w-full bg-terminal-bg/95 border-b border-terminal-border backdrop-blur-md"
    >
      {/* Top Bar: Brand, Search, Status, Demo Badge */}
      <div className="flex items-center justify-between px-4 lg:px-6 h-16 gap-3">
        {/* Left: Mobile Menu Toggle & Brand Logo */}
        <div className="flex items-center gap-3">
          <button
            id="btn-sidebar-toggle"
            onClick={onToggleSidebar}
            className="p-2 text-terminal-text-muted hover:text-terminal-text-primary rounded-lg hover:bg-terminal-surface-hover lg:hidden transition-colors"
            aria-label="Chuyển đổi menu điều hướng"
          >
            {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-terminal-accent flex items-center justify-center shadow-lg shadow-blue-950/40">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold tracking-tight text-lg text-terminal-text-primary font-mono">
                  VN STOCK <span className="text-terminal-accent">AI</span>
                </span>
                <DemoBadge size="sm" />
              </div>
              <p className="text-[10px] text-terminal-text-muted hidden sm:block font-mono">
                TERMINAL · HOSE · HNX · UPCOM
              </p>
            </div>
          </div>
        </div>

        {/* Center: Search Box */}
        <div ref={searchRef} className="relative flex-1 max-w-md mx-2">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-terminal-text-muted">
              <Search className="w-4 h-4" />
            </div>
            <input
              id="input-stock-search"
              type="text"
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => {
                if (searchTerm.trim().length > 0) setIsDropdownOpen(true);
              }}
              placeholder="Tìm mã cổ phiếu (HPG, FPT, VCB, MBB, SSI...)"
              className="w-full pl-9 pr-4 py-2 bg-terminal-surface border border-terminal-border rounded-lg text-sm text-terminal-text-primary placeholder-terminal-text-muted focus:outline-none focus:border-terminal-accent focus:ring-1 focus:ring-terminal-accent/40 transition-all font-mono"
            />
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setIsDropdownOpen(false);
                }}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-terminal-text-muted hover:text-terminal-text-primary"
              >
                Xóa
              </button>
            )}
          </div>

          {/* Autocomplete Dropdown */}
          {isDropdownOpen && (
            <div
              id="dropdown-search-results"
              className="absolute left-0 right-0 mt-1.5 bg-terminal-surface border border-terminal-border rounded-xl shadow-2xl overflow-hidden z-50 max-h-80 overflow-y-auto"
            >
              <div className="px-3 py-1.5 bg-terminal-bg text-[11px] font-mono text-terminal-text-muted border-b border-terminal-border flex justify-between items-center">
                <span>KẾT QUẢ TÌM KIẾM</span>
                <span className="text-terminal-ref text-[10px]">DEMO DATA</span>
              </div>
              {searchResults.length > 0 ? (
                <div className="divide-y divide-terminal-border">
                  {searchResults.map((stk) => (
                    <button
                      key={stk.symbol}
                      id={`search-item-${stk.symbol}`}
                      onClick={() => handleSelectResult(stk.symbol)}
                      className="w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-terminal-surface-hover transition-colors group"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono font-bold text-sm text-terminal-text-primary group-hover:text-terminal-accent">
                          {stk.symbol}
                        </span>
                        <Badge variant="subtle" size="xs">
                          {stk.exchange}
                        </Badge>
                        <span className="text-xs text-terminal-text-muted truncate max-w-[160px] sm:max-w-xs">
                          {stk.companyName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-right">
                        <span className={`text-xs font-mono font-semibold ${getPriceChangeColor(stk.change)}`}>
                          {new Intl.NumberFormat('vi-VN').format(stk.price)}
                        </span>
                        <Badge variant={stk.change >= 0 ? 'up' : 'down'} size="xs">
                          {formatPercent(stk.changePercent)}
                        </Badge>
                        <ChevronRight className="w-3.5 h-3.5 text-terminal-text-muted group-hover:text-terminal-text-secondary" />
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-6 text-center text-xs text-terminal-text-muted">
                  {isSearching
                    ? 'Đang tìm kiếm mã cổ phiếu...'
                    : `Không tìm thấy mã "${searchTerm}". Thử gõ: HPG, FPT, VCB, MBB, SSI...`}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Market State Indicator */}
        <div className="flex items-center gap-3">
          <div
            id="badge-market-state"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-terminal-border bg-terminal-surface text-xs text-terminal-text-primary select-none"
            title={marketStatus.sessionName}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                marketStatus.state === 'TRADING'
                  ? 'bg-terminal-up animate-pulse'
                  : 'bg-terminal-text-muted'
              }`}
            />
            <span className="font-medium font-mono text-[11px] sm:text-xs">
              {marketStatus.stateLabel}
            </span>
            <span className="text-terminal-text-muted text-[10px] hidden md:inline font-mono">
              ({marketStatus.sessionName})
            </span>
          </div>
        </div>
      </div>

      {/* Sub-header Bar: Live Market Ticker Chips */}
      <div
        id="bar-indices-tickers"
        className="px-4 lg:px-6 py-2 bg-terminal-bg/80 border-t border-terminal-border flex items-center gap-4 sm:gap-6 overflow-x-auto scrollbar-none text-xs"
      >
        <div className="flex items-center gap-1.5 text-terminal-text-muted font-mono text-[11px] whitespace-nowrap">
          <Activity className="w-3.5 h-3.5 text-terminal-accent" />
          <span>THỊ TRƯỜNG:</span>
        </div>

        <div className="flex items-center gap-4 sm:gap-6">
          {indices.map((idx) => {
            const isUp = idx.change >= 0;
            return (
              <div
                key={idx.symbol}
                id={`ticker-${idx.symbol}`}
                className="flex items-center gap-2 whitespace-nowrap font-mono"
              >
                <span className="text-terminal-text-muted font-bold">{idx.displayName}:</span>
                <span
                  className={`font-semibold ${
                    isUp ? 'text-terminal-up' : 'text-terminal-down'
                  }`}
                >
                  {idx.value.toFixed(2)}
                </span>
                <span
                  className={`text-[11px] font-medium ${
                    isUp ? 'text-terminal-up' : 'text-terminal-down'
                  }`}
                >
                  {isUp ? `+${idx.change.toFixed(2)}` : idx.change.toFixed(2)} (
                  {formatPercent(idx.changePercent)})
                </span>
              </div>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2 text-[10px] font-mono text-terminal-text-muted whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-terminal-ref" />
          <span>Phase 1 Foundation · Terminal Architecture</span>
        </div>
      </div>
    </header>
  );
}

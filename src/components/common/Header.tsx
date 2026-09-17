import React, { useState, useRef, useEffect } from 'react';
import { IndexData, MarketStatus } from '../../types/market';
import { StockSummary } from '../../types/stock';
import {
  Search,
  Activity,
  Menu,
  X,
  ChevronRight,
  TrendingUp,
  Sparkles,
  Command,
  Bell,
  Sliders,
  User,
} from 'lucide-react';
import { formatPercent, getPriceChangeColor } from '../../utils/formatters';
import { Button } from '../ui/Button';

interface HeaderProps {
  indices: IndexData[];
  marketStatus: MarketStatus;
  onSelectStock: (symbol: string) => void;
  onSearchQuery: (query: string) => Promise<StockSummary[]>;
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
  onOpenCommandPalette: () => void;
  onOpenCopilot: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  indices,
  marketStatus,
  onSelectStock,
  onSearchQuery,
  onToggleSidebar,
  isSidebarOpen,
  onOpenCommandPalette,
  onOpenCopilot,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<StockSummary[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

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
      try {
        const results = await onSearchQuery(val);
        setSearchResults(results || []);
        setIsDropdownOpen(true);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
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
      className="sticky top-0 z-30 w-full bg-[#09111f]/88 border-b border-[#203652] backdrop-blur-xl"
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 lg:px-6 h-16 gap-3">
        {/* Left: Mobile Toggle & Search trigger */}
        <div className="flex items-center gap-3">
          <button
            id="btn-sidebar-toggle"
            onClick={onToggleSidebar}
            className="p-2 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-[#182231] lg:hidden transition-colors"
            aria-label="Toggle navigation menu"
          >
            {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Center: Search & Command Palette Trigger */}
        <div ref={searchRef} className="relative flex-1 max-w-xl mx-2">
          <div className="relative flex items-center">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
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
              placeholder="Search stocks, symbols, fundamentals (HPG, FPT, VCB...)"
              className="w-full pl-10 pr-20 py-2.5 bg-[#0f1b2d]/90 border border-[#203652] hover:border-[#2c496b] focus:border-cyan-400 rounded-2xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-4 focus:ring-cyan-400/10 transition-all font-sans shadow-inner shadow-black/10"
            />
            <div className="absolute right-2.5 flex items-center gap-1.5">
              <button
                type="button"
                onClick={onOpenCommandPalette}
                className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#182231] border border-[#263244] text-[10px] font-mono text-slate-400 hover:text-slate-200"
                title="Open Command Palette"
              >
                <Command className="w-3 h-3" /> K
              </button>
              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setIsDropdownOpen(false);
                  }}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Autocomplete Dropdown */}
          {isDropdownOpen && (
            <div
              id="dropdown-search-results"
              className="absolute left-0 right-0 mt-1.5 bg-[#111827] border border-[#263244] rounded-xl shadow-2xl overflow-hidden z-50 max-h-80 overflow-y-auto"
            >
              <div className="px-3 py-1.5 bg-[#0E1522] text-[11px] font-mono text-slate-400 border-b border-[#263244] flex justify-between items-center">
                <span>STOCK INTELLIGENCE SEARCH</span>
                <span className="text-indigo-400 text-[10px]">VIETNAM MARKETS</span>
              </div>
              {searchResults.length > 0 ? (
                <div className="divide-y divide-[#263244]">
                  {searchResults.map((stk) => (
                    <button
                      key={stk.symbol}
                      id={`search-item-${stk.symbol}`}
                      onClick={() => handleSelectResult(stk.symbol)}
                      className="w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-[#182231] transition-colors group"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono font-bold text-sm text-slate-100 group-hover:text-indigo-400">
                          {stk.symbol}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#1E293B] text-slate-400 border border-[#263244]">
                          {stk.exchange}
                        </span>
                        <span className="text-xs text-slate-400 truncate max-w-[180px] sm:max-w-xs">
                          {stk.companyName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-right">
                        <span className={`text-xs font-mono font-semibold ${getPriceChangeColor(stk.change)}`}>
                          {new Intl.NumberFormat('vi-VN').format(stk.price)}
                        </span>
                        <span
                          className={`text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded ${
                            stk.change >= 0
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-rose-500/10 text-rose-400'
                          }`}
                        >
                          {stk.change >= 0 ? '+' : ''}{formatPercent(stk.changePercent)}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300" />
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-6 text-center text-xs text-slate-400">
                  {isSearching
                    ? 'Searching market database...'
                    : `No results for "${searchTerm}". Try: HPG, FPT, VCB, MBB, SSI, MWG...`}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2.5">
          {/* Market Status Badge */}
          <div
            id="badge-market-state"
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[#263244] bg-[#111827] text-xs text-slate-200 select-none"
            title={marketStatus.sessionName}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                marketStatus.state === 'TRADING'
                  ? 'bg-emerald-400 animate-pulse'
                  : 'bg-slate-500'
              }`}
            />
            <span className="font-semibold font-mono text-[11px]">
              {marketStatus.stateLabel}
            </span>
            <span className="text-slate-500 text-[10px] hidden md:inline font-mono">
              ({marketStatus.sessionName})
            </span>
          </div>

          {/* AI Copilot Trigger Button */}
          <Button
            variant="accent-glow"
            size="sm"
            onClick={onOpenCopilot}
            leftIcon={Sparkles}
            className="shadow-sm"
          >
            <span className="hidden md:inline">AI Copilot</span>
          </Button>

          {/* Quick Notification & Profile */}
          <button
            onClick={onOpenCommandPalette}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-[#182231] rounded-xl border border-[#263244] transition-colors"
            title="Command Palette (Ctrl+K)"
          >
            <Sliders className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Market Ribbon */}
      <div
        id="bar-indices-tickers"
        className="px-4 lg:px-6 py-2 bg-[#0E1522] border-t border-[#263244] flex items-center gap-4 sm:gap-6 overflow-x-auto scrollbar-none text-xs"
      >
        <div className="flex items-center gap-1.5 text-slate-400 font-mono text-[11px] whitespace-nowrap shrink-0">
          <Activity className="w-3.5 h-3.5 text-indigo-400" />
          <span className="font-semibold">VIETNAM INDICES:</span>
        </div>

        <div className="flex items-center gap-5 sm:gap-8">
          {indices.map((idx) => {
            const isUp = idx.change >= 0;
            return (
              <div
                key={idx.symbol}
                id={`ticker-${idx.symbol}`}
                className="flex items-center gap-2 whitespace-nowrap font-mono"
              >
                <span className="text-slate-400 font-bold">{idx.displayName}:</span>
                <span
                  className={`font-semibold ${
                    isUp ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {idx.value.toFixed(2)}
                </span>
                <span
                  className={`text-[11px] font-medium ${
                    isUp ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {isUp ? `+${idx.change.toFixed(2)}` : idx.change.toFixed(2)} (
                  {formatPercent(idx.changePercent)})
                </span>
              </div>
            );
          })}
        </div>

        <div className="ml-auto hidden md:flex items-center gap-2 text-[11px] font-mono text-slate-400 whitespace-nowrap">
          <span className="w-2 h-2 rounded-full bg-indigo-400" />
          <span>Real-time Quant Feed</span>
        </div>
      </div>
    </header>
  );
};

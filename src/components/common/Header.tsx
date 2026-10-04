import React, { useState, useRef, useEffect } from 'react';
import { IndexData, MarketStatus } from '../../types/market';
import { StockSummary } from '../../types/stock';
import { Search, Activity, Menu, X, ChevronRight, Sparkles, Command } from 'lucide-react';
import {
  formatPercent,
  getPriceChangeColor,
  formatIndexPoint,
  formatPointChange,
} from '../../utils/formatters';

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

  const isTrading = marketStatus.state === 'TRADING';

  // Display-only formatting of the freshness stamp. Any unparseable value is
  // returned verbatim so the source value is never silently discarded.
  const formatRibbonTimestamp = (raw?: string) => {
    if (!raw) return '—';
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    return parsed.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <header
      id="main-app-header"
      className="sticky top-0 z-30 w-full bg-terminal-bg border-b border-terminal-border"
    >
      {/* Top Bar — 44px dense terminal bar.
          The search wrapper needs min-w-0 + basis-0: without them flex shrink
          collapses the field to ~120px because siblings carry intrinsic width. */}
      <div className="flex items-center gap-2 px-2 lg:px-3 h-11">
        <button
          id="btn-sidebar-toggle"
          onClick={onToggleSidebar}
          className="lg:hidden shrink-0 p-1.5 rounded text-terminal-text-muted hover:text-terminal-text-primary hover:bg-terminal-surface-hover"
          aria-label="Toggle navigation menu"
          aria-expanded={isSidebarOpen}
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* max-w-[640px], not max-w-2xl: the numeric max-w scale resolves against
            this project's --spacing-* tokens, capping the field at 48px. */}
        <div ref={searchRef} className="relative flex-1 min-w-0 basis-0 max-w-[640px]">
          <div className="relative flex items-center">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-terminal-text-muted">
              <Search className="w-3.5 h-3.5" />
            </div>
            <input
              id="input-stock-search"
              type="text"
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => {
                if (searchTerm.trim().length > 0) setIsDropdownOpen(true);
              }}
              placeholder="Search ticker / company — HPG, FPT, VCB…"
              aria-label="Search ticker or company"
              className="w-full h-7 pl-8 pr-16 bg-terminal-surface border border-terminal-border hover:border-terminal-border-bright focus:border-terminal-accent rounded text-[12px] text-terminal-text-primary placeholder:text-terminal-text-muted focus:outline-none font-sans"
            />
            <div className="absolute right-1.5 flex items-center gap-1">
              <button
                type="button"
                onClick={onOpenCommandPalette}
                className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-sm bg-terminal-surface-elevated border border-terminal-border text-[10px] font-mono text-terminal-text-muted hover:text-terminal-text-secondary"
                title="Open Command Palette"
              >
                <Command className="w-3 h-3" />K
              </button>
              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setIsDropdownOpen(false);
                  }}
                  aria-label="Clear search"
                  className="text-terminal-text-muted hover:text-terminal-text-primary"
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
              className="absolute left-0 right-0 mt-1 bg-terminal-surface border border-terminal-border rounded shadow-xl overflow-hidden z-50 max-h-80 overflow-y-auto"
            >
              <div className="panel-header">
                <span className="panel-title">Symbol lookup</span>
                <span className="text-[10px] font-mono text-terminal-text-muted">
                  {isSearching ? 'SEARCHING…' : `${searchResults.length} RESULT(S)`}
                </span>
              </div>
              {searchResults.length > 0 ? (
                <div className="divide-y divide-terminal-border-subtle">
                  {searchResults.map((stk) => (
                    <button
                      key={stk.symbol}
                      id={`search-item-${stk.symbol}`}
                      onClick={() => handleSelectResult(stk.symbol)}
                      className="w-full px-2.5 py-1.5 flex items-center justify-between text-left row-hover group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono font-semibold text-[12px] text-terminal-text-primary tnum">
                          {stk.symbol}
                        </span>
                        <span className="px-1 py-0.5 rounded-sm text-[10px] font-mono bg-terminal-surface-elevated text-terminal-text-muted border border-terminal-border">
                          {stk.exchange}
                        </span>
                        <span className="text-[11px] text-terminal-text-muted truncate">
                          {stk.companyName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-right shrink-0 pl-2">
                        <span
                          className={`text-[12px] font-mono tnum ${getPriceChangeColor(stk.change)}`}
                        >
                          {formatIndexPoint(stk.price)}
                        </span>
                        <span
                          className={`text-[11px] font-mono tnum ${
                            stk.change >= 0 ? 'text-terminal-up' : 'text-terminal-down'
                          }`}
                        >
                          {formatPercent(stk.changePercent)}
                        </span>
                        <ChevronRight className="w-3 h-3 text-terminal-text-muted group-hover:text-terminal-text-secondary" />
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="terminal-state">
                  <span className="terminal-state-code">
                    {isSearching ? 'Loading' : 'No data'}
                  </span>
                  <p className="terminal-state-detail">
                    {isSearching
                      ? 'Querying the symbol universe…'
                      : `No symbol matched "${searchTerm}".`}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Controls — no ml-auto: an auto margin would absorb all free space
            before flex-grow is applied and collapse the search field. */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            id="badge-market-state"
            className="hidden sm:flex items-center gap-1.5 px-2 h-7 rounded-sm border border-terminal-border bg-terminal-surface select-none"
            title={marketStatus.sessionName}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                isTrading ? 'bg-terminal-up' : 'bg-terminal-text-muted'
              }`}
            />
            <span className="font-mono text-[10px] uppercase tracking-wider text-terminal-text-secondary whitespace-nowrap">
              {marketStatus.stateLabel}
            </span>
          </div>

          <button
            onClick={onOpenCopilot}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-sm bg-terminal-surface-elevated border border-terminal-border text-[11px] font-medium text-terminal-text-secondary hover:text-terminal-text-primary hover:bg-terminal-surface-hover"
            title="Open research assistant"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Assistant</span>
          </button>
        </div>
      </div>

      {/* Market Ribbon — one dense 26px strip, real values only */}
      <div
        id="bar-indices-tickers"
        className="px-2 lg:px-3 h-[26px] bg-terminal-surface-subtle border-t border-terminal-border flex items-center gap-3 overflow-x-auto text-[11px]"
      >
        <div className="flex items-center gap-1 text-terminal-text-muted font-mono text-[10px] uppercase tracking-wider whitespace-nowrap shrink-0">
          <Activity className="w-3 h-3" />
          <span>VN</span>
        </div>

        {indices.length > 0 ? (
          <div className="flex items-center gap-4">
            {indices.map((idx) => {
              const isUp = idx.change >= 0;
              const tone = isUp ? 'text-terminal-up' : 'text-terminal-down';
              return (
                <div
                  key={idx.symbol}
                  id={`ticker-${idx.symbol}`}
                  className="flex items-center gap-1.5 whitespace-nowrap font-mono"
                >
                  <span className="text-terminal-text-secondary font-semibold">
                    {idx.displayName}
                  </span>
                  <span className={`tnum ${tone}`}>{idx.value.toFixed(2)}</span>
                  <span className={`text-[10px] tnum ${tone}`}>
                    {formatPointChange(idx.change)}
                  </span>
                  <span className={`text-[10px] tnum ${tone}`}>
                    ({formatPercent(idx.changePercent)})
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          // No index payload yet. Use an unresolved placeholder rather than
          // asserting an outage, so loading is not reported as unavailable.
          <span className="text-[10px] font-mono uppercase tracking-wider text-terminal-text-disabled whitespace-nowrap">
            Indices — --
          </span>
        )}

        {/* Freshness timestamp. Rendered only when the source supplied a real value;
            the ISO string is formatted for display, never substituted. */}
        <div className="ml-auto hidden md:flex items-center gap-1.5 text-[10px] font-mono text-terminal-text-muted whitespace-nowrap shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-terminal-text-muted" />
          <span>{formatRibbonTimestamp(marketStatus.timestamp)}</span>
        </div>
      </div>
    </header>
  );
};

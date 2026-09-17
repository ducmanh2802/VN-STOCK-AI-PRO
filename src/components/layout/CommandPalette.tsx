import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  LayoutDashboard,
  TrendingUp,
  Bookmark,
  Sparkles,
  SlidersHorizontal,
  FileText,
  Globe,
  FlaskConical,
  PlayCircle,
  Briefcase,
  ShieldAlert,
  BookOpen,
  Activity,
  Settings,
  X,
  ArrowRight,
  Command,
} from 'lucide-react';
import { StockSummary } from '../../types/stock';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tabId: string) => void;
  onSelectStock: (symbol: string) => void;
  onSearchQuery?: (query: string) => Promise<StockSummary[]>;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onSelectStock,
  onSearchQuery,
}) => {
  const [search, setSearch] = useState('');
  const [stockResults, setStockResults] = useState<StockSummary[]>([]);
  const [isSearchingStocks, setIsSearchingStocks] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSearch('');
      setStockResults([]);
    }
  }, [isOpen]);

  // Keyboard shortcut listener for Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Dynamic stock query
  useEffect(() => {
    if (!search.trim() || !onSearchQuery) {
      setStockResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingStocks(true);
      try {
        const results = await onSearchQuery(search.trim());
        setStockResults(results || []);
      } catch {
        setStockResults([]);
      } finally {
        setIsSearchingStocks(false);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [search, onSearchQuery]);

  if (!isOpen) return null;

  const navigationCommands = [
    { id: 'dashboard', label: 'Dashboard Overview', group: 'OVERVIEW', icon: LayoutDashboard },
    { id: 'market', label: 'Market Overview & Sectors', group: 'OVERVIEW', icon: TrendingUp },
    { id: 'watchlist', label: 'Watchlist Monitor', group: 'OVERVIEW', icon: Bookmark },
    { id: 'ai-analyst', label: 'AI Market Research & Insights', group: 'RESEARCH', icon: Sparkles },
    { id: 'screener', label: 'Stock Screener & Multi-Factor Filters', group: 'RESEARCH', icon: SlidersHorizontal },
    { id: 'fundamentals', label: 'Fundamental & Valuation Explorer', group: 'RESEARCH', icon: FileText },
    { id: 'news-macro', label: 'News & Macro Intelligence', group: 'RESEARCH', icon: Globe },
    { id: 'strategy-lab', label: 'Strategy Lab (Quant Studio)', group: 'QUANT LAB', icon: FlaskConical },
    { id: 'backtest', label: 'Backtesting & Validation Engine', group: 'QUANT LAB', icon: PlayCircle },
    { id: 'paper-trading', label: 'Paper Trading Execution Studio', group: 'QUANT LAB', icon: Activity },
    { id: 'portfolio', label: 'Portfolio Analytics & Allocation', group: 'PORTFOLIO', icon: Briefcase },
    { id: 'risk-center', label: 'Risk Center & Guardrails', group: 'PORTFOLIO', icon: ShieldAlert },
    { id: 'journal', label: 'Trade Journal & Audit Trails', group: 'PORTFOLIO', icon: BookOpen },
    { id: 'data-status', label: 'Data Quality & Feed Status', group: 'SYSTEM', icon: Activity },
    { id: 'settings', label: 'Platform Settings & Preferences', group: 'SYSTEM', icon: Settings },
  ];

  const filteredNav = navigationCommands.filter((cmd) =>
    cmd.label.toLowerCase().includes(search.toLowerCase()) ||
    cmd.group.toLowerCase().includes(search.toLowerCase()) ||
    cmd.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-[42rem] bg-[#111827] border border-[#263244] rounded-2xl shadow-2xl overflow-hidden text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-[#263244] bg-[#0E1522]">
          <Search className="w-5 h-5 text-indigo-400 shrink-0 mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search stocks (HPG, FPT, VCB...), sections, or commands..."
            className="w-full bg-transparent border-none text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-0 font-sans"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="p-1 text-slate-400 hover:text-slate-200 mr-2"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono text-slate-400 bg-[#182231] border border-[#263244] rounded">
            ESC
          </kbd>
        </div>

        {/* Command Body */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-4">
          {/* Stock Search Results */}
          {stockResults.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 font-mono uppercase tracking-wider flex justify-between">
                <span>Matching Stocks</span>
                <span className="text-indigo-400">VN Stock Market</span>
              </div>
              <div className="space-y-1">
                {stockResults.map((stock) => (
                  <button
                    key={stock.symbol}
                    onClick={() => {
                      onSelectStock(stock.symbol);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[#182231] text-left transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[#1E293B] border border-[#263244] flex items-center justify-center font-mono font-bold text-xs text-indigo-400">
                        {stock.symbol}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-100 group-hover:text-indigo-300">
                          {stock.symbol} <span className="text-xs font-normal text-slate-400">· {stock.companyName}</span>
                        </div>
                        <div className="text-xs text-slate-500 font-mono">
                          {stock.exchange} · {new Intl.NumberFormat('vi-VN').format(stock.price)} VND
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-mono font-semibold ${stock.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {stock.change >= 0 ? '+' : ''}{stock.changePercent?.toFixed(2)}%
                      </span>
                      <ArrowRight className="w-4 h-4 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Navigation Commands */}
          <div>
            <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 font-mono uppercase tracking-wider">
              Navigation & Modules
            </div>
            <div className="space-y-1">
              {filteredNav.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onNavigate(item.id);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[#182231] text-left transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[#182231] border border-[#263244] flex items-center justify-center text-slate-400 group-hover:text-indigo-400 group-hover:border-indigo-500/30 transition-colors">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-sm font-medium text-slate-200 group-hover:text-slate-100">
                          {item.label}
                        </span>
                        <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1E293B] text-slate-400">
                          {item.group}
                        </span>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-[#0B0F17] border-t border-[#263244] flex items-center justify-between text-xs text-slate-400 font-mono">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-[#182231] border border-[#263244] rounded text-[10px]">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-[#182231] border border-[#263244] rounded text-[10px]">↓</kbd>
              to navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-[#182231] border border-[#263244] rounded text-[10px]">↵</kbd>
              to select
            </span>
          </div>
          <span className="text-slate-500">VN STOCK AI PRO</span>
        </div>
      </div>
    </div>
  );
};

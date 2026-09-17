import React, { useState, useMemo } from 'react';
import { VIETNAM_STOCKS_UNIVERSE, StockMetadata } from '../../services/market/stockUniverse';
import { Badge } from '../ui/Badge';
import { Search, Plus, Check, X, Bookmark, Sparkles } from 'lucide-react';

interface AddStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  watchlistSymbols: string[];
  onAddStock: (symbol: string) => void;
  onRemoveStock: (symbol: string) => void;
}

export const AddStockModal: React.FC<AddStockModalProps> = ({
  isOpen,
  onClose,
  watchlistSymbols,
  onAddStock,
  onRemoveStock,
}) => {
  const [query, setQuery] = useState('');
  const [selectedExchange, setSelectedExchange] = useState<'ALL' | 'HOSE' | 'HNX' | 'UPCOM'>('ALL');

  const watchlistSet = useMemo(() => new Set(watchlistSymbols.map((s) => s.toUpperCase())), [watchlistSymbols]);

  const filteredStocks = useMemo(() => {
    const q = query.trim().toUpperCase();
    return VIETNAM_STOCKS_UNIVERSE.filter((stock) => {
      const matchEx = selectedExchange === 'ALL' || stock.exchange === selectedExchange;
      if (!matchEx) return false;
      if (!q) return true;
      return (
        stock.symbol.toUpperCase().includes(q) ||
        stock.companyName.toLowerCase().includes(query.toLowerCase()) ||
        stock.sector.toLowerCase().includes(query.toLowerCase())
      );
    });
  }, [query, selectedExchange]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
      <div
        className="w-full max-w-[42rem] bg-terminal-surface border border-terminal-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-terminal-border bg-terminal-bg">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-terminal-surface border border-terminal-border text-terminal-accent">
              <Bookmark className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold font-mono text-terminal-text-primary uppercase">
                Tra Cứu & Quản Lý Watchlist
              </h3>
              <p className="text-[11px] text-terminal-text-muted">
                Đang có {watchlistSymbols.length} mã trong danh mục của bạn
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-terminal-surface text-terminal-text-muted hover:text-terminal-text-primary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Exchange Filter Bar */}
        <div className="p-3 border-b border-terminal-border space-y-2 bg-terminal-surface">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-terminal-text-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm kiếm theo mã cổ phiếu, tên công ty hoặc nhóm ngành..."
              autoFocus
              className="w-full pl-9 pr-8 py-2 bg-terminal-bg border border-terminal-border rounded-lg text-xs font-mono text-terminal-text-primary placeholder-terminal-text-muted focus:outline-none focus:border-terminal-accent"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-terminal-text-muted hover:text-terminal-text-primary"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-xs font-mono">
            <span className="text-terminal-text-muted text-[11px]">Sàn giao dịch:</span>
            {(['ALL', 'HOSE', 'HNX', 'UPCOM'] as const).map((ex) => (
              <button
                key={ex}
                onClick={() => setSelectedExchange(ex)}
                className={`px-2.5 py-0.5 rounded text-[11px] transition-colors ${
                  selectedExchange === ex
                    ? 'bg-terminal-accent text-white font-bold'
                    : 'bg-terminal-bg text-terminal-text-muted hover:text-terminal-text-primary border border-terminal-border'
                }`}
              >
                {ex === 'ALL' ? 'Tất cả' : ex}
              </button>
            ))}
          </div>
        </div>

        {/* Stocks List */}
        <div className="flex-1 overflow-y-auto p-2 divide-y divide-terminal-border/40 scrollbar-thin scrollbar-thumb-terminal-border">
          {filteredStocks.length > 0 ? (
            filteredStocks.map((stock) => {
              const isAdded = watchlistSet.has(stock.symbol.toUpperCase());
              return (
                <div
                  key={stock.symbol}
                  className="flex items-center justify-between p-2.5 hover:bg-terminal-surface-hover/60 rounded-lg transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 text-center">
                      <span className="font-bold text-sm font-mono text-terminal-text-primary group-hover:text-terminal-accent transition-colors block">
                        {stock.symbol}
                      </span>
                      <Badge variant="subtle" size="xs">
                        {stock.exchange}
                      </Badge>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-terminal-text-primary">
                        {stock.companyName}
                      </div>
                      <div className="text-[11px] text-terminal-text-muted flex items-center gap-2 mt-0.5">
                        <span>{stock.sector}</span>
                        {stock.isVN30 && (
                          <span className="inline-flex items-center gap-0.5 text-amber-400 font-mono text-[10px]">
                            <Sparkles className="w-2.5 h-2.5" /> VN30
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Add / Remove Button */}
                  <button
                    onClick={() => {
                      if (isAdded) {
                        onRemoveStock(stock.symbol);
                      } else {
                        onAddStock(stock.symbol);
                      }
                    }}
                    className={`px-3 py-1 rounded text-xs font-mono flex items-center gap-1.5 transition-all ${
                      isAdded
                        ? 'bg-terminal-surface-subtle text-terminal-text-muted hover:bg-rose-500/20 hover:text-rose-400 border border-terminal-border'
                        : 'bg-terminal-accent hover:bg-terminal-accent-hover text-white font-medium shadow-xs'
                    }`}
                  >
                    {isAdded ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Đã theo dõi</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>Theo dõi</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })
          ) : (
            <div className="py-12 text-center space-y-2">
              <p className="text-xs text-terminal-text-muted font-mono">
                Không tìm thấy mã nào khớp với từ khóa "{query}"
              </p>
              {query.length >= 2 && (
                <button
                  onClick={() => onAddStock(query.toUpperCase())}
                  className="px-3 py-1.5 bg-terminal-accent text-white rounded text-xs font-mono inline-flex items-center gap-1 shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Thêm trực tiếp mã "{query.toUpperCase()}"
                </button>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-terminal-border bg-terminal-bg flex items-center justify-between text-xs font-mono text-terminal-text-muted">
          <span>Chọn mã để thêm hoặc bỏ theo dõi</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-terminal-surface-subtle hover:bg-terminal-surface-hover border border-terminal-border text-terminal-text-primary rounded text-xs font-medium transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

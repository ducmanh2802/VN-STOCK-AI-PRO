import { useState, useMemo } from 'react';
import { StockSummary } from '../types/stock';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { DemoBadge } from '../components/common/DemoBadge';
import { formatVND, formatPercent, formatVolume, formatBillionVND, getPriceChangeColor } from '../utils/formatters';
import { Search, Filter, Sparkles, BookmarkPlus, BookmarkCheck } from 'lucide-react';

interface StocksPageProps {
  allStocks: StockSummary[];
  watchlistSymbols: string[];
  onSelectStock: (symbol: string) => void;
  onToggleWatchlist: (symbol: string) => void;
}

export function StocksPage({
  allStocks,
  watchlistSymbols,
  onSelectStock,
  onToggleWatchlist,
}: StocksPageProps) {
  const [search, setSearch] = useState('');
  const [selectedExchange, setSelectedExchange] = useState<string>('ALL');
  const [selectedSector, setSelectedSector] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'volume' | 'aiScore' | 'changePercent' | 'marketCap'>('volume');

  const sectorsList = useMemo(() => {
    const set = new Set(allStocks.map((s) => s.sector));
    return ['ALL', ...Array.from(set)];
  }, [allStocks]);

  const filteredStocks = useMemo(() => {
    return allStocks
      .filter((s) => {
        const matchesQuery =
          s.symbol.toUpperCase().includes(search.toUpperCase()) ||
          s.companyName.toUpperCase().includes(search.toUpperCase());
        const matchesExchange = selectedExchange === 'ALL' || s.exchange === selectedExchange;
        const matchesSector = selectedSector === 'ALL' || s.sector === selectedSector;
        return matchesQuery && matchesExchange && matchesSector;
      })
      .sort((a, b) => {
        if (sortBy === 'volume') return b.volume - a.volume;
        if (sortBy === 'aiScore') return b.aiScore - a.aiScore;
        if (sortBy === 'changePercent') return b.changePercent - a.changePercent;
        if (sortBy === 'marketCap') return b.marketCap - a.marketCap;
        return 0;
      });
  }, [allStocks, search, selectedExchange, selectedSector, sortBy]);

  return (
    <div id="page-stocks-directory" className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-terminal-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-terminal-text-primary font-mono uppercase tracking-tight">
              Danh Sách Cổ Phiếu Việt Nam
            </h1>
            <DemoBadge size="sm" />
          </div>
          <p className="text-xs text-terminal-text-muted">
            Tra cứu và sàng lọc cổ phiếu trên cả 3 sàn HOSE, HNX, UPCOM
          </p>
        </div>
        <span className="text-xs font-mono text-terminal-text-muted">
          Hiển thị <strong>{filteredStocks.length}</strong> / {allStocks.length} mã
        </span>
      </div>

      {/* Filter & Search Bar */}
      <Card variant="default" density="compact" className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-terminal-text-muted" />
          <input
            id="input-filter-stock-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo mã hoặc tên công ty..."
            className="w-full pl-8 pr-3 py-1.5 bg-terminal-bg border border-terminal-border rounded text-terminal-text-primary placeholder-terminal-text-muted focus:outline-none focus:border-terminal-accent font-mono"
          />
        </div>

        {/* Exchange Filter */}
        <div className="flex items-center gap-1.5">
          <Filter className="w-4 h-4 text-terminal-text-muted" />
          <select
            id="select-filter-exchange"
            value={selectedExchange}
            onChange={(e) => setSelectedExchange(e.target.value)}
            className="w-full py-1.5 px-2.5 bg-terminal-bg border border-terminal-border rounded text-terminal-text-secondary focus:outline-none focus:border-terminal-accent font-mono"
          >
            <option value="ALL">Tất cả sàn giao dịch</option>
            <option value="HOSE">Sàn HOSE (TP.HCM)</option>
            <option value="HNX">Sàn HNX (Hà Nội)</option>
            <option value="UPCOM">Sàn UPCOM</option>
          </select>
        </div>

        {/* Sector Filter */}
        <div>
          <select
            id="select-filter-sector"
            value={selectedSector}
            onChange={(e) => setSelectedSector(e.target.value)}
            className="w-full py-1.5 px-2.5 bg-terminal-bg border border-terminal-border rounded text-terminal-text-secondary focus:outline-none focus:border-terminal-accent font-mono"
          >
            <option value="ALL">Tất cả ngành nghề</option>
            {sectorsList.filter((s) => s !== 'ALL').map((sec) => (
              <option key={sec} value={sec}>
                Ngành {sec}
              </option>
            ))}
          </select>
        </div>

        {/* Sorting */}
        <div>
          <select
            id="select-sort-stocks"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="w-full py-1.5 px-2.5 bg-terminal-bg border border-terminal-border rounded text-terminal-text-secondary focus:outline-none focus:border-terminal-accent font-mono"
          >
            <option value="volume">Sắp xếp: Khối lượng GD cao nhất</option>
            <option value="aiScore">Sắp xếp: Điểm AI Score cao nhất</option>
            <option value="changePercent">Sắp xếp: % Tăng mạnh nhất</option>
            <option value="marketCap">Sắp xếp: Vốn hóa thị trường lớn nhất</option>
          </select>
        </div>
      </Card>

      {/* Stocks Table */}
      <Card variant="default" className="p-0 overflow-hidden shadow-sm">
        {filteredStocks.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-terminal-border bg-terminal-bg text-terminal-text-muted uppercase text-[11px]">
                  <th className="py-3 px-3">Mã CP</th>
                  <th className="py-3 px-3">Ngành</th>
                  <th className="py-3 px-3 text-right">Giá</th>
                  <th className="py-3 px-3 text-right">% Thay đổi</th>
                  <th className="py-3 px-3 text-right">Khối lượng</th>
                  <th className="py-3 px-3 text-right">Vốn hóa</th>
                  <th className="py-3 px-3 text-center">P/E</th>
                  <th className="py-3 px-3 text-center">ROE</th>
                  <th className="py-3 px-3 text-center">AI Score</th>
                  <th className="py-3 px-3 text-center">Theo dõi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-terminal-border/60">
                {filteredStocks.map((stock) => {
                  const isWatchlisted = watchlistSymbols.includes(stock.symbol);
                  const isUp = stock.change > 0;
                  const isDown = stock.change < 0;

                  return (
                    <tr
                      key={stock.symbol}
                      id={`stock-row-${stock.symbol}`}
                      className="hover:bg-terminal-surface-hover transition-colors group cursor-pointer"
                      onClick={() => onSelectStock(stock.symbol)}
                    >
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-terminal-text-primary group-hover:text-terminal-accent transition-colors">
                            {stock.symbol}
                          </span>
                          <Badge variant="subtle" size="xs">
                            {stock.exchange}
                          </Badge>
                        </div>
                        <div className="text-[11px] text-terminal-text-muted font-sans truncate max-w-[180px]">
                          {stock.companyName}
                        </div>
                      </td>

                      <td className="py-3 px-3 text-terminal-text-secondary font-sans">{stock.sector}</td>

                      <td className={`py-3 px-3 text-right font-bold text-sm ${getPriceChangeColor(stock.change)}`}>
                        {formatVND(stock.price)}
                      </td>

                      <td className="py-3 px-3 text-right">
                        <Badge variant={isUp ? 'up' : isDown ? 'down' : 'ref'} size="xs">
                          {formatPercent(stock.changePercent)}
                        </Badge>
                      </td>

                      <td className="py-3 px-3 text-right text-terminal-text-secondary font-medium">
                        {formatVolume(stock.volume)}
                      </td>

                      <td className="py-3 px-3 text-right text-terminal-text-muted">
                        {formatBillionVND(stock.marketCap)}
                      </td>

                      <td className="py-3 px-3 text-center text-terminal-text-secondary">{stock.pe}x</td>
                      <td className="py-3 px-3 text-center text-terminal-up font-medium">
                        {stock.roe}%
                      </td>

                      <td className="py-3 px-3 text-center">
                        <Badge variant="accent" size="xs">
                          <Sparkles className="w-3 h-3" />
                          {stock.aiScore}
                        </Badge>
                      </td>

                      <td
                        className="py-3 px-3 text-center"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleWatchlist(stock.symbol);
                        }}
                      >
                        <button
                          id={`btn-toggle-watch-${stock.symbol}`}
                          className={`p-1.5 rounded transition-colors ${
                            isWatchlisted
                              ? 'text-terminal-ref bg-terminal-ref/15 hover:bg-terminal-ref/25'
                              : 'text-terminal-text-muted hover:text-terminal-text-primary hover:bg-terminal-surface-subtle'
                          }`}
                          title={isWatchlisted ? 'Đang theo dõi' : 'Thêm vào watchlist'}
                        >
                          {isWatchlisted ? (
                            <BookmarkCheck className="w-4 h-4" />
                          ) : (
                            <BookmarkPlus className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            type="search"
            title="Không tìm thấy cổ phiếu"
            description={`Không có mã nào khớp với bộ lọc "${search}". Vui lòng thử lại với từ khóa khác.`}
            actionLabel="Xóa bộ lọc"
            onAction={() => {
              setSearch('');
              setSelectedExchange('ALL');
              setSelectedSector('ALL');
            }}
          />
        )}
      </Card>
    </div>
  );
}

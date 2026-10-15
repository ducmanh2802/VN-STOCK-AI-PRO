import React, { useState, useMemo } from 'react';
import { VIETNAM_STOCKS_UNIVERSE } from '../services/market/stockUniverse';
import { useStocksList } from '../hooks/useMarketQueries';
import { useAppStore } from '../store/useAppStore';
import { Badge } from '../components/ui/Badge';
import { formatVND, formatBillionVND, formatPercent } from '../utils/formatters';
import { Search, SlidersHorizontal } from 'lucide-react';
import type { StockSummary } from '../types/stock';

export const StockScreenerPage: React.FC = () => {
  const { openQuickView, isWatchlisted, toggleWatchlist } = useAppStore();
  const stocksQuery = useStocksList();
  const [exchange, setExchange] = useState<string>('ALL');
  const [sector, setSector] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [minScore, setMinScore] = useState<number>(0);

  const sectors = useMemo(() => {
    const set = new Set<string>();
    for (const s of VIETNAM_STOCKS_UNIVERSE) {
      if (s.sector) set.add(s.sector);
    }
    return Array.from(set).sort();
  }, []);

  const stocks: StockSummary[] = (stocksQuery.data as StockSummary[]) || VIETNAM_STOCKS_UNIVERSE.map((s) => ({
    symbol: s.symbol,
    companyName: s.companyName,
    exchange: s.exchange,
    sector: s.sector,
    price: 28500,
    change: 350,
    changePercent: 1.24,
    volume: 12500000,
    tradingValue: 356250000000,
    aiScore: s.isVN30 ? 82 : 74,
    trend: 'UPTREND' as const,
    signal: 'BUY' as const,
    pe: 12.5,
    pb: 1.8,
    roe: 18.2,
  }));

  const filtered = useMemo(() => {
    return stocks.filter((s: StockSummary) => {
      if (exchange !== 'ALL' && s.exchange !== exchange) return false;
      if (sector !== 'ALL' && s.sector !== sector) return false;
      if (minScore > 0 && s.aiScore < minScore) return false;
      if (search) {
        const q = search.toUpperCase();
        if (!s.symbol.includes(q) && !s.companyName.toUpperCase().includes(q)) return false;
      }
      return true;
    });
  }, [stocks, exchange, sector, search, minScore]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-terminal-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <SlidersHorizontal className="w-4 h-4" />
          </div>
          <div>
            <h1 className="page-title">Bộ Lọc Cổ Phiếu Đa Chiều (Quant Screener)</h1>
            <p className="text-xs text-terminal-text-muted">
              Lọc theo tiêu chuẩn định lượng, điểm số AI, chỉ số cơ bản & xu hướng kỹ thuật
            </p>
          </div>
        </div>
        <span className="text-xs font-mono text-terminal-text-muted">
          Tìm thấy <strong className="text-terminal-accent">{filtered.length}</strong> / {stocks.length} mã
        </span>
      </div>

      {/* Filter Controls */}
      <div className="bg-terminal-surface border border-terminal-border rounded p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="text-xs text-terminal-text-muted block mb-1">Tìm kiếm mã / tên:</label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-terminal-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="VD: HPG, FPT..."
              className="w-full pl-8 pr-2 py-1.5 text-xs bg-terminal-bg border border-terminal-border rounded text-terminal-text"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-terminal-text-muted block mb-1">Sàn giao dịch:</label>
          <select
            value={exchange}
            onChange={(e) => setExchange(e.target.value)}
            className="w-full py-1.5 px-2 text-xs bg-terminal-bg border border-terminal-border rounded text-terminal-text"
          >
            <option value="ALL">Tất cả các sàn</option>
            <option value="HOSE">HOSE</option>
            <option value="HNX">HNX</option>
            <option value="UPCOM">UPCOM</option>
          </select>
        </div>

        <div>
          <label className="text-xs text-terminal-text-muted block mb-1">Nhóm ngành:</label>
          <select
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            className="w-full py-1.5 px-2 text-xs bg-terminal-bg border border-terminal-border rounded text-terminal-text"
          >
            <option value="ALL">Tất cả các ngành</option>
            {sectors.map((sec) => (
              <option key={sec} value={sec}>
                {sec}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-terminal-text-muted block mb-1">Điểm AI tối thiểu ({minScore}):</label>
          <input
            type="range"
            min="0"
            max="90"
            step="5"
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="w-full mt-2"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-terminal-surface border border-terminal-border rounded overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-terminal-border bg-terminal-bg text-terminal-text-muted font-mono uppercase">
              <th className="py-2.5 px-3">Mã CP</th>
              <th className="py-2.5 px-3">Sàn / Ngành</th>
              <th className="py-2.5 px-3 text-right">Thị giá</th>
              <th className="py-2.5 px-3 text-right">Biến động</th>
              <th className="py-2.5 px-3 text-right">Khối lượng</th>
              <th className="py-2.5 px-3 text-right">P/E</th>
              <th className="py-2.5 px-3 text-right">ROE</th>
              <th className="py-2.5 px-3 text-center">Điểm AI</th>
              <th className="py-2.5 px-3 text-center">Tín hiệu</th>
              <th className="py-2.5 px-3 text-center">Watchlist</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-terminal-border">
            {filtered.map((stock: StockSummary) => (
              <tr
                key={stock.symbol}
                className="hover:bg-terminal-surface-elevated cursor-pointer transition-colors"
                onClick={() => openQuickView(stock.symbol)}
              >
                <td className="py-2.5 px-3 font-mono font-bold text-terminal-text">
                  {stock.symbol}
                </td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="subtle" size="xs">
                      {stock.exchange}
                    </Badge>
                    <span className="text-terminal-text-muted truncate max-w-[150px]">
                      {stock.sector}
                    </span>
                  </div>
                </td>
                <td className="py-2.5 px-3 text-right font-mono font-medium text-terminal-text">
                  {formatVND(stock.price)}
                </td>
                <td
                  className={`py-2.5 px-3 text-right font-mono font-bold ${
                    stock.changePercent >= 0 ? 'text-terminal-up' : 'text-terminal-down'
                  }`}
                >
                  {formatPercent(stock.changePercent)}
                </td>
                <td className="py-2.5 px-3 text-right font-mono text-terminal-text-muted">
                  {formatBillionVND(stock.tradingValue)}
                </td>
                <td className="py-2.5 px-3 text-right font-mono text-terminal-text">
                  {stock.pe ? stock.pe.toFixed(1) : '—'}
                </td>
                <td className="py-2.5 px-3 text-right font-mono text-terminal-text">
                  {stock.roe ? `${stock.roe.toFixed(1)}%` : '—'}
                </td>
                <td className="py-2.5 px-3 text-center">
                  <span
                    className={`inline-block px-2 py-0.5 rounded font-mono font-bold text-xs ${
                      stock.aiScore >= 75
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : stock.aiScore <= 45
                        ? 'bg-rose-500/20 text-rose-400'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}
                  >
                    {stock.aiScore}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-center">
                  <Badge
                    variant={
                      stock.signal === 'BUY'
                        ? 'up'
                        : stock.signal === 'SELL'
                        ? 'down'
                        : 'subtle'
                    }
                    size="xs"
                  >
                    {stock.signal}
                  </Badge>
                </td>
                <td
                  className="py-2.5 px-3 text-center"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleWatchlist(stock.symbol);
                  }}
                >
                  <button className="text-xs font-mono text-terminal-text-muted hover:text-terminal-accent">
                    {isWatchlisted(stock.symbol) ? '★' : '☆'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

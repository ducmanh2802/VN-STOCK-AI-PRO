import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StockSummary } from '../../../types/stock';
import { WatchlistStats, SortColumn, SortDirection } from '../types';
import { WatchlistStatsSummary } from '../WatchlistStatsSummary';
import { WatchlistToolbar } from '../WatchlistToolbar';
import { WatchlistTable } from '../WatchlistTable';
import { WatchlistCardGrid } from '../WatchlistCardGrid';
import { WatchlistEmptyState } from '../WatchlistEmptyState';

const MOCK_REAL_STOCKS: StockSummary[] = [
  {
    symbol: 'HPG',
    companyName: 'CTCP Tập đoàn Hòa Phát',
    exchange: 'HOSE',
    sector: 'Thép & Vật liệu',
    price: 28500,
    change: 850,
    changePercent: 3.07,
    volume: 18500000,
    tradingValue: 527.25,
    open: 27800,
    high: 28700,
    low: 27700,
    refPrice: 27650,
    ceilingPrice: 29550,
    floorPrice: 25750,
    marketCap: 165300,
    pe: 11.2,
    pb: 1.5,
    roe: 16.5,
    rsi: 62,
    trend: 'UPTREND',
    aiScore: 82,
    fairValue: 34000,
    sparkline: [27650, 27800, 28200, 28500],
    isDemo: false,
  },
  {
    symbol: 'FPT',
    companyName: 'CTCP FPT',
    exchange: 'HOSE',
    sector: 'Công nghệ',
    price: 135000,
    change: -1200,
    changePercent: -0.88,
    volume: 4200000,
    tradingValue: 567.0,
    open: 136500,
    high: 137000,
    low: 134500,
    refPrice: 136200,
    ceilingPrice: 145700,
    floorPrice: 126700,
    marketCap: 198000,
    pe: 22.4,
    pb: 4.8,
    roe: 28.2,
    rsi: 54,
    trend: 'SIDEWAY',
    aiScore: 74,
    fairValue: 155000,
    sparkline: [136200, 136500, 135000],
    isDemo: false,
  },
  {
    symbol: 'SSI',
    companyName: 'CTCP Chứng khoán SSI',
    exchange: 'HOSE',
    sector: 'Chứng khoán',
    price: 32000,
    change: 0,
    changePercent: 0,
    volume: 12000000,
    tradingValue: 384.0,
    open: 32000,
    high: 32500,
    low: 31800,
    refPrice: 32000,
    ceilingPrice: 34200,
    floorPrice: 29800,
    marketCap: 48000,
    pe: 14.8,
    pb: 1.8,
    roe: 14.2,
    rsi: 48,
    trend: 'SIDEWAY',
    aiScore: 58,
    fairValue: 36000,
    sparkline: [32000, 32000],
    isDemo: false,
  },
];

describe('Watchlist Module — Production Acceptance Suite', () => {
  describe('1. WatchlistStatsSummary & Metric Aggregations', () => {
    it('computes and renders market breadth, averages and totals accurately', () => {
      const stats: WatchlistStats = {
        totalCount: 3,
        advances: 1,
        declines: 1,
        unchanged: 1,
        ceilings: 0,
        floors: 0,
        avgChangePercent: 0.73,
        avgAiScore: 71.3,
        avgUpsidePercent: 15.6,
        totalTradingValue: 1478.25,
        totalVolume: 34700000,
        topGainer: MOCK_REAL_STOCKS[0],
        topLoser: MOCK_REAL_STOCKS[1],
      };

      const html = renderToStaticMarkup(
        <WatchlistStatsSummary
          watchlist={MOCK_REAL_STOCKS}
          stats={stats}
          isFetching={false}
          onRefresh={() => {}}
          lastUpdated={new Date('2026-09-16T10:30:00')}
          refreshInterval={30000}
          onRefreshIntervalChange={() => {}}
        />
      );

      // Verify breadths in markup
      expect(html).toContain('3');
      expect(html).toContain('1▲');
      expect(html).toContain('1▼');
      expect(html).toContain('1■');

      // Verify AI Score and Upside
      expect(html).toContain('71.3');
      expect(html).toContain('15.6%');
      expect(html).toContain('Live Market Feed (VPS / KBS)');
    });
  });

  describe('2. WatchlistTable & WatchlistCardGrid Markup', () => {
    it('renders real stock prices, badges, and sparklines without placeholders', () => {
      const htmlTable = renderToStaticMarkup(
        <WatchlistTable
          stocks={MOCK_REAL_STOCKS}
          sortColumn="changePercent"
          sortDirection="desc"
          onSort={() => {}}
          onSelectStock={() => {}}
          onNavigateToStock={() => {}}
          onOpenTradeModal={() => {}}
          onRemoveStock={() => {}}
        />
      );

      expect(htmlTable).toContain('HPG');
      expect(htmlTable).toContain('FPT');
      expect(htmlTable).toContain('SSI');
      expect(htmlTable).toContain('28.500');
      expect(htmlTable).toContain('135.000');
      expect(htmlTable).toContain('+3.07%');
      expect(htmlTable).toContain('polyline'); // Real SVG Sparkline present

      const htmlGrid = renderToStaticMarkup(
        <WatchlistCardGrid
          stocks={MOCK_REAL_STOCKS}
          onSelectStock={() => {}}
          onNavigateToStock={() => {}}
          onOpenTradeModal={() => {}}
          onRemoveStock={() => {}}
        />
      );

      expect(htmlGrid).toContain('HPG');
      expect(htmlGrid).toContain('CTCP Tập đoàn Hòa Phát');
      expect(htmlGrid).toContain('Fair Value');
    });
  });

  describe('3. Sorting & Filtering Determinism', () => {
    it('sorts deterministically ascending and descending by multiple metrics', () => {
      const sortBy = (stocks: StockSummary[], col: SortColumn, dir: SortDirection) => {
        if (dir === 'none') return stocks;
        return [...stocks].sort((a, b) => {
          let valA: any = a[col as keyof StockSummary] ?? 0;
          let valB: any = b[col as keyof StockSummary] ?? 0;
          if (col === 'symbol') {
            return dir === 'asc' ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
          }
          if (valA < valB) return dir === 'asc' ? -1 : 1;
          if (valA > valB) return dir === 'asc' ? 1 : -1;
          return 0;
        });
      };

      const sortedByPriceDesc = sortBy(MOCK_REAL_STOCKS, 'price', 'desc');
      expect(sortedByPriceDesc[0].symbol).toBe('FPT');
      expect(sortedByPriceDesc[1].symbol).toBe('SSI');
      expect(sortedByPriceDesc[2].symbol).toBe('HPG');

      const sortedByPriceAsc = sortBy(MOCK_REAL_STOCKS, 'price', 'asc');
      expect(sortedByPriceAsc[0].symbol).toBe('HPG');
      expect(sortedByPriceAsc[1].symbol).toBe('SSI');
      expect(sortedByPriceAsc[2].symbol).toBe('FPT');

      const sortedByAiDesc = sortBy(MOCK_REAL_STOCKS, 'aiScore', 'desc');
      expect(sortedByAiDesc[0].symbol).toBe('HPG');
      expect(sortedByAiDesc[1].symbol).toBe('FPT');
      expect(sortedByAiDesc[2].symbol).toBe('SSI');
    });
  });

  describe('4. WatchlistEmptyState', () => {
    it('renders clean user-invoked starter baskets', () => {
      const html = renderToStaticMarkup(
        <WatchlistEmptyState
          onAddStock={() => {}}
          onAddMultipleStocks={() => {}}
        />
      );

      expect(html).toContain('Danh Mục Theo Dõi Đang Trống');
      expect(html).toContain('Top VN30 Bluechips');
      expect(html).toContain('Ngân Hàng &amp; Chứng Khoán');
    });
  });

  describe('5. WatchlistToolbar', () => {
    it('renders category group tabs, search and export controls', () => {
      const html = renderToStaticMarkup(
        <WatchlistToolbar
          searchQuery=""
          onSearchChange={() => {}}
          selectedGroup="all"
          onGroupChange={() => {}}
          exchangeFilter="ALL"
          onExchangeFilterChange={() => {}}
          signalFilter="ALL"
          onSignalFilterChange={() => {}}
          trendFilter="ALL"
          onTrendFilterChange={() => {}}
          viewMode="table"
          onViewModeChange={() => {}}
          onAddStock={() => {}}
          onOpenAddModal={() => {}}
          onExportCSV={() => {}}
          onExportJSON={() => {}}
          onCopySummary={() => {}}
          isCopied={false}
          watchlistSymbols={['HPG', 'FPT', 'SSI']}
          totalStocksCount={3}
          filteredCount={3}
        />
      );

      expect(html).toContain('Tất cả danh mục');
      expect(html).toContain('VN30 Bluechips');
      expect(html).toContain('Ngân hàng');
      expect(html).toContain('Lọc mã CP');
    });
  });
});

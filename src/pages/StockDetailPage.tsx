import React, { useState } from 'react';
import {
  useFullStockDetail,
  useStockChartData,
  useMoneyFlowAnalysis,
  useStockAnalysis,
  useRealtimeQuote,
  useRealFundamentals,
} from '../hooks/useMarketQueries';
import { TimeframeOption } from '../types/stockDetail';
import type { StockChartDataBundle } from '../services/market/stockHistory';
import { StockHeader } from '../components/stock/StockHeader';
import { StockPriceSummary } from '../components/stock/StockPriceSummary';
import { StockAISignalCard } from '../components/stock/StockAISignalCard';
import { StockCandlestickChart } from '../components/stock/StockCandlestickChart';
import { StockTechnicalIndicators } from '../components/stock/StockTechnicalIndicators';
import { StockAnalysisCard } from '../components/stock/StockAnalysisCard';
import { StockFundamentals } from '../components/stock/StockFundamentals';
import { StockRealFundamentals } from '../components/stock/StockRealFundamentals';
import { StockValuation } from '../components/stock/StockValuation';
import { StockMoneyFlow } from '../components/stock/StockMoneyFlow';
import { StockSupportResistance } from '../components/stock/StockSupportResistance';
import { StockRiskReward } from '../components/stock/StockRiskReward';
import { StockAIExplanation } from '../components/stock/StockAIExplanation';
import { DataSourceBadge } from '../components/stock/DataSourceBadge';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorBoundary';
import { ArrowLeft, AlertCircle } from 'lucide-react';

export interface StockDetailPageProps {
  symbol: string;
  isWatchlisted: boolean;
  onToggleWatchlist: (symbol: string) => void;
  onBackToDashboard?: () => void;
}

export const StockDetailPage: React.FC<StockDetailPageProps> = ({
  symbol,
  isWatchlisted,
  onToggleWatchlist,
  onBackToDashboard,
}) => {
  const [timeframe, setTimeframe] = useState<TimeframeOption>('3M');

  // Fetch complete stock details
  const {
    data: stock,
    isLoading: isStockLoading,
    error: stockError,
    refetch: refetchStock,
    isRefetching,
  } = useFullStockDetail(symbol);

  // PHASE 8.5C — REAL data sources (KBS history, VPS quote, VPS fundamentals)
  const { data: chartResp, isLoading: isChartLoading } = useStockChartData(symbol, timeframe);
  const { data: realtimeQuoteResp } = useRealtimeQuote(symbol);
  const { data: realFundamentalsResp, isLoading: isRealFundamentalsLoading } = useRealFundamentals(symbol);

  const quote = realtimeQuoteResp?.dataStatus === 'OK' ? realtimeQuoteResp.quote ?? null : null;
  const quoteUnavailableReason =
    realtimeQuoteResp && realtimeQuoteResp.dataStatus !== 'OK'
      ? realtimeQuoteResp.error ?? 'VPS trả về trạng thái không khả dụng'
      : null;
  const realFundamentals =
    realFundamentalsResp && realFundamentalsResp.dataStatus === 'OK' ? realFundamentalsResp : null;
  const realFundamentalsUnavailableReason =
    realFundamentalsResp && realFundamentalsResp.dataStatus !== 'OK'
      ? realFundamentalsResp.error ?? 'VPS trả về trạng thái không khả dụng'
      : null;

  // Real KBS chart bundle (only when the endpoint returned dataStatus OK)
  const chartBundle: StockChartDataBundle | null =
    chartResp && chartResp.dataStatus === 'OK' && Array.isArray(chartResp.candles)
      ? (chartResp as unknown as StockChartDataBundle)
      : null;
  const chartUnavailableReason =
    chartResp && chartResp.dataStatus !== 'OK' ? chartResp.error ?? 'Không khả dụng' : null;

  // 52-week extremes / avg volume / latest session value computed from REAL KBS candles
  const candles52 = chartBundle?.candles ? chartBundle.candles.slice(-252) : [];
  const realHigh52 = candles52.length > 0 ? Math.max(...candles52.map((c) => c.high)) : undefined;
  const realLow52 = candles52.length > 0 ? Math.min(...candles52.map((c) => c.low)) : undefined;
  const realAvgVolume20 =
    chartBundle && chartBundle.candles.length >= 20
      ? Math.round(
          chartBundle.candles.slice(-20).reduce((sum, c) => sum + c.volume, 0) / 20
        )
      : undefined;
  const realTradingValueBillion =
    chartBundle?.latestValueVnd && chartBundle.latestValueVnd > 0
      ? chartBundle.latestValueVnd / 1e9
      : undefined;

  // Fetch deterministic money flow analysis
  const { data: moneyFlowAnalysis } = useMoneyFlowAnalysis(symbol);
  const { data: stockAnalysis, isLoading: isAnalysisLoading } = useStockAnalysis(symbol);

  if (isStockLoading) {
    return (
      <div id="stock-detail-loading" className="py-16 space-y-6">
        <LoadingState
          variant="terminal"
          message={`Đang tải dữ liệu toàn diện cổ phiếu ${symbol} (Kỹ thuật, BCTC, Dòng tiền & AI định giá)...`}
        />
      </div>
    );
  }

  if (stockError || !stock) {
    return (
      <div id="stock-detail-error" className="py-12 space-y-6">
        <div className="p-6 rounded-xl bg-terminal-surface border border-terminal-down/30 text-center space-y-4 max-w-lg mx-auto">
          <AlertCircle className="w-10 h-10 text-terminal-down mx-auto" />
          <h2 className="text-xl font-bold font-mono text-terminal-text-primary">
            Không tìm thấy thông tin mã {symbol}
          </h2>
          <p className="text-xs text-terminal-text-secondary">
            Mã cổ phiếu chưa được niêm yết trên các sàn HOSE, HNX, UPCOM hoặc dữ liệu tạm thời chưa khả dụng.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            {onBackToDashboard && (
              <button
                onClick={onBackToDashboard}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-terminal-accent text-white text-xs font-mono font-bold"
              >
                <ArrowLeft className="w-4 h-4" /> Quay lại Tổng quan
              </button>
            )}
            <button
              onClick={() => refetchStock()}
              className="px-4 py-2 rounded-lg bg-terminal-surface hover:bg-terminal-surface-hover border border-terminal-border text-xs font-mono text-terminal-text-primary"
            >
              Thử lại
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id={`stock-detail-page-${symbol}`} className="space-y-4 pb-12">
      {/* 1. Stock Header */}
      <StockHeader
        symbol={stock.symbol}
        companyName={stock.companyName}
        exchange={stock.exchange}
        sector={stock.sector}
        isWatchlisted={isWatchlisted}
        onToggleWatchlist={() => onToggleWatchlist(stock.symbol)}
        onBack={onBackToDashboard}
        onRefresh={() => refetchStock()}
        isRefreshing={isRefetching}
      />

      {/* 1b. Real data-source indicator (PHASE 8.5C STEP 13) */}
      <DataSourceBadge
        historical={{ source: 'KBS', ok: Boolean(chartBundle) }}
        realtime={{ source: 'VPS', ok: Boolean(quote), detail: quoteUnavailableReason ?? undefined }}
        fundamentals={{
          source: 'VPS',
          ok: Boolean(realFundamentals),
          detail: realFundamentalsUnavailableReason ?? undefined,
        }}
      />

      {/* 2. Price Summary — REAL VPS quote when available, explicit unavailable state otherwise */}
      {quote ? (
        <StockPriceSummary
          price={quote.lastPrice}
          change={quote.change ?? 0}
          changePercent={quote.changePercent ?? 0}
          refPrice={quote.referencePrice ?? undefined}
          ceilingPrice={quote.ceilingPrice ?? undefined}
          floorPrice={quote.floorPrice ?? undefined}
          open={quote.openPrice ?? undefined}
          high={quote.highPrice ?? undefined}
          low={quote.lowPrice ?? undefined}
          volume={quote.matchedVolumeShares ?? 0}
          tradingValue={realTradingValueBillion ?? 0}
          high52Week={realHigh52}
          low52Week={realLow52}
          avgVolume20D={realAvgVolume20}
          dataSourceLabel="VPS"
        />
      ) : (
        <StockPriceSummary
          price={0}
          change={0}
          changePercent={0}
          volume={0}
          tradingValue={0}
          realtimeUnavailableReason={quoteUnavailableReason ?? 'đang tải hoặc nguồn lỗi'}
        />
      )}

      {/* 3. AI Signal Card */}
      <StockAISignalCard
        signal={stock.aiSignal}
        currentPrice={stock.price}
      />

      {/* 4. Interactive Candlestick Chart with REAL KBS data */}
      <StockCandlestickChart
        symbol={stock.symbol}
        chartData={chartBundle}
        timeframe={timeframe}
        onChangeTimeframe={setTimeframe}
        isLoading={isChartLoading}
      />
      {!chartBundle && !isChartLoading && (
        <div className="p-3 rounded-xl bg-terminal-surface border border-amber-400/30 text-[11px] text-amber-400 font-mono">
          Lịch sử giá thật (KBS) không khả dụng{chartUnavailableReason ? ` — ${chartUnavailableReason}` : ''}.
          Không hiển thị dữ liệu giả.
        </div>
      )}

      {/* 5. Technical Indicators (Pre-calculated snapshot from REAL candles) */}
      <StockTechnicalIndicators
        snapshot={chartBundle?.snapshot || null}
        currentPrice={quote?.lastPrice ?? chartBundle?.candles[chartBundle.candles.length - 1]?.close ?? 0}
      />

      {/* 5b. Real technical analysis engine result (Phase 8.4 / 8.5C) — real KBS data → StockAnalysisEngine */}
      <StockAnalysisCard analysis={stockAnalysis} isLoading={isAnalysisLoading} />

      {/* 2-Column Responsive Layout for Deep Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 6. Fundamental Metrics (REAL VPS data, periods as provided by source) */}
        <StockRealFundamentals
          fundamentals={realFundamentals}
          isLoading={isRealFundamentalsLoading && !realFundamentals}
          unavailableReason={realFundamentalsUnavailableReason}
        />

        {/* 6b. Legacy Phase 8.4 fundamental metrics (demo data — kept for UI continuity) */}
        <StockFundamentals fundamentals={stock.fundamentals} />

        {/* 7. Valuation */}
        <StockValuation valuation={stock.valuation} />

        {/* 8. Money Flow */}
        <StockMoneyFlow moneyFlow={stock.moneyFlow} analysis={moneyFlowAnalysis} />

        {/* 9. Support / Resistance */}
        <StockSupportResistance
          levels={stock.supportResistance}
          currentPrice={stock.price}
        />
      </div>

      {/* Full Width Bottom Panels */}
      {/* 10. Risk / Reward */}
      <StockRiskReward
        riskReward={stock.riskReward}
        currentPrice={stock.price}
      />

      {/* 11. AI Explanation */}
      <StockAIExplanation
        explanation={stock.aiExplanation}
        symbol={stock.symbol}
      />
    </div>
  );
};

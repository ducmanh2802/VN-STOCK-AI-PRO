import React, { useState } from 'react';
import { useFullStockDetail, useStockChartData, useMoneyFlowAnalysis } from '../hooks/useMarketQueries';
import { TimeframeOption } from '../types/stockDetail';
import { StockHeader } from '../components/stock/StockHeader';
import { StockPriceSummary } from '../components/stock/StockPriceSummary';
import { StockAISignalCard } from '../components/stock/StockAISignalCard';
import { StockCandlestickChart } from '../components/stock/StockCandlestickChart';
import { StockTechnicalIndicators } from '../components/stock/StockTechnicalIndicators';
import { StockFundamentals } from '../components/stock/StockFundamentals';
import { StockValuation } from '../components/stock/StockValuation';
import { StockMoneyFlow } from '../components/stock/StockMoneyFlow';
import { StockSupportResistance } from '../components/stock/StockSupportResistance';
import { StockRiskReward } from '../components/stock/StockRiskReward';
import { StockAIExplanation } from '../components/stock/StockAIExplanation';
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

  // Fetch deterministic candle history and pre-calculated indicator bundle
  const {
    data: chartData,
    isLoading: isChartLoading,
  } = useStockChartData(symbol, timeframe, stock?.price || 0);

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

      {/* 2. Price Summary */}
      <StockPriceSummary
        price={stock.price}
        change={stock.change}
        changePercent={stock.changePercent}
        refPrice={stock.refPrice}
        ceilingPrice={stock.ceilingPrice}
        floorPrice={stock.floorPrice}
        open={stock.open}
        high={stock.high}
        low={stock.low}
        volume={stock.volume}
        tradingValue={stock.tradingValue}
        high52Week={stock.high52Week}
        low52Week={stock.low52Week}
        avgVolume20D={stock.avgVolume20D}
        foreignOwnershipPercent={stock.foreignOwnershipPercent}
      />

      {/* 3. AI Signal Card */}
      <StockAISignalCard
        signal={stock.aiSignal}
        currentPrice={stock.price}
      />

      {/* 4. Interactive Candlestick Chart with Indicators */}
      <StockCandlestickChart
        symbol={stock.symbol}
        chartData={chartData || null}
        timeframe={timeframe}
        onChangeTimeframe={setTimeframe}
        isLoading={isChartLoading}
      />

      {/* 5. Technical Indicators (Pre-calculated snapshot) */}
      <StockTechnicalIndicators
        snapshot={chartData?.snapshot || null}
        currentPrice={stock.price}
      />

      {/* 2-Column Responsive Layout for Deep Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 6. Fundamental Metrics */}
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

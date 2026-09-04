import React, { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  CrosshairMode,
  LineStyle,
  IChartApi,
  ISeriesApi,
} from 'lightweight-charts';
import { TimeframeOption, IndicatorKey } from '../../types/stockDetail';
import { StockChartDataBundle } from '../../services/market/stockHistory';
import { formatVND, formatVolume } from '../../utils/formatters';
import { BarChart2, Layers, Eye, EyeOff, Maximize2, RotateCcw } from 'lucide-react';

export interface StockCandlestickChartProps {
  symbol: string;
  chartData: StockChartDataBundle | null;
  timeframe: TimeframeOption;
  onChangeTimeframe: (tf: TimeframeOption) => void;
  isLoading?: boolean;
}

const TIMEFRAMES: { label: string; value: TimeframeOption }[] = [
  { label: '1D', value: '1D' },
  { label: '1W', value: '1W' },
  { label: '1M', value: '1M' },
  { label: '3M', value: '3M' },
  { label: '6M', value: '6M' },
  { label: '1Y', value: '1Y' },
  { label: '3Y', value: '3Y' },
];

export const StockCandlestickChart: React.FC<StockCandlestickChartProps> = ({
  symbol,
  chartData,
  timeframe,
  onChangeTimeframe,
  isLoading = false,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const macdContainerRef = useRef<HTMLDivElement>(null);

  // Active indicator toggles
  const [activeIndicators, setActiveIndicators] = useState<Record<IndicatorKey, boolean>>({
    MA20: true,
    MA50: true,
    MA200: false,
    Bollinger: false,
    Volume: true,
    RSI: false,
    MACD: false,
  });

  // Crosshair / Legend hover stats
  const [hoveredBar, setHoveredBar] = useState<{
    time: string | number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  } | null>(null);

  const toggleIndicator = (key: IndicatorKey) => {
    setActiveIndicators((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Main Candlestick Chart & Overlays Effect
  useEffect(() => {
    if (!chartContainerRef.current || !chartData || chartData.candles.length === 0) {
      return;
    }

    const container = chartContainerRef.current;
    container.innerHTML = '';

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 380,
      layout: {
        background: { type: ColorType.Solid, color: '#0B0E14' },
        textColor: '#94A3B8',
        fontSize: 11,
        fontFamily: 'JetBrains Mono, monospace',
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.45)', style: LineStyle.Dotted },
        horzLines: { color: 'rgba(30, 41, 59, 0.45)', style: LineStyle.Dotted },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#38BDF8', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#1E293B' },
        horzLine: { color: '#38BDF8', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#1E293B' },
      },
      rightPriceScale: {
        borderColor: '#1E293B',
        scaleMargins: {
          top: 0.1,
          bottom: activeIndicators.Volume ? 0.22 : 0.1,
        },
      },
      timeScale: {
        borderColor: '#1E293B',
        timeVisible: timeframe === '1D',
        secondsVisible: false,
      },
    });

    // 1. Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10B981',
      downColor: '#EF4444',
      borderUpColor: '#10B981',
      borderDownColor: '#EF4444',
      wickUpColor: '#10B981',
      wickDownColor: '#EF4444',
    });

    candleSeries.setData(chartData.candles as any);

    // 2. Volume Series (Overlay)
    if (activeIndicators.Volume && chartData.volume.length > 0) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        color: '#26a69a',
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume_scale',
      });

      chart.priceScale('volume_scale').applyOptions({
        scaleMargins: {
          top: 0.78,
          bottom: 0,
        },
      });

      volumeSeries.setData(
        chartData.volume.map((v) => ({
          time: v.time as any,
          value: v.value,
          color: v.color,
        }))
      );
    }

    // 3. MA20 Line
    if (activeIndicators.MA20 && chartData.sma20.length > 0) {
      const ma20Series = chart.addSeries(LineSeries, {
        color: '#EAB308',
        lineWidth: 2,
        title: 'MA20',
      });
      ma20Series.setData(chartData.sma20 as any);
    }

    // 4. MA50 Line
    if (activeIndicators.MA50 && chartData.sma50.length > 0) {
      const ma50Series = chart.addSeries(LineSeries, {
        color: '#3B82F6',
        lineWidth: 2,
        title: 'MA50',
      });
      ma50Series.setData(chartData.sma50 as any);
    }

    // 5. MA200 Line
    if (activeIndicators.MA200 && chartData.sma200.length > 0) {
      const ma200Series = chart.addSeries(LineSeries, {
        color: '#A855F7',
        lineWidth: 2,
        title: 'MA200',
      });
      ma200Series.setData(chartData.sma200 as any);
    }

    // 6. Bollinger Bands
    if (activeIndicators.Bollinger && chartData.bollinger.length > 0) {
      const bbUpper = chart.addSeries(LineSeries, {
        color: '#06B6D4',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        title: 'BB Up',
      });
      const bbMiddle = chart.addSeries(LineSeries, {
        color: '#0891B2',
        lineWidth: 1,
        title: 'BB Mid',
      });
      const bbLower = chart.addSeries(LineSeries, {
        color: '#06B6D4',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        title: 'BB Low',
      });

      bbUpper.setData(chartData.bollinger.map((b) => ({ time: b.time as any, value: b.upper })));
      bbMiddle.setData(chartData.bollinger.map((b) => ({ time: b.time as any, value: b.middle })));
      bbLower.setData(chartData.bollinger.map((b) => ({ time: b.time as any, value: b.lower })));
    }

    // Crosshair listener for legend
    chart.subscribeCrosshairMove((param) => {
      if (
        param.point === undefined ||
        !param.time ||
        param.point.x < 0 ||
        param.point.x > container.clientWidth ||
        param.point.y < 0 ||
        param.point.y > container.clientHeight
      ) {
        setHoveredBar(null);
      } else {
        const data = param.seriesData.get(candleSeries) as any;
        if (data) {
          setHoveredBar({
            time: param.time as any,
            open: data.open,
            high: data.high,
            low: data.low,
            close: data.close,
            volume: (param.seriesData.values().next().value as any)?.value || 0,
          });
        }
      }
    });

    chart.timeScale().fitContent();

    // ResizeObserver for responsiveness
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          chart.applyOptions({ width: entry.contentRect.width });
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [chartData, activeIndicators.MA20, activeIndicators.MA50, activeIndicators.MA200, activeIndicators.Bollinger, activeIndicators.Volume, timeframe]);

  // Sub-pane: RSI Chart
  useEffect(() => {
    if (!activeIndicators.RSI || !rsiContainerRef.current || !chartData || chartData.rsi.length === 0) {
      return;
    }

    const container = rsiContainerRef.current;
    container.innerHTML = '';

    const rsiChart = createChart(container, {
      width: container.clientWidth,
      height: 120,
      layout: {
        background: { type: ColorType.Solid, color: '#0B0E14' },
        textColor: '#94A3B8',
        fontSize: 10,
        fontFamily: 'JetBrains Mono, monospace',
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.35)', style: LineStyle.Dotted },
        horzLines: { color: 'rgba(30, 41, 59, 0.35)', style: LineStyle.Dotted },
      },
      rightPriceScale: {
        borderColor: '#1E293B',
      },
      timeScale: {
        borderColor: '#1E293B',
        visible: false,
      },
    });

    const rsiSeries = rsiChart.addSeries(LineSeries, {
      color: '#F59E0B',
      lineWidth: 2,
      title: 'RSI(14)',
    });

    rsiSeries.setData(chartData.rsi as any);

    // Overbought line (70) and Oversold line (30)
    rsiSeries.createPriceLine({
      price: 70,
      color: '#EF4444',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: '70',
    });
    rsiSeries.createPriceLine({
      price: 30,
      color: '#10B981',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: '30',
    });

    rsiChart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          rsiChart.applyOptions({ width: entry.contentRect.width });
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      rsiChart.remove();
    };
  }, [activeIndicators.RSI, chartData]);

  // Sub-pane: MACD Chart
  useEffect(() => {
    if (!activeIndicators.MACD || !macdContainerRef.current || !chartData || chartData.macd.length === 0) {
      return;
    }

    const container = macdContainerRef.current;
    container.innerHTML = '';

    const macdChart = createChart(container, {
      width: container.clientWidth,
      height: 130,
      layout: {
        background: { type: ColorType.Solid, color: '#0B0E14' },
        textColor: '#94A3B8',
        fontSize: 10,
        fontFamily: 'JetBrains Mono, monospace',
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.35)', style: LineStyle.Dotted },
        horzLines: { color: 'rgba(30, 41, 59, 0.35)', style: LineStyle.Dotted },
      },
      rightPriceScale: {
        borderColor: '#1E293B',
      },
      timeScale: {
        borderColor: '#1E293B',
        visible: false,
      },
    });

    // Histogram
    const histSeries = macdChart.addSeries(HistogramSeries, {
      color: '#3B82F6',
      title: 'Hist',
    });
    histSeries.setData(
      chartData.macd.map((m) => ({
        time: m.time as any,
        value: m.histogram,
        color: m.histogram >= 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)',
      }))
    );

    // MACD line
    const macdLine = macdChart.addSeries(LineSeries, {
      color: '#38BDF8',
      lineWidth: 2,
      title: 'MACD',
    });
    macdLine.setData(chartData.macd.map((m) => ({ time: m.time as any, value: m.macd })));

    // Signal line
    const signalLine = macdChart.addSeries(LineSeries, {
      color: '#F43F5E',
      lineWidth: 2,
      title: 'Signal',
    });
    signalLine.setData(chartData.macd.map((m) => ({ time: m.time as any, value: m.signal })));

    macdChart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          macdChart.applyOptions({ width: entry.contentRect.width });
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      macdChart.remove();
    };
  }, [activeIndicators.MACD, chartData]);

  // Last bar for fallback legend
  const latestBar =
    chartData && chartData.candles.length > 0
      ? chartData.candles[chartData.candles.length - 1]
      : null;

  const displayBar = hoveredBar || latestBar;

  return (
    <div
      id="stock-candlestick-chart"
      className="p-4 rounded-xl bg-terminal-surface border border-terminal-border shadow-sm space-y-3"
    >
      {/* Chart Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-terminal-border/70">
        {/* Timeframe Selector */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-terminal-bg border border-terminal-border">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              id={`btn-timeframe-${tf.value}`}
              onClick={() => onChangeTimeframe(tf.value)}
              className={`px-2.5 py-1 text-xs font-mono font-medium rounded transition-colors ${
                timeframe === tf.value
                  ? 'bg-terminal-accent text-white font-bold shadow-xs'
                  : 'text-terminal-text-secondary hover:text-terminal-text-primary hover:bg-terminal-surface-hover'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>

        {/* Indicator Toggles */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
          <span className="text-[11px] text-terminal-text-muted hidden sm:inline mr-1">Chỉ báo:</span>

          <button
            onClick={() => toggleIndicator('MA20')}
            className={`px-2 py-0.5 rounded border transition-colors ${
              activeIndicators.MA20
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 font-bold'
                : 'bg-terminal-bg text-terminal-text-muted border-terminal-border hover:text-terminal-text-primary'
            }`}
          >
            MA20
          </button>

          <button
            onClick={() => toggleIndicator('MA50')}
            className={`px-2 py-0.5 rounded border transition-colors ${
              activeIndicators.MA50
                ? 'bg-blue-500/20 text-blue-400 border-blue-500/40 font-bold'
                : 'bg-terminal-bg text-terminal-text-muted border-terminal-border hover:text-terminal-text-primary'
            }`}
          >
            MA50
          </button>

          <button
            onClick={() => toggleIndicator('MA200')}
            className={`px-2 py-0.5 rounded border transition-colors ${
              activeIndicators.MA200
                ? 'bg-purple-500/20 text-purple-400 border-purple-500/40 font-bold'
                : 'bg-terminal-bg text-terminal-text-muted border-terminal-border hover:text-terminal-text-primary'
            }`}
          >
            MA200
          </button>

          <button
            onClick={() => toggleIndicator('Bollinger')}
            className={`px-2 py-0.5 rounded border transition-colors ${
              activeIndicators.Bollinger
                ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40 font-bold'
                : 'bg-terminal-bg text-terminal-text-muted border-terminal-border hover:text-terminal-text-primary'
            }`}
          >
            Bollinger
          </button>

          <button
            onClick={() => toggleIndicator('Volume')}
            className={`px-2 py-0.5 rounded border transition-colors ${
              activeIndicators.Volume
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-bold'
                : 'bg-terminal-bg text-terminal-text-muted border-terminal-border hover:text-terminal-text-primary'
            }`}
          >
            Volume
          </button>

          <button
            onClick={() => toggleIndicator('RSI')}
            className={`px-2 py-0.5 rounded border transition-colors ${
              activeIndicators.RSI
                ? 'bg-amber-400/25 text-amber-300 border-amber-400/50 font-bold'
                : 'bg-terminal-bg text-terminal-text-muted border-terminal-border hover:text-terminal-text-primary'
            }`}
          >
            RSI
          </button>

          <button
            onClick={() => toggleIndicator('MACD')}
            className={`px-2 py-0.5 rounded border transition-colors ${
              activeIndicators.MACD
                ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 font-bold'
                : 'bg-terminal-bg text-terminal-text-muted border-terminal-border hover:text-terminal-text-primary'
            }`}
          >
            MACD
          </button>
        </div>
      </div>

      {/* Crosshair / Candle OHLC Legend Bar */}
      {displayBar && (
        <div className="flex flex-wrap items-center gap-3 text-xs font-mono bg-terminal-bg/80 px-3 py-1.5 rounded-lg border border-terminal-border/60">
          <span className="text-terminal-text-muted">
            {typeof displayBar.time === 'number'
              ? new Date(displayBar.time * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
              : displayBar.time}
          </span>
          <div>
            <span className="text-terminal-text-muted">O: </span>
            <strong className="text-terminal-text-primary">{formatVND(displayBar.open)}</strong>
          </div>
          <div>
            <span className="text-terminal-text-muted">H: </span>
            <strong className="text-terminal-up">{formatVND(displayBar.high)}</strong>
          </div>
          <div>
            <span className="text-terminal-text-muted">L: </span>
            <strong className="text-terminal-down">{formatVND(displayBar.low)}</strong>
          </div>
          <div>
            <span className="text-terminal-text-muted">C: </span>
            <strong className={displayBar.close >= displayBar.open ? 'text-terminal-up' : 'text-terminal-down'}>
              {formatVND(displayBar.close)}
            </strong>
          </div>
          {displayBar.volume > 0 && (
            <div>
              <span className="text-terminal-text-muted">Vol: </span>
              <strong className="text-terminal-accent">{formatVolume(displayBar.volume)}</strong>
            </div>
          )}
        </div>
      )}

      {/* Main Lightweight Chart Canvas */}
      <div className="relative rounded-lg overflow-hidden border border-terminal-border/80 bg-terminal-bg">
        {isLoading && (
          <div className="absolute inset-0 z-10 bg-terminal-bg/70 flex items-center justify-center font-mono text-xs text-terminal-text-secondary">
            Đang tải dữ liệu biểu đồ nến...
          </div>
        )}
        <div ref={chartContainerRef} className="w-full" />
      </div>

      {/* Sub-pane: RSI */}
      {activeIndicators.RSI && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] font-mono text-terminal-text-muted px-1">
            <span className="text-amber-400 font-semibold">RSI(14) Oscillation (30 - 70)</span>
            {chartData?.snapshot && (
              <span>
                Hiện tại: <strong className="text-terminal-text-primary">{chartData.snapshot.rsi.value}</strong> ({chartData.snapshot.rsi.label})
              </span>
            )}
          </div>
          <div className="rounded-lg overflow-hidden border border-terminal-border/80 bg-terminal-bg">
            <div ref={rsiContainerRef} className="w-full" />
          </div>
        </div>
      )}

      {/* Sub-pane: MACD */}
      {activeIndicators.MACD && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] font-mono text-terminal-text-muted px-1">
            <span className="text-sky-400 font-semibold">MACD (12, 26, 9) · Signal & Histogram</span>
            {chartData?.snapshot && (
              <span>
                MACD: <strong className="text-sky-400">{chartData.snapshot.macd.macd}</strong> · Signal:{' '}
                <strong className="text-rose-400">{chartData.snapshot.macd.signal}</strong> ({chartData.snapshot.macd.label})
              </span>
            )}
          </div>
          <div className="rounded-lg overflow-hidden border border-terminal-border/80 bg-terminal-bg">
            <div ref={macdContainerRef} className="w-full" />
          </div>
        </div>
      )}
    </div>
  );
};

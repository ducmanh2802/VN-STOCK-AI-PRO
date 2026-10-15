import React, { useCallback, useMemo, useState } from 'react';
import {
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Layers,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { MetricCard } from '../components/ui/MetricCard';
import { DataStatusBadge, type DataFreshnessState } from '../components/ui/DataStatusBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { EquityCurveChart } from '../components/charts/EquityCurveChart';
import { VIETNAM_STOCKS_UNIVERSE } from '../services/market/stockUniverse';
import { HORIZON_LABELS, type InvestmentHorizon } from '../types/recommendation';
import { formatNumber, formatPercent, formatVND } from '../utils/formatters';
import {
  RANGE_PRESETS,
  costRows,
  drawdownCurvePoints,
  equityCurvePoints,
  resolveDateRange,
  type BacktestApiEnvelope,
  type RangePreset,
} from './backtest/metrics';

const inputCls =
  'w-full text-xs font-mono bg-terminal-surface-elevated border border-terminal-border rounded px-2 py-1.5 text-terminal-text-primary focus:outline-none focus:border-terminal-accent';
const labelCls = 'block text-[10px] font-mono uppercase text-terminal-text-muted mb-1';

interface RunState {
  readonly status: 'idle' | 'loading' | 'success' | 'error';
  readonly data: BacktestApiEnvelope | null;
  readonly message: string | null;
}

const EMPTY_RUN: RunState = { status: 'idle', data: null, message: null };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** `null` renders as `--`, never as a fabricated `0%` or `NaN%`. */
function pct(value: number | null | undefined, decimals = 2): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  return `${value.toFixed(decimals)}%`;
}

/**
 * PHASE 17/18 — BACKTESTING & VALIDATION ENGINE PAGE
 *
 * Runs the certified `BacktestEngine` server-side against REAL KBS bars.
 * Everything the page displays is computed from that result; there is no
 * synthetic fallback when the provider fails — the failure is surfaced instead.
 */
export const BacktestPage: React.FC = () => {
  const [symbol, setSymbol] = useState('HPG');
  const [strategy, setStrategy] = useState<InvestmentHorizon>('SHORT_TERM');
  const [preset, setPreset] = useState<RangePreset | 'CUSTOM'>('2Y');
  const [range, setRange] = useState(() => resolveDateRange('2Y', todayIso()));
  const [initialCapital, setInitialCapital] = useState('100000000');
  const [run, setRun] = useState<RunState>(EMPTY_RUN);

  const applyPreset = useCallback((next: RangePreset) => {
    setPreset(next);
    setRange(resolveDateRange(next, todayIso()));
  }, []);

  const onCustomDate = useCallback((field: 'startDate' | 'endDate', value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    setPreset('CUSTOM');
    setRange((prev) => ({ ...prev, [field]: value }));
  }, []);

  const execute = useCallback(async () => {
    const capital = Number(initialCapital);
    if (!Number.isFinite(capital) || capital <= 0) {
      setRun({
        status: 'error',
        data: null,
        message: 'Vốn ban đầu phải là số nguyên dương (VND).',
      });
      return;
    }

    setRun({ status: 'loading', data: null, message: null });
    try {
      const response = await fetch('/api/backtest/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: symbol.trim().toUpperCase(),
          strategy,
          startDate: range.startDate,
          endDate: range.endDate,
          initialCapital: Math.round(capital),
        }),
      });

      const payload = (await response.json()) as BacktestApiEnvelope;
      if (!response.ok || !payload.success || !payload.result) {
        const message =
          payload.error?.message || 'Backtest không thể thực hiện với dữ liệu hiện tại.';
        setRun({ status: 'error', data: payload, message });
        return;
      }
      setRun({ status: 'success', data: payload, message: null });
    } catch (err) {
      setRun({
        status: 'error',
        data: null,
        message: err instanceof Error ? err.message : 'Mất kết nối tới máy chủ backtest.',
      });
    }
  }, [initialCapital, range.endDate, range.startDate, strategy, symbol]);

  const result = run.data?.result ?? null;
  const provenance = run.data?.provenance ?? null;

  const equityPoints = useMemo(
    () => (result ? equityCurvePoints(result.equityCurve) : []),
    [result]
  );
  const drawdownPoints = useMemo(
    () => (result ? drawdownCurvePoints(result.equityCurve) : []),
    [result]
  );
  const costs = useMemo(() => (result ? costRows(result) : []), [result]);

  const statusBadge: DataFreshnessState =
    run.status === 'error'
      ? 'DATA_UNAVAILABLE'
      : run.status === 'success'
        ? 'LIVE'
        : 'LOADING';

  const ledger = result?.tradeHistory ?? [];

  return (
    <div id="page-backtest" className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-terminal-border">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sky-600/20 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <PlayCircle className="w-4 h-4" />
            </div>
            <h1 className="page-title">Backtesting &amp; Validation Engine</h1>
            {run.status !== 'idle' && <DataStatusBadge status={statusBadge} compact />}
          </div>
          <p className="text-xs text-terminal-text-muted mt-1">
            Chạy chiến lược trên dữ liệu nến KBS thật, chống look-ahead, lot 100 và phí/thuế/
            trượt giá Việt Nam.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase px-2 py-1 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            <ShieldCheck className="w-3 h-3" /> Zero mock data
          </span>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase px-2 py-1 rounded border border-terminal-border bg-terminal-surface text-terminal-text-muted">
            <Layers className="w-3 h-3" /> Advisory only
          </span>
        </div>
      </div>

      {/* Configuration */}
      <div className="bg-terminal-surface border border-terminal-border rounded-md p-4 space-y-4">
        <div className="text-[11px] font-mono uppercase text-terminal-text-muted">
          Cấu hình thí nghiệm
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className={labelCls} htmlFor="bt-symbol">
              Mã cổ phiếu
            </label>
            <input
              id="bt-symbol"
              list="bt-universe"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              className={inputCls}
              autoComplete="off"
            />
            <datalist id="bt-universe">
              {VIETNAM_STOCKS_UNIVERSE.map((s) => (
                <option key={s.symbol} value={s.symbol}>
                  {s.companyName}
                </option>
              ))}
            </datalist>
          </div>

          <div>
            <label className={labelCls} htmlFor="bt-strategy">
              Khung chiến lược
            </label>
            <select
              id="bt-strategy"
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as InvestmentHorizon)}
              className={inputCls}
            >
              {(Object.keys(HORIZON_LABELS) as InvestmentHorizon[]).map((h) => (
                <option key={h} value={h}>
                  {HORIZON_LABELS[h]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls} htmlFor="bt-start">
              Từ ngày
            </label>
            <input
              id="bt-start"
              type="date"
              value={range.startDate}
              onChange={(e) => onCustomDate('startDate', e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls} htmlFor="bt-end">
              Đến ngày
            </label>
            <input
              id="bt-end"
              type="date"
              value={range.endDate}
              onChange={(e) => onCustomDate('endDate', e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls} htmlFor="bt-capital">
              Vốn ban đầu (VND)
            </label>
            <input
              id="bt-capital"
              type="number"
              min={1000000}
              step={1000000}
              value={initialCapital}
              onChange={(e) => setInitialCapital(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {RANGE_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => applyPreset(p)}
                className={`px-2.5 py-1 rounded text-[11px] font-mono border transition-colors ${
                  preset === p
                    ? 'border-terminal-accent/60 bg-terminal-accent/15 text-terminal-accent'
                    : 'border-terminal-border text-terminal-text-muted hover:text-terminal-text-primary'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={execute}
            isLoading={run.status === 'loading'}
            leftIcon={RefreshCw}
          >
            {run.status === 'loading' ? 'Đang chạy backtest…' : 'Chạy backtest'}
          </Button>
        </div>
      </div>

      {/* Error — fail-closed, never a fabricated equity curve */}
      {run.status === 'error' && (
        <div className="flex items-start gap-2.5 bg-rose-950/30 border border-rose-800/40 rounded-md p-3.5">
          <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
          <div className="text-xs text-rose-300 font-mono">
            <div className="font-semibold uppercase text-[11px] mb-0.5">
              Backtest không khả dụng
            </div>
            <div>{run.message}</div>
            {run.data?.error?.code && (
              <div className="text-[10px] text-rose-400/70 mt-1">
                mã lỗi: {run.data.error.code}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Results */}
      {run.status === 'success' && result && (
        <div className="space-y-5">
          {/* Provenance strip */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-terminal-surface-subtle border border-terminal-border rounded px-3 py-2 text-[10px] font-mono text-terminal-text-muted">
            <span className="text-terminal-text-secondary">
              {provenance?.symbol} · {provenance?.strategy}
            </span>
            <span>
              {provenance?.startDate} → {provenance?.endDate}
            </span>
            <span>{provenance?.requestedBars} nến thật</span>
            <span>{provenance?.firstBar} … {provenance?.lastBar}</span>
            <span className="text-emerald-400">anti-lookahead: {provenance?.antiLookahead}</span>
            <span>lot {provenance?.boardLot}</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {run.data?.retrievedAt
                ? new Date(run.data.retrievedAt).toLocaleTimeString('vi-VN')
                : '--'}
            </span>
          </div>

          {/* Headline metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="TỔNG LỢI NHUẬN"
              value={formatVND(result.netProfit)}
              change={result.totalReturn}
              changeValue={`${formatPercent(result.totalReturn)} / ${pct(
                result.annualizedReturn
              )} năm`}
              subValue={`Vốn đầu ${formatVND(result.initialCapital)} → ${formatVND(
                result.finalEquity
              )}`}
              badge={result.totalReturn >= 0 ? 'WIN' : 'LOSS'}
              badgeVariant={result.totalReturn >= 0 ? 'success' : 'danger'}
              icon={result.totalReturn >= 0 ? TrendingUp : TrendingDown}
              status="LIVE"
            />
            <MetricCard
              label="MAX DRAWDOWN"
              value={formatPercent(result.maxDrawdown)}
              subValue="Sụt giảm lớn nhất từ đỉnh"
              badge={Math.abs(result.maxDrawdown) > 25 ? 'DEEP' : 'CONTROLLED'}
              badgeVariant={Math.abs(result.maxDrawdown) > 25 ? 'danger' : 'success'}
              status="LIVE"
            />
            <MetricCard
              label="WIN RATE"
              value={pct(result.winRate, 1)}
              subValue={`${result.winningTrades} thắng / ${result.losingTrades} thua`}
              badge={`${result.totalTrades} TRADES`}
              badgeVariant="indigo"
              status="LIVE"
            />
            <MetricCard
              label="SHARPE / SORTINO"
              value={`${formatNumber(result.sharpeRatio, 2)} / ${formatNumber(
                result.sortinoRatio,
                2
              )}`}
              subValue={`Profit factor ${formatNumber(result.profitFactor, 2)}`}
              badge="RISK-ADJ"
              badgeVariant="neutral"
              status="LIVE"
            />
          </div>

          {/* Curves */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-terminal-surface border border-terminal-border rounded-md p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase text-terminal-text-muted">
                  Đường equity (VND)
                </span>
                <span className="text-[11px] font-mono text-terminal-text-secondary">
                  {formatVND(result.finalEquity)}
                </span>
              </div>
              <EquityCurveChart
                points={equityPoints}
                baselineValue={result.initialCapital}
                ariaLabel="Đường equity của backtest"
                formatValue={(v) => formatVND(v)}
              />
            </div>

            <div className="bg-terminal-surface border border-terminal-border rounded-md p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase text-terminal-text-muted">
                  Drawdown (%)
                </span>
                <span className="text-[11px] font-mono text-rose-400">
                  {formatPercent(result.maxDrawdown)}
                </span>
              </div>
              <EquityCurveChart
                points={drawdownPoints}
                color="#F43F5E"
                baselineValue={0}
                ariaLabel="Đường drawdown của backtest"
                formatValue={(v) => formatPercent(v)}
              />
            </div>
          </div>

          {/* Costs + summary */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-terminal-surface border border-terminal-border rounded-md overflow-hidden">
              <div className="px-4 py-2.5 border-b border-terminal-border text-[11px] font-mono uppercase text-terminal-text-muted">
                Chi phí thực hiện
              </div>
              <table className="w-full text-xs">
                <tbody className="divide-y divide-terminal-border">
                  {costs.map((row) => (
                    <tr key={row.key} className={row.key === 'total' ? 'bg-terminal-surface-subtle' : ''}>
                      <td className="px-4 py-2 text-terminal-text-secondary font-mono">
                        {row.label}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-terminal-text-primary">
                        {formatVND(row.valueVnd)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-terminal-text-muted">
                        {pct(row.shareOfCosts, 1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-terminal-surface border border-terminal-border rounded-md overflow-hidden">
              <div className="px-4 py-2.5 border-b border-terminal-border text-[11px] font-mono uppercase text-terminal-text-muted">
                Số liệu giao dịch
              </div>
              <div className="grid grid-cols-2 divide-x divide-terminal-border">
                <div className="p-4 space-y-2">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-terminal-text-muted">Tổng giao dịch</span>
                    <span className="text-terminal-text-primary">{result.totalTrades}</span>
                  </div>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-terminal-text-muted">Lợi nhuận gộp</span>
                    <span className="text-terminal-text-primary">{formatVND(result.grossProfit)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-terminal-text-muted">Lỗ gộp</span>
                    <span className="text-terminal-text-primary">{formatVND(result.grossLoss)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-terminal-text-muted">TB lệnh thắng</span>
                    <span className="text-emerald-400">{formatVND(result.averageWin)}</span>
                  </div>
                </div>
                <div className="p-4 space-y-2">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-terminal-text-muted">Lợi nhuận ròng</span>
                    <span className="text-terminal-text-primary">{formatVND(result.netProfit)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-terminal-text-muted">TB lệnh thua</span>
                    <span className="text-rose-400">{formatVND(result.averageLoss)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-terminal-text-muted">Giữ TB (phiên)</span>
                    <span className="text-terminal-text-primary">
                      {formatNumber(result.averageHoldingPeriod, 1)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-terminal-text-muted">Tổng chi phí</span>
                    <span className="text-amber-400">
                      {formatVND((result.fees ?? 0) + (result.tax ?? 0) + (result.slippageCost ?? 0))}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Trade ledger */}
          <div className="bg-terminal-surface border border-terminal-border rounded-md overflow-hidden">
            <div className="px-4 py-2.5 border-b border-terminal-border flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase text-terminal-text-muted">
                Sổ lệnh ({ledger.length}
                {result.tradeHistoryTruncated
                  ? ` / ${result.totalTradeCount ?? result.totalTrades} gần nhất`
                  : ''}
                )
              </span>
              <span className="text-[10px] font-mono text-terminal-text-muted">
                Đóng tại phiên cuối: {result.totalTrades > 0 ? 'Có' : 'Không'}
              </span>
            </div>
            {ledger.length === 0 ? (
              <EmptyState
                compact
                title="NO_TRADES"
                description="Chiến lược không mở lệnh nào trong khoảng dữ liệu này. Kết quả vẫn hợp lệ — không có lệnh là kết quả thật."
              />
            ) : (
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full text-left text-[11px] font-mono border-collapse">
                  <thead className="sticky top-0 bg-terminal-surface-subtle">
                    <tr className="text-terminal-text-muted uppercase text-[10px]">
                      <th className="px-3 py-2">Thời điểm</th>
                      <th className="px-3 py-2">Loại</th>
                      <th className="px-3 py-2 text-right">SL</th>
                      <th className="px-3 py-2 text-right">Giá khớp</th>
                      <th className="px-3 py-2 text-right">Lãi/Lỗ</th>
                      <th className="px-3 py-2 text-right">%</th>
                      <th className="px-3 py-2">Lý do</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-terminal-border">
                    {ledger.map((trade) => (
                      <tr key={trade.tradeId} className="hover:bg-terminal-surface-hover">
                        <td className="px-3 py-1.5 text-terminal-text-secondary">
                          {String(trade.executionTimestamp).slice(0, 10)}
                        </td>
                        <td
                          className={`px-3 py-1.5 ${
                            trade.side === 'BUY' ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {trade.side}
                        </td>
                        <td className="px-3 py-1.5 text-right">{trade.quantity}</td>
                        <td className="px-3 py-1.5 text-right">{formatVND(trade.executionPrice)}</td>
                        <td
                          className={`px-3 py-1.5 text-right ${
                            trade.realizedPnL > 0
                              ? 'text-emerald-400'
                              : trade.realizedPnL < 0
                                ? 'text-rose-400'
                                : 'text-terminal-text-muted'
                          }`}
                        >
                          {formatVND(trade.realizedPnL)}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          {formatPercent(trade.returnPercent)}
                        </td>
                        <td className="px-3 py-1.5 text-terminal-text-muted">
                          {trade.exitReason ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-[10px] font-mono text-terminal-text-muted leading-relaxed">
            Kết quả backtest là sản phẩm nghiên cứu lịch sử, không phải khuyến nghị giao dịch.
            Mọi lệnh thật phải qua RiskGuard / TradingEngine / PositionSizer.
          </p>
        </div>
      )}

      {/* Idle */}
      {run.status === 'idle' && (
        <EmptyState
          title="READY"
          description="Chọn mã, khung chiến lược và khoảng thời gian rồi bấm “Chạy backtest”. Dữ liệu nến lấy trực tiếp từ KBS — không có dữ liệu giả."
          actionLabel="Chạy thử HPG 2Y"
          onAction={execute}
        />
      )}
    </div>
  );
};

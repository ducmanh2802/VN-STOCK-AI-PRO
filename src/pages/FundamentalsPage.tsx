import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PieChart,
  RefreshCw,
  AlertTriangle,
  Search,
  Plus,
  X,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { MetricCard } from '../components/ui/MetricCard';
import { DataStatusBadge } from '../components/ui/DataStatusBadge';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { VIETNAM_STOCKS_UNIVERSE } from '../services/market/stockUniverse';
import type {
  VpsNormalizedFundamentals,
  VpsNormalizedQuote,
} from '../services/market/providers/vps/types';
import { formatNumber, formatPercent, formatVND } from '../utils/formatters';
import {
  SERIES_KEYS,
  SERIES_LABELS,
  buildSlotRows,
  deriveValuation,
  firstFinite,
  maxMagnitude,
  millionVndToText,
  slotDeltaPct,
} from './fundamentals/metrics';

const inputCls =
  'w-full text-xs font-mono bg-terminal-surface-elevated border border-terminal-border rounded px-2 py-1.5 text-terminal-text-primary focus:outline-none focus:border-terminal-accent';
const labelCls = 'block text-[10px] font-mono uppercase text-terminal-text-muted mb-1';

interface SymbolBundle {
  readonly symbol: string;
  readonly fundamentals: VpsNormalizedFundamentals | null;
  readonly quote: VpsNormalizedQuote | null;
  readonly error: string | null;
  readonly loadedAt: string | null;
}

const EMPTY_BUNDLE = (symbol: string): SymbolBundle => ({
  symbol,
  fundamentals: null,
  quote: null,
  error: null,
  loadedAt: null,
});

async function fetchJson(url: string): Promise<{ ok: boolean; body: any }> {
  const res = await fetch(url, { cache: 'no-store' });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { ok: res.ok, body };
}

async function loadBundle(symbol: string): Promise<SymbolBundle> {
  const [fund, quote] = await Promise.all([
    fetchJson(`/api/market-data/fundamentals/${encodeURIComponent(symbol)}`).catch(() => ({
      ok: false,
      body: null,
    })),
    fetchJson(`/api/market-data/quote/${encodeURIComponent(symbol)}`).catch(() => ({
      ok: false,
      body: null,
    })),
  ]);

  const unavailable = (body: any): string | null =>
    body && typeof body.dataStatus === 'string' && body.dataStatus !== 'OK'
      ? `Nguồn trả về ${body.dataStatus}`
      : null;

  const error =
    (!fund.ok && (fund.body?.error ?? 'Không tải được báo cáo tài chính')) ||
    unavailable(fund.body) ||
    (!quote.ok && (quote.body?.error ?? 'Không tải được giá')) ||
    unavailable(quote.body) ||
    null;

  return {
    symbol,
    fundamentals: fund.ok && fund.body?.annual ? (fund.body as VpsNormalizedFundamentals) : null,
    quote: quote.ok && quote.body?.quote ? (quote.body.quote as VpsNormalizedQuote) : null,
    error,
    loadedAt: new Date().toISOString(),
  };
}

/**
 * PHASE 4 / 8 — FUNDAMENTALS & VALUATION EXPLORER
 *
 * Every figure is a real VPS statement value or an arithmetic derivation from
 * one. Because the provider reports `mappingStatus: 'AMBIGUOUS'`, slots are
 * shown with their verbatim source labels and are never re-labelled as a
 * confirmed time axis.
 */
export const FundamentalsPage: React.FC = () => {
  const [primary, setPrimary] = useState('HPG');
  const [comparison, setComparison] = useState<string[]>([]);
  const [statement, setStatement] = useState<'annual' | 'quarterly'>('annual');
  const [bundles, setBundles] = useState<Record<string, SymbolBundle>>({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (symbols: string[]) => {
    if (symbols.length === 0) return;
    setLoading(true);
    const results = await Promise.all(symbols.map((s) => loadBundle(s)));
    setBundles((prev) => {
      const next = { ...prev };
      for (const r of results) next[r.symbol] = r;
      return next;
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void load([primary]);
  }, [primary, load]);

  const activeSymbols = useMemo(
    () => [primary, ...comparison.filter((s) => s !== primary)].slice(0, 4),
    [comparison, primary]
  );

  useEffect(() => {
    const missing = activeSymbols.filter((s) => !bundles[s]);
    if (missing.length > 0) void load(missing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSymbols.join(',')]);

  const primaryBundle = bundles[primary] ?? EMPTY_BUNDLE(primary);
  const series = primaryBundle.fundamentals?.[statement] ?? null;
  const slots = useMemo(
    () =>
      series
        ? buildSlotRows(series, statement === 'annual'
            ? primaryBundle.fundamentals?.annualPeriods ?? []
            : primaryBundle.fundamentals?.quarterlyPeriods ?? [])
        : [],
    [primaryBundle.fundamentals, series, statement]
  );

  const eps = firstFinite(series?.eps);
  const bvps = firstFinite(series?.bvps);
  const lastPrice = primaryBundle.quote?.lastPrice ?? null;
  const valuation = deriveValuation(lastPrice, eps, bvps);

  const revenueBars = slots.map((s) => s.values.netRevenue);
  const profitBars = slots.map((s) => s.values.netProfit);
  const revenueMax = maxMagnitude(revenueBars);
  const profitMax = maxMagnitude(profitBars);

  const addComparison = (symbol: string) => {
    const clean = symbol.trim().toUpperCase();
    if (!clean || activeSymbols.includes(clean) || activeSymbols.length >= 4) return;
    setComparison((prev) => [...prev, clean]);
  };

  const removeComparison = (symbol: string) =>
    setComparison((prev) => prev.filter((s) => s !== symbol));

  const symbolMeta = (symbol: string) =>
    VIETNAM_STOCKS_UNIVERSE.find((s) => s.symbol === symbol);

  const renderValue = (key: (typeof SERIES_KEYS)[number], value: number | null): string => {
    if (value === null) return '--';
    if (key === 'netRevenue' || key === 'grossProfit' || key === 'operatingProfit' ||
        key === 'netProfit' || key === 'totalAssets' || key === 'liabilities' || key === 'equity') {
      return millionVndToText(value);
    }
    if (key === 'ros' || key === 'roe' || key === 'roa') return `${formatNumber(value, 2)}%`;
    return formatNumber(value, key === 'eps' || key === 'bvps' ? 0 : 2);
  };

  return (
    <div id="page-fundamentals" className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-terminal-border">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-600/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <PieChart className="w-4 h-4" />
            </div>
            <h1 className="page-title">Báo Cáo Tài Chính &amp; Chất Lượng</h1>
            <DataStatusBadge
              status={
                loading
                  ? 'LOADING'
                  : primaryBundle.error
                    ? 'DATA_UNAVAILABLE'
                    : primaryBundle.fundamentals
                      ? 'LIVE'
                      : 'LOADING'
              }
              compact
            />
          </div>
          <p className="text-xs text-terminal-text-muted mt-1">
            Báo cáo tài chính VPS theo từng slot nguồn, hệ số chất lượng và định giá suy ra từ giá
            thật — không có số liệu thay thế.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase px-2 py-1 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
          <ShieldCheck className="w-3 h-3" /> VPS · MILLION_VND
        </span>
      </div>

      {/* Symbol picker */}
      <div className="bg-terminal-surface border border-terminal-border rounded-md p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelCls} htmlFor="fund-symbol">
              Mã chính
            </label>
            <input
              id="fund-symbol"
              list="fund-universe"
              value={primary}
              onChange={(e) => setPrimary(e.target.value.trim().toUpperCase())}
              className={inputCls}
              autoComplete="off"
            />
            <datalist id="fund-universe">
              {VIETNAM_STOCKS_UNIVERSE.map((s) => (
                <option key={s.symbol} value={s.symbol}>
                  {s.companyName}
                </option>
              ))}
            </datalist>
          </div>

          <div>
            <label className={labelCls} htmlFor="fund-compare">
              So sánh (tối đa 4 mã)
            </label>
            <div className="flex gap-2">
              <input
                id="fund-compare"
                placeholder="Thêm mã,VD: FPT"
                disabled={activeSymbols.length >= 4}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    addComparison((e.target as HTMLInputElement).value);
                    (e.target as HTMLInputElement).value = '';
                  }
                }}
                className={inputCls}
              />
              <Button
                size="sm"
                variant="outline"
                leftIcon={Plus}
                disabled={activeSymbols.length >= 4}
                onClick={() => {
                  const el = document.getElementById('fund-compare') as HTMLInputElement | null;
                  if (el) {
                    addComparison(el.value);
                    el.value = '';
                  }
                }}
              >
                Thêm
              </Button>
            </div>
          </div>

          <div className="flex items-end gap-2">
            <Button
              size="sm"
              variant="secondary"
              leftIcon={RefreshCw}
              isLoading={loading}
              onClick={() => load(activeSymbols)}
            >
              Tải lại dữ liệu
            </Button>
            <span className="text-[10px] font-mono text-terminal-text-muted pb-1.5">
              {activeSymbols.length}/4 mã
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {activeSymbols.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-terminal-border bg-terminal-surface-subtle text-[11px] font-mono text-terminal-text-primary"
            >
              <button
                type="button"
                onClick={() => s !== primary && setPrimary(s)}
                className="hover:text-terminal-accent"
              >
                {s}
                {s === primary && <span className="text-terminal-accent ml-1">(chính)</span>}
              </button>
              {s !== primary && (
                <button
                  type="button"
                  aria-label={`Xóa ${s}`}
                  onClick={() => removeComparison(s)}
                  className="text-terminal-text-muted hover:text-rose-400"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Fail-closed error */}
      {primaryBundle.error && (
        <div className="flex items-start gap-2.5 bg-amber-950/30 border border-amber-800/40 rounded-md p-3.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-300 font-mono">
            <div className="font-semibold uppercase text-[11px] mb-0.5">Dữ liệu không khả dụng</div>
            <div>{primaryBundle.error}</div>
          </div>
        </div>
      )}

      {!primaryBundle.fundamentals && !primaryBundle.error && (
        <EmptyState
          title="LOADING"
          description="Đang tải báo cáo tài chính thật từ VPS…"
        />
      )}

      {primaryBundle.fundamentals && (
        <>
          {/* Valuation metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <MetricCard
              label="GIÁ HIỆN TẠI"
              value={formatVND(lastPrice)}
              subValue={primaryBundle.quote ? `Tham chiếu ${formatVND(primaryBundle.quote.referencePrice)}` : 'Chưa có báo giá'}
              status={primaryBundle.quote ? 'LIVE' : 'DATA_UNAVAILABLE'}
            />
            <MetricCard
              label="P/E SUY RA"
              value={formatNumber(valuation.pe, 2)}
              subValue={valuation.pe ? `Lợi suất EPS ${formatNumber(valuation.earningsYieldPct, 2)}%` : 'Thiếu EPS thật'}
              badge={valuation.pe ? 'DERIVED' : 'N/A'}
              badgeVariant={valuation.pe ? 'indigo' : 'neutral'}
              status={valuation.pe ? 'LIVE' : 'DATA_UNAVAILABLE'}
            />
            <MetricCard
              label="P/B SUY RA"
              value={formatNumber(valuation.pb, 2)}
              subValue={valuation.pb ? `Giá / book ${formatNumber(valuation.bookToPricePct, 1)}%` : 'Thiếu BVPS thật'}
              badge={valuation.pb ? 'DERIVED' : 'N/A'}
              badgeVariant={valuation.pb ? 'indigo' : 'neutral'}
              status={valuation.pb ? 'LIVE' : 'DATA_UNAVAILABLE'}
            />
            <MetricCard
              label="EPS (NGUỒN)"
              value={formatVND(eps)}
              subValue="VND / cổ phiếu"
              badge="VPS"
              badgeVariant="neutral"
              status={eps !== null ? 'LIVE' : 'DATA_UNAVAILABLE'}
            />
            <MetricCard
              label="BVPS (NGUỒN)"
              value={formatVND(bvps)}
              subValue="VND / cổ phiếu"
              badge="VPS"
              badgeVariant="neutral"
              status={bvps !== null ? 'LIVE' : 'DATA_UNAVAILABLE'}
            />
            <MetricCard
              label="ROE / ROA"
              value={`${formatNumber(firstFinite(series?.roe), 1)}% / ${formatNumber(
                firstFinite(series?.roa),
                1
              )}%`}
              subValue="Theo nguồn, chưa xác nhận kỳ"
              badge="SOURCE"
              badgeVariant="warning"
              status={firstFinite(series?.roe) !== null ? 'PARTIAL' : 'DATA_UNAVAILABLE'}
            />
          </div>

          {/* Ambiguity disclosure */}
          <div className="flex items-start gap-2.5 bg-slate-900/60 border border-terminal-border rounded-md p-3.5">
            <Search className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
            <div className="text-[11px] font-mono text-terminal-text-secondary space-y-1">
              <div className="uppercase text-terminal-text-muted text-[10px]">
                Ghi chú period metadata — {primaryBundle.fundamentals.periodMetadata.mappingStatus}
              </div>
              <div>
                Khối dữ liệu chỉ có 4 slot V1..V4; nhà cung cấp xác nhận nhãn kỳ chưa tin cậy nên
                không có slot nào được coi là “kỳ hiện tại”.
              </div>
              <ul className="space-y-0.5 text-terminal-text-muted">
                {primaryBundle.fundamentals.periodMetadata.notes.map((note) => (
                  <li key={note}>• {note}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Statement table */}
          <div className="bg-terminal-surface border border-terminal-border rounded-md overflow-hidden">
            <div className="px-4 py-2.5 border-b border-terminal-border flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-mono uppercase text-terminal-text-muted">
                {statement === 'annual' ? 'Báo cáo năm (annual)' : 'Báo cáo quý (quarterly)'} —{' '}
                {primaryBundle.fundamentals.statementUnit}
              </span>
              <span className="flex gap-1.5">
                {(['annual', 'quarterly'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setStatement(mode)}
                    className={`px-2.5 py-1 rounded text-[11px] font-mono border transition-colors ${
                      statement === mode
                        ? 'border-terminal-accent/60 bg-terminal-accent/15 text-terminal-accent'
                        : 'border-terminal-border text-terminal-text-muted hover:text-terminal-text-primary'
                    }`}
                  >
                    {mode === 'annual' ? 'Năm' : 'Quý'}
                  </button>
                ))}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px] font-mono border-collapse">
                <thead>
                  <tr className="bg-terminal-surface-subtle text-[10px] uppercase text-terminal-text-muted">
                    <th className="px-4 py-2">Chỉ tiêu</th>
                    {slots.map((slot) => (
                      <th key={slot.slot} className="px-4 py-2 text-right">
                        {slot.slot}
                        <span className="block font-normal normal-case text-terminal-text-muted/70">
                          {slot.sourceLabel ?? 'không có nhãn'}
                        </span>
                      </th>
                    ))}
                    <th className="px-4 py-2 text-right">Δ giữa 2 slot</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-terminal-border">
                  {SERIES_KEYS.map((key) => {
                    const current = slots[0]?.values[key] ?? null;
                    const previous = slots[1]?.values[key] ?? null;
                    const delta = slotDeltaPct(current, previous);
                    return (
                      <tr key={key} className="hover:bg-terminal-surface-hover">
                        <td className="px-4 py-1.5 text-terminal-text-secondary">
                          {SERIES_LABELS[key]}
                        </td>
                        {slots.map((slot) => (
                          <td key={slot.slot} className="px-4 py-1.5 text-right text-terminal-text-primary">
                            {renderValue(key, slot.values[key])}
                          </td>
                        ))}
                        <td className="px-4 py-1.5 text-right">
                          <span
                            className={
                              delta === null
                                ? 'text-terminal-text-muted'
                                : delta > 0
                                  ? 'text-emerald-400'
                                  : delta < 0
                                    ? 'text-rose-400'
                                    : 'text-terminal-text-muted'
                            }
                          >
                            {formatPercent(delta)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 border-t border-terminal-border text-[10px] font-mono text-terminal-text-muted">
              Δ là chênh lệch thuần giữa hai slot liền kề trên dữ liệu thật — KHÔNG phải tỷ lệ
              tăng trưởng theo năm đã được xác nhận.
            </div>
          </div>

          {/* Revenue / profit bars */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-terminal-surface border border-terminal-border rounded-md p-4 space-y-3">
              <div className="text-[11px] font-mono uppercase text-terminal-text-muted">
                Doanh thu theo slot (tỷ đồng)
              </div>
              <div className="space-y-2">
                {slots.map((slot, idx) => {
                  const value = slot.values.netRevenue;
                  const width = value === null ? 0 : (Math.abs(value) / revenueMax) * 100;
                  return (
                    <div key={slot.slot} className="space-y-1">
                      <div className="flex justify-between text-[10px] font-mono">
                        <span className="text-terminal-text-secondary">
                          {slot.slot} · {slot.sourceLabel ?? '—'}
                        </span>
                        <span className="text-terminal-text-primary">
                          {millionVndToText(value)}
                        </span>
                      </div>
                      <div className="h-2 rounded bg-terminal-surface-subtle overflow-hidden">
                        <div
                          className="h-full bg-sky-500/70"
                          style={{ width: `${width}%` }}
                          title={String(revenueBars[idx] ?? '')}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-terminal-surface border border-terminal-border rounded-md p-4 space-y-3">
              <div className="text-[11px] font-mono uppercase text-terminal-text-muted">
                Lợi nhuận sau thuế theo slot (tỷ đồng)
              </div>
              <div className="space-y-2">
                {slots.map((slot, idx) => {
                  const value = slot.values.netProfit;
                  const width = value === null ? 0 : (Math.abs(value) / profitMax) * 100;
                  return (
                    <div key={slot.slot} className="space-y-1">
                      <div className="flex justify-between text-[10px] font-mono">
                        <span className="text-terminal-text-secondary">
                          {slot.slot} · {slot.sourceLabel ?? '—'}
                        </span>
                        <span className="text-terminal-text-primary">
                          {millionVndToText(value)}
                        </span>
                      </div>
                      <div className="h-2 rounded bg-terminal-surface-subtle overflow-hidden">
                        <div
                          className="h-full bg-emerald-500/70"
                          style={{ width: `${width}%` }}
                          title={String(profitBars[idx] ?? '')}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Cross-symbol comparison */}
      {activeSymbols.length > 1 && (
        <div className="bg-terminal-surface border border-terminal-border rounded-md overflow-hidden">
          <div className="px-4 py-2.5 border-b border-terminal-border text-[11px] font-mono uppercase text-terminal-text-muted">
            So sánh đa mã (slot V1 theo nguồn, chưa xác nhận kỳ)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px] font-mono border-collapse">
              <thead>
                <tr className="bg-terminal-surface-subtle text-[10px] uppercase text-terminal-text-muted">
                  <th className="px-4 py-2">Mã</th>
                  <th className="px-4 py-2">Doanh nghiệp</th>
                  <th className="px-4 py-2 text-right">Giá</th>
                  <th className="px-4 py-2 text-right">P/E</th>
                  <th className="px-4 py-2 text-right">P/B</th>
                  <th className="px-4 py-2 text-right">ROE</th>
                  <th className="px-4 py-2 text-right">ROA</th>
                  <th className="px-4 py-2 text-right">EPS</th>
                  <th className="px-4 py-2">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-terminal-border">
                {activeSymbols.map((s) => {
                  const bundle = bundles[s];
                  const annual = bundle?.fundamentals?.annual ?? null;
                  const price = bundle?.quote?.lastPrice ?? null;
                  const v = deriveValuation(price, firstFinite(annual?.eps), firstFinite(annual?.bvps));
                  const meta = symbolMeta(s);
                  return (
                    <tr key={s} className="hover:bg-terminal-surface-hover">
                      <td className="px-4 py-2 font-bold text-terminal-text-primary">
                        {s}
                        {s === primary && <Badge variant="accent" size="xs" className="ml-1.5">CHÍNH</Badge>}
                      </td>
                      <td className="px-4 py-2 text-terminal-text-secondary">
                        {meta?.companyName ?? '--'}
                      </td>
                      <td className="px-4 py-2 text-right">{formatVND(price)}</td>
                      <td className="px-4 py-2 text-right">{formatNumber(v.pe, 2)}</td>
                      <td className="px-4 py-2 text-right">{formatNumber(v.pb, 2)}</td>
                      <td className="px-4 py-2 text-right">
                        {formatNumber(firstFinite(annual?.roe), 1)}%
                      </td>
                      <td className="px-4 py-2 text-right">
                        {formatNumber(firstFinite(annual?.roa), 1)}%
                      </td>
                      <td className="px-4 py-2 text-right">{formatVND(firstFinite(annual?.eps))}</td>
                      <td className="px-4 py-2">
                        {!bundle ? (
                          <Badge variant="secondary" size="xs">ĐANG TẢI</Badge>
                        ) : bundle.error || !bundle.fundamentals ? (
                          <Badge variant="down" size="xs">UNAVAILABLE</Badge>
                        ) : (
                          <Badge variant="up" size="xs">OK</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* In-session price band from the real VPS quote */}
      {primaryBundle.quote && (
        <div className="bg-terminal-surface border border-terminal-border rounded-md p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-mono uppercase text-terminal-text-muted">
              Vị thế giá trong phiên ({primary})
            </span>
            <span className="text-[11px] font-mono text-terminal-text-secondary">
              Trần {formatVND(primaryBundle.quote.ceilingPrice)} · Tham chiếu{' '}
              {formatVND(primaryBundle.quote.referencePrice)} · Sàn{' '}
              {formatVND(primaryBundle.quote.floorPrice)}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] font-mono">
            <div className="flex justify-between">
              <span className="text-terminal-text-muted">Mở</span>
              <span>{formatVND(primaryBundle.quote.openPrice)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-terminal-text-muted">Cao</span>
              <span>{formatVND(primaryBundle.quote.highPrice)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-terminal-text-muted">Thấp</span>
              <span>{formatVND(primaryBundle.quote.lowPrice)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-terminal-text-muted">KL khớp (CP)</span>
              <span>{formatVND(primaryBundle.quote.matchedVolumeShares)}</span>
            </div>
          </div>

          {(() => {
            const { floorPrice, ceilingPrice, lastPrice, referencePrice } = primaryBundle.quote!;
            const hasBand =
              typeof floorPrice === 'number' &&
              typeof ceilingPrice === 'number' &&
              ceilingPrice > floorPrice;
            const positionPct = hasBand
              ? Math.min(100, Math.max(0, ((lastPrice - floorPrice) / (ceilingPrice - floorPrice)) * 100))
              : null;
            return (
              <div className="space-y-1.5">
                <div className="relative h-3 rounded-full bg-terminal-surface-subtle overflow-hidden border border-terminal-border">
                  {positionPct !== null && (
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-rose-500/50 via-amber-400/50 to-emerald-500/60"
                      style={{ width: `${positionPct}%` }}
                    />
                  )}
                </div>
                <div className="flex justify-between text-[10px] font-mono text-terminal-text-muted">
                  <span>Sàn {formatVND(floorPrice)}</span>
                  <span className="text-terminal-text-secondary">
                    Hiện tại {formatVND(lastPrice)} ({formatPercent(
                      primaryBundle.quote!.changePercent
                    )})
                  </span>
                  <span>Trần {formatVND(ceilingPrice)}</span>
                </div>
                <div className="text-[10px] font-mono text-terminal-text-muted">
                  Giá tham chiếu {formatVND(referencePrice)} · đơn vị VND/cổ phiếu
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

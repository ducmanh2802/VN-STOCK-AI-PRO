import React, { useMemo, useState } from 'react';
import { Activity } from 'lucide-react';
import type { SectorHeatmapItem, StockSummary } from '../types/stock';
import type { MarketIntelligenceSnapshot, SectorMetrics } from '../lib/analysis/market/types';
import { ErrorState } from '../components/ui/ErrorBoundary';
import { LoadingState } from '../components/ui/LoadingState';
import { EmptyState } from '../components/ui/EmptyState';
import { formatPercent } from '../utils/formatters';

type Props = {
  sectors: SectorHeatmapItem[];
  stocks: StockSummary[];
  intelligence?: MarketIntelligenceSnapshot;
  isLoading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  onSelectStock: (symbol: string) => void;
};

function Panel({ title, eyebrow, children, className = '' }: { title: string; eyebrow?: string; children: React.ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-terminal-border/70 bg-terminal-surface p-4 ${className}`}><div className="mb-4 flex items-end justify-between gap-3 border-b border-terminal-border/60 pb-3"><div>{eyebrow && <p className="mb-1 text-[10px] font-mono uppercase tracking-[.16em] text-terminal-accent">{eyebrow}</p>}<h2 className="text-sm font-semibold uppercase tracking-wide text-terminal-text">{title}</h2></div></div>{children}</section>;
}

function value(value: number | null | undefined, suffix = '') { return value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}${suffix}`; }
function tone(value: number | null | undefined) { return value == null ? 'text-terminal-muted' : value >= 0 ? 'text-terminal-positive' : 'text-terminal-negative'; }

export function SectorIntelligencePage({ sectors, stocks, intelligence, isLoading = false, error, onRetry, onSelectStock }: Props) {
  const metrics = intelligence?.sectors ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(metrics[0]?.sectorId ?? sectors[0]?.id ?? null);
  const selectedMetric = metrics.find((item) => item.sectorId === selectedId) ?? metrics[0];
  const selectedHeatmap = sectors.find((item) => item.id === selectedId) ?? sectors.find((item) => item.name === selectedMetric?.sectorName);
  const selectedName = selectedMetric?.sectorName ?? selectedHeatmap?.name ?? 'No sector selected';
  const selectedStocks = useMemo(() => stocks.filter((stock) => stock.sector === selectedName).slice(0, 8), [stocks, selectedName]);
  const ranked = [...metrics].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  const leaders = ranked.slice(0, 3);
  const laggards = ranked.slice(-3).reverse();

  if (isLoading) return <LoadingState variant="terminal" message="Loading canonical sector intelligence..." />;
  if (error) return <ErrorState error={error} onRetry={onRetry} compact />;

  return <div id="page-sector-intelligence" className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-terminal-border/70 pb-4"><div><p className="mb-1 text-[10px] font-mono uppercase tracking-[.18em] text-terminal-accent">Phase 20 sector intelligence</p><h1 className="text-2xl font-semibold tracking-tight text-terminal-text">Sector Intelligence</h1><p className="mt-1 text-sm text-terminal-muted">Rotation, relative strength, activity and constituent context from the canonical engine.</p></div><div className="text-right text-[10px] font-mono uppercase tracking-wider text-terminal-muted"><p>DATA STATUS</p><p className="mt-1 text-terminal-positive">{intelligence ? 'LIVE SNAPSHOT' : 'UNAVAILABLE'}</p></div></header>

    {!intelligence || metrics.length === 0 ? <EmptyState title="No sector data available" description="Canonical sector intelligence is currently unavailable." compact /> : <>
      <Panel title="Sector rotation" eyebrow="01 / canonical ranking"><div className="grid gap-4 md:grid-cols-3"><div><p className="metric-label">Leaders</p><div className="mt-2 space-y-2">{leaders.map((item) => <button key={item.sectorId} onClick={() => setSelectedId(item.sectorId)} className="flex w-full items-center justify-between rounded border border-terminal-border/60 px-3 py-2 text-left text-xs hover:border-terminal-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terminal-accent"><span>{item.sectorName}</span><span className="font-mono text-terminal-positive">#{item.rank}</span></button>)}</div></div><div><p className="metric-label">Selected sector</p><p className="mt-2 text-xl font-semibold text-terminal-accent">{selectedName}</p><p className="mt-1 text-xs text-terminal-muted">Rank {selectedMetric?.rank ?? '—'} · score {value(selectedMetric?.compositeScore)}</p></div><div><p className="metric-label">Laggards</p><div className="mt-2 space-y-2">{laggards.map((item) => <button key={item.sectorId} onClick={() => setSelectedId(item.sectorId)} className="flex w-full items-center justify-between rounded border border-terminal-border/60 px-3 py-2 text-left text-xs hover:border-terminal-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terminal-accent"><span>{item.sectorName}</span><span className="font-mono text-terminal-negative">#{item.rank}</span></button>)}</div></div></div></Panel>

      <Panel title="Sector heatmap" eyebrow="02 / daily performance"><div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">{sectors.length === 0 ? <p className="col-span-full text-xs text-terminal-muted">NO SECTOR DATA AVAILABLE</p> : sectors.map((sector) => { const metric = metrics.find((item) => item.sectorId === sector.id || item.sectorName === sector.name); const selected = selectedId === (metric?.sectorId ?? sector.id); const change = metric?.returns.d1 ?? sector.changePercent; return <button key={sector.id} onClick={() => setSelectedId(metric?.sectorId ?? sector.id)} aria-pressed={selected} className={`min-h-24 rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terminal-accent ${selected ? 'border-terminal-accent bg-terminal-accent/10' : 'border-terminal-border bg-terminal-surface-elevated hover:border-terminal-border-bright'} ${tone(change)}`}><span className="block truncate text-xs font-semibold text-terminal-text">{sector.name}</span><span className="mt-3 block font-mono text-lg">{formatPercent(change)}</span><span className="mt-1 block text-[10px] text-terminal-muted">{metric?.rank ? `Rank ${metric.rank}` : `${sector.stocksCount} constituents`}</span></button>; })}</div></Panel>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]"><Panel title="Sector ranking" eyebrow="03 / deterministic rank"><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead><tr className="border-b border-terminal-border text-terminal-muted"><th className="py-2 pr-3">Rank</th><th className="py-2 pr-3">Sector</th><th className="py-2 pr-3 text-right">1D</th><th className="py-2 pr-3 text-right">RS 1M</th><th className="py-2 pr-3 text-right">Momentum</th><th className="py-2 text-right">Breadth</th></tr></thead><tbody>{ranked.map((item) => <tr key={item.sectorId} className={`border-b border-terminal-border/40 ${item.sectorId === selectedMetric?.sectorId ? 'bg-terminal-accent/5' : ''}`}><td className="py-2 pr-3 font-mono text-terminal-accent">{item.rank ?? '—'}</td><td className="py-2 pr-3"><button onClick={() => setSelectedId(item.sectorId)} className="text-terminal-text hover:text-terminal-accent focus-visible:outline-none focus-visible:underline">{item.sectorName}</button></td><td className={`py-2 pr-3 text-right font-mono ${tone(item.returns.d1)}`}>{value(item.returns.d1, '%')}</td><td className={`py-2 pr-3 text-right font-mono ${tone(item.relativeStrength.vsVnIndex.m1)}`}>{value(item.relativeStrength.vsVnIndex.m1, '%')}</td><td className="py-2 pr-3 text-right font-mono">{value(item.momentum.momentumScore)}</td><td className="py-2 text-right font-mono">{value(item.breadth.percentAboveMA20, '%')}</td></tr>)}</tbody></table></div></Panel><Panel title="Relative strength & flow" eyebrow="04 / canonical snapshot"><div className="space-y-3"><div className="flex items-center justify-between border-b border-terminal-border/50 pb-3"><span className="text-xs text-terminal-muted">Selected RS vs VN-INDEX · 1M</span><strong className={`font-mono ${tone(selectedMetric?.relativeStrength.vsVnIndex.m1)}`}>{value(selectedMetric?.relativeStrength.vsVnIndex.m1, '%')}</strong></div><div className="flex items-center justify-between border-b border-terminal-border/50 pb-3"><span className="text-xs text-terminal-muted">Momentum score</span><strong className="font-mono text-terminal-text">{value(selectedMetric?.momentum.momentumScore)}</strong></div><div className="flex items-center justify-between"><span className="text-xs text-terminal-muted">Above MA20</span><strong className="font-mono text-terminal-text">{value(selectedMetric?.breadth.percentAboveMA20, '%')}</strong></div></div><p className="mt-4 border-t border-terminal-border/50 pt-3 text-[10px] text-terminal-muted">Dedicated sector money-flow metric: DATA GAP — BLOCKED. Canonical contract exposes sector breadth and momentum, not sector flow.</p></Panel></div>

      <Panel title={`Selected sector · ${selectedName}`} eyebrow="05 / drill-down"><div className="grid gap-4 md:grid-cols-4"><div><p className="metric-label">Performance 1D</p><p className={`metric-value-lg ${tone(selectedMetric?.returns.d1)}`}>{value(selectedMetric?.returns.d1, '%')}</p></div><div><p className="metric-label">Relative strength 1M</p><p className="metric-value-lg">{value(selectedMetric?.relativeStrength.vsVnIndex.m1, '%')}</p></div><div><p className="metric-label">Momentum</p><p className="metric-value-lg">{value(selectedMetric?.momentum.momentumScore)}</p></div><div><p className="metric-label">Breadth above MA20</p><p className="metric-value-lg">{value(selectedMetric?.breadth.percentAboveMA20, '%')}</p></div></div><div className="mt-5 border-t border-terminal-border/60 pt-4"><div className="mb-3 flex items-center gap-2"><Activity className="h-4 w-4 text-terminal-accent" /><h3 className="text-xs font-semibold uppercase tracking-wide">Top stocks</h3></div>{selectedStocks.length === 0 ? <p className="text-xs text-terminal-muted">NO CONSTITUENT DATA AVAILABLE FOR THIS SECTOR</p> : <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{selectedStocks.map((stock) => <button key={stock.symbol} onClick={() => onSelectStock(stock.symbol)} className="flex items-center justify-between rounded border border-terminal-border/60 px-3 py-2 text-left hover:border-terminal-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terminal-accent"><span><span className="block font-mono text-sm text-terminal-accent">{stock.symbol}</span><span className="block max-w-32 truncate text-[10px] text-terminal-muted">{stock.companyName}</span></span><span className={`font-mono text-xs ${tone(stock.changePercent)}`}>{formatPercent(stock.changePercent)}</span></button>)}</div>}</div></Panel>
    </>}
  </div>;
}

export default SectorIntelligencePage;

import { IndexData } from '../types/market';
import { SectorHeatmapItem, TopMover } from '../types/stock';
import type { MarketIntelligenceSnapshot } from '../lib/analysis/market/types';
import { MarketOverview } from '../components/dashboard/MarketOverview';
import { MarketHeatmap } from '../components/dashboard/MarketHeatmap';
import { TopMovers } from '../components/dashboard/TopMovers';
import { DemoBadge } from '../components/common/DemoBadge';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorBoundary';
import { formatBillionVND, formatPercent } from '../utils/formatters';

interface MarketPageProps {
  indices: IndexData[];
  sectors: SectorHeatmapItem[];
  gainers: TopMover[];
  losers: TopMover[];
  active: TopMover[];
  intelligence?: MarketIntelligenceSnapshot;
  intelligenceLoading?: boolean;
  intelligenceError?: Error | null;
  onRetryIntelligence?: () => void;
  onSelectStock: (symbol: string) => void;
}

const stateLabel: Record<string, string> = {
  BULL_TREND: 'Bull trend',
  BEAR_TREND: 'Bear trend',
  SIDEWAYS: 'Sideways',
  HIGH_VOLATILITY: 'High volatility',
  LOW_VOLATILITY: 'Low volatility',
  ACCUMULATION: 'Accumulation',
  DISTRIBUTION: 'Distribution',
  UNKNOWN: 'Unknown',
};

function ratio(value: number | null | undefined, digits = 2) {
  return value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits);
}

function percent(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? '—' : `${(value * 100).toFixed(1)}%`;
}

function IntelPanel({ title, eyebrow, children, className = '' }: { title: string; eyebrow?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-terminal-border/70 bg-terminal-surface p-4 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-terminal-border/60 pb-3">
        <div>
          {eyebrow && <p className="mb-1 text-[10px] font-mono uppercase tracking-[0.16em] text-terminal-muted">{eyebrow}</p>}
          <h2 className="text-sm font-semibold uppercase tracking-wide text-terminal-text">{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

function DataUnavailable({ message = 'Canonical intelligence is unavailable.' }: { message?: string }) {
  return <div className="rounded border border-terminal-border bg-terminal-surface-elevated px-3 py-4 text-xs text-terminal-muted">DATA UNAVAILABLE <span className="ml-2 text-terminal-muted/80">{message}</span></div>;
}

export function MarketPage({
  indices,
  sectors,
  gainers,
  losers,
  active,
  intelligence,
  intelligenceLoading = false,
  intelligenceError,
  onRetryIntelligence,
  onSelectStock,
}: MarketPageProps) {
  const snapshot = intelligence;
  const breadth = snapshot?.breadth;
  const regime = snapshot?.regime;
  const structure = snapshot?.supportResistance;
  const risk = snapshot?.breakdownRisk;
  const recovery = snapshot?.recoveryStrength;

  return (
    <div id="page-market" className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-terminal-border/70 pb-4">
        <div>
          <p className="mb-1 text-[10px] font-mono uppercase tracking-[0.18em] text-terminal-accent">Phase 20 intelligence workspace</p>
          <h1 className="text-2xl font-semibold tracking-tight text-terminal-text">Market Intelligence</h1>
          <p className="mt-1 max-w-2xl text-sm text-terminal-muted">A canonical view of market state, breadth, participation, structure and risk.</p>
        </div>
        <DemoBadge size="md" />
      </header>

      <MarketOverview indices={indices} />

      {intelligenceLoading && <LoadingState variant="terminal" message="Loading canonical market intelligence..." />}
      {intelligenceError && !intelligenceLoading && <ErrorState error={intelligenceError} onRetry={onRetryIntelligence} compact />}
      {!intelligenceLoading && !intelligenceError && snapshot && (
        <div className="space-y-4" aria-label="Market intelligence analysis">
          <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
            <IntelPanel title="Market state" eyebrow="01 / current regime">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div><p className="metric-label">Regime</p><p className="mt-1 text-lg font-semibold text-terminal-accent">{stateLabel[regime.regime] ?? regime.regime}</p></div>
                <div><p className="metric-label">Confidence</p><p className="metric-value-lg">{regime.confidence.toFixed(0)}<span className="text-sm text-terminal-muted">/100</span></p></div>
                <div><p className="metric-label">Trend score</p><p className="metric-value-lg">{ratio(regime.scores.trendScore, 0)}</p></div>
                <div><p className="metric-label">As of</p><p className="mt-1 font-mono text-xs text-terminal-muted">{new Date(regime.timestamp).toLocaleString('vi-VN')}</p></div>
              </div>
            </IntelPanel>
            <IntelPanel title="Data quality" eyebrow="authoritative coverage">
              <div className="flex items-end justify-between gap-4"><div><p className="metric-label">Coverage</p><p className="metric-value-xl">{snapshot.dataQuality.coveragePercent.toFixed(1)}%</p></div><div className="text-right text-xs text-terminal-muted"><p>{snapshot.dataQuality.validSymbols} valid / {snapshot.dataQuality.totalUniverseSymbols} universe</p><p className="mt-1">{snapshot.dataQuality.isFailClosed ? 'Fail-closed' : 'Validated'}</p></div></div>
              <div className="mt-3 h-1.5 overflow-hidden rounded bg-terminal-surface-high"><div className="h-full bg-terminal-accent" style={{ width: `${Math.min(snapshot.dataQuality.coveragePercent, 100)}%` }} /></div>
            </IntelPanel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <IntelPanel title="Market breadth" eyebrow="02 / participation">
              {breadth ? <>
                <div className="grid grid-cols-3 gap-3"><div><p className="metric-label">Advancers</p><p className="metric-value-lg text-terminal-positive">{breadth.advanceCount}</p></div><div><p className="metric-label">Unchanged</p><p className="metric-value-lg text-terminal-muted">{breadth.unchangedCount}</p></div><div><p className="metric-label">Decliners</p><p className="metric-value-lg text-terminal-negative">{breadth.declineCount}</p></div></div>
                <div className="mt-4 flex h-2 overflow-hidden rounded bg-terminal-surface-high" aria-label={`Advancers ${breadth.advanceCount}, unchanged ${breadth.unchangedCount}, decliners ${breadth.declineCount}`}><div className="bg-terminal-positive" style={{ width: `${breadth.advanceCount / Math.max(breadth.totalConstituents, 1) * 100}%` }} /><div className="bg-terminal-muted" style={{ width: `${breadth.unchangedCount / Math.max(breadth.totalConstituents, 1) * 100}%` }} /><div className="bg-terminal-negative" style={{ width: `${breadth.declineCount / Math.max(breadth.totalConstituents, 1) * 100}%` }} /></div>
                <div className="mt-4 grid grid-cols-3 gap-3 text-xs"><span className="text-terminal-muted">A/D <strong className="font-mono text-terminal-text">{ratio(breadth.advanceDeclineRatio)}</strong></span><span className="text-terminal-muted">Thrust <strong className="font-mono text-terminal-text">{percent(breadth.breadthThrust)}</strong></span><span className="text-terminal-muted">Up volume <strong className="font-mono text-terminal-text">{percent(breadth.marketParticipation)}</strong></span></div>
              </> : <DataUnavailable />}
            </IntelPanel>
            <IntelPanel title="Participation & momentum" eyebrow="03 / moving average health">
              {breadth ? <div className="grid grid-cols-3 gap-3"><div><p className="metric-label">Above MA20</p><p className="metric-value-lg">{percent(breadth.percentAboveMA20)}</p></div><div><p className="metric-label">Above MA50</p><p className="metric-value-lg">{percent(breadth.percentAboveMA50)}</p></div><div><p className="metric-label">Above MA200</p><p className="metric-value-lg">{percent(breadth.percentAboveMA200)}</p></div></div> : <DataUnavailable />}
              <div className="mt-5 grid grid-cols-2 gap-3 border-t border-terminal-border/60 pt-3 text-xs"><span className="text-terminal-muted">Momentum score <strong className="font-mono text-terminal-text">{ratio(regime.scores.momentumScore, 0)}</strong></span><span className="text-terminal-muted">Liquidity score <strong className="font-mono text-terminal-text">{ratio(regime.scores.liquidityScore, 0)}</strong></span></div>
            </IntelPanel>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr]">
            <IntelPanel title="Market structure" eyebrow="04 / levels"><div className="grid grid-cols-2 gap-3 text-xs"><span className="text-terminal-muted">Current <strong className="block font-mono text-base text-terminal-text">{structure?.currentPrice ?? '—'}</strong></span><span className="text-terminal-muted">Status <strong className="block text-terminal-accent">{structure?.status ?? 'DATA_UNAVAILABLE'}</strong></span><span className="text-terminal-muted">Support <strong className="block font-mono text-terminal-positive">{structure?.nearestSupport?.price ?? '—'}</strong></span><span className="text-terminal-muted">Resistance <strong className="block font-mono text-terminal-negative">{structure?.nearestResistance?.price ?? '—'}</strong></span></div></IntelPanel>
            <IntelPanel title="Breakdown risk" eyebrow="05 / downside"><p className="text-2xl font-semibold text-terminal-warning">{risk?.riskLevel ?? 'DATA_UNAVAILABLE'}</p><p className="mt-2 text-xs leading-5 text-terminal-muted">{risk?.status === 'DATA_UNAVAILABLE' ? risk.reason : risk?.why?.[0] ?? risk?.trendCondition ?? 'Canonical risk conditions available.'}</p></IntelPanel>
            <IntelPanel title="Recovery strength" eyebrow="06 / upside"><p className="text-2xl font-semibold text-terminal-accent">{recovery?.recoveryState ?? 'DATA_UNAVAILABLE'}</p><p className="mt-2 text-xs leading-5 text-terminal-muted">{recovery?.status === 'DATA_UNAVAILABLE' ? recovery.reason : recovery?.why?.[0] ?? recovery?.momentumCondition ?? 'Canonical recovery conditions available.'}</p></IntelPanel>
          </div>

          <IntelPanel title="Flow & activity" eyebrow="07 / volume intelligence"><div className="grid gap-3 sm:grid-cols-3"><div><p className="metric-label">Volume spikes</p><p className="metric-value-lg">{snapshot.volumeFlow.marketVolumeSpikeCount}</p></div><div><p className="metric-label">Dry-ups</p><p className="metric-value-lg">{snapshot.volumeFlow.marketDryUpCount}</p></div><div><p className="metric-label">Advancing volume</p><p className="metric-value-lg">{percent(snapshot.volumeFlow.marketAdvancingVolumeRatio)}</p></div></div></IntelPanel>
        </div>
      )}

      <MarketHeatmap sectors={sectors} onSelectStock={onSelectStock} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2"><TopMovers gainers={gainers} losers={losers} active={active} onSelectStock={onSelectStock} /><IntelPanel title="Sector performance" eyebrow="existing market view"><div className="overflow-x-auto"><table className="w-full text-left text-xs font-mono"><thead><tr className="border-b border-terminal-border text-terminal-muted"><th className="py-2 pr-2">Sector</th><th className="py-2 text-right">Change</th><th className="py-2 text-right">Market cap</th><th className="py-2 text-right">Leader</th></tr></thead><tbody>{sectors.map((sec) => <tr key={sec.id} className="border-b border-terminal-border/40 hover:bg-terminal-surface-high/60"><td className="py-2 pr-2 text-terminal-text">{sec.name}</td><td className={`py-2 text-right font-semibold ${sec.changePercent >= 0 ? 'text-terminal-positive' : 'text-terminal-negative'}`}>{formatPercent(sec.changePercent)}</td><td className="py-2 text-right text-terminal-muted">{formatBillionVND(sec.marketCap)}</td><td className="py-2 text-right"><button onClick={() => onSelectStock(sec.leaderSymbol)} className="rounded border border-terminal-border px-2 py-1 text-terminal-accent transition-colors hover:bg-terminal-accent/10">{sec.leaderSymbol}</button></td></tr>)}</tbody></table></div></IntelPanel></div>
    </div>
  );
}

export default MarketPage;

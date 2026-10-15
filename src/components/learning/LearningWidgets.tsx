import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { linksFor } from '../../lib/learning/systemLinks';

export const DataBadgeChip: React.FC<{ badge: string }> = ({ badge }) => {
  const labelMap: Record<string, string> = {
    SIMULATED: 'SIMULATED — illustrative only, not real data',
    EDUCATIONAL: 'EDUCATIONAL — approved learning content',
    REAL: 'REAL — live market data',
    HISTORICAL: 'HISTORICAL — end-of-day historical data',
  };
  const colorMap: Record<string, string> = {
    SIMULATED: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    EDUCATIONAL: 'bg-green-500/10 text-green-400 border-green-500/30',
    REAL: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    HISTORICAL: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  };
  const label = labelMap[badge] ?? badge;
  const color = colorMap[badge] ?? 'bg-slate-500/10 text-slate-300 border-slate-500/30';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-mono tracking-wide ${color}`}>
      {label}
    </span>
  );
};

export const SafetyBanner: React.FC = () => (
  <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-400 font-medium leading-relaxed">
    <span className="font-semibold">⚠ Education only — not financial advice.</span>
    <div className="mt-1 text-xs text-red-300">
      Exercises use <span className="font-mono">SIMULATED</span> illustrative figures — never real market data.
      <br />Never place real orders from a lesson conclusion.
      <br />When data is missing the platform answers <span className="font-mono">UNAVAILABLE</span> — respect it as fail-closed.
    </div>
  </div>
);

export const LearnThis: React.FC<{ feature: string }> = ({ feature }) => {
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  const links = linksFor(feature);
  if (links.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {links.map((l) => (
        <button
          key={l.lessonId}
          onClick={() => {
            try {
              sessionStorage.setItem('vnstock_learn_lesson', l.lessonId);
            } catch { /* ignore */ }
            setCurrentView('learn-lesson');
            window.scrollTo({ top: 0 });
          }}
          className="text-[11px] font-mono px-2 py-1 rounded border border-terminal-accent/30 bg-terminal-accent/10 text-terminal-accent hover:bg-terminal-accent/20"
          title={l.label}
        >
          {l.label}
        </button>
      ))}
      {links.length === 0 && (
        <span className="text-[10px] text-terminal-text-muted">No direct lesson — try the beginner path.</span>
      )}
    </div>
  );
};

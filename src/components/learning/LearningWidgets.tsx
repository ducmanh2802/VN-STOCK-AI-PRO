import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { linksFor } from '../../lib/learning/systemLinks';

export const DataBadgeChip: React.FC<{ badge: string }> = ({ badge }) => {
  const color =
    badge === 'SIMULATED'
      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
      : badge === 'HISTORICAL'
        ? 'bg-sky-500/10 text-sky-400 border-sky-500/30'
        : 'bg-slate-500/10 text-slate-300 border-slate-500/30';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-mono tracking-wide ${color}`}>
      {badge === 'SIMULATED' ? 'SIMULATED EDUCATIONAL DATA' : badge}
    </span>
  );
};

export const SafetyBanner: React.FC = () => (
  <div className="rounded border border-terminal-border bg-terminal-surface p-3 text-xs text-terminal-text-muted leading-relaxed">
    <span className="font-semibold text-terminal-text">Education only — not financial advice. </span>
    Exercises use <span className="font-mono">SIMULATED</span> illustrative figures unless labelled otherwise.
    Never place real orders from a lesson conclusion. When data is missing the platform answers{' '}
    <span className="font-mono">UNAVAILABLE</span> — respect it.
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
          Learn this
        </button>
      ))}
    </div>
  );
};

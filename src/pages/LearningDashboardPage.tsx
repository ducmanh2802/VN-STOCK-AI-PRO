import React, { useMemo, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { LearningService } from '../services/learning/LearningService';
import { DataBadgeChip, SafetyBanner } from '../components/learning/LearningWidgets';

export const LearningDashboardPage: React.FC = () => {
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  const [, force] = useState(0);
  const paths = useMemo(() => LearningService.listPaths(), []);
  const mastery = useMemo(() => LearningService.getMastery(), [force]);
  const pathId = 'path-beginner';
  const progress = LearningService.getProgress(pathId);
  const rec = LearningService.getRecommendation(pathId);
  const adaptive = LearningService.getAdaptiveRecommendation(pathId);
  const weak = mastery.filter((m) => m.state === 'LEARNING' || m.state === 'PRACTICING').slice(0, 4);
  const mastered = mastery.filter((m) => m.state === 'MASTERED' || m.state === 'UNDERSTANDING');

  const openRec = () => {
    if (rec.kind === 'LESSON' && rec.refId) {
      try { sessionStorage.setItem('vnstock_learn_lesson', rec.refId); } catch { /* ignore */ }
      setCurrentView('learn-lesson');
    } else if (rec.kind === 'LAB') setCurrentView('practice-lab');
    else if (rec.kind === 'EXERCISE' && rec.refId) {
      const detail = LearningService.listLessons().find((l) => l.id && rec.refId && undefined);
      void detail;
      // Route to the lesson owning the exercise
      const all = LearningService.listLessons();
      for (const l of all) {
        const d = LearningService.getLessonDetail(l.id);
        if (d?.exercises.some((e) => e.id === rec.refId)) {
          try { sessionStorage.setItem('vnstock_learn_lesson', l.id); } catch { /* ignore */ }
          break;
        }
      }
      setCurrentView('learn-lesson');
    } else setCurrentView('learn-path');
    void force;
  };

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold text-terminal-text">Learn</h1>
        <p className="text-xs text-terminal-text-muted font-mono mt-1">Where am I? What next? What is weak? What is mastered?</p>
      </div>
      <SafetyBanner />
      <div className="grid md:grid-cols-3 gap-3">
        <div className="rounded border border-terminal-border bg-terminal-surface p-4">
          <div className="text-[11px] font-mono text-terminal-text-muted">PROGRESS</div>
          <div className="text-2xl font-mono text-terminal-text mt-1">{progress.percent}%</div>
          <div className="text-xs text-terminal-text-muted mt-1">{progress.completedLessons}/{progress.totalLessons} lessons</div>
          <div className="h-1.5 bg-terminal-surface-elevated rounded mt-2 overflow-hidden">
            <div className="h-full bg-terminal-accent" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
        <div className="rounded border border-terminal-border bg-terminal-surface p-4">
          <div className="text-[11px] font-mono text-terminal-text-muted">CONTINUE</div>
          <div className="text-sm text-terminal-text mt-1">{rec.kind === 'COMPLETE' ? 'Path complete' : `${rec.kind}: ${rec.refId}`}</div>
          <div className="text-xs text-terminal-text-muted mt-1">{rec.reason}</div>
          <div className="text-xs text-terminal-text-muted mt-1">Adaptive: {adaptive.kind === 'COMPLETE' ? 'Path complete' : `${adaptive.kind}: ${adaptive.refId}`} — {adaptive.explanation.whyNow}</div>
          {adaptive.explanation.evidence[0] && <div className="text-[11px] font-mono text-terminal-text-muted mt-1">Evidence: {adaptive.explanation.evidence[0]}</div>}
          <button onClick={openRec} className="mt-2 text-[11px] font-mono px-2 py-1 rounded bg-terminal-accent text-white hover:opacity-90">Continue</button>
        </div>
        <div className="rounded border border-terminal-border bg-terminal-surface p-4">
          <div className="text-[11px] font-mono text-terminal-text-muted">NEEDS REVIEW</div>
          {weak.length === 0 ? <div className="text-xs text-terminal-text-muted mt-1">Nothing weak yet. Keep going.</div> :
            weak.map((w) => <div key={w.conceptId} className="text-xs font-mono text-terminal-text mt-1">{w.conceptId} · {w.state}</div>)}
          <div className="text-[11px] font-mono text-terminal-text-muted mt-3">MASTERED ({mastered.length})</div>
          <div className="text-xs text-terminal-text-muted">{mastered.length === 0 ? '—' : mastered.map((m) => m.conceptId).join(', ')}</div>
        </div>
      </div>
      <div className="rounded border border-terminal-border bg-terminal-surface p-4">
        <div className="text-[11px] font-mono text-terminal-text-muted mb-2">LEARNING PATHS</div>
        {paths.map((p) => (
          <div key={p.id} className="flex items-center justify-between py-2 border-t border-terminal-border first:border-0">
            <div>
              <div className="text-sm text-terminal-text font-medium">{p.title}</div>
              <div className="text-xs text-terminal-text-muted">{p.description}</div>
            </div>
            <div className="flex gap-2">
              <DataBadgeChip badge="EDUCATIONAL" />
              <button onClick={() => setCurrentView('learn-path')} className="text-[11px] font-mono px-2 py-1 rounded border border-terminal-border hover:bg-terminal-surface-elevated">Open</button>
            </div>
          </div>
        ))}
        <div className="flex gap-2 mt-3">
          <button onClick={() => setCurrentView('practice-lab')} className="text-[11px] font-mono px-2 py-1 rounded border border-terminal-accent/30 bg-terminal-accent/10 text-terminal-accent">Practice Lab</button>
          <button onClick={() => { try { sessionStorage.setItem('vnstock_learn_reset', '1'); } catch { /* ignore */ } force((x) => x + 1); }} className="text-[11px] font-mono px-2 py-1 rounded border border-terminal-border text-terminal-text-muted">Refresh stats</button>
        </div>
      </div>
    </div>
  );
};

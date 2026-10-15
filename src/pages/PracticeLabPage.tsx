import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { LearningService } from '../services/learning/LearningService';
import { DataBadgeChip, SafetyBanner } from '../components/learning/LearningWidgets';
import { progressStore } from '../lib/learning/ProgressStore';

export const PracticeLabPage: React.FC = () => {
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  const lab = LearningService.listLabs()[0];
  const [picked, setPicked] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<string[]>([]);
  const [why, setWhy] = useState('');
  const [done, setDone] = useState(false);
  if (!lab) return <div className="text-sm text-terminal-text-muted">No lab published.</div>;

  const toggle = (e: string) => setEvidence((p) => (p.includes(e) ? p.filter((x) => x !== e) : [...p, e]));
  const correct = picked === 'concentration';
  const allEvidence = lab.evidenceRequired.every((e) => evidence.includes(e));

  return (
    <div className="space-y-4 max-w-4xl">
      <button onClick={() => setCurrentView('learn')} className="text-[11px] font-mono text-terminal-text-muted hover:text-terminal-text">← Back to Learn</button>
      <div className="rounded border border-amber-500/30 bg-terminal-surface p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-lg font-semibold text-terminal-text">PRACTICE LAB — {lab.title}</h1>
          <DataBadgeChip badge={lab.dataBadge} />
        </div>
        <p className="text-xs text-terminal-text-muted mt-1">Topic: {lab.topic} · Difficulty: {lab.difficulty}</p>
        <p className="text-sm text-terminal-text-muted mt-2">{lab.scenario}</p>
        <div className="mt-2 rounded border border-terminal-border p-2 text-xs font-mono text-terminal-text-muted">
          SIMULATED portfolio: ACB / FPT / HPG / VCB · weights 30/30/25/15 · illustrative pairwise correlation ≈ 0.55–0.75 (fictional) · 2 of 4 names in one sector (fictional)
        </div>
        <p className="text-sm text-terminal-text mt-2 font-medium">{lab.question}</p>
        <div className="mt-2 space-y-1">
          {[
            { id: 'concentration', label: 'Sector concentration + high correlation (most visible)' },
            { id: 'cash', label: 'Excess cash drag' },
            { id: 'fx', label: 'FX settlement failure' },
          ].map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-sm text-terminal-text cursor-pointer">
              <input type="radio" name="lab-pick" checked={picked === o.id} onChange={() => setPicked(o.id)} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
        <div className="mt-3">
          <div className="text-[11px] font-mono text-terminal-text-muted">EVIDENCE REQUIRED (tick only what you can state):</div>
          <div className="flex flex-wrap gap-2 mt-1">
            {lab.evidenceRequired.map((e) => (
              <label key={e} className="flex items-center gap-1.5 text-xs font-mono border border-terminal-border rounded px-2 py-1 cursor-pointer">
                <input type="checkbox" checked={evidence.includes(e)} onChange={() => toggle(e)} />
                <span>{e}</span>
              </label>
            ))}
          </div>
        </div>
        <textarea value={why} onChange={(e) => setWhy(e.target.value)} placeholder="One sentence: WHY is this the most visible risk? (no buy/sell advice)" className="mt-3 w-full text-sm bg-terminal-surface-elevated border border-terminal-border rounded px-2 py-1.5 text-terminal-text" rows={2} />
        <button
          onClick={() => { if (correct && allEvidence && why.trim().length >= 12) { progressStore.completeLab(lab.id); setDone(true); } else setDone(false); }}
          className="mt-2 text-[11px] font-mono px-3 py-1.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-200"
        >
          Analyze (self-check)
        </button>
        {picked !== null && (
          <div className={`mt-2 text-xs rounded border p-2 leading-relaxed ${correct && allEvidence && why.trim().length >= 12 ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-100' : 'border-terminal-border bg-terminal-surface-elevated text-terminal-text-muted'}`}>
            {correct && allEvidence && why.trim().length >= 12
              ? 'YOUR ANSWER: CORRECT — concentration/correlation dominates because two heavy weights share one sector and move together in this SIMULATED setup. Expected reasoning: cite one correlation observation + one sector-exposure fact + one size fact, then stop (no advice). Lab recorded as complete.'
              : `YOUR ANSWER: REVIEW NEEDED — expected: concentration/correlation, all 3 evidence boxes ticked, and a ≥12-char WHY. Why: correlated sector bets fall together; size decides damage. See lesson les-risk-105 in platform RiskCenter. Next: re-read the SIMULATED box and retry. Guidance: ${lab.guidance}`}
          </div>
        )}
        {done && <div className="mt-1 text-[11px] font-mono text-emerald-300">Lab complete — recorded locally.</div>}
      </div>
      <SafetyBanner />
    </div>
  );
};

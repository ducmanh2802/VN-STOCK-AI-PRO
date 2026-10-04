import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { LearningService } from '../services/learning/LearningService';
import { PREREQUISITES } from '../lib/learning/catalog';
import { SubmitAssessmentSchema, SubmitProjectSchema } from '../schemas/learningSchema';
import { DataBadgeChip, SafetyBanner } from '../components/learning/LearningWidgets';

export const LearningPathPage: React.FC = () => {
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  const path = LearningService.listPaths()[0];
  if (!path) return <div className="text-sm text-terminal-text-muted">No published paths.</div>;
  const progress = LearningService.getProgress(path.id);
  const done = new Set<string>();
  try {
    const raw = localStorage.getItem('vnstock_learning_progress_v1');
    if (raw) for (const p of JSON.parse(raw) as { lessonId: string; completed: boolean }[]) if (p.completed) done.add(p.lessonId);
  } catch { /* ignore */ }

  const openLesson = (id: string) => {
    try { sessionStorage.setItem('vnstock_learn_lesson', id); } catch { /* ignore */ }
    setCurrentView('learn-lesson');
  };
  const projects = LearningService.listProjects();
  const [ticked, setTicked] = useState<string[]>([]);
  const [thesis, setThesis] = useState('');
  const [projResult, setProjResult] = useState<{ correct: boolean; feedback: string } | null>(null);
  const toggleTick = (e: string) => setTicked((p) => (p.includes(e) ? p.filter((x) => x !== e) : [...p, e]));
  const asmt = LearningService.getAssessmentDetail('asmt-beginner-01');
  const [asmtAnswers, setAsmtAnswers] = useState<Record<string, string>>({});
  const [asmtResult, setAsmtResult] = useState<{ score: number; maxScore: number; passed: boolean } | null>(null);
  const [, setCertTick] = useState(0);
  const eligibility = LearningService.getEligibility();
  const certificate = LearningService.getCertificate();

  return (
    <div className="space-y-4 max-w-4xl">
      <button onClick={() => setCurrentView('learn')} className="text-[11px] font-mono text-terminal-text-muted hover:text-terminal-text">← Back to Learn</button>
      <div>
        <h1 className="text-xl font-semibold text-terminal-text">{path.title}</h1>
        <p className="text-xs text-terminal-text-muted mt-1">{path.description}</p>
        <p className="text-xs font-mono text-terminal-text-muted mt-1">Progress {progress.completedLessons}/{progress.totalLessons} ({progress.percent}%)</p>
      </div>
      <SafetyBanner />
      <ol className="space-y-2">
        {path.items.map((item, i) => {
          if (item.kind === 'lab') {
            return (
              <li key={`${item.kind}-${item.refId}`} className="rounded border border-amber-500/30 bg-terminal-surface p-3 flex items-center justify-between">
                <div><span className="font-mono text-[11px] text-amber-400">LAB {i + 1}</span><div className="text-sm text-terminal-text">Practice Lab: diversification</div></div>
                <button onClick={() => setCurrentView('practice-lab')} className="text-[11px] font-mono px-2 py-1 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300">Open lab</button>
              </li>
            );
          }
          const d = LearningService.getLessonDetail(item.refId);
          const locked = !((PREREQUISITES[item.refId] ?? []).every((r) => done.has(r)));
          return (
            <li key={item.refId} className="rounded border border-terminal-border bg-terminal-surface p-3 flex items-center justify-between">
              <div>
                <span className="font-mono text-[11px] text-terminal-text-muted">STEP {i + 1} · {d?.lesson.difficulty} · {d?.lesson.estimatedMinutes} min {done.has(item.refId) ? '· DONE' : locked ? '· LOCKED' : ''}</span>
                <div className="text-sm text-terminal-text">{d?.lesson.title ?? item.refId}</div>
              </div>
              <button disabled={locked} onClick={() => openLesson(item.refId)} className="text-[11px] font-mono px-2 py-1 rounded border border-terminal-border disabled:opacity-40 hover:bg-terminal-surface-elevated">Open</button>
            </li>
          );
        })}
      </ol>
      {projects.map((p) => {
        const detail = LearningService.getProjectDetail(p.id);
        return (
          <div key={p.id} className="rounded border border-emerald-500/30 bg-terminal-surface p-4 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-terminal-text">PROJECT — {p.title}</span>
              <DataBadgeChip badge={p.dataBadge} />
              <span className="text-[10px] font-mono text-terminal-text-muted">{detail?.status ?? 'NOT_STARTED'}</span>
              {detail && detail.submissions > 0 && (
                <span className="text-[10px] font-mono text-terminal-text-muted">submissions: {detail.submissions}</span>
              )}
            </div>
            {detail && detail.missingPrereqs.length > 0 && (
              <div className="text-xs font-mono text-amber-200">Prerequisites first: {detail.missingPrereqs.join(', ')}</div>
            )}
            <p className="text-sm text-terminal-text-muted leading-relaxed">{p.summary}</p>
            <ol className="list-decimal ml-5 text-sm text-terminal-text space-y-0.5">{p.steps.map((s) => <li key={s}>{s}</li>)}</ol>
            <div className="text-[11px] font-mono text-terminal-text-muted">EVIDENCE REQUIRED (sandbox self-check):</div>
            <div className="flex flex-wrap gap-2">
              {p.evidenceRequired.map((e) => (
                <label key={e} className="flex items-center gap-1.5 text-xs font-mono border border-terminal-border rounded px-2 py-1 cursor-pointer">
                  <input type="checkbox" checked={ticked.includes(e)} onChange={() => toggleTick(e)} />
                  <span>{e}</span>
                </label>
              ))}
            </div>
            <textarea value={thesis} onChange={(e) => setThesis(e.target.value)} placeholder="One paragraph thesis: one FACT + one UNKNOWN (≥24 chars, no advice)" className="w-full text-sm bg-terminal-surface-elevated border border-terminal-border rounded px-2 py-1.5 text-terminal-text" rows={2} />
            <button
              onClick={() => {
                const parsed = SubmitProjectSchema.safeParse({ projectId: p.id, ticked, thesis });
                if (!parsed.success) return;
                const r = LearningService.submitProject(p.id, ticked, thesis);
                if (r) setProjResult({ correct: r.correct, feedback: r.feedback });
              }}
              className="text-[11px] font-mono px-3 py-1.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-200"
            >
              Submit project (self-check)
            </button>
            {projResult && (
              <div className={`text-xs leading-relaxed rounded border p-2 ${projResult.correct ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200' : 'border-amber-500/30 bg-amber-500/5 text-amber-100'}`}>
                <div className="font-mono mb-0.5">{projResult.correct ? 'YOUR ANSWER: CORRECT' : 'YOUR ANSWER: REVIEW NEEDED'}</div>
                {projResult.feedback}
              </div>
            )}
            {projResult?.correct && detail?.status === 'PASSED' && (
              <button
                onClick={() => {
                  if (LearningService.completeProjectStep(p.id)) setProjResult({ correct: true, feedback: 'Project recorded as COMPLETED (sandbox, local).' });
                }}
                className="text-[11px] font-mono px-3 py-1.5 rounded border border-emerald-500/30 text-emerald-200"
              >
                Mark project complete
              </button>
            )}
          </div>
        );
      })}
      {asmt && (
        <div className="rounded border border-sky-500/30 bg-terminal-surface p-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-terminal-text">ASSESSMENT — {asmt.assessment.title}</span>
            <DataBadgeChip badge={asmt.assessment.dataBadge} />
            <span className="text-[10px] font-mono text-terminal-text-muted">attempts: {asmt.attempts.length}</span>
          </div>
          <p className="text-sm text-terminal-text-muted leading-relaxed">{asmt.assessment.description}</p>
          {asmt.questions.map((q, qi) => (
            <div key={q.id} className="rounded border border-terminal-border p-3">
              <p className="text-sm text-terminal-text">Q{qi + 1}. {q.question}</p>
              {q.options ? (
                <div className="mt-1 space-y-1">
                  {q.options.map((o) => (
                    <label key={o.id} className="flex items-center gap-2 text-sm text-terminal-text-muted cursor-pointer">
                      <input
                        type="radio"
                        name={q.id}
                        checked={asmtAnswers[q.id] === o.id}
                        onChange={() => setAsmtAnswers((p) => ({ ...p, [q.id]: o.id }))}
                      />
                      <span><span className="font-mono">{o.id}</span> — {o.label}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <input
                  value={asmtAnswers[q.id] ?? ''}
                  onChange={(e) => setAsmtAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                  placeholder="Your answer"
                  className="mt-1 w-full max-w-xs text-sm bg-terminal-surface-elevated border border-terminal-border rounded px-2 py-1 text-terminal-text"
                />
              )}
            </div>
          ))}
          <button
            onClick={() => {
              const parsed = SubmitAssessmentSchema.safeParse({ assessmentId: asmt.assessment.id, answers: asmtAnswers });
              if (!parsed.success) return;
              const r = LearningService.submitAssessment(asmt.assessment.id, asmtAnswers);
              if (r) {
                setAsmtResult({ score: r.score, maxScore: r.maxScore, passed: r.passed });
                setCertTick((x) => x + 1);
              }
            }}
            className="text-[11px] font-mono px-3 py-1.5 rounded bg-sky-500/15 border border-sky-500/30 text-sky-200"
          >
            Submit assessment
          </button>
          {asmtResult && (
            <div className="text-xs font-mono text-terminal-text-muted">
              Last attempt: {asmtResult.score}/{asmtResult.maxScore} — {asmtResult.passed ? 'PASS' : 'NOT YET (history kept, retry allowed)'}
            </div>
          )}
          <div className="text-xs font-mono text-terminal-text-muted">
            Eligibility: {eligibility.eligible ? 'ELIGIBLE' : `missing: ${eligibility.missing.join('; ') || '—'}`}
          </div>
          {eligibility.eligible && !certificate && (
            <button
              onClick={() => {
                if (LearningService.issueCertificateStep()) setCertTick((x) => x + 1);
              }}
              className="text-[11px] font-mono px-3 py-1.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-200"
            >
              Issue certificate (educational attestation)
            </button>
          )}
          {certificate && (
            <div className="text-xs rounded border border-emerald-500/30 bg-emerald-500/5 p-2 text-emerald-200">
              <div className="font-mono">CERTIFICATE {certificate.id} — {certificate.status}</div>
              <div className="font-mono text-[11px] text-terminal-text-muted">{certificate.evidence.join(' · ')}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

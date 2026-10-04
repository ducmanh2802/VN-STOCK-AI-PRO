import React, { useMemo, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { LearningService } from '../services/learning/LearningService';
import { DataBadgeChip, SafetyBanner } from '../components/learning/LearningWidgets';
import { SubmitAttemptSchema } from '../schemas/learningSchema';

function initialLessonId(): string {
  try {
    const v = sessionStorage.getItem('vnstock_learn_lesson');
    if (v) return v;
  } catch { /* ignore */ }
  return 'les-market-101';
}

export const LearningLessonPage: React.FC = () => {
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  const [lessonId, setLessonId] = useState(initialLessonId);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, { correct: boolean; feedback: string }>>({});
  const [doneTick, setDoneTick] = useState(0);
  const detail = useMemo(() => LearningService.getLessonDetail(lessonId), [lessonId, doneTick]);
  const lessons = useMemo(() => LearningService.listLessons(), []);

  if (!detail) return <div className="text-sm text-terminal-text-muted">Lesson unavailable (fail-safe).</div>;
  const { lesson, exercises } = detail;

  const submit = (exerciseId: string) => {
    const raw = answers[exerciseId] ?? '';
    const parsed = SubmitAttemptSchema.safeParse({ exerciseId, answer: raw });
    if (!parsed.success) return;
    const r = LearningService.submitExercise(exerciseId, raw);
    if (r) setResults((prev) => ({ ...prev, [exerciseId]: { correct: r.correct, feedback: r.feedback } }));
  };

  const complete = () => {
    LearningService.completeLesson(lessonId);
    setDoneTick((x) => x + 1);
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-2">
        <button onClick={() => setCurrentView('learn-path')} className="text-[11px] font-mono text-terminal-text-muted hover:text-terminal-text">← Path</button>
        <select value={lessonId} onChange={(e) => { setLessonId(e.target.value); try { sessionStorage.setItem('vnstock_learn_lesson', e.target.value); } catch { /* ignore */ } }} className="ml-auto text-[11px] font-mono bg-terminal-surface border border-terminal-border rounded px-2 py-1 text-terminal-text">
          {lessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
        </select>
      </div>
      <div>
        <h1 className="text-xl font-semibold text-terminal-text">{lesson.title}</h1>
        <div className="flex gap-2 mt-1 items-center">
          <span className="text-[11px] font-mono text-terminal-text-muted">{lesson.difficulty} · {lesson.estimatedMinutes} min</span>
          <DataBadgeChip badge={lesson.dataBadge} />
        </div>
      </div>
      <SafetyBanner />
      <div className="rounded border border-terminal-border bg-terminal-surface p-4">
        <div className="text-[11px] font-mono text-terminal-text-muted mb-1">OBJECTIVES</div>
        <ul className="list-disc ml-5 text-sm text-terminal-text space-y-0.5">{lesson.objectives.map((o) => <li key={o}>{o}</li>)}</ul>
      </div>
      {lesson.sections.map((s) => (
        <div key={s.heading} className="rounded border border-terminal-border bg-terminal-surface p-4">
          <div className="text-sm font-semibold text-terminal-text">{s.heading}</div>
          <p className="text-sm text-terminal-text-muted mt-1 leading-relaxed">{s.body}</p>
        </div>
      ))}
      {lesson.examples.map((e) => (
        <div key={e.title} className="rounded border border-terminal-border bg-terminal-surface p-4">
          <div className="flex items-center gap-2"><span className="text-sm font-semibold text-terminal-text">{e.title}</span><DataBadgeChip badge={e.dataBadge} /></div>
          <p className="text-sm text-terminal-text-muted mt-1">{e.body}</p>
        </div>
      ))}
      <div className="rounded border border-terminal-border bg-terminal-surface p-4">
        <div className="text-[11px] font-mono text-terminal-text-muted mb-1">KEY POINTS</div>
        <ul className="list-disc ml-5 text-sm text-terminal-text">{lesson.keyPoints.map((k) => <li key={k}>{k}</li>)}</ul>
        {lesson.systemFeatureRefs.length > 0 && <div className="text-xs font-mono text-terminal-text-muted mt-2">Try in platform: {lesson.systemFeatureRefs.join(' · ')}</div>}
      </div>
      <div className="space-y-3">
        <div className="text-sm font-semibold text-terminal-text">Exercises ({exercises.length})</div>
        {exercises.map((ex) => (
          <div key={ex.id} className="rounded border border-terminal-border bg-terminal-surface p-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-terminal-border text-terminal-text-muted">{ex.type}</span>
              <DataBadgeChip badge={ex.dataBadge} />
            </div>
            <p className="text-sm text-terminal-text mt-2">{ex.question}</p>
            {ex.options ? (
              <div className="mt-2 space-y-1">
                {ex.options.map((o) => (
                  <label key={o.id} className="flex items-center gap-2 text-sm text-terminal-text-muted cursor-pointer">
                    <input type="radio" name={ex.id} checked={answers[ex.id] === o.id} onChange={() => setAnswers((p) => ({ ...p, [ex.id]: o.id }))} />
                    <span><span className="font-mono">{o.id}</span> — {o.label}</span>
                  </label>
                ))}
              </div>
            ) : (
              <input value={answers[ex.id] ?? ''} onChange={(e) => setAnswers((p) => ({ ...p, [ex.id]: e.target.value }))} placeholder="Your answer" className="mt-2 w-full max-w-xs text-sm bg-terminal-surface-elevated border border-terminal-border rounded px-2 py-1 text-terminal-text" />
            )}
            <button onClick={() => submit(ex.id)} className="mt-2 text-[11px] font-mono px-2 py-1 rounded bg-terminal-accent text-white">Submit</button>
            {results[ex.id] && (
              <div className={`mt-2 text-xs leading-relaxed rounded border p-2 ${results[ex.id].correct ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200' : 'border-amber-500/30 bg-amber-500/5 text-amber-100'}`}>
                <div className="font-mono mb-0.5">{results[ex.id].correct ? 'YOUR ANSWER: CORRECT' : 'YOUR ANSWER: REVIEW NEEDED'}</div>
                {results[ex.id].feedback}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={complete} className="text-[11px] font-mono px-3 py-1.5 rounded bg-terminal-accent text-white">Mark lesson complete</button>
        <button onClick={() => setCurrentView('learn')} className="text-[11px] font-mono px-3 py-1.5 rounded border border-terminal-border">Dashboard</button>
      </div>
    </div>
  );
};

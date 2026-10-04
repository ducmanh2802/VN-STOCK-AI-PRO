// ExerciseScoringEngine — deterministic scoring. No randomness, no Date.now.
import type { Exercise, ScoredResult } from './types';

function normText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function toNumberOrNull(s: string): number | null {
  const cleaned = s.trim().replace(/,/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function scoreExercise(exercise: Exercise, answer: string | string[]): ScoredResult {
  const maxScore = 1;
  const correct = exercise.correctAnswer;

  if (exercise.type === 'CALCULATION') {
    const expected = toNumberOrNull(String(Array.isArray(correct) ? correct[0] : correct));
    const got = toNumberOrNull(String(Array.isArray(answer) ? answer[0] ?? '' : answer));
    if (expected === null || got === null) {
      return { score: 0, maxScore, correct: false, feedback: buildFeedback(exercise, false) };
    }
    const tol = exercise.tolerance ?? 0;
    const ok = Math.abs(got - expected) <= tol + 1e-9;
    return { score: ok ? 1 : 0, maxScore, correct: ok, feedback: buildFeedback(exercise, ok) };
  }

  if (Array.isArray(correct)) {
    const want = correct.map(normText).sort();
    const gotArr = (Array.isArray(answer) ? answer : [answer]).map((a) => normText(String(a))).sort();
    const ok = want.length === gotArr.length && want.every((v, i) => v === gotArr[i]);
    return { score: ok ? 1 : 0, maxScore, correct: ok, feedback: buildFeedback(exercise, ok) };
  }

  // Single-answer: option id exact, else case-insensitive text compare
  const wantRaw = String(correct);
  const gotRaw = String(Array.isArray(answer) ? answer[0] ?? '' : answer);
  const ok = normText(gotRaw) === normText(wantRaw);
  return { score: ok ? 1 : 0, maxScore, correct: ok, feedback: buildFeedback(exercise, ok) };
}

export function buildFeedback(exercise: Exercise, correct: boolean): string {
  const head = correct ? 'Correct.' : 'Not quite yet.';
  const concepts = exercise.conceptIds.length > 0 ? `Concept: ${exercise.conceptIds.join(', ')}.` : '';
  return [
    head,
    `Why: ${exercise.explanation}`,
    `Expected reasoning: ${exercise.expectedReasoning}`,
    concepts,
    exercise.systemFeature ? `See in platform: ${exercise.systemFeature}.` : '',
    'Next: continue the path recommendation (retry missed items first).',
  ]
    .filter(Boolean)
    .join(' ');
}

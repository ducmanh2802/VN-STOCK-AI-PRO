// MasteryEngine — evidence-gated mastery. Pure + deterministic.
import type { ConceptMastery, ExerciseAttempt, MasteryState } from './types';
import { EXERCISES } from './catalog';

function stateFor(avg: number | null, attempts: number, completedLessons: number): MasteryState {
  if (attempts === 0) return completedLessons > 0 ? 'LEARNING' : 'NOT_STARTED';
  if (avg === null) return 'PRACTICING';
  if (avg >= 0.85 && attempts >= 2) return 'MASTERED';
  if (avg >= 0.7) return 'UNDERSTANDING';
  if (avg >= 0.4) return 'PRACTICING';
  return 'LEARNING';
}

export function computeMastery(
  attemptsByExercise: Record<string, ExerciseAttempt[]>,
  completedLessonIds: string[],
  lessonToConcepts: Record<string, string[]>,
): ConceptMastery[] {
  // concept -> scores
  const scoresByConcept = new Map<string, number[]>();
  for (const ex of EXERCISES) {
    const list = attemptsByExercise[ex.id] ?? [];
    if (list.length === 0) continue;
    const best = Math.max(...list.map((a) => (a.maxScore > 0 ? a.score / a.maxScore : 0)));
    for (const c of ex.conceptIds) {
      const arr = scoresByConcept.get(c) ?? [];
      arr.push(best);
      scoresByConcept.set(c, arr);
    }
  }
  const lessonsByConcept = new Map<string, number>();
  for (const [lessonId, concepts] of Object.entries(lessonToConcepts)) {
    if (!completedLessonIds.includes(lessonId)) continue;
    for (const c of concepts) lessonsByConcept.set(c, (lessonsByConcept.get(c) ?? 0) + 1);
  }
  const conceptIds = new Set<string>([...scoresByConcept.keys(), ...lessonsByConcept.keys()]);
  const out: ConceptMastery[] = [];
  for (const c of [...conceptIds].sort()) {
    const scores = scoresByConcept.get(c) ?? [];
    const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    const st = stateFor(avg, scores.length, lessonsByConcept.get(c) ?? 0);
    out.push({ conceptId: c, state: st, score: avg ?? 0 });
  }
  return out;
}

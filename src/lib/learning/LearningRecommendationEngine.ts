// LearningRecommendationEngine — deterministic next-activity. No randomness.
import type { ExerciseAttempt, Recommendation } from './types';
import { EXERCISES, LESSONS, PREREQUISITES, getPath } from './catalog';

export interface LearnerSnapshot {
  completedLessonIds: string[];
  attemptsByExercise: Record<string, ExerciseAttempt[]>;
  completedLabIds: string[];
}

function prereqsMet(lessonId: string, done: Set<string>): boolean {
  const req = PREREQUISITES[lessonId] ?? [];
  return req.every((r) => done.has(r));
}

function avgScore(exerciseId: string, snap: LearnerSnapshot): number | null {
  const list = snap.attemptsByExercise[exerciseId] ?? [];
  if (list.length === 0) return null;
  const vals = list.map((a) => (a.maxScore > 0 ? a.score / a.maxScore : 0));
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function recommendNext(pathId: string, snap: LearnerSnapshot): Recommendation {
  const path = getPath(pathId);
  if (!path) return { kind: 'COMPLETE', refId: null, reason: 'Unknown path is treated as complete (fail-safe).' };
  const done = new Set(snap.completedLessonIds);
  const doneLabs = new Set(snap.completedLabIds);

  // 1. Failed exercises first (deterministic: lowest score, then id order)
  const failed = EXERCISES.filter((e) => {
    const avg = avgScore(e.id, snap);
    return avg !== null && avg < 1;
  }).sort((a, b) => {
    const sa = avgScore(a.id, snap) ?? 1;
    const sb = avgScore(b.id, snap) ?? 1;
    if (sa !== sb) return sa - sb;
    return a.id.localeCompare(b.id);
  });
  if (failed.length > 0) {
    return { kind: 'EXERCISE', refId: failed[0].id, reason: `Retry missed exercise ${failed[0].id} before advancing.` };
  }

  // 2. First incomplete path item whose prereqs are met
  for (const item of path.items) {
    if (item.kind === 'lesson') {
      if (done.has(item.refId)) continue;
      if (!prereqsMet(item.refId, done)) {
        const missing = (PREREQUISITES[item.refId] ?? []).find((r) => !done.has(r));
        if (missing) return { kind: 'LESSON', refId: missing, reason: `Prerequisite ${missing} unlocks ${item.refId}.` };
        continue;
      }
      // Prefer unattempted exercise of this lesson before marking lesson readable? Lesson first (read), exercises inline.
      return { kind: 'LESSON', refId: item.refId, reason: `Next in path: ${item.refId}.` };
    }
    if (item.kind === 'lab') {
      if (doneLabs.has(item.refId)) continue;
      return { kind: 'LAB', refId: item.refId, reason: `Apply knowledge in lab ${item.refId}.` };
    }
  }

  // 3. Unattempted exercises in completed lessons (review)
  const review = LESSONS.flatMap((l) =>
    EXERCISES.filter((e) => e.lessonId === l.id && (snap.attemptsByExercise[e.id] ?? []).length === 0),
  ).sort((a, b) => a.id.localeCompare(b.id));
  if (review.length > 0) {
    return { kind: 'REVIEW', refId: review[0].id, reason: `Review exercise ${review[0].id}.` };
  }

  return { kind: 'COMPLETE', refId: null, reason: 'Path complete. Well done.' };
}

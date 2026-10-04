// AdaptiveLearningEngine — LEARNING-09 mastery-aware, explainable recommendations.
// Pure + deterministic. No randomness, no Date.now, no IO, no trading imports.
// Layers on top of MasteryEngine + catalog; does NOT alter existing engines.
import type { ExerciseAttempt, MasteryState, Recommendation } from './types';
import type { LearnerSnapshot } from './LearningRecommendationEngine';
import { EXERCISES, LESSONS, getPath } from './catalog';
import { computeMastery } from './MasteryEngine';
import { buildGraph, getDirectPrerequisites } from './KnowledgeGraph';

// L12 integration: prerequisite traversal is graph-backed (single derived view,
// same catalog data). The graph is static for the catalog version — build once.
const GRAPH = buildGraph();

export interface AdaptiveExplanation {
  /** WHY THIS LESSON / EXERCISE / LAB (content reason). */
  whyThis: string;
  /** WHY NOW (sequencing reason: failure, prereq, review, path order). */
  whyNow: string;
  /** WHAT PREREQUISITE IS MISSING (lesson ids blocking progress). */
  missingPrerequisites: string[];
  /** WHAT EVIDENCE CAUSED THE RECOMMENDATION (scores, attempts, mastery states). */
  evidence: string[];
  /** Weakest concepts first (LEARNING/PRACTICING with attempts), max 3. */
  weakConcepts: string[];
  /** Concepts due for review (UNDERSTANDING, not yet MASTERED), id order. */
  reviewConcepts: string[];
}

export interface AdaptiveRecommendation extends Recommendation {
  explanation: AdaptiveExplanation;
}

const DIFFICULTY_RANK: Record<string, number> = { Beginner: 0, Intermediate: 1, Advanced: 2 };

function lessonToConcepts(): Record<string, string[]> {
  const m: Record<string, string[]> = {};
  for (const l of LESSONS) m[l.id] = l.conceptIds;
  return m;
}

function avgOf(list: ExerciseAttempt[] | undefined): number | null {
  if (!list || list.length === 0) return null;
  const vals = list.map((a) => (a.maxScore > 0 ? a.score / a.maxScore : 0));
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function conceptAvg(conceptId: string, snap: LearnerSnapshot): number | null {
  const vals: number[] = [];
  for (const ex of EXERCISES) {
    if (!ex.conceptIds.includes(conceptId)) continue;
    const list = snap.attemptsByExercise[ex.id] ?? [];
    if (list.length === 0) continue;
    vals.push(Math.max(...list.map((a) => (a.maxScore > 0 ? a.score / a.maxScore : 0))));
  }
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function failSafe(): AdaptiveRecommendation {
  return {
    kind: 'COMPLETE',
    refId: null,
    reason: 'Unknown path is treated as complete (fail-safe).',
    explanation: {
      whyThis: 'No known path to recommend.',
      whyNow: 'Fail-safe: unknown path id.',
      missingPrerequisites: [],
      evidence: [],
      weakConcepts: [],
      reviewConcepts: [],
    },
  };
}

/** Weak-topic detection: LEARNING/PRACTICING concepts with attempts, weakest score first, id tiebreak. */
export function detectWeakConcepts(snap: LearnerSnapshot): { conceptId: string; state: MasteryState; score: number }[] {
  const mastery = computeMastery(snap.attemptsByExercise, snap.completedLessonIds, lessonToConcepts());
  return mastery
    .filter((m) => m.state === 'LEARNING' || m.state === 'PRACTICING')
    .filter((m) => {
      const attempted = EXERCISES.some(
        (e) => e.conceptIds.includes(m.conceptId) && (snap.attemptsByExercise[e.id] ?? []).length > 0,
      );
      return attempted;
    })
    .sort((a, b) => (a.score !== b.score ? a.score - b.score : a.conceptId.localeCompare(b.conceptId)))
    .slice(0, 3);
}

/** Review scheduling: UNDERSTANDING concepts (evidence exists, mastery not yet reached), id order. */
export function detectReviewConcepts(snap: LearnerSnapshot): string[] {
  const mastery = computeMastery(snap.attemptsByExercise, snap.completedLessonIds, lessonToConcepts());
  return mastery
    .filter((m) => m.state === 'UNDERSTANDING')
    .map((m) => m.conceptId)
    .sort();
}

export function recommendAdaptive(pathId: string, snap: LearnerSnapshot): AdaptiveRecommendation {
  const path = getPath(pathId);
  if (!path) return failSafe();
  const done = new Set(snap.completedLessonIds);
  const doneLabs = new Set(snap.completedLabIds);
  const weak = detectWeakConcepts(snap);
  const weakIds = weak.map((w) => w.conceptId);
  const review = detectReviewConcepts(snap);

  const evidenceFor = (exerciseId: string): string[] => {
    const out: string[] = [];
    const list = snap.attemptsByExercise[exerciseId] ?? [];
    if (list.length > 0) out.push(`exercise ${exerciseId}: avg ${(avgOf(list) ?? 0).toFixed(2)} over ${list.length} attempt(s)`);
    const ex = EXERCISES.find((e) => e.id === exerciseId);
    for (const c of ex?.conceptIds ?? []) {
      const ca = conceptAvg(c, snap);
      if (ca !== null) out.push(`concept ${c}: avg ${ca.toFixed(2)}`);
    }
    return out;
  };

  // 1. Failed exercises first — weakest concept first, then lowest score, then id order.
  const failed = EXERCISES.filter((e) => {
    const avg = avgOf(snap.attemptsByExercise[e.id]);
    return avg !== null && avg < 1;
  }).sort((a, b) => {
    const caA = Math.min(...a.conceptIds.map((c) => conceptAvg(c, snap) ?? 1));
    const caB = Math.min(...b.conceptIds.map((c) => conceptAvg(c, snap) ?? 1));
    if (caA !== caB) return caA - caB;
    const sa = avgOf(snap.attemptsByExercise[a.id]) ?? 1;
    const sb = avgOf(snap.attemptsByExercise[b.id]) ?? 1;
    if (sa !== sb) return sa - sb;
    return a.id.localeCompare(b.id);
  });
  if (failed.length > 0) {
    const top = failed[0];
    return {
      kind: 'EXERCISE',
      refId: top.id,
      reason: `Retry missed exercise ${top.id} before advancing.`,
      explanation: {
        whyThis: `Exercise ${top.id} tests ${top.conceptIds.join(', ')} where your evidence is weakest.`,
        whyNow: 'Failed evidence outranks new material: fix the weakest link first.',
        missingPrerequisites: [],
        evidence: evidenceFor(top.id),
        weakConcepts: weakIds,
        reviewConcepts: review,
      },
    };
  }

  // 2. Next path item in prerequisite order (lesson or lab).
  for (const item of path.items) {
    if (item.kind === 'lesson') {
      if (done.has(item.refId)) continue;
      const missing = getDirectPrerequisites(GRAPH, item.refId).filter((r) => !done.has(r));
      if (missing.length > 0) {
        return {
          kind: 'LESSON',
          refId: missing[0],
          reason: `Prerequisite ${missing[0]} unlocks ${item.refId}.`,
          explanation: {
            whyThis: `Lesson ${missing[0]} is required before ${item.refId}.`,
            whyNow: 'Prerequisite gap blocks the path; backfill before advancing.',
            missingPrerequisites: missing,
            evidence: [`completed lessons: ${snap.completedLessonIds.length}`, `blocked: ${item.refId}`],
            weakConcepts: weakIds,
            reviewConcepts: review,
          },
        };
      }
      const itemWeak = weakIds.filter((c) => (lessonToConcepts()[item.refId] ?? []).includes(c));
      return {
        kind: 'LESSON',
        refId: item.refId,
        reason: `Next in path: ${item.refId}.`,
        explanation: {
          whyThis: `Lesson ${item.refId} is the next path step.`,
          whyNow:
            itemWeak.length > 0
              ? `Path order; note weak concept(s) ${itemWeak.join(', ')} appear here — attempt its exercises carefully.`
              : 'Path order; prerequisites satisfied.',
          missingPrerequisites: [],
          evidence: [`completed lessons: ${snap.completedLessonIds.length}`],
          weakConcepts: weakIds,
          reviewConcepts: review,
        },
      };
    }
    if (item.kind === 'lab') {
      if (doneLabs.has(item.refId)) continue;
      return {
        kind: 'LAB',
        refId: item.refId,
        reason: `Apply knowledge in lab ${item.refId}.`,
        explanation: {
          whyThis: `Lab ${item.refId} applies the path knowledge with required evidence.`,
          whyNow: 'Lessons complete; application before review.',
          missingPrerequisites: [],
          evidence: [`completed labs: ${snap.completedLabIds.length}`],
          weakConcepts: weakIds,
          reviewConcepts: review,
        },
      };
    }
  }

  // 3. Review: unattempted exercises of UNDERSTANDING concepts, easiest first, id tiebreak.
  const reviewPool = EXERCISES.filter(
    (e) =>
      (snap.attemptsByExercise[e.id] ?? []).length === 0 && e.conceptIds.some((c) => review.includes(c)),
  ).sort(
    (a, b) =>
      (DIFFICULTY_RANK[a.difficulty] ?? 9) - (DIFFICULTY_RANK[b.difficulty] ?? 9) || a.id.localeCompare(b.id),
  );
  if (reviewPool.length > 0) {
    const top = reviewPool[0];
    return {
      kind: 'REVIEW',
      refId: top.id,
      reason: `Strengthen ${top.conceptIds.join(', ')} toward mastery with ${top.id}.`,
      explanation: {
        whyThis: `Exercise ${top.id} practices ${top.conceptIds.join(', ')}, currently UNDERSTANDING but not MASTERED.`,
        whyNow: 'Path complete; scheduled review converts understanding into mastery.',
        missingPrerequisites: [],
        evidence: evidenceFor(top.id).concat([`review concepts: ${review.join(', ')}`]),
        weakConcepts: weakIds,
        reviewConcepts: review,
      },
    };
  }

  // 4. Any remaining unattempted exercise, easiest first.
  const rest = EXERCISES.filter((e) => (snap.attemptsByExercise[e.id] ?? []).length === 0).sort(
    (a, b) =>
      (DIFFICULTY_RANK[a.difficulty] ?? 9) - (DIFFICULTY_RANK[b.difficulty] ?? 9) || a.id.localeCompare(b.id),
  );
  if (rest.length > 0) {
    return {
      kind: 'REVIEW',
      refId: rest[0].id,
      reason: `Review exercise ${rest[0].id}.`,
      explanation: {
        whyThis: `Exercise ${rest[0].id} has no attempts yet.`,
        whyNow: 'Coverage review: no failed items and path complete.',
        missingPrerequisites: [],
        evidence: [],
        weakConcepts: weakIds,
        reviewConcepts: review,
      },
    };
  }

  return {
    kind: 'COMPLETE',
    refId: null,
    reason: 'Path complete. Well done.',
    explanation: {
      whyThis: 'Nothing left to recommend.',
      whyNow: 'All path items done and every exercise attempted without failure.',
      missingPrerequisites: [],
      evidence: [],
      weakConcepts: weakIds,
      reviewConcepts: review,
    },
  };
}

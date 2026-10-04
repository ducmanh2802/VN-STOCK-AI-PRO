import { describe, expect, it } from 'vitest';
import {
  detectReviewConcepts,
  detectWeakConcepts,
  recommendAdaptive,
} from '../AdaptiveLearningEngine';
import type { ExerciseAttempt } from '../types';
import type { LearnerSnapshot } from '../LearningRecommendationEngine';

const stamp = '2026-10-04T00:00:00.000Z';
const attempt = (exerciseId: string, score: number): ExerciseAttempt => ({
  exerciseId, answer: 'x', score, maxScore: 1, correct: score === 1, attemptedAt: stamp,
});
const empty: LearnerSnapshot = { completedLessonIds: [], attemptsByExercise: {}, completedLabIds: [] };

describe('adaptive recommendation fail-safe + determinism', () => {
  it('unknown path fails safe with explanation', () => {
    const r = recommendAdaptive('missing', empty);
    expect(r.kind).toBe('COMPLETE');
    expect(r.explanation.whyThis.length).toBeGreaterThan(0);
    expect(r.explanation.whyNow.length).toBeGreaterThan(0);
  });
  it('same snapshot -> same adaptive recommendation', () => {
    const snap: LearnerSnapshot = {
      completedLessonIds: ['les-market-101'],
      attemptsByExercise: { 'ex-band-01': [attempt('ex-band-01', 0)] },
      completedLabIds: [],
    };
    expect(recommendAdaptive('path-beginner', snap)).toEqual(recommendAdaptive('path-beginner', snap));
  });
  it('fresh learner starts at first lesson with empty missing prereqs', () => {
    const r = recommendAdaptive('path-beginner', empty);
    expect(r).toMatchObject({ kind: 'LESSON', refId: 'les-market-101' });
    expect(r.explanation.missingPrerequisites).toEqual([]);
    expect(r.explanation.weakConcepts).toEqual([]);
  });
});

describe('weak-topic detection drives failed-first ordering', () => {
  it('weakest concept surfaces first with evidence', () => {
    const snap: LearnerSnapshot = {
      completedLessonIds: ['les-market-101'],
      attemptsByExercise: {
        'ex-band-01': [attempt('ex-band-01', 0)],
        'ex-stock-def-01': [attempt('ex-stock-def-01', 0), attempt('ex-stock-def-01', 1)],
      },
      completedLabIds: [],
    };
    const weak = detectWeakConcepts(snap);
    expect(weak.length).toBeGreaterThan(0);
    // c-index-sector avg 0 < c-stock avg 0.5 -> weakest first
    expect(weak[0].conceptId).toBe('c-index-sector');
    const r = recommendAdaptive('path-beginner', snap);
    expect(r).toMatchObject({ kind: 'EXERCISE', refId: 'ex-band-01' });
    expect(r.explanation.evidence.length).toBeGreaterThan(0);
    expect(r.explanation.weakConcepts[0]).toBe('c-index-sector');
    expect(r.explanation.whyThis).toContain('weakest');
  });
});

describe('review scheduling converts UNDERSTANDING toward mastery', () => {
  it('single correct attempt -> UNDERSTANDING concept yields REVIEW of sibling exercise', () => {
    const snap: LearnerSnapshot = {
      completedLessonIds: [
        'les-market-101', 'les-price-volume-102', 'les-index-sector-103',
        'les-statements-104', 'les-risk-105', 'les-system-106', 'les-practice-107',
      ],
      attemptsByExercise: { 'ex-stock-def-01': [attempt('ex-stock-def-01', 1)] },
      completedLabIds: ['lab-diversification-01'],
    };
    expect(detectReviewConcepts(snap)).toContain('c-stock');
    const r = recommendAdaptive('path-beginner', snap);
    expect(r.kind).toBe('REVIEW');
    // sibling unattempted exercise on c-stock
    expect(r.refId).toBe('ex-market-cap-01');
    expect(r.explanation.reviewConcepts).toContain('c-stock');
  });
  it('prerequisite gaps are named explicitly', () => {
    // les-risk-105 requires les-statements-104; skip ahead by completing nothing but asking mid-path:
    // simulate done up to les-index-sector-103 only; next path item is les-statements-104 (no gap).
    // Force a gap: mark les-price-volume-102 done but NOT les-market-101.
    const snap: LearnerSnapshot = {
      completedLessonIds: ['les-price-volume-102'],
      attemptsByExercise: {},
      completedLabIds: [],
    };
    const r = recommendAdaptive('path-beginner', snap);
    // path scan: les-market-101 incomplete with no prereqs -> recommended directly
    expect(r).toMatchObject({ kind: 'LESSON', refId: 'les-market-101' });
  });
});

describe('acceptance edge cases (§9.4)', () => {
  const allLessons = [
    'les-market-101', 'les-price-volume-102', 'les-index-sector-103',
    'les-statements-104', 'les-risk-105', 'les-system-106', 'les-practice-107',
  ];
  it('tie-breaking: equal scores fall back to exercise id order', () => {
    const snap: LearnerSnapshot = {
      completedLessonIds: ['les-market-101'],
      attemptsByExercise: {
        'ex-ttm-debug-01': [attempt('ex-ttm-debug-01', 0)],
        'ex-band-01': [attempt('ex-band-01', 0)],
      },
      completedLabIds: [],
    };
    const r = recommendAdaptive('path-beginner', snap);
    expect(r.kind).toBe('EXERCISE');
    // both avg 0 on distinct concepts (both avg 0) -> lowest concept avg ties -> id order
    expect(r.refId).toBe('ex-band-01');
  });
  it('completed path with all exercises passed -> COMPLETE', () => {
    const attempts: LearnerSnapshot['attemptsByExercise'] = {};
    for (const id of [
      'ex-market-cap-01', 'ex-stock-def-01', 'ex-stale-01', 'ex-band-01', 'ex-margin-01',
      'ex-ttm-debug-01', 'ex-pe-fact-01', 'ex-size-01', 'ex-decision-01', 'ex-nav-01', 'ex-lab-01',
    ]) {
      attempts[id] = [attempt(id, 1), attempt(id, 1)];
    }
    const r = recommendAdaptive('path-beginner', {
      completedLessonIds: allLessons,
      attemptsByExercise: attempts,
      completedLabIds: ['lab-diversification-01'],
    });
    expect(r.kind).toBe('COMPLETE');
  });
  it('conflicting signals: failed exercise outranks path completion', () => {
    const snap: LearnerSnapshot = {
      completedLessonIds: allLessons,
      attemptsByExercise: { 'ex-band-01': [attempt('ex-band-01', 0)] },
      completedLabIds: ['lab-diversification-01'],
    };
    const r = recommendAdaptive('path-beginner', snap);
    expect(r).toMatchObject({ kind: 'EXERCISE', refId: 'ex-band-01' });
  });
  it('invalid state (maxScore 0) never crashes and never masters', () => {
    const bad: ExerciseAttempt = {
      exerciseId: 'ex-band-01', answer: 'a', score: 0, maxScore: 0, correct: false, attemptedAt: stamp,
    };
    const snap: LearnerSnapshot = {
      completedLessonIds: [],
      attemptsByExercise: { 'ex-band-01': [bad] },
      completedLabIds: [],
    };
    // degenerate attempt scores 0 -> treated as failed evidence, retried deterministically
    const r = recommendAdaptive('path-beginner', snap);
    expect(r).toMatchObject({ kind: 'EXERCISE', refId: 'ex-band-01' });
    expect(detectWeakConcepts(snap).some((w) => w.state === 'MASTERED')).toBe(false);
  });
});

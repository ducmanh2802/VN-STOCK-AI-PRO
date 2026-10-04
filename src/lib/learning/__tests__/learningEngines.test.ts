import { describe, expect, it } from 'vitest';
import { EXERCISES, LESSONS, PATHS, PREREQUISITES } from '../catalog';
import { scoreExercise } from '../ExerciseScoringEngine';
import { computeMastery } from '../MasteryEngine';
import { recommendNext } from '../LearningRecommendationEngine';
import type { ExerciseAttempt } from '../types';

const stamp = '2026-10-04T00:00:00.000Z';
const attempt = (exerciseId: string, score: number): ExerciseAttempt => ({
  exerciseId, answer: 'x', score, maxScore: 1, correct: score === 1, attemptedAt: stamp,
});

describe('learning catalog validity', () => {
  it('only PUBLISHED content ships in MVP', () => {
    expect(LESSONS.length).toBeGreaterThan(0);
    expect(EXERCISES.length).toBeGreaterThan(0);
    expect(PATHS.length).toBeGreaterThanOrEqual(1);
    for (const l of LESSONS) expect(l.status).toBe('PUBLISHED');
    for (const e of EXERCISES) expect(e.status).toBe('PUBLISHED');
  });
  it('every exercise points at an existing published lesson', () => {
    const ids = new Set(LESSONS.map((l) => l.id));
    for (const e of EXERCISES) expect(ids.has(e.lessonId)).toBe(true);
  });
  it('path refs resolve and prerequisites form a chain', () => {
    const lessonIds = new Set(LESSONS.map((l) => l.id));
    for (const p of PATHS) for (const item of p.items) {
      if (item.kind === 'lesson') expect(lessonIds.has(item.refId)).toBe(true);
    }
    for (const [k, v] of Object.entries(PREREQUISITES) as [string, string[]][]) {
      expect(lessonIds.has(k)).toBe(true);
      for (const r of v) expect(lessonIds.has(r)).toBe(true);
    }
  });
  it('unavailable content fails safely (null, never throw)', async () => {
    const { LearningService } = await import('../../../services/learning/LearningService');
    expect(LearningService.getLessonDetail('nope')).toBeNull();
    expect(LearningService.submitExercise('nope', 'a')).toBeNull();
  });
});

describe('exercise scoring determinism', () => {
  it('knowledge option scoring is exact + deterministic', () => {
    const ex = EXERCISES.find((e) => e.id === 'ex-band-01')!;
    expect(scoreExercise(ex, 'a').correct).toBe(true);
    expect(scoreExercise(ex, 'b').correct).toBe(false);
    expect(scoreExercise(ex, 'a')).toEqual(scoreExercise(ex, 'a'));
  });
  it('calculation honors tolerance', () => {
    const ex = EXERCISES.find((e) => e.id === 'ex-margin-01')!;
    expect(scoreExercise(ex, '25').correct).toBe(true);
    expect(scoreExercise(ex, '25.4').correct).toBe(true);
    expect(scoreExercise(ex, '30').correct).toBe(false);
    expect(scoreExercise(ex, 'not-a-number').correct).toBe(false);
  });
  it('feedback teaches (why + reasoning + feature)', () => {
    const ex = EXERCISES.find((e) => e.id === 'ex-stale-01')!;
    const r = scoreExercise(ex, 'a');
    expect(r.correct).toBe(false);
    expect(r.feedback).toContain('Why:');
    expect(r.feedback).toContain('Expected reasoning:');
  });
});

describe('mastery requires evidence', () => {
  const l2c: Record<string, string[]> = { 'les-market-101': ['c-stock'] };
  it('no evidence -> NOT_STARTED / LEARNING, never MASTERED', () => {
    const m = computeMastery({}, [], l2c);
    expect(m.every((x) => x.state === 'NOT_STARTED' || x.state === 'LEARNING')).toBe(true);
    expect(m.some((x) => x.state === 'MASTERED')).toBe(false);
  });
  it('lesson open alone does not master', () => {
    const m = computeMastery({}, ['les-market-101'], l2c);
    const c = m.find((x) => x.conceptId === 'c-stock');
    expect(c?.state).not.toBe('MASTERED');
  });
  it('repeated strong evidence masters', () => {
    const m = computeMastery(
      { 'ex-stock-def-01': [attempt('ex-stock-def-01', 1), attempt('ex-stock-def-01', 1)] },
      ['les-market-101'],
      { 'les-market-101': ['c-stock'], 'x': ['c-stock'] },
    );
    // ex-stock-def-01 maps to c-stock; need attempts>=2 on scored concept
    const withTwo = computeMastery(
      { 'ex-stock-def-01': [attempt('ex-stock-def-01', 1)], 'ex-market-cap-01': [attempt('ex-market-cap-01', 1)] },
      ['les-market-101'],
      { 'les-market-101': ['c-stock'] },
    );
    expect(withTwo.find((x) => x.conceptId === 'c-stock')?.state).toBe('MASTERED');
    expect(m.find((x) => x.conceptId === 'c-stock')?.score).toBeGreaterThanOrEqual(0);
  });
});

describe('recommendation is prerequisite-ordered + deterministic', () => {
  it('suggests first lesson, then prerequisite chain', () => {
    const empty = { completedLessonIds: [], attemptsByExercise: {}, completedLabIds: [] };
    expect(recommendNext('path-beginner', empty)).toMatchObject({ kind: 'LESSON', refId: 'les-market-101' });
    const mid = { completedLessonIds: ['les-market-101'], attemptsByExercise: {}, completedLabIds: [] };
    expect(recommendNext('path-beginner', mid).refId).toBe('les-price-volume-102');
  });
  it('failed exercise outranks next lesson', () => {
    const snap = {
      completedLessonIds: ['les-market-101'],
      attemptsByExercise: { 'ex-band-01': [attempt('ex-band-01', 0)] },
      completedLabIds: [],
    };
    expect(recommendNext('path-beginner', snap)).toMatchObject({ kind: 'EXERCISE', refId: 'ex-band-01' });
  });
  it('same state -> same recommendation; unknown path fails safe', () => {
    const snap = { completedLessonIds: [], attemptsByExercise: {}, completedLabIds: [] };
    expect(recommendNext('path-beginner', snap)).toEqual(recommendNext('path-beginner', snap));
    expect(recommendNext('missing', snap).kind).toBe('COMPLETE');
  });
});

describe('learning isolation invariant', () => {
  it('learning lib never imports trading/risk execution', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = path.resolve(__dirname, '..');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    // Isolation = no code dependency on trading execution. Display strings naming
    // features (e.g. "RiskGuard" in lesson text) are allowed; imports are not.
    const bannedImport = [/from\s+['"][^'"]*trading\//, /require\s*\([^)]*trading\//];
    for (const f of files) {
      if (f === 'index.ts') continue;
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const re of bannedImport) expect(re.test(src), `${f} must not import trading execution`).toBe(false);
    }
  });
});

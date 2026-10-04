import { describe, expect, it } from 'vitest';
import {
  canPostToCohort,
  enroll,
  hasAccess,
  summarizeCohort,
  type Cohort,
} from '../TrainingFoundation';

const cohort: Cohort = {
  id: 'coh-q1',
  orgId: 'org-acme',
  title: 'VN Beginnings Cohort',
  curriculumLessonIds: ['les-market-101', 'les-price-volume-102'],
  startsAt: '2026-01-01',
  endsAt: '2026-03-31',
  instructorIds: ['inst-1'],
};

describe('enrollment windows (explicit asOfDate)', () => {
  it('enrolls inside the window; rejects outside; rejects bad ids', () => {
    expect(enroll(cohort, 'u1', '2026-02-01').ok).toBe(true);
    expect(enroll(cohort, 'u1', '2025-12-31').ok).toBe(false);
    expect(enroll(cohort, 'u1', '2026-04-01').ok).toBe(false);
    expect(enroll(cohort, '  ', '2026-02-01').ok).toBe(false);
    expect(enroll({ ...cohort, startsAt: '2026-05-01' }, 'u1', '2026-02-01').ok).toBe(false);
  });
  it('enrollment is deterministic', () => {
    expect(enroll(cohort, 'u1', '2026-02-01')).toEqual(enroll(cohort, 'u1', '2026-02-01'));
  });
});

describe('cohort progress + completion', () => {
  it('aggregates per-learner progress; dropped learners excluded', () => {
    const s = summarizeCohort(
      cohort,
      [
        { cohortId: 'coh-q1', learnerId: 'u1', enrolledAt: '2026-01-05', status: 'ENROLLED' },
        { cohortId: 'coh-q1', learnerId: 'u2', enrolledAt: '2026-01-06', status: 'DROPPED' },
        { cohortId: 'coh-other', learnerId: 'u3', enrolledAt: '2026-01-06', status: 'ENROLLED' },
      ],
      { u1: ['les-market-101'] },
    );
    expect(s.enrolledCount).toBe(1);
    expect(s.perLearner[0]).toMatchObject({ learnerId: 'u1', completed: 1, total: 2, percent: 50, done: false });
    expect(s.completedCount).toBe(0);
    expect(s.averagePercent).toBe(50);
  });
  it('empty cohort degrades to zeros (fail-safe)', () => {
    const s = summarizeCohort(cohort, [], {});
    expect(s).toMatchObject({ averagePercent: 0, completedCount: 0, enrolledCount: 0 });
  });
});

describe('access tiers + community gate', () => {
  it('higher tiers satisfy lower requirements; unknown tiers never grant', () => {
    expect(hasAccess(['COHORT'], 'FREE')).toBe(true);
    expect(hasAccess(['FREE'], 'COHORT')).toBe(false);
    expect(hasAccess([], 'FREE')).toBe(false);
    expect(hasAccess(['BOGUS' as never], 'FREE')).toBe(false);
  });
  it('only enrolled (not dropped) learners may post', () => {
    const en = [{ cohortId: 'coh-q1', learnerId: 'u1', enrolledAt: '2026-01-05', status: 'ENROLLED' as const }];
    expect(canPostToCohort(en, 'coh-q1', 'u1')).toBe(true);
    expect(canPostToCohort(en, 'coh-q1', 'u2')).toBe(false);
    expect(canPostToCohort([{ ...en[0], status: 'DROPPED' as const }], 'coh-q1', 'u1')).toBe(false);
  });
});

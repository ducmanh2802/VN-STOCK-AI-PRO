// TrainingFoundation — LEARNING-15 customer training / community foundation.
// Pure domain + deterministic rules. No social network, no payments, no auth:
// explicit learner/cohort boundaries with userId-ready ids, enrollment windows
// via explicit asOfDate (never the wall clock), and tiered access attach points.
export interface Organization {
  id: string;
  name: string;
}

export interface Cohort {
  id: string;
  orgId: string;
  title: string;
  curriculumLessonIds: string[];
  startsAt: string;
  endsAt: string;
  instructorIds: string[];
}

export type EnrollmentStatus = 'ENROLLED' | 'COMPLETED' | 'DROPPED';

export interface Enrollment {
  cohortId: string;
  learnerId: string;
  enrolledAt: string;
  status: EnrollmentStatus;
}

export interface LearnerProfile {
  learnerId: string;
  displayName: string | null;
}

export type AccessTier = 'FREE' | 'PRO' | 'COURSE' | 'CERTIFICATION' | 'COHORT' | 'MENTORING' | 'B2B';

const TIER_RANK: Record<AccessTier, number> = {
  FREE: 0,
  PRO: 1,
  COURSE: 2,
  CERTIFICATION: 3,
  COHORT: 4,
  MENTORING: 5,
  B2B: 6,
};

function nonEmpty(s: string | null | undefined): boolean {
  return !!s && s.trim().length > 0;
}

export interface EnrollResult {
  ok: boolean;
  reason: string;
  enrollment: Enrollment | null;
}

/** Windowed enrollment (explicit asOfDate; fail-closed outside window or on bad ids). */
export function enroll(cohort: Cohort, learnerId: string, asOfDate: string): EnrollResult {
  if (!cohort || !nonEmpty(cohort.id) || !nonEmpty(learnerId)) {
    return { ok: false, reason: 'Invalid cohort or learner id.', enrollment: null };
  }
  if (!nonEmpty(cohort.startsAt) || !nonEmpty(cohort.endsAt) || cohort.startsAt > cohort.endsAt) {
    return { ok: false, reason: 'Cohort window is invalid.', enrollment: null };
  }
  if (asOfDate < cohort.startsAt) return { ok: false, reason: 'Enrollment opens at cohort start.', enrollment: null };
  if (asOfDate > cohort.endsAt) return { ok: false, reason: 'Cohort has ended.', enrollment: null };
  return {
    ok: true,
    reason: 'Enrolled.',
    enrollment: { cohortId: cohort.id, learnerId: learnerId.trim(), enrolledAt: asOfDate, status: 'ENROLLED' },
  };
}

export interface LearnerCohortProgress {
  learnerId: string;
  completed: number;
  total: number;
  percent: number;
  done: boolean;
}

export interface CohortSummary {
  perLearner: LearnerCohortProgress[];
  averagePercent: number;
  completedCount: number;
  enrolledCount: number;
}

/** Cohort progress aggregation over explicit per-learner completion sets (deterministic). */
export function summarizeCohort(
  cohort: Cohort,
  enrollments: Enrollment[],
  completedByLearner: Record<string, string[]>,
): CohortSummary {
  const total = cohort.curriculumLessonIds.length;
  const active = enrollments.filter((e) => e && e.cohortId === cohort.id && e.status !== 'DROPPED');
  const perLearner = active
    .map((e) => {
      const doneSet = new Set(completedByLearner[e.learnerId] ?? []);
      const completed = cohort.curriculumLessonIds.filter((id) => doneSet.has(id)).length;
      const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
      return { learnerId: e.learnerId, completed, total, percent, done: total > 0 && completed === total };
    })
    .sort((a, b) => a.learnerId.localeCompare(b.learnerId));
  const averagePercent =
    perLearner.length > 0 ? Math.round(perLearner.reduce((s, p) => s + p.percent, 0) / perLearner.length) : 0;
  return {
    perLearner,
    averagePercent,
    completedCount: perLearner.filter((p) => p.done).length,
    enrolledCount: perLearner.length,
  };
}

/** Tiered access attach point (future monetization hooks onto this ordering). */
export function hasAccess(grants: AccessTier[], required: AccessTier): boolean {
  const best = Math.max(-1, ...grants.map((g) => TIER_RANK[g] ?? -1));
  return best >= (TIER_RANK[required] ?? Number.POSITIVE_INFINITY);
}

/** Community posting eligibility (foundation only: enrollment gate; moderation deferred). */
export function canPostToCohort(enrollments: Enrollment[], cohortId: string, learnerId: string): boolean {
  return enrollments.some(
    (e) => e && e.cohortId === cohortId && e.learnerId === learnerId && e.status === 'ENROLLED',
  );
}

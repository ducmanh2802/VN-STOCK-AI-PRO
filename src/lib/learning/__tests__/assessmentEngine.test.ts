import { describe, expect, it } from 'vitest';
import { ASSESSMENTS, CATALOG_VERSION } from '../catalog';
import {
  checkEligibility,
  gradeAssessment,
  issueCertificate,
  transitionCertificate,
} from '../AssessmentEngine';

const stamp = '2026-10-04T00:00:00.000Z';
const a = ASSESSMENTS[0];
// correct option ids / numerics per catalog
const CORRECT: Record<string, string> = {
  'ex-stock-def-01': 'a',
  'ex-stale-01': 'b',
  'ex-band-01': 'a',
  'ex-margin-01': '25',
  'ex-ttm-debug-01': 'b',
  'ex-size-01': '1000',
  'ex-decision-01': 'a',
};

describe('assessment catalog validity', () => {
  it('ships one published versioned assessment with resolvable questions', () => {
    expect(ASSESSMENTS.length).toBeGreaterThanOrEqual(1);
    expect(a.status).toBe('PUBLISHED');
    expect(a.exerciseIds.length).toBe(7);
    expect(a.passThreshold).toBeGreaterThan(0.5);
  });
});

describe('grading (§11.4)', () => {
  it('perfect paper passes with competency map', () => {
    const r = gradeAssessment(a, { ...CORRECT }, stamp);
    expect(r.score).toBe(7);
    expect(r.passed).toBe(true);
    expect(r.catalogVersion).toBe(CATALOG_VERSION);
    expect(r.assessmentVersion).toBe(a.version);
  });
  it('safety-gate concept failure fails the whole paper', () => {
    const r = gradeAssessment(a, { ...CORRECT, 'ex-stale-01': 'a' }, stamp);
    expect(r.passed).toBe(false);
    expect(r.failedCompetencies).toContain('c-data-risk');
  });
  it('unanswered counts as 0 explicitly (fail-closed, not silent)', () => {
    const r = gradeAssessment(a, {}, stamp);
    expect(r.score).toBe(0);
    expect(r.passed).toBe(false);
  });
  it('invalid answers never crash and score 0', () => {
    const r = gradeAssessment(a, { 'ex-margin-01': 'not-a-number' }, stamp);
    expect(r.score).toBe(0);
    expect(r.passed).toBe(false);
  });
  it('grading is deterministic', () => {
    expect(gradeAssessment(a, { ...CORRECT }, stamp)).toEqual(gradeAssessment(a, { ...CORRECT }, stamp));
  });
});

describe('attempt versioning + retakes', () => {
  it('attempts pin versions; stale-version passes do not satisfy eligibility', () => {
    const stalePass = gradeAssessment(a, { ...CORRECT }, stamp);
    const stale = { ...stalePass, catalogVersion: '0.0.0-legacy' };
    const e = checkEligibility({
      completedLessonIds: ['l1'],
      requiredLessonIds: ['l1'],
      assessmentAttempts: [stale],
      requiredProjectIds: [],
      completedProjectIds: [],
    });
    expect(e.eligible).toBe(false);
  });
  it('retake history is kept; current-version pass satisfies', () => {
    const fail = gradeAssessment(a, {}, stamp);
    const pass = gradeAssessment(a, { ...CORRECT }, stamp);
    const e = checkEligibility({
      completedLessonIds: ['l1'],
      requiredLessonIds: ['l1'],
      assessmentAttempts: [fail, pass],
      requiredProjectIds: [],
      completedProjectIds: [],
    });
    expect(e.eligible).toBe(true);
  });
});

describe('eligibility + certification', () => {
  const passAttempt = gradeAssessment(a, { ...CORRECT }, stamp);
  const full = {
    completedLessonIds: ['l1', 'l2'],
    requiredLessonIds: ['l1', 'l2'],
    assessmentAttempts: [passAttempt],
    requiredProjectIds: ['prj-company-101'],
    completedProjectIds: ['prj-company-101'],
  };
  it('eligibility names every missing piece', () => {
    const e = checkEligibility({ ...full, completedProjectIds: [] });
    expect(e.eligible).toBe(false);
    expect(e.missing).toContain('project:prj-company-101');
  });
  it('no evidence -> no certificate (fail-closed)', () => {
    expect(issueCertificate('asmt-beginner-01', [], false, stamp)).toBeNull();
    expect(issueCertificate('asmt-beginner-01', [], true, stamp)).toBeNull();
  });
  it('eligible input issues a deterministic educational certificate', () => {
    const e = checkEligibility(full);
    const c1 = issueCertificate('asmt-beginner-01', ['ev:1'], e.eligible, stamp);
    const c2 = issueCertificate('asmt-beginner-01', ['ev:1'], e.eligible, stamp);
    expect(c1).toEqual(c2);
    expect(c1?.status).toBe('ISSUED');
    expect(c1?.evidence.join(' ')).toContain('ev:1');
  });
  it('certificate transitions are explicit; illegal ones are no-ops', () => {
    const e = checkEligibility(full);
    const c = issueCertificate('asmt-beginner-01', ['ev:1'], e.eligible, stamp)!;
    expect(transitionCertificate(c, 'REVOKED').status).toBe('REVOKED');
    expect(transitionCertificate(c, 'ELIGIBLE').status).toBe('ISSUED'); // no-op
    const revoked = transitionCertificate(c, 'REVOKED');
    expect(transitionCertificate(revoked, 'ISSUED').status).toBe('REVOKED'); // terminal
  });
});

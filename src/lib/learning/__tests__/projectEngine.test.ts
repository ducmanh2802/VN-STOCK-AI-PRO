import { describe, expect, it } from 'vitest';
import { CATALOG_VERSION, PROJECTS } from '../catalog';
import {
  MIN_THESIS_CHARS,
  checkProjectPrereqs,
  isTerminalProjectStatus,
  projectStatusOf,
  scoreProject,
} from '../ProjectEngine';

const thesis = 'SIMULATED sandbox: revenue grew while margin held; TTM comparable; UNKNOWN: forward guidance.';

describe('project catalog validity', () => {
  it('ships exactly one published beginner sandbox project', () => {
    expect(PROJECTS.length).toBeGreaterThanOrEqual(1);
    const p = PROJECTS[0];
    expect(p.status).toBe('PUBLISHED');
    expect(p.level).toBe('Beginner');
    expect(p.evidenceRequired.length).toBeGreaterThanOrEqual(4);
  });
});

describe('project self-check scoring', () => {
  const p = PROJECTS[0];
  const full = [...p.evidenceRequired];
  it('complete evidence + thesis passes with teaching feedback', () => {
    const r = scoreProject(p, full, thesis);
    expect(r.correct).toBe(true);
    expect(r.feedback).toContain('Why:');
    expect(r.feedback).toContain('Expected reasoning:');
  });
  it('missing evidence fails and names what is missing', () => {
    const r = scoreProject(p, full.slice(0, 2), thesis);
    expect(r.correct).toBe(false);
    expect(r.feedback).toContain('Missing evidence:');
  });
  it('short thesis fails with length guidance', () => {
    const r = scoreProject(p, full, 'too short');
    expect(r.correct).toBe(false);
    expect(r.feedback).toContain(`${MIN_THESIS_CHARS}`);
  });
  it('scoring is deterministic', () => {
    expect(scoreProject(p, full, thesis)).toEqual(scoreProject(p, full, thesis));
  });
});

describe('project lifecycle (§10.4)', () => {
  const p = PROJECTS[0];
  const rec = (over: Record<string, unknown> = {}) => ({
    projectId: p.id,
    version: CATALOG_VERSION,
    submissions: 0,
    passed: false,
    completed: false,
    updatedAt: '2026-10-04T00:00:00.000Z',
    ...over,
  });
  it('null record -> NOT_STARTED; submissions without pass -> REVISION_REQUIRED', () => {
    expect(projectStatusOf(null)).toBe('NOT_STARTED');
    expect(projectStatusOf(rec({ submissions: 2 }))).toBe('REVISION_REQUIRED');
  });
  it('passed -> PASSED; completed -> COMPLETED; terminal set is exact', () => {
    expect(projectStatusOf(rec({ submissions: 1, passed: true }))).toBe('PASSED');
    expect(projectStatusOf(rec({ submissions: 1, passed: true, completed: true }))).toBe('COMPLETED');
    expect(isTerminalProjectStatus('COMPLETED')).toBe(true);
    expect(isTerminalProjectStatus('FAILED')).toBe(true);
    expect(isTerminalProjectStatus('PASSED')).toBe(false);
  });
  it('versioning: stale pinned version forces REVISION_REQUIRED, history never mutates', () => {
    const stale = rec({ submissions: 3, passed: true, completed: true, version: '0.0.0-legacy' });
    expect(projectStatusOf(stale)).toBe('REVISION_REQUIRED');
    expect(stale.passed).toBe(true); // record itself untouched
  });
  it('prerequisite enforcement names missing lessons', () => {
    expect(checkProjectPrereqs(p, [])).toEqual(p.requiresLessonIds);
    expect(checkProjectPrereqs(p, [...p.requiresLessonIds])).toEqual([]);
    expect(checkProjectPrereqs(p, ['les-statements-104'])).toContain('les-risk-105');
  });
  it('invalid project submission fails closed at service boundary', async () => {
    const { LearningService } = await import('../../../services/learning/LearningService');
    expect(LearningService.getProjectDetail('nope')).toBeNull();
    expect(LearningService.submitProject('nope', [], 'x')).toBeNull();
    expect(LearningService.completeProjectStep('nope')).toBe(false);
  });
});

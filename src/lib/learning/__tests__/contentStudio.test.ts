import { describe, expect, it } from 'vitest';
import {
  nextVersion,
  publishContent,
  transitionContent,
  validateAssessment,
  validateCatalog,
  validateExercise,
  validateLesson,
  validatePath,
  validateProject,
} from '../ContentStudio';

describe('lifecycle transitions', () => {
  it('DRAFT -> REVIEW -> PUBLISHED -> ARCHIVED; illegal moves are no-ops', () => {
    expect(transitionContent('DRAFT', 'SUBMIT_REVIEW')).toBe('REVIEW');
    expect(transitionContent('REVIEW', 'PUBLISH')).toBe('PUBLISHED');
    expect(transitionContent('PUBLISHED', 'ARCHIVE')).toBe('ARCHIVED');
    expect(transitionContent('DRAFT', 'PUBLISH')).toBe('DRAFT');
    expect(transitionContent('ARCHIVED', 'PUBLISH')).toBe('ARCHIVED');
    expect(transitionContent('PUBLISHED', 'REVERT_DRAFT')).toBe('PUBLISHED');
  });
  it('nextVersion patch-bumps; unparseable gets a draft suffix', () => {
    expect(nextVersion('1.0.0-mvp')).toBe('1.0.1-mvp');
    expect(nextVersion('2.3.9')).toBe('2.3.10');
    expect(nextVersion('weird')).toBe('weird-draft');
  });
});

describe('catalog validation (real content passes)', () => {
  it('full catalog validates clean', () => {
    expect(validateCatalog()).toEqual([]);
  });
  it('every shipped object validates individually', () => {
    expect(validateLesson('les-market-101')).toEqual([]);
    expect(validateExercise('ex-stale-01')).toEqual([]);
    expect(validateProject('prj-company-101')).toEqual([]);
    expect(validateAssessment('asmt-beginner-01')).toEqual([]);
    expect(validatePath('path-beginner')).toEqual([]);
  });
  it('unknown ids fail closed with UNKNOWN_REF', () => {
    for (const fn of [validateLesson, validateExercise, validateProject, validateAssessment, validatePath]) {
      const issues = fn('nope-missing');
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].code).toBe('UNKNOWN_REF');
    }
  });
});

describe('publish gate fails closed', () => {
  it('valid content publishes; unknown kind/id never publishes', () => {
    expect(publishContent('lesson', 'les-market-101')).toMatchObject({ ok: true, errors: [] });
    expect(publishContent('exercise', 'ex-stale-01').ok).toBe(true);
    expect(publishContent('wizard', 'les-market-101').ok).toBe(false);
    const bad = publishContent('lesson', 'les-ghost');
    expect(bad.ok).toBe(false);
    expect(bad.errors.length).toBeGreaterThan(0);
  });
  it('publish decisions are deterministic', () => {
    expect(publishContent('project', 'prj-company-101')).toEqual(publishContent('project', 'prj-company-101'));
  });
});

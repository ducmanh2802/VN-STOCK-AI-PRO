// ProjectEngine — LEARNING-10 sandboxed project self-check. Pure + deterministic.
// No randomness, no Date.now, no IO, no trading imports. Sandbox only:
// projects can never touch trading execution; evidence is learner-attested.
import { CATALOG_VERSION } from './catalog';
import type { Project, ProjectCheckResult, ProjectRecord, ProjectStatus } from './types';

export const MIN_THESIS_CHARS = 24;

export function scoreProject(project: Project, ticked: string[], thesis: string): ProjectCheckResult {
  const maxScore = 1;
  const missing = project.evidenceRequired.filter((e) => !ticked.includes(e));
  const text = (thesis || '').trim();
  const ok = missing.length === 0 && text.length >= MIN_THESIS_CHARS;
  return { score: ok ? 1 : 0, maxScore, correct: ok, feedback: buildProjectFeedback(project, missing, text, ok) };
}

export function buildProjectFeedback(
  project: Project,
  missing: string[],
  thesis: string,
  correct: boolean,
): string {
  const head = correct ? 'Correct.' : 'Not quite yet.';
  const parts = [
    head,
    `Why: ${project.rubric}`,
    `Expected reasoning: walk Screener → StockDetail → RiskCenter, state one FACT and one UNKNOWN, then stop (no advice).`,
    project.conceptIds.length > 0 ? `Concept: ${project.conceptIds.join(', ')}.` : '',
    project.systemFeature ? `See in platform: ${project.systemFeature}.` : '',
    missing.length > 0
      ? `Missing evidence: ${missing.join(', ')}.`
      : thesis.trim().length < MIN_THESIS_CHARS
        ? `Thesis too short (${thesis.trim().length}/${MIN_THESIS_CHARS} chars): state one observation and one UNKNOWN.`
        : 'Thesis accepted: evidence complete.',
    'Next: continue the path recommendation.',
  ];
  return parts.filter(Boolean).join(' ');
}

/** Prerequisite enforcement: lessons required before submission (fail-closed). */
export function checkProjectPrereqs(project: Project, completedLessonIds: string[]): string[] {
  const done = new Set(completedLessonIds);
  return (project.requiresLessonIds ?? []).filter((id) => !done.has(id));
}

/**
 * Deterministic lifecycle derivation. Version-pinned records never mutate:
 * a record pinned to an older catalog version returns REVISION_REQUIRED
 * (revalidate) instead of inheriting PASSED/COMPLETED.
 */
export function projectStatusOf(record: ProjectRecord | null, currentVersion: string = CATALOG_VERSION): ProjectStatus {
  if (!record) return 'NOT_STARTED';
  if (record.version !== currentVersion) return 'REVISION_REQUIRED';
  if (record.completed) return 'COMPLETED';
  if (record.passed) return 'PASSED';
  if (record.submissions > 0) return 'REVISION_REQUIRED';
  return 'IN_PROGRESS';
}

/** SUBMITTED/UNDER_REVIEW/FAILED are explicit review-track states (instructor lane, backend). */
export function isTerminalProjectStatus(s: ProjectStatus): boolean {
  return s === 'COMPLETED' || s === 'FAILED';
}

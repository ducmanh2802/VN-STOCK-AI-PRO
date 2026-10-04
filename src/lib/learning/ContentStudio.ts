// ContentStudio — LEARNING-14 instructor/admin authoring foundation. Pure + deterministic.
// Lifecycle: DRAFT -> REVIEW -> PUBLISHED -> ARCHIVED (linear; illegal moves are no-ops).
// Published versions are immutable: editing published content requires nextVersion().
// publish() fails closed: invalid content is never publishable.
import {
  ASSESSMENTS,
  CONCEPTS,
  EXERCISES,
  LABS,
  LESSONS,
  PATHS,
  PREREQUISITES,
  PROJECTS,
  TOPICS,
} from './catalog';
import type { ContentStatus } from './types';
export type StudioTransition = 'SUBMIT_REVIEW' | 'PUBLISH' | 'ARCHIVE' | 'REVERT_DRAFT';

const TRANSITIONS: Record<ContentStatus, Partial<Record<StudioTransition, ContentStatus>>> = {
  DRAFT: { SUBMIT_REVIEW: 'REVIEW' },
  REVIEW: { PUBLISH: 'PUBLISHED', REVERT_DRAFT: 'DRAFT' },
  PUBLISHED: { ARCHIVE: 'ARCHIVED' },
  ARCHIVED: {},
};

/** Lifecycle transition; illegal moves return the input unchanged (fail-closed). */
export function transitionContent(status: ContentStatus, event: StudioTransition): ContentStatus {
  return TRANSITIONS[status]?.[event] ?? status;
}

/** Patch-bump a catalog-style version (1.0.0-mvp -> 1.0.1-mvp); unparseable -> '-draft'. */
export function nextVersion(current: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)(.*)$/.exec((current || '').trim());
  if (!m) return `${current || '0.0.0'}-draft`;
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}${m[4]}`;
}

export interface StudioIssue {
  object: string;
  code:
    | 'REQUIRED_FIELD'
    | 'UNKNOWN_REF'
    | 'PREREQ_UNKNOWN'
    | 'PREREQ_CYCLE'
    | 'GRAPH_UNLINKED'
    | 'ASSESSMENT_UNMAPPED'
    | 'VERSION_STALE';
  detail: string;
}

function req(issues: StudioIssue[], object: string, cond: boolean, detail: string): void {
  if (!cond) issues.push({ object, code: 'REQUIRED_FIELD', detail });
}

export function validateLesson(id: string): StudioIssue[] {
  const issues: StudioIssue[] = [];
  const l = LESSONS.find((x) => x.id === id);
  if (!l) return [{ object: id, code: 'UNKNOWN_REF', detail: 'lesson not in catalog' }];
  req(issues, id, l.title.trim().length > 0, 'title required');
  req(issues, id, l.objectives.length > 0, 'objectives required');
  req(issues, id, l.sections.length > 0, 'sections required');
  req(issues, id, l.conceptIds.length > 0, 'conceptIds required');
  req(issues, id, TOPICS.some((t) => t.id === l.topicId), `unknown topic ${l.topicId}`);
  for (const c of l.conceptIds) {
    if (!CONCEPTS.some((x) => x.id === c)) issues.push({ object: id, code: 'UNKNOWN_REF', detail: `concept ${c}` });
  }
  if ((l.systemFeatureRefs ?? []).length === 0) {
    issues.push({ object: id, code: 'GRAPH_UNLINKED', detail: 'no systemFeatureRefs (unlinked from platform)' });
  }
  return issues;
}

export function validateExercise(id: string): StudioIssue[] {
  const issues: StudioIssue[] = [];
  const e = EXERCISES.find((x) => x.id === id);
  if (!e) return [{ object: id, code: 'UNKNOWN_REF', detail: 'exercise not in catalog' }];
  req(issues, id, e.question.trim().length > 0, 'question required');
  req(issues, id, e.explanation.trim().length > 0, 'explanation required');
  req(issues, id, e.expectedReasoning.trim().length > 0, 'expectedReasoning required');
  if (!LESSONS.some((l) => l.id === e.lessonId)) issues.push({ object: id, code: 'UNKNOWN_REF', detail: `lesson ${e.lessonId}` });
  for (const c of e.conceptIds) {
    if (!CONCEPTS.some((x) => x.id === c)) issues.push({ object: id, code: 'UNKNOWN_REF', detail: `concept ${c}` });
  }
  return issues;
}

export function validateProject(id: string): StudioIssue[] {
  const issues: StudioIssue[] = [];
  const p = PROJECTS.find((x) => x.id === id);
  if (!p) return [{ object: id, code: 'UNKNOWN_REF', detail: 'project not in catalog' }];
  req(issues, id, p.steps.length > 0, 'steps required');
  req(issues, id, p.evidenceRequired.length > 0, 'evidenceRequired required');
  req(issues, id, p.rubric.trim().length > 0, 'rubric required');
  for (const c of p.conceptIds) {
    if (!CONCEPTS.some((x) => x.id === c)) issues.push({ object: id, code: 'UNKNOWN_REF', detail: `concept ${c}` });
  }
  for (const l of p.requiresLessonIds ?? []) {
    if (!LESSONS.some((x) => x.id === l)) issues.push({ object: id, code: 'PREREQ_UNKNOWN', detail: `lesson ${l}` });
  }
  return issues;
}

export function validateAssessment(id: string): StudioIssue[] {
  const issues: StudioIssue[] = [];
  const a = ASSESSMENTS.find((x) => x.id === id);
  if (!a) return [{ object: id, code: 'UNKNOWN_REF', detail: 'assessment not in catalog' }];
  req(issues, id, a.exerciseIds.length > 0, 'exerciseIds required');
  req(issues, id, a.passThreshold > 0 && a.passThreshold <= 1, 'passThreshold in (0,1]');
  for (const exId of a.exerciseIds) {
    const ex = EXERCISES.find((x) => x.id === exId);
    if (!ex) {
      issues.push({ object: id, code: 'UNKNOWN_REF', detail: `exercise ${exId}` });
      continue;
    }
    if (ex.status !== 'PUBLISHED') issues.push({ object: id, code: 'ASSESSMENT_UNMAPPED', detail: `unpublished exercise ${exId}` });
  }
  return issues;
}

export function validatePath(id: string): StudioIssue[] {
  const issues: StudioIssue[] = [];
  const p = PATHS.find((x) => x.id === id);
  if (!p) return [{ object: id, code: 'UNKNOWN_REF', detail: 'path not in catalog' }];
  for (const item of p.items) {
    const ok =
      item.kind === 'lesson'
        ? LESSONS.some((l) => l.id === item.refId)
        : item.kind === 'lab'
          ? LABS.some((l) => l.id === item.refId)
          : item.kind === 'exercise'
            ? EXERCISES.some((e) => e.id === item.refId)
            : false;
    if (!ok) issues.push({ object: id, code: 'UNKNOWN_REF', detail: `${item.kind} ${item.refId}` });
  }
  return issues;
}

/** Full-catalog validation: every object + prereq acyclicity (bounded DFS). */
export function validateCatalog(): StudioIssue[] {
  const issues: StudioIssue[] = [];
  for (const l of LESSONS) issues.push(...validateLesson(l.id));
  for (const e of EXERCISES) issues.push(...validateExercise(e.id));
  for (const p of PROJECTS) issues.push(...validateProject(p.id));
  for (const a of ASSESSMENTS) issues.push(...validateAssessment(a.id));
  for (const p of PATHS) issues.push(...validatePath(p.id));
  for (const [lessonId, reqs] of Object.entries(PREREQUISITES)) {
    if (!LESSONS.some((l) => l.id === lessonId)) issues.push({ object: lessonId, code: 'PREREQ_UNKNOWN', detail: 'prereq key not a lesson' });
    for (const r of reqs) {
      if (!LESSONS.some((l) => l.id === r)) issues.push({ object: lessonId, code: 'PREREQ_UNKNOWN', detail: `prereq ${r}` });
    }
  }
  // Cycle check (iterative, bounded).
  const succ = new Map<string, string[]>();
  for (const [k, v] of Object.entries(PREREQUISITES)) succ.set(k, [...v]);
  const color = new Map<string, number>();
  const visit = (start: string): boolean => {
    const stack: [string, number][] = [[start, 0]];
    while (stack.length > 0) {
      const [node, idx] = stack[stack.length - 1];
      if ((color.get(node) ?? 0) === 0) color.set(node, 1);
      const next = succ.get(node) ?? [];
      if (idx < next.length) {
        stack[stack.length - 1][1] = idx + 1;
        const m = next[idx];
        const c = color.get(m) ?? 0;
        if (c === 1) return true;
        if (c === 0) stack.push([m, 0]);
      } else {
        color.set(node, 2);
        stack.pop();
      }
    }
    return false;
  };
  for (const id of [...succ.keys()].sort()) {
    if ((color.get(id) ?? 0) === 0 && visit(id)) {
      issues.push({ object: id, code: 'PREREQ_CYCLE', detail: 'prerequisite cycle' });
      break;
    }
  }
  return issues;
}

export interface PublishResult {
  ok: boolean;
  errors: StudioIssue[];
}

/** Publish gate: fails closed on ANY issue. */
export function publishContent(kind: string, id: string): PublishResult {
  let errors: StudioIssue[] = [];
  if (kind === 'lesson') errors = validateLesson(id);
  else if (kind === 'exercise') errors = validateExercise(id);
  else if (kind === 'project') errors = validateProject(id);
  else if (kind === 'assessment') errors = validateAssessment(id);
  else if (kind === 'path') errors = validatePath(id);
  else errors = [{ object: id, code: 'UNKNOWN_REF', detail: `unknown kind ${kind}` }];
  return { ok: errors.length === 0, errors };
}

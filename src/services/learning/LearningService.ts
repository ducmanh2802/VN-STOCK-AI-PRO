// LearningService — orchestration over catalog + progress + engines.
// Client-only for MVP (DB-ready interface, no trading imports).
import {
  ASSESSMENTS,
  CATALOG_VERSION,
  CONCEPTS,
  EXERCISES,
  LABS,
  LESSONS,
  PATHS,
  PROJECTS,
  getAssessment,
  getExercise,
  getExercisesForLesson,
  getLesson,
  getProject,
} from '../../lib/learning/catalog';
import {
  checkEligibility,
  gradeAssessment,
  issueCertificate,
} from '../../lib/learning/AssessmentEngine';
import type { AssessmentAttempt, Certificate } from '../../lib/learning/types';
import { checkProjectPrereqs, projectStatusOf, scoreProject } from '../../lib/learning/ProjectEngine';
import type {
  ConceptMastery,
  ProjectCheckResult,
  ProjectStatus,
  Recommendation,
  ScoredResult,
} from '../../lib/learning/types';
import { computeMastery } from '../../lib/learning/MasteryEngine';
import { recommendNext, type LearnerSnapshot } from '../../lib/learning/LearningRecommendationEngine';
import { recommendAdaptive, type AdaptiveRecommendation } from '../../lib/learning/AdaptiveLearningEngine';
import { scoreExercise } from '../../lib/learning/ExerciseScoringEngine';
import { progressStore } from '../../lib/learning/ProgressStore';

function snapshot(): LearnerSnapshot {
  const completedLessonIds = progressStore.getCompletedLessons();
  const attemptsByExercise: LearnerSnapshot['attemptsByExercise'] = {};
  for (const ex of EXERCISES) {
    const list = progressStore.getAttempts(ex.id);
    if (list.length > 0) attemptsByExercise[ex.id] = list;
  }
  return { completedLessonIds, attemptsByExercise, completedLabIds: progressStore.getCompletedLabs() };
}

function computeEligibility(assessmentId: string): { eligible: boolean; missing: string[] } {
  const path = PATHS.find((p) => p.id === 'path-beginner');
  const requiredLessonIds = (path?.items ?? [])
    .filter((i) => i.kind === 'lesson')
    .map((i) => i.refId);
  return checkEligibility({
    completedLessonIds: progressStore.getCompletedLessons(),
    requiredLessonIds,
    assessmentAttempts: progressStore.getAssessmentAttempts(assessmentId),
    requiredProjectIds: ['prj-company-101'],
    completedProjectIds: progressStore.getCompletedProjects(),
  });
}

export const LearningService = {
  listPaths() {
    return PATHS.filter((p) => p.status === 'PUBLISHED');
  },
  listLessons() {
    return LESSONS.filter((l) => l.status === 'PUBLISHED');
  },
  listLabs() {
    return LABS.filter((l) => l.status === 'PUBLISHED');
  },
  getLessonDetail(lessonId: string) {
    const lesson = getLesson(lessonId);
    if (!lesson || lesson.status !== 'PUBLISHED') return null;
    return { lesson, exercises: getExercisesForLesson(lessonId) };
  },
  completeLesson(lessonId: string) {
    return progressStore.completeLesson(lessonId);
  },
  submitExercise(exerciseId: string, answer: string | string[]): (ScoredResult & { exerciseId: string }) | null {
    const ex = EXERCISES.find((e) => e.id === exerciseId);
    if (!ex || ex.status !== 'PUBLISHED') return null;
    const result = scoreExercise(ex, answer);
    progressStore.recordAttempt({
      exerciseId,
      answer,
      score: result.score,
      maxScore: result.maxScore,
      correct: result.correct,
      attemptedAt: new Date().toISOString(),
    });
    return { ...result, exerciseId };
  },
  getMastery(): ConceptMastery[] {
    const snap = snapshot();
    const lessonToConcepts: Record<string, string[]> = {};
    for (const l of LESSONS) lessonToConcepts[l.id] = l.conceptIds;
    return computeMastery(snap.attemptsByExercise, snap.completedLessonIds, lessonToConcepts);
  },
  getRecommendation(pathId: string): Recommendation {
    return recommendNext(pathId, snapshot());
  },
  getAdaptiveRecommendation(pathId: string): AdaptiveRecommendation {
    return recommendAdaptive(pathId, snapshot());
  },
  getProgress(pathId: string): { completedLessons: number; totalLessons: number; percent: number } {
    const path = PATHS.find((p) => p.id === pathId);
    const done = new Set(progressStore.getCompletedLessons());
    if (!path) return { completedLessons: 0, totalLessons: 0, percent: 0 };
    const lessons = path.items.filter((i) => i.kind === 'lesson');
    const c = lessons.filter((i) => done.has(i.refId)).length;
    return { completedLessons: c, totalLessons: lessons.length, percent: lessons.length ? Math.round((c / lessons.length) * 100) : 0 };
  },
  listConcepts() {
    return CONCEPTS;
  },
  listProjects() {
    return PROJECTS.filter((p) => p.status === 'PUBLISHED');
  },
  getProjectDetail(projectId: string) {
    const project = getProject(projectId);
    if (!project || project.status !== 'PUBLISHED') return null;
    const record = progressStore.getProjectRecord(projectId);
    const status: ProjectStatus = record
      ? projectStatusOf(record)
      : progressStore.getCompletedProjects().includes(projectId)
        ? projectStatusOf({ projectId, version: CATALOG_VERSION, submissions: 1, passed: true, completed: true, updatedAt: '' })
        : 'NOT_STARTED';
    return {
      project,
      completed: progressStore.getCompletedProjects().includes(projectId),
      status,
      submissions: record?.submissions ?? 0,
      missingPrereqs: checkProjectPrereqs(project, progressStore.getCompletedLessons()),
    };
  },
  submitProject(projectId: string, ticked: string[], thesis: string): (ProjectCheckResult & { projectId: string }) | null {
    const project = getProject(projectId);
    if (!project || project.status !== 'PUBLISHED') return null;
    const missing = checkProjectPrereqs(project, progressStore.getCompletedLessons());
    if (missing.length > 0) {
      return {
        score: 0,
        maxScore: 1,
        correct: false,
        feedback: `Blocked: complete prerequisite lesson(s) ${missing.join(', ')} before submitting. Evidence first, then application.`,
        projectId,
      };
    }
    const result = scoreProject(project, ticked, thesis);
    const prev = progressStore.getProjectRecord(projectId);
    progressStore.saveProjectRecord({
      projectId,
      version: prev?.version ?? CATALOG_VERSION,
      submissions: (prev?.submissions ?? 0) + 1,
      passed: (prev?.passed ?? false) || result.correct,
      completed: prev?.completed ?? false,
      updatedAt: new Date().toISOString(),
    });
    return { ...result, projectId };
  },
  completeProjectStep(projectId: string): boolean {
    const project = getProject(projectId);
    if (!project || project.status !== 'PUBLISHED') return false;
    const record = progressStore.getProjectRecord(projectId);
    if (!record || !record.passed || record.version !== CATALOG_VERSION) return false;
    if (checkProjectPrereqs(project, progressStore.getCompletedLessons()).length > 0) return false;
    progressStore.saveProjectRecord({ ...record, completed: true, updatedAt: new Date().toISOString() });
    progressStore.completeProject(projectId);
    return true;
  },
  listAssessments() {
    return ASSESSMENTS.filter((a) => a.status === 'PUBLISHED');
  },
  getAssessmentDetail(assessmentId: string) {
    const assessment = getAssessment(assessmentId);
    if (!assessment || assessment.status !== 'PUBLISHED') return null;
    const questions = assessment.exerciseIds
      .map((id) => getExercise(id))
      .filter((e) => e && e.status === 'PUBLISHED');
    return {
      assessment,
      questions,
      attempts: progressStore.getAssessmentAttempts(assessmentId),
    };
  },
  submitAssessment(
    assessmentId: string,
    answers: Record<string, string | string[]>,
  ): AssessmentAttempt | null {
    const assessment = getAssessment(assessmentId);
    if (!assessment || assessment.status !== 'PUBLISHED') return null;
    const attempt = gradeAssessment(assessment, answers, new Date().toISOString());
    progressStore.recordAssessmentAttempt(attempt);
    return attempt;
  },
  getEligibility(assessmentId = 'asmt-beginner-01'): { eligible: boolean; missing: string[] } {
    return computeEligibility(assessmentId);
  },
  issueCertificateStep(assessmentId = 'asmt-beginner-01'): Certificate | null {
    const { eligible } = computeEligibility(assessmentId);
    const attempts = progressStore.getAssessmentAttempts(assessmentId);
    const best = attempts.filter((a) => a.passed && a.catalogVersion === CATALOG_VERSION).slice(-1)[0];
    if (!eligible || !best) return null;
    const evidence = [
      `assessment:${assessmentId}@${best.assessmentVersion}`,
      `attempt:${best.attemptedAt}`,
      'lessons:path-beginner',
      'project:prj-company-101',
      'note:EDUCATIONAL attestation only — not an external accreditation',
    ];
    const cert = issueCertificate(assessmentId, evidence, true, new Date().toISOString());
    if (cert) progressStore.saveCertificate(cert);
    return cert;
  },
  getCertificate(): Certificate | null {
    return progressStore.getCertificate();
  },
};

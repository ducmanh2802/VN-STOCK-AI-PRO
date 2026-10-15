import {
  LESSONS,
  EXERCISES,
  PATHS,
  PROJECTS,
  ASSESSMENTS,
  LABS,
} from '../../lib/learning/catalog.ts';
import { scoreExercise } from '../../lib/learning/ExerciseScoringEngine.ts';
import { scoreProject } from '../../lib/learning/ProjectEngine.ts';
import { computeMastery } from '../../lib/learning/MasteryEngine.ts';
import { recommendNext, type LearnerSnapshot } from '../../lib/learning/LearningRecommendationEngine.ts';
import type {
  Lesson,
  Exercise,
  LearningPath,
  Project,
  ProjectStatus,
  Assessment,
  ExerciseAttempt,
  ConceptMastery,
  LessonProgress,
  Recommendation,
} from '../../lib/learning/types.ts';


const ATTEMPTS_KEY = 'vnstock_learning_attempts_v1';
const PROGRESS_KEY = 'vnstock_learning_progress_v1';
const PROJECTS_KEY = 'vnstock_learning_projects_v1';

function getStoredAttempts(): ExerciseAttempt[] {
  try {
    const raw = localStorage.getItem(ATTEMPTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function getStoredProgress(): LessonProgress[] {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function getAttemptsByExercise(attempts: ExerciseAttempt[]): Record<string, ExerciseAttempt[]> {
  const map: Record<string, ExerciseAttempt[]> = {};
  for (const a of attempts) {
    if (!map[a.exerciseId]) map[a.exerciseId] = [];
    map[a.exerciseId].push(a);
  }
  return map;
}

function getLessonToConcepts(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const l of LESSONS) {
    map[l.id] = [...l.conceptIds];
  }
  return map;
}

export class LearningService {
  public static listPaths(): readonly LearningPath[] {
    return PATHS;
  }

  public static getPath(id: string): LearningPath | null {
    return PATHS.find((p) => p.id === id) ?? null;
  }

  public static listLessons(): readonly Lesson[] {
    return LESSONS;
  }

  public static getLessonDetail(id: string): { lesson: Lesson; exercises: readonly Exercise[] } | null {
    const lesson = LESSONS.find((l) => l.id === id);
    if (!lesson) return null;
    const exercises = EXERCISES.filter((e) => e.lessonId === id);
    return { lesson, exercises };
  }

  public static completeLesson(lessonId: string): void {
    const progress = getStoredProgress();
    const existing = progress.find((p) => p.lessonId === lessonId);
    if (existing) {
      existing.completed = true;
    } else {
      progress.push({
        lessonId,
        completed: true,
        completedAt: new Date().toISOString(),
      });
    }
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    } catch {
      // ignore
    }
  }

  public static submitExercise(exerciseId: string, answer: string): { correct: boolean; score: number; maxScore: number; feedback: string } | null {
    const exercise = EXERCISES.find((e) => e.id === exerciseId);
    if (!exercise) return null;

    const result = scoreExercise(exercise, answer);
    const attempt: ExerciseAttempt = {
      exerciseId,
      answer,
      score: result.score,
      maxScore: result.maxScore,
      correct: result.correct,
      attemptedAt: new Date().toISOString(),
    };

    const attempts = getStoredAttempts();
    attempts.push(attempt);
    try {
      localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(attempts));
    } catch {
      // ignore
    }

    return result;
  }

  public static listProjects(): readonly Project[] {
    return PROJECTS ?? [];
  }

  public static getProjectDetail(id: string): {
    project: Project;
    status: ProjectStatus;
    submissions: number;
    missingPrereqs: string[];
  } | null {
    const project = (PROJECTS ?? []).find((p) => p.id === id);
    if (!project) return null;
    let rec: any = null;
    try {
      const projects = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '{}');
      rec = projects[id];
    } catch {
      rec = null;
    }
    const progress = getStoredProgress();
    const doneSet = new Set(progress.filter((p) => p.completed).map((p) => p.lessonId));
    const missingPrereqs = (project.requiresLessonIds ?? []).filter((r) => !doneSet.has(r));
    return {
      project,
      status: (rec?.passed ? 'PASSED' : rec?.submissions ? 'IN_PROGRESS' : 'NOT_STARTED') as ProjectStatus,
      submissions: rec?.submissions ?? 0,
      missingPrereqs,
    };
  }

  public static submitProject(projectId: string, evidenceIds: string[], thesis: string): { correct: boolean; score: number; maxScore: number; feedback: string } | null {
    const project = (PROJECTS ?? []).find((p) => p.id === projectId);
    if (!project) return null;

    const result = scoreProject(project, evidenceIds, thesis);
    try {
      const projects = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '{}');
      projects[projectId] = {
        projectId,
        passed: result.correct,
        completed: result.correct,
        submissions: (projects[projectId]?.submissions || 0) + 1,
        version: '1.0.0-mvp',
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
    } catch {
      // ignore
    }
    return result;
  }

  public static completeProjectStep(projectId: string): boolean {
    const project = (PROJECTS ?? []).find((p) => p.id === projectId);
    return Boolean(project);
  }

  public static getMastery(): readonly ConceptMastery[] {
    const attempts = getStoredAttempts();
    const progress = getStoredProgress();
    const attemptsByExercise = getAttemptsByExercise(attempts);
    const completedLessonIds = progress.filter((p) => p.completed).map((p) => p.lessonId);
    const lessonToConcepts = getLessonToConcepts();
    return computeMastery(attemptsByExercise, completedLessonIds, lessonToConcepts);
  }

  public static getProgress(pathId: string): { completedLessons: number; totalLessons: number; percent: number } {
    const path = PATHS.find((p) => p.id === pathId);
    if (!path) return { completedLessons: 0, totalLessons: 0, percent: 0 };
    const lessonItems = path.items.filter((i) => i.kind === 'lesson');
    const progress = getStoredProgress();
    const completedSet = new Set(progress.filter((p) => p.completed).map((p) => p.lessonId));
    const completed = lessonItems.filter((i) => completedSet.has(i.refId)).length;
    const total = lessonItems.length;
    return {
      completedLessons: completed,
      totalLessons: total,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }

  public static getRecommendation(pathId: string): Recommendation {
    const attempts = getStoredAttempts();
    const progress = getStoredProgress();
    const snap: LearnerSnapshot = {
      completedLessonIds: progress.filter((p) => p.completed).map((p) => p.lessonId),
      attemptsByExercise: getAttemptsByExercise(attempts),
      completedLabIds: [],
    };
    return recommendNext(pathId, snap);
  }

  public static getAdaptiveRecommendation(pathId: string): Recommendation {
    return LearningService.getRecommendation(pathId);
  }

  public static getAssessmentDetail(id: string): {
    assessment: Assessment;
    questions: Exercise[];
    attempts: ExerciseAttempt[];
  } | null {
    const asmt = (ASSESSMENTS ?? []).find((a) => a.id === id);
    if (!asmt) return null;
    const questions = EXERCISES.filter((e) => asmt.exerciseIds.includes(e.id));
    const attempts = getStoredAttempts().filter((a) => asmt.exerciseIds.includes(a.exerciseId));
    return {
      assessment: asmt,
      questions,
      attempts,
    };
  }

  public static submitAssessment(
    id: string,
    answers: Record<string, string>
  ): { score: number; maxScore: number; passed: boolean } | null {
    const asmt = (ASSESSMENTS ?? []).find((a) => a.id === id);
    if (!asmt) return null;
    let score = 0;
    const maxScore = asmt.exerciseIds.length;
    for (const exId of asmt.exerciseIds) {
      const ex = EXERCISES.find((e) => e.id === exId);
      if (ex && answers[exId] !== undefined) {
        const res = scoreExercise(ex, answers[exId]);
        if (res.correct) score++;
      }
    }
    const passed = maxScore > 0 ? score / maxScore >= asmt.passThreshold : false;
    return { score, maxScore, passed };
  }

  public static getEligibility(): { eligible: boolean; missing: string[]; reasons: string[] } {
    return {
      eligible: false,
      missing: ['Complete all beginner path modules'],
      reasons: ['Complete all beginner path modules to earn certificate'],
    };
  }

  public static getCertificate(): { id: string; status: string; evidence: string[]; issuedAt: string } | null {
    try {
      const raw = localStorage.getItem('vnstock_learning_cert_v1');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  public static issueCertificateStep(): { id: string; status: string; evidence: string[]; issuedAt: string } | null {
    const cert = {
      id: `CERT-${Date.now().toString(36).toUpperCase()}`,
      status: 'ISSUED',
      evidence: ['Completed beginner learning path', 'Passed beginner assessment'],
      issuedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem('vnstock_learning_cert_v1', JSON.stringify(cert));
    } catch {
      // ignore
    }
    return cert;
  }

}

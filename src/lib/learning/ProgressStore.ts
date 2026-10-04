// ProgressStore — localStorage-backed persistence behind a DB-ready interface.
// P1 foundation (§8): version-aware completions + explicit learner-identity scoping.
// Default singleton preserves legacy keys (single local learner). Scoped stores
// prefix keys per learnerId so a future backend can adopt the same boundaries.
import type { AssessmentAttempt, Certificate, ExerciseAttempt, LessonProgress, ProjectRecord } from './types';
import { CATALOG_VERSION } from './catalog';

export interface LearnerIdentity {
  /** Stable learner id. 'local' = anonymous single-learner default (legacy keys). */
  learnerId: string;
}

export const DEFAULT_LEARNER: LearnerIdentity = { learnerId: 'local' };

export interface IProgressStore {
  getCompletedLessons(): string[];
  completeLesson(lessonId: string): string[];
  /** Ids completed under an older catalog version (need revalidation, not deletion). */
  getStaleCompletions(): string[];
  getAttempts(exerciseId: string): ExerciseAttempt[];
  recordAttempt(a: ExerciseAttempt): void;
  getCompletedLabs(): string[];
  completeLab(labId: string): string[];
  getCompletedProjects(): string[];
  completeProject(projectId: string): string[];
  getProjectRecord(projectId: string): ProjectRecord | null;
  saveProjectRecord(r: ProjectRecord): void;
  getAssessmentAttempts(assessmentId: string): AssessmentAttempt[];
  /** Append-only: historical attempts are never mutated (assessment integrity). */
  recordAssessmentAttempt(a: AssessmentAttempt): void;
  getCertificate(): Certificate | null;
  saveCertificate(c: Certificate): void;
  reset(): void;
}

const LESSONS_KEY = 'vnstock_learning_progress_v1';
const ATTEMPTS_KEY = 'vnstock_learning_attempts_v1';
const LABS_KEY = 'vnstock_learning_labs_v1';
const PROJECTS_KEY = 'vnstock_learning_projects_v1';
const PROJECT_RECORDS_KEY = 'vnstock_learning_project_records_v1';
const ASSESSMENT_ATTEMPTS_KEY = 'vnstock_learning_assessment_attempts_v1';
const CERT_KEY = 'vnstock_learning_certificate_v1';

function readJson<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readArr<T>(key: string): T[] {
  const v = readJson<unknown>(key, []);
  return Array.isArray(v) ? (v as T[]) : [];
}

function writeJson(key: string, value: unknown): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // fail-safe: progress loss is acceptable, never crash learning UI
  }
}

function utcNow(): string {
  return new Date().toISOString();
}

export class LocalProgressStore implements IProgressStore {
  private readonly pfx: string;
  constructor(identity: LearnerIdentity = DEFAULT_LEARNER) {
    const id = (identity.learnerId || 'local').trim() || 'local';
    this.pfx = id === 'local' ? '' : `${id}:`;
  }
  private k(base: string): string {
    return `${this.pfx}${base}`;
  }
  getCompletedLessons(): string[] {
    const v = readArr<LessonProgress>(this.k(LESSONS_KEY));
    return v.filter((p) => p && p.completed && typeof p.lessonId === 'string').map((p) => p.lessonId);
  }
  completeLesson(lessonId: string): string[] {
    const v = readArr<LessonProgress>(this.k(LESSONS_KEY));
    if (!v.some((p) => p.lessonId === lessonId && p.completed)) {
      v.push({ lessonId, completed: true, completedAt: utcNow(), catalogVersion: CATALOG_VERSION });
      writeJson(this.k(LESSONS_KEY), v);
    }
    return this.getCompletedLessons();
  }
  getStaleCompletions(): string[] {
    const v = readArr<LessonProgress>(this.k(LESSONS_KEY));
    return v
      .filter((p) => p && p.completed && typeof p.lessonId === 'string' && p.catalogVersion !== CATALOG_VERSION)
      .map((p) => p.lessonId);
  }
  getAttempts(exerciseId: string): ExerciseAttempt[] {
    const all = readArr<ExerciseAttempt>(this.k(ATTEMPTS_KEY));
    return all.filter((a) => a && a.exerciseId === exerciseId);
  }
  getAllAttempts(): ExerciseAttempt[] {
    return readArr<ExerciseAttempt>(this.k(ATTEMPTS_KEY));
  }
  recordAttempt(a: ExerciseAttempt): void {
    const all = readArr<ExerciseAttempt>(this.k(ATTEMPTS_KEY));
    all.push({ ...a, attemptedAt: a.attemptedAt || utcNow() });
    writeJson(this.k(ATTEMPTS_KEY), all);
  }
  getCompletedLabs(): string[] {
    return readArr<string>(this.k(LABS_KEY));
  }
  completeLab(labId: string): string[] {
    const v = readArr<string>(this.k(LABS_KEY));
    if (!v.includes(labId)) {
      v.push(labId);
      writeJson(this.k(LABS_KEY), v);
    }
    return this.getCompletedLabs();
  }
  getCompletedProjects(): string[] {
    return readArr<string>(this.k(PROJECTS_KEY));
  }
  completeProject(projectId: string): string[] {
    const v = readArr<string>(this.k(PROJECTS_KEY));
    if (!v.includes(projectId)) {
      v.push(projectId);
      writeJson(this.k(PROJECTS_KEY), v);
    }
    return this.getCompletedProjects();
  }
  getProjectRecord(projectId: string): ProjectRecord | null {
    const all = readJson<Record<string, ProjectRecord>>(this.k(PROJECT_RECORDS_KEY), {});
    if (!all || typeof all !== 'object' || Array.isArray(all)) return null;
    const r = all[projectId];
    return r && typeof r === 'object' ? r : null;
  }
  saveProjectRecord(r: ProjectRecord): void {
    const all = readJson<Record<string, ProjectRecord>>(this.k(PROJECT_RECORDS_KEY), {});
    const safe = all && typeof all === 'object' && !Array.isArray(all) ? all : {};
    safe[r.projectId] = r;
    writeJson(this.k(PROJECT_RECORDS_KEY), safe);
  }
  getAssessmentAttempts(assessmentId: string): AssessmentAttempt[] {
    const all = readArr<AssessmentAttempt>(this.k(ASSESSMENT_ATTEMPTS_KEY));
    return all.filter((a) => a && a.assessmentId === assessmentId);
  }
  recordAssessmentAttempt(a: AssessmentAttempt): void {
    const all = readArr<AssessmentAttempt>(this.k(ASSESSMENT_ATTEMPTS_KEY));
    all.push({ ...a });
    writeJson(this.k(ASSESSMENT_ATTEMPTS_KEY), all);
  }
  getCertificate(): Certificate | null {
    const c = readJson<Certificate | null>(this.k(CERT_KEY), null);
    return c && typeof c === 'object' ? c : null;
  }
  saveCertificate(c: Certificate): void {
    writeJson(this.k(CERT_KEY), { ...c });
  }
  reset(): void {
    writeJson(this.k(LESSONS_KEY), []);
    writeJson(this.k(ATTEMPTS_KEY), []);
    writeJson(this.k(LABS_KEY), []);
    writeJson(this.k(PROJECTS_KEY), []);
    writeJson(this.k(PROJECT_RECORDS_KEY), {});
    writeJson(this.k(ASSESSMENT_ATTEMPTS_KEY), []);
    writeJson(this.k(CERT_KEY), null);
  }
}

/** Scoped store for an explicit learner identity (userId-ready boundary, still local). */
export function scopedStore(identity: LearnerIdentity): LocalProgressStore {
  return new LocalProgressStore(identity);
}

export const progressStore = new LocalProgressStore();

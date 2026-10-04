// LEARNING HUB — domain types (MVP subset of roadmap §26).
// Pure types only. No React, no IO, no trading imports.

export type ContentStatus = 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'ARCHIVED';

export type MasteryState =
  | 'NOT_STARTED'
  | 'LEARNING'
  | 'PRACTICING'
  | 'UNDERSTANDING'
  | 'MASTERED'
  | 'REVIEW_REQUIRED';

export type ExerciseType =
  | 'KNOWLEDGE'
  | 'CALCULATION'
  | 'INTERPRETATION'
  | 'SYSTEM_NAVIGATION'
  | 'DECISION'
  | 'DEBUGGING'
  | 'BUILD'
  | 'DEFEND';

export type DataBadge = 'SIMULATED' | 'HISTORICAL' | 'REAL' | 'EDUCATIONAL';

export interface KnowledgeDomain {
  id: string;
  title: string;
  description: string;
  level: number;
}

export interface Topic {
  id: string;
  domainId: string;
  title: string;
  description: string;
}

export interface Concept {
  id: string;
  topicId: string;
  title: string;
  summary: string;
  systemFeature?: string;
}

export interface LessonSection {
  heading: string;
  body: string;
}

export interface LessonExample {
  title: string;
  body: string;
  dataBadge: DataBadge;
}

export interface Lesson {
  id: string;
  conceptIds: string[];
  topicId: string;
  title: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  estimatedMinutes: number;
  objectives: string[];
  sections: LessonSection[];
  examples: LessonExample[];
  keyPoints: string[];
  systemFeatureRefs: string[];
  dataBadge: DataBadge;
  status: ContentStatus;
  version: string;
}

export interface ExerciseOption {
  id: string;
  label: string;
}

export interface Exercise {
  id: string;
  lessonId: string;
  conceptIds: string[];
  type: ExerciseType;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  question: string;
  options?: ExerciseOption[];
  /** For KNOWLEDGE/INTERPRETATION/DECISION/DEBUGGING/SYSTEM_NAVIGATION: option id(s). For CALCULATION: numeric string. For text: accepted strings. */
  correctAnswer: string | string[];
  tolerance?: number;
  explanation: string;
  expectedReasoning: string;
  systemFeature?: string;
  dataBadge: DataBadge;
  status: ContentStatus;
  version: string;
}

export type PathItemKind = 'lesson' | 'exercise' | 'lab';

export interface PathItem {
  kind: PathItemKind;
  refId: string;
}

export interface LearningPath {
  id: string;
  title: string;
  description: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  items: PathItem[];
  status: ContentStatus;
  version: string;
}

export interface PracticeLab {
  id: string;
  title: string;
  topic: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  scenario: string;
  question: string;
  evidenceRequired: string[];
  guidance: string;
  dataBadge: DataBadge;
  status: ContentStatus;
  version: string;
}

export interface LessonProgress {
  lessonId: string;
  completed: boolean;
  completedAt?: string;
  /** Catalog version at completion time. Absent = legacy pre-versioned entry (treated as stale). */
  catalogVersion?: string;
}

export interface ExerciseAttempt {
  exerciseId: string;
  answer: string | string[];
  score: number;
  maxScore: number;
  correct: boolean;
  attemptedAt: string;
}

export interface ConceptMastery {
  conceptId: string;
  state: MasteryState;
  score: number;
}

export interface ScoredResult {
  score: number;
  maxScore: number;
  correct: boolean;
  feedback: string;
}

export interface Recommendation {
  kind: 'LESSON' | 'EXERCISE' | 'REVIEW' | 'LAB' | 'COMPLETE';
  refId: string | null;
  reason: string;
}

export interface Project {
  id: string;
  title: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  summary: string;
  steps: string[];
  evidenceRequired: string[];
  rubric: string;
  conceptIds: string[];
  /** Lessons that must be completed before submission (fail-closed). */
  requiresLessonIds: string[];
  systemFeature?: string;
  dataBadge: DataBadge;
  status: ContentStatus;
  version: string;
}

export type ProjectStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'PASSED'
  | 'FAILED'
  | 'REVISION_REQUIRED'
  | 'COMPLETED';

export interface ProjectRecord {
  projectId: string;
  /** Catalog version pinned at first submission (never mutated by content changes). */
  version: string;
  submissions: number;
  passed: boolean;
  completed: boolean;
  updatedAt: string;
}

export interface ProjectCheckResult {
  score: number;
  maxScore: number;
  correct: boolean;
  feedback: string;
}

export interface Assessment {
  id: string;
  title: string;
  description: string;
  /** Exercise ids composing this assessment (scored via ExerciseScoringEngine). */
  exerciseIds: string[];
  /** Overall pass rate, e.g. 0.7. */
  passThreshold: number;
  /** Per-concept minimum rates, e.g. { 'c-ttm': 0.5 }. Empty = no competency gate. */
  competencyThresholds: Record<string, number>;
  dataBadge: DataBadge;
  status: ContentStatus;
  version: string;
}

export interface AssessmentAttempt {
  assessmentId: string;
  /** Versions pinned at attempt time — immutable forever. */
  assessmentVersion: string;
  catalogVersion: string;
  answers: Record<string, string | string[]>;
  score: number;
  maxScore: number;
  passed: boolean;
  competency: Record<string, number>;
  failedCompetencies: string[];
  attemptedAt: string;
}

export type CertificateStatus = 'NOT_ELIGIBLE' | 'ELIGIBLE' | 'ISSUED' | 'EXPIRED' | 'REVOKED';

export interface Certificate {
  id: string;
  assessmentId: string;
  assessmentVersion: string;
  catalogVersion: string;
  status: CertificateStatus;
  /** Evidence bundle ids: completed lessons, passed attempt timestamp, project id. */
  evidence: string[];
  issuedAt: string | null;
}

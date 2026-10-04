// AssessmentEngine — LEARNING-11 serious assessment + evidence-based certification.
// Pure + deterministic. Attempts are version-pinned at grading time and never
// mutated afterwards: content changes cannot rewrite history (immutability).
// Local issuance is an EDUCATIONAL attestation, never an external accreditation.
import { CATALOG_VERSION, getExercise } from './catalog';
import { scoreExercise } from './ExerciseScoringEngine';
import type {
  Assessment,
  AssessmentAttempt,
  Certificate,
  CertificateStatus,
} from './types';

export interface GradedAssessment {
  score: number;
  maxScore: number;
  passed: boolean;
  competency: Record<string, number>;
  failedCompetencies: string[];
  feedback: string;
}

export function gradeAssessment(
  assessment: Assessment,
  answers: Record<string, string | string[]>,
  attemptedAt: string,
): AssessmentAttempt {
  let score = 0;
  const competencySum: Record<string, { got: number; n: number }> = {};
  for (const exId of assessment.exerciseIds) {
    const ex = getExercise(exId);
    if (!ex || ex.status !== 'PUBLISHED') continue; // unpublished content never counts
    const raw = answers[exId];
    if (raw === undefined) continue; // unanswered = 0, explicit (fail-closed, not silent)
    const r = scoreExercise(ex, raw);
    score += r.score;
    for (const c of ex.conceptIds) {
      const acc = competencySum[c] ?? { got: 0, n: 0 };
      acc.got += r.score;
      acc.n += 1;
      competencySum[c] = acc;
    }
  }
  const maxScore = assessment.exerciseIds.length;
  const competency: Record<string, number> = {};
  for (const [c, acc] of Object.entries(competencySum)) competency[c] = acc.n > 0 ? acc.got / acc.n : 0;
  const failedCompetencies = Object.entries(assessment.competencyThresholds)
    .filter(([c, min]) => (competency[c] ?? 0) < min)
    .map(([c]) => c);
  const passed = maxScore > 0 && score / maxScore >= assessment.passThreshold && failedCompetencies.length === 0;
  const feedback = [
    passed ? 'Correct.' : 'Not quite yet.',
    `Why: score ${score}/${maxScore} vs threshold ${assessment.passThreshold * 100}%.`,
    failedCompetencies.length > 0
      ? `Competency gate failed: ${failedCompetencies.join(', ')} (safety-critical concepts are non-negotiable).`
      : 'All competency gates satisfied.',
    'Expected reasoning: each question is scored by the deterministic exercise engine; unanswered counts as 0.',
    'Next: retry missed questions, then re-take (history is kept).',
  ].join(' ');
  return {
    assessmentId: assessment.id,
    assessmentVersion: assessment.version,
    catalogVersion: CATALOG_VERSION,
    answers: { ...answers },
    score,
    maxScore,
    passed,
    competency,
    failedCompetencies,
    attemptedAt,
  };
}

export interface EligibilityInput {
  completedLessonIds: string[];
  requiredLessonIds: string[];
  assessmentAttempts: AssessmentAttempt[];
  requiredProjectIds: string[];
  completedProjectIds: string[];
}

export function checkEligibility(input: EligibilityInput): { eligible: boolean; missing: string[] } {
  const missing: string[] = [];
  const doneLessons = new Set(input.completedLessonIds);
  for (const id of input.requiredLessonIds) if (!doneLessons.has(id)) missing.push(`lesson:${id}`);
  const currentPass = input.assessmentAttempts.some(
    (a) => a.passed && a.catalogVersion === CATALOG_VERSION,
  );
  if (!currentPass) missing.push('assessment:asmt-beginner-01 (current-version pass)');
  const doneProjects = new Set(input.completedProjectIds);
  for (const id of input.requiredProjectIds) if (!doneProjects.has(id)) missing.push(`project:${id}`);
  return { eligible: missing.length === 0, missing };
}

export function issueCertificate(
  assessmentId: string,
  evidence: string[],
  eligible: boolean,
  attemptedAt: string,
): Certificate | null {
  if (!eligible || evidence.length === 0) return null; // fail-closed: no evidence, no certificate
  const stamp = attemptedAt.replace(/[^0-9]/g, '').slice(0, 14) || 'undated';
  return {
    id: `cert-${assessmentId}-${stamp}`,
    assessmentId,
    assessmentVersion: CATALOG_VERSION,
    catalogVersion: CATALOG_VERSION,
    status: 'ISSUED',
    evidence: [...evidence],
    issuedAt: attemptedAt,
  };
}

export function transitionCertificate(cert: Certificate, to: CertificateStatus): Certificate {
  const allowed: Record<CertificateStatus, CertificateStatus[]> = {
    NOT_ELIGIBLE: ['ELIGIBLE'],
    ELIGIBLE: ['ISSUED', 'EXPIRED'],
    ISSUED: ['EXPIRED', 'REVOKED'],
    EXPIRED: [],
    REVOKED: [],
  };
  if (!(allowed[cert.status] ?? []).includes(to)) return cert; // illegal transition = no-op
  return { ...cert, status: to };
}

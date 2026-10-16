import { z } from 'zod';

export const SubmitAttemptSchema = z.object({
  exerciseId: z.string().min(1),
  answer: z.string(),
});

export const SubmitAssessmentSchema = z.object({
  assessmentId: z.string().min(1),
  answers: z.record(z.string(), z.string()),
});

export const SubmitProjectSchema = z.object({
  projectId: z.string().min(1),
  selectedEvidenceIds: z.array(z.string()),
  thesis: z.string().min(1),
});

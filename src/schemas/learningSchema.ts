import { z } from 'zod';

export const ExerciseAnswerSchema = z.union([z.string().min(1).max(500), z.array(z.string().min(1).max(200)).max(10)]);

export const SubmitAttemptSchema = z.object({
  exerciseId: z.string().min(1).max(100),
  answer: ExerciseAnswerSchema,
});

export const CompleteLessonSchema = z.object({
  lessonId: z.string().min(1).max(100),
});

export const CompleteLabSchema = z.object({
  labId: z.string().min(1).max(100),
});

export const SubmitProjectSchema = z.object({
  projectId: z.string().min(1).max(100),
  ticked: z.array(z.string().min(1).max(200)).max(20),
  thesis: z.string().min(1).max(2000),
});

export const SubmitAssessmentSchema = z.object({
  assessmentId: z.string().min(1).max(100),
  answers: z.record(z.string().min(1).max(100), ExerciseAnswerSchema).refine((o) => Object.keys(o).length <= 50, {
    message: 'too many answers',
  }),
});

import { z } from "zod";

export const checkpointQuestionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  choices: z.array(z.string().min(1)).min(2).max(6),
  answer_index: z.number().int().min(0),
}).refine((q) => q.answer_index < q.choices.length, {
  message: "answer_index out of range",
  path: ["answer_index"],
});

export const trainingPathWriteSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens"),
  title: z.string().min(1),
  role: z.string().min(1),
  description: z.string().nullable().optional(),
  sort_order: z.number().int().min(0).optional().default(0),
  article_slugs: z.array(z.string().min(1)).min(1),
  checkpoint_quiz: z.array(checkpointQuestionSchema).optional().default([]),
});

export const trainingPathPatchSchema = trainingPathWriteSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: "At least one field required" },
);

export type TrainingPathWrite = z.infer<typeof trainingPathWriteSchema>;

/**
 * POST /api/admin/learning/training-progress/quiz
 * Grade checkpoint quiz and set completion when all rules pass.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, handleApiError } from "@/lib/supabase/api-helpers";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { ADMIN_SECTION_OVERVIEW } from "@/lib/admin-sections";
import { z } from "zod";
import {
  computeCompletion,
  gradeCheckpointQuiz,
  resolveTrainingSteps,
  type ArticleRow,
  type CheckpointQuestion,
} from "@/lib/learning/training-paths";
import { syncPathCompletionIfReady } from "@/lib/learning/sync-path-completion";

const bodySchema = z.object({
  path_slug: z.string().min(1),
  answers: z.record(z.string(), z.number()),
});

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_OVERVIEW, request);
    if (!user) return unauthorizedResponse("Authentication required");

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Validation failed", code: "VALIDATION_ERROR" },
        },
        { status: 400 },
      );
    }

    const { path_slug, answers } = parsed.data;
    const admin = getSupabaseAdmin();

    const { data: path, error: pathError } = await admin
      .from("learning_training_paths")
      .select("slug, article_slugs, checkpoint_quiz")
      .eq("slug", path_slug)
      .maybeSingle();

    if (pathError) return handleApiError(pathError, "Failed to load path");
    if (!path) {
      return NextResponse.json(
        { data: null, error: { message: "Path not found", code: "NOT_FOUND" } },
        { status: 404 },
      );
    }

    const quiz = (Array.isArray(path.checkpoint_quiz) ? path.checkpoint_quiz : []) as CheckpointQuestion[];
    const grade = gradeCheckpointQuiz(quiz, answers);

    if (!grade.passed) {
      return NextResponse.json({
        data: { passed: false, failed_question_ids: grade.failedQuestionIds },
        error: null,
      });
    }

    const slugs = path.article_slugs as string[];
    const { data: articles } = await admin
      .from("learning_articles")
      .select("id, slug, title, summary, audience, is_internal, status, content_type")
      .in("slug", slugs);

    const articleMap = new Map<string, ArticleRow>();
    for (const a of articles ?? []) {
      articleMap.set(a.slug, a as ArticleRow);
    }

    const steps = resolveTrainingSteps(slugs, articleMap);

    const { data: progressRows } = await admin
      .from("learning_training_progress")
      .select("article_slug")
      .eq("user_id", user.id)
      .eq("path_slug", path_slug);

    const signedOffSlugs = new Set((progressRows ?? []).map((r) => r.article_slug));
    const now = new Date().toISOString();

    await admin.from("learning_training_completions").upsert(
      {
        user_id: user.id,
        path_slug,
        quiz_passed_at: now,
        completed_at: null,
      },
      { onConflict: "user_id,path_slug" },
    );

    const { completed_at } = await syncPathCompletionIfReady(admin, user.id, path_slug);

    const completionCheck = computeCompletion({
      steps,
      signedOffSlugs,
      quizPassed: true,
      checkpointQuiz: quiz,
    });

    return NextResponse.json({
      data: {
        passed: true,
        failed_question_ids: [] as string[],
        completed_at,
        completion_blocked_reason: completed_at ? null : completionCheck.reason ?? "STEPS_INCOMPLETE",
      },
      error: null,
    });
  } catch (err) {
    return handleApiError(err, "Failed to grade quiz");
  }
}

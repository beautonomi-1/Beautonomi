import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeCompletion,
  resolveTrainingSteps,
  type ArticleRow,
  type CheckpointQuestion,
} from "./training-paths";

/**
 * After sign-off or quiz pass, set completed_at when all published steps are signed off
 * and (if configured) the checkpoint quiz has passed.
 */
export async function syncPathCompletionIfReady(
  admin: SupabaseClient,
  userId: string,
  pathSlug: string,
): Promise<{ completed_at: string | null }> {
  const { data: path } = await admin
    .from("learning_training_paths")
    .select("article_slugs, checkpoint_quiz")
    .eq("slug", pathSlug)
    .maybeSingle();

  if (!path) return { completed_at: null };

  const slugs = path.article_slugs as string[];
  const quiz = (Array.isArray(path.checkpoint_quiz) ? path.checkpoint_quiz : []) as CheckpointQuestion[];

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
    .eq("user_id", userId)
    .eq("path_slug", pathSlug);

  const signedOffSlugs = new Set((progressRows ?? []).map((r) => r.article_slug));

  const { data: completionRow } = await admin
    .from("learning_training_completions")
    .select("quiz_passed_at, completed_at")
    .eq("user_id", userId)
    .eq("path_slug", pathSlug)
    .maybeSingle();

  if (completionRow?.completed_at) {
    return { completed_at: completionRow.completed_at };
  }

  const quizPassed = quiz.length === 0 ? true : Boolean(completionRow?.quiz_passed_at);
  const check = computeCompletion({
    steps,
    signedOffSlugs,
    quizPassed,
    checkpointQuiz: quiz,
  });

  if (!check.complete) return { completed_at: null };

  const now = new Date().toISOString();
  await admin.from("learning_training_completions").upsert(
    {
      user_id: userId,
      path_slug: pathSlug,
      quiz_passed_at: completionRow?.quiz_passed_at ?? null,
      completed_at: now,
    },
    { onConflict: "user_id,path_slug" },
  );

  return { completed_at: now };
}

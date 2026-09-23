/**
 * GET /api/admin/learning/training-paths
 * Returns training paths with resolved steps (all statuses), checkpoint quiz without answers,
 * and current user's progress when authenticated.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, handleApiError } from "@/lib/supabase/api-helpers";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { ADMIN_SECTION_OVERVIEW } from "@/lib/admin-sections";
import {
  resolveTrainingSteps,
  stripQuizAnswers,
  type ArticleRow,
  type CheckpointQuestion,
} from "@/lib/learning/training-paths";

type PathRow = {
  id: string;
  slug: string;
  title: string;
  role: string;
  description: string | null;
  sort_order: number;
  article_slugs: string[];
  checkpoint_quiz: CheckpointQuestion[] | null;
  created_at: string;
  updated_at: string;
};

export type TrainingPathStepResponse = ReturnType<typeof resolveTrainingSteps>[number];

export type TrainingPathResponse = Omit<PathRow, "article_slugs" | "checkpoint_quiz"> & {
  steps: TrainingPathStepResponse[];
  checkpoint_quiz: ReturnType<typeof stripQuizAnswers>;
  progress: {
    signed_off_slugs: string[];
    quiz_passed: boolean;
    completed_at: string | null;
  };
};

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_OVERVIEW, request);
    if (!user) return unauthorizedResponse("Authentication required");

    const admin = getSupabaseAdmin();

    const { data: paths, error: pathsError } = await admin
      .from("learning_training_paths")
      .select(
        "id, slug, title, role, description, sort_order, article_slugs, checkpoint_quiz, created_at, updated_at",
      )
      .order("sort_order", { ascending: true });

    if (pathsError) {
      console.error("Error loading training paths:", pathsError);
      return handleApiError(pathsError, "Failed to load training paths");
    }

    const rows = (paths ?? []) as PathRow[];
    const allSlugs = Array.from(new Set(rows.flatMap((p) => p.article_slugs)));

    const articleMap = new Map<string, ArticleRow>();
    if (allSlugs.length > 0) {
      const { data: articles, error: articlesError } = await admin
        .from("learning_articles")
        .select("id, slug, title, summary, audience, is_internal, status, content_type")
        .in("slug", allSlugs);

      if (articlesError) {
        console.error("Error loading training path articles:", articlesError);
        return handleApiError(articlesError, "Failed to load training path articles");
      }

      for (const a of articles ?? []) {
        articleMap.set(a.slug, a as ArticleRow);
      }
    }

    const pathSlugs = rows.map((p) => p.slug);
    const signedByPath = new Map<string, Set<string>>();
    const completionByPath = new Map<string, { quiz_passed: boolean; completed_at: string | null }>();

    if (pathSlugs.length > 0) {
      const { data: progressRows } = await admin
        .from("learning_training_progress")
        .select("path_slug, article_slug")
        .eq("user_id", user.id)
        .in("path_slug", pathSlugs);

      for (const row of progressRows ?? []) {
        const set = signedByPath.get(row.path_slug) ?? new Set<string>();
        set.add(row.article_slug);
        signedByPath.set(row.path_slug, set);
      }

      const { data: completionRows } = await admin
        .from("learning_training_completions")
        .select("path_slug, quiz_passed_at, completed_at")
        .eq("user_id", user.id)
        .in("path_slug", pathSlugs);

      for (const row of completionRows ?? []) {
        completionByPath.set(row.path_slug, {
          quiz_passed: Boolean(row.quiz_passed_at),
          completed_at: row.completed_at,
        });
      }
    }

    const resolved: TrainingPathResponse[] = rows.map((path) => {
      const steps = resolveTrainingSteps(path.article_slugs, articleMap);
      const quizRaw = Array.isArray(path.checkpoint_quiz) ? path.checkpoint_quiz : [];
      const completion = completionByPath.get(path.slug);
      const signed = signedByPath.get(path.slug) ?? new Set<string>();
      const { article_slugs: _a, checkpoint_quiz: _q, ...rest } = path;
      return {
        ...rest,
        steps,
        checkpoint_quiz: stripQuizAnswers(quizRaw),
        progress: {
          signed_off_slugs: Array.from(signed),
          quiz_passed: completion?.quiz_passed ?? false,
          completed_at: completion?.completed_at ?? null,
        },
      };
    });

    return NextResponse.json({ data: resolved, error: null });
  } catch (err) {
    return handleApiError(err, "Failed to load training paths");
  }
}

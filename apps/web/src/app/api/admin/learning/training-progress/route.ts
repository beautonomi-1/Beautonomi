/**
 * POST /api/admin/learning/training-progress
 * Record sign-off for the current admin on a published path step.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, handleApiError } from "@/lib/supabase/api-helpers";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { ADMIN_SECTION_OVERVIEW } from "@/lib/admin-sections";
import { z } from "zod";
import {
  canSignOffStep,
  resolveTrainingSteps,
  type ArticleRow,
} from "@/lib/learning/training-paths";
import { syncPathCompletionIfReady } from "@/lib/learning/sync-path-completion";

const bodySchema = z.object({
  path_slug: z.string().min(1),
  article_slug: z.string().min(1),
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

    const { path_slug, article_slug } = parsed.data;
    const admin = getSupabaseAdmin();

    const { data: path, error: pathError } = await admin
      .from("learning_training_paths")
      .select("slug, article_slugs")
      .eq("slug", path_slug)
      .maybeSingle();

    if (pathError) return handleApiError(pathError, "Failed to load path");
    if (!path || !path.article_slugs.includes(article_slug)) {
      return NextResponse.json(
        { data: null, error: { message: "Step not in path", code: "NOT_FOUND" } },
        { status: 404 },
      );
    }

    const { data: articles } = await admin
      .from("learning_articles")
      .select("id, slug, title, summary, audience, is_internal, status, content_type")
      .eq("slug", article_slug);

    const articleMap = new Map<string, ArticleRow>();
    for (const a of articles ?? []) {
      articleMap.set(a.slug, a as ArticleRow);
    }

    const steps = resolveTrainingSteps(path.article_slugs as string[], articleMap);
    const step = steps.find((s) => s.slug === article_slug);
    if (!step || !canSignOffStep(step)) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Only published articles can be signed off",
            code: "STEP_NOT_PUBLISHED",
          },
        },
        { status: 400 },
      );
    }

    const { data: row, error: insertError } = await admin
      .from("learning_training_progress")
      .upsert(
        {
          user_id: user.id,
          path_slug,
          article_slug,
          signed_off_at: new Date().toISOString(),
        },
        { onConflict: "user_id,path_slug,article_slug" },
      )
      .select("signed_off_at")
      .single();

    if (insertError) return handleApiError(insertError, "Failed to record sign-off");

    const { completed_at } = await syncPathCompletionIfReady(admin, user.id, path_slug);

    return NextResponse.json({ data: { ...row, completed_at }, error: null });
  } catch (err) {
    return handleApiError(err, "Failed to record sign-off");
  }
}

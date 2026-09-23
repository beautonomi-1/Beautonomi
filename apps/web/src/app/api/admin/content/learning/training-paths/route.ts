/**
 * GET /api/admin/content/learning/training-paths
 * POST /api/admin/content/learning/training-paths
 * CMS editor for internal training paths (includes checkpoint quiz with answers).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, handleApiError } from "@/lib/supabase/api-helpers";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { writeAuditLog } from "@/lib/audit/audit";
import { ADMIN_SECTION_CONTENT_CATALOG } from "@/lib/admin-sections";
import { trainingPathWriteSchema } from "@/lib/learning/training-paths-schema";
import { resolveTrainingSteps, type ArticleRow } from "@/lib/learning/training-paths";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    if (!user) return unauthorizedResponse("Authentication required");

    const admin = getSupabaseAdmin();
    const { data: paths, error } = await admin
      .from("learning_training_paths")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) return handleApiError(error, "Failed to load training paths");

    const rows = paths ?? [];
    const allSlugs = Array.from(new Set(rows.flatMap((p) => p.article_slugs as string[])));
    const articleMap = new Map<string, ArticleRow>();

    if (allSlugs.length > 0) {
      const { data: articles } = await admin
        .from("learning_articles")
        .select("id, slug, title, summary, audience, is_internal, status, content_type")
        .in("slug", allSlugs);
      for (const a of articles ?? []) {
        articleMap.set(a.slug, a as ArticleRow);
      }
    }

    const enriched = rows.map((path) => ({
      ...path,
      resolved_steps: resolveTrainingSteps(path.article_slugs as string[], articleMap),
    }));

    return NextResponse.json({ data: enriched, error: null });
  } catch (err) {
    return handleApiError(err, "Failed to load training paths");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    if (!user) return unauthorizedResponse("Authentication required");

    const parsed = trainingPathWriteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Validation failed",
            code: "VALIDATION_ERROR",
            details: parsed.error.issues,
          },
        },
        { status: 400 },
      );
    }

    const admin = getSupabaseAdmin();
    const payload = {
      ...parsed.data,
      description: parsed.data.description ?? null,
      updated_at: new Date().toISOString(),
    };

    const { data: row, error } = await admin
      .from("learning_training_paths")
      .insert(payload)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { data: null, error: { message: "Slug already exists", code: "DUPLICATE" } },
          { status: 409 },
        );
      }
      return handleApiError(error, "Failed to create training path");
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role ?? "superadmin",
      action: "admin.content.learning.training_path.create",
      entity_type: "learning_training_path",
      entity_id: row.id,
      metadata: { slug: row.slug, title: row.title },
    });

    return NextResponse.json({ data: row, error: null });
  } catch (err) {
    return handleApiError(err, "Failed to create training path");
  }
}

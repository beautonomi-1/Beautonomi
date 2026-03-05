/**
 * GET /api/admin/content/learning/articles/[id]
 * PUT /api/admin/content/learning/articles/[id]
 * DELETE /api/admin/content/learning/articles/[id]
 */
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";

const updateSchema = z.object({
  category_id: z.string().uuid().optional(),
  title: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  summary: z.string().nullable().optional(),
  body: z.string().optional(),
  content_format: z.enum(["html", "markdown"]).optional(),
  content_type: z.enum(["article", "video_guide"]).optional(),
  status: z.enum(["draft", "published", "scheduled", "archived"]).optional(),
  audience: z.enum(["general", "customer", "provider", "internal"]).optional(),
  is_internal: z.boolean().optional(),
  published_at: z.string().datetime().nullable().optional(),
  scheduled_at: z.string().datetime().nullable().optional(),
  image_url: z.string().url().nullable().optional(),
  featured_order: z.number().int().min(0).nullable().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) return unauthorizedResponse("Authentication required");

    const { id } = await params;
    const supabase = await getSupabaseServer();

    const { data, error } = await supabase
      .from("learning_articles")
      .select("*, learning_categories(id, title, slug, audience)")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { data: null, error: { message: "Article not found", code: "NOT_FOUND" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error("Unexpected error in GET learning article:", err);
    return NextResponse.json(
      { data: null, error: { message: "Failed to fetch article", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) return unauthorizedResponse("Authentication required");

    const { id } = await params;
    const supabase = await getSupabaseServer();
    const body = await request.json();

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Validation failed",
            code: "VALIDATION_ERROR",
            details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          },
        },
        { status: 400 }
      );
    }

    const { data: row, error } = await supabase
      .from("learning_articles")
      .update(parsed.data)
      .eq("id", id)
      .select()
      .single();

    if (error || !row) {
      console.error("Error updating learning article:", error);
      return NextResponse.json(
        { data: null, error: { message: "Failed to update article", code: "UPDATE_ERROR" } },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as { role?: string }).role ?? "superadmin",
      action: "admin.content.learning.article.update",
      entity_type: "learning_article",
      entity_id: id,
      metadata: { status: row.status },
    });

    return NextResponse.json({ data: row, error: null });
  } catch (err) {
    console.error("Unexpected error in PUT learning article:", err);
    return NextResponse.json(
      { data: null, error: { message: "Failed to update article", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) return unauthorizedResponse("Authentication required");

    const { id } = await params;
    const supabase = await getSupabaseServer();

    const { error } = await supabase.from("learning_articles").delete().eq("id", id);

    if (error) {
      console.error("Error deleting learning article:", error);
      return NextResponse.json(
        { data: null, error: { message: "Failed to delete article", code: "DELETE_ERROR" } },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as { role?: string }).role ?? "superadmin",
      action: "admin.content.learning.article.delete",
      entity_type: "learning_article",
      entity_id: id,
      metadata: {},
    });

    return NextResponse.json({ data: { id, deleted: true }, error: null });
  } catch (err) {
    console.error("Unexpected error in DELETE learning article:", err);
    return NextResponse.json(
      { data: null, error: { message: "Failed to delete article", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}

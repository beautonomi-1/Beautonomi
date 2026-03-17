/**
 * GET /api/admin/content/learning/articles
 * POST /api/admin/content/learning/articles
 * Learning Center articles. Part of existing CMS.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";
import { ADMIN_SECTION_CONTENT_CATALOG } from "@/lib/admin-sections";

const articleSchema = z.object({
  category_id: z.string().uuid(),
  title: z.string().min(1, "Title is required"),
  slug: z.string().min(1, "Slug is required"),
  summary: z.string().nullable().optional(),
  body: z.string().default(""),
  content_format: z.enum(["html", "markdown"]).optional().default("html"),
  content_type: z.enum(["article", "video_guide"]).optional().default("article"),
  status: z.enum(["draft", "published", "scheduled", "archived"]).optional().default("draft"),
  audience: z.enum(["general", "customer", "provider", "internal"]),
  is_internal: z.boolean().optional().default(false),
  published_at: z.string().datetime().nullable().optional(),
  scheduled_at: z.string().datetime().nullable().optional(),
  image_url: z.string().url().nullable().optional(),
  featured_order: z.number().int().min(0).nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    if (!user) return unauthorizedResponse("Authentication required");

    const supabase = await getSupabaseServer(request);
    if (!supabase) {
      return NextResponse.json({ data: [], error: null });
    }

    const { searchParams } = new URL(request.url);
    const category_id = searchParams.get("category_id");
    const status = searchParams.get("status");
    const audience = searchParams.get("audience");

    let query = supabase
      .from("learning_articles")
      .select("*, learning_categories(title, slug)", { count: "exact" })
      .order("created_at", { ascending: false });

    if (category_id) query = query.eq("category_id", category_id);
    if (status) query = query.eq("status", status);
    if (audience) query = query.eq("audience", audience);

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching learning articles:", error);
      return NextResponse.json({ data: [], error: null });
    }

    return NextResponse.json({ data: data ?? [], error: null });
  } catch (err) {
    console.error("Unexpected error in GET /api/admin/content/learning/articles:", err);
    return NextResponse.json(
      { data: null, error: { message: "Failed to fetch articles", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    if (!user) return unauthorizedResponse("Authentication required");

    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const parsed = articleSchema.safeParse(body);
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

    const insert = {
      ...parsed.data,
      author_id: user.id,
      published_at: parsed.data.published_at ?? (parsed.data.status === "published" ? new Date().toISOString() : null),
    };

    const { data: row, error } = await supabase
      .from("learning_articles")
      .insert(insert)
      .select()
      .single();

    if (error || !row) {
      console.error("Error creating learning article:", error);
      return NextResponse.json(
        { data: null, error: { message: "Failed to create article", code: "CREATE_ERROR" } },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role ?? "superadmin",
      action: "admin.content.learning.article.create",
      entity_type: "learning_article",
      entity_id: row.id,
      metadata: { title: row.title, slug: row.slug, status: row.status },
    });

    return NextResponse.json({ data: row, error: null });
  } catch (err) {
    console.error("Unexpected error in POST /api/admin/content/learning/articles:", err);
    return NextResponse.json(
      { data: null, error: { message: "Failed to create article", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}

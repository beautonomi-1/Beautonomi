/**
 * GET /api/admin/content/learning/featured
 * PATCH /api/admin/content/learning/featured
 * Featured article ids (ordered) for Learning Center homepage.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";
import { ADMIN_SECTION_CONTENT_CATALOG } from "@/lib/admin-sections";

const patchSchema = z.object({
  article_ids: z.array(z.string().uuid()),
});

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    if (!user) return unauthorizedResponse("Authentication required");

    const supabase = await getSupabaseServer(request);
    if (!supabase) {
      return NextResponse.json({ data: { article_ids: [] }, error: null });
    }

    const { data: section } = await supabase
      .from("learning_homepage_sections")
      .select("payload")
      .eq("section_key", "featured_articles")
      .single();

    const article_ids = (section?.payload as { article_ids?: string[] })?.article_ids ?? [];

    return NextResponse.json({ data: { article_ids }, error: null });
  } catch (err) {
    console.error("Unexpected error in GET learning featured:", err);
    return NextResponse.json(
      { data: null, error: { message: "Failed to fetch featured", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    if (!user) return unauthorizedResponse("Authentication required");

    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const parsed = patchSchema.safeParse(body);
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
      .from("learning_homepage_sections")
      .upsert(
        { section_key: "featured_articles", payload: { article_ids: parsed.data.article_ids }, display_order: 2 },
        { onConflict: "section_key" }
      )
      .select()
      .single();

    if (error || !row) {
      console.error("Error updating featured articles:", error);
      return NextResponse.json(
        { data: null, error: { message: "Failed to update featured", code: "UPDATE_ERROR" } },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role ?? "superadmin",
      action: "admin.content.learning.featured.update",
      entity_type: "learning_homepage_sections",
      entity_id: row.id,
      metadata: { count: parsed.data.article_ids.length },
    });

    return NextResponse.json({ data: { article_ids: parsed.data.article_ids }, error: null });
  } catch (err) {
    console.error("Unexpected error in PATCH learning featured:", err);
    return NextResponse.json(
      { data: null, error: { message: "Failed to update featured", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}

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
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchScopedSingle } from "@/lib/tenant/scoped-overrides";

const patchSchema = z.object({
  article_ids: z.array(z.string().uuid()),
});

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    if (!user) return unauthorizedResponse("Authentication required");

    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    if (!supabase) {
      return NextResponse.json({ data: { article_ids: [] }, error: null });
    }

    const scoped = await fetchScopedSingle<{ payload?: { article_ids?: string[] } }>({
      supabase,
      table: "learning_homepage_sections",
      tenantId,
      select: "payload",
      apply: (q) => q.eq("section_key", "featured_articles"),
    });
    const section = scoped.data;

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
    const tenantId = await resolveAdminApiTenantId(request);
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

    const { data: existing } = await supabase
      .from("learning_homepage_sections")
      .select("id")
      .eq("section_key", "featured_articles")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    let row: { id: string } | null = null;
    let error: unknown = null;
    if (existing?.id) {
      const { data: updated, error: updateError } = await supabase
        .from("learning_homepage_sections")
        .update({ payload: { article_ids: parsed.data.article_ids }, display_order: 2, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select("id")
        .single();
      row = updated as { id: string } | null;
      error = updateError;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("learning_homepage_sections")
        .insert({ section_key: "featured_articles", payload: { article_ids: parsed.data.article_ids }, display_order: 2, tenant_id: tenantId })
        .select("id")
        .single();
      row = inserted as { id: string } | null;
      error = insertError;
    }

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

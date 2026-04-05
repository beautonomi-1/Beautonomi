/**
 * GET /api/admin/content/learning/categories
 * POST /api/admin/content/learning/categories
 * Learning Center categories. Part of existing CMS (no /api/admin/learning/*).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";
import { ADMIN_SECTION_CONTENT_CATALOG } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

const categorySchema = z.object({
  title: z.string().min(1, "Title is required"),
  slug: z.string().min(1, "Slug is required"),
  icon: z.string().nullable().optional(),
  sort_order: z.number().int().min(0).optional().default(0),
  audience: z.enum(["general", "customer", "provider", "internal"]),
  visibility: z.enum(["public", "internal"]).optional().default("public"),
  parent_id: z.string().uuid().nullable().optional(),
});

/** Build recursive tree from flat list (parent_id). */
function buildTree(
  items: Array<{ id: string; parent_id: string | null; [k: string]: unknown }>,
  parentId: string | null = null
): Array<{ id: string; parent_id: string | null; children: unknown[]; [k: string]: unknown }> {
  return items
    .filter((c) => (c.parent_id ?? null) === parentId)
    .sort((a, b) => (a.sort_order as number) - (b.sort_order as number))
    .map((c) => ({
      ...c,
      children: buildTree(items, c.id),
    }));
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    if (!user) return unauthorizedResponse("Authentication required");

    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    if (!supabase) {
      return NextResponse.json({ data: [], error: null });
    }

    const { searchParams } = new URL(request.url);
    const audience = searchParams.get("audience");
    const visibility = searchParams.get("visibility");
    const format = searchParams.get("format");

    let query = supabase
      .from("learning_categories")
      .select("*")
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (audience) query = query.eq("audience", audience);
    if (visibility) query = query.eq("visibility", visibility);

    const { data: rows, error } = await query;

    if (error) {
      console.error("Error fetching learning categories:", error);
      return NextResponse.json({ data: [], error: null });
    }

    const list = rows ?? [];
    if (format === "tree") {
      return NextResponse.json({ data: buildTree(list), error: null });
    }
    return NextResponse.json({ data: list, error: null });
  } catch (err) {
    console.error("Unexpected error in GET /api/admin/content/learning/categories:", err);
    return NextResponse.json(
      { data: null, error: { message: "Failed to fetch categories", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    if (!user) return unauthorizedResponse("Authentication required");

    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    const parsed = categorySchema.safeParse(body);
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
      .from("learning_categories")
      .insert({ ...parsed.data, tenant_id: tenantId })
      .select()
      .single();

    if (error || !row) {
      console.error("Error creating learning category:", error);
      return NextResponse.json(
        { data: null, error: { message: "Failed to create category", code: "CREATE_ERROR" } },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role ?? "superadmin",
      action: "admin.content.learning.category.create",
      entity_type: "learning_category",
      entity_id: row.id,
      metadata: { title: row.title, slug: row.slug },
    });

    return NextResponse.json({ data: row, error: null });
  } catch (err) {
    console.error("Unexpected error in POST /api/admin/content/learning/categories:", err);
    return NextResponse.json(
      { data: null, error: { message: "Failed to create category", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}

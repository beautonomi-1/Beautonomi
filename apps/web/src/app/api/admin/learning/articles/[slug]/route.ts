/**
 * GET /api/admin/learning/articles/[slug]
 * Full article body for the internal Knowledge Base reader (includes internal
 * articles). Any admin role. Read-only.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, handleApiError } from "@/lib/supabase/api-helpers";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { ADMIN_SECTION_OVERVIEW } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_OVERVIEW, request);
    if (!user) return unauthorizedResponse("Authentication required");

    const { slug } = await params;
    const admin = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { data, error } = await admin
      .from("learning_articles")
      .select(
        "id, title, slug, summary, body, content_format, content_type, audience, is_internal, status, updated_at, learning_categories(id, title, slug, audience, visibility)"
      )
      .eq("slug", slug)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json(
        { data: null, error: { message: "Article not found", code: "NOT_FOUND" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    return handleApiError(err, "Failed to load article");
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection, handleApiError, successResponse  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_CONTENT_CATALOG } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchScopedListMerged } from "@/lib/tenant/scoped-overrides";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);

    const scoped = await fetchScopedListMerged<Record<string, unknown>>({
      supabase,
      table: "about_us_content",
      tenantId,
      select: "*",
      dedupeKey: (row) => String(row.section_key ?? row.id ?? ""),
      orderBy: { column: "display_order", ascending: true },
    });
    const data = scoped.data;

    return successResponse(data || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch about us content");
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    const { section_key, title, content, display_order, is_active, image_url } = body;

    if (!section_key || !title || !content) {
      return NextResponse.json(
        { error: "section_key, title, and content are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("about_us_content")
      .insert({
        tenant_id: tenantId,
        section_key,
        title,
        content,
        display_order: display_order || 0,
        is_active: is_active !== undefined ? is_active : true,
        ...(image_url !== undefined && { image_url: image_url || null }),
      })
      .select()
      .single();

    if (error) throw error;

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to create about us content");
  }
}

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
      table: "footer_settings",
      tenantId,
      select: "*",
      dedupeKey: (row) => String(row.key ?? row.id ?? ""),
      orderBy: { column: "key", ascending: true },
    });
    const data = scoped.data;

    return successResponse(data || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch footer settings");
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    const { key, value, description } = body;

    if (!key || value === undefined) {
      return NextResponse.json(
        { error: "key and value are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('footer_settings')
      .insert({
        tenant_id: tenantId,
        key,
        value,
        description: description || null,
      })
      .select()
      .single();

    if (error) throw error;

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to create footer setting");
  }
}

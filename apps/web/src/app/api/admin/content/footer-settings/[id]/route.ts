import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection, handleApiError, successResponse  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_CONTENT_CATALOG } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);

    const { data, error } = await supabase
      .from('footer_settings')
      .select('*')
      .eq('id', id)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .single();

    if (error) throw error;

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to fetch footer setting");
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    const { value, description } = body;

    if (value === undefined) {
      return NextResponse.json(
        { error: "value is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('footer_settings')
      .update({
        value,
        description: description !== undefined ? description : undefined,
      })
      .eq('id', id)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .select()
      .single();

    if (error) throw error;

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to update footer setting");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);

    const { error } = await supabase
      .from('footer_settings')
      .delete()
      .eq('id', id)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`);

    if (error) throw error;

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete footer setting");
  }
}

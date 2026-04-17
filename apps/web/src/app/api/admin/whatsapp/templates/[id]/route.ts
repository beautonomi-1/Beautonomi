import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError, notFoundResponse, errorResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    const updates: Record<string, any> = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.body !== undefined) updates.body = body.body.trim();
    if (body.category !== undefined) updates.category = body.category;
    if (body.sort_order !== undefined) updates.sort_order = Number(body.sort_order);
    if (body.is_active !== undefined) updates.is_active = body.is_active;

    if (Object.keys(updates).length === 0) {
      return errorResponse("No fields to update", "VALIDATION_ERROR", 400);
    }

    const { data, error } = await supabase
      .from("whatsapp_templates")
      .update(updates)
      .eq("id", id)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .select()
      .single();

    if (error) throw error;
    if (!data) return notFoundResponse("Template not found");

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to update template");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { error } = await supabase
      .from("whatsapp_templates")
      .update({ is_active: false })
      .eq("id", id)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`);

    if (error) throw error;
    return successResponse({ deleted: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete template");
  }
}

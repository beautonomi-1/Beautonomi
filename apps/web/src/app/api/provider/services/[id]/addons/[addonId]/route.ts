import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, notFoundResponse, handleApiError, getProviderIdForUser, requireRoleInApi } from "@/lib/supabase/api-helpers";

type Params = { params: Promise<{ id: string; addonId: string }> };

/**
 * PATCH /api/provider/services/[id]/addons/[addonId]
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id: _serviceId, addonId } = await params;
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: existing } = await supabase
      .from("offerings")
      .select("id, provider_id")
      .eq("id", addonId)
      .eq("provider_id", providerId)
      .eq("service_type", "addon")
      .single();

    if (!existing) return notFoundResponse("Add-on not found");

    const body = await request.json();
    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.title = body.name;
    if (body.price !== undefined) updateData.price = Number(body.price);
    if (body.duration_minutes !== undefined) updateData.duration_minutes = Number(body.duration_minutes);

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data: addon, error } = await supabase
      .from("offerings")
      .update(updateData)
      .eq("id", addonId)
      .select()
      .single();

    if (error) throw error;

    return successResponse(addon);
  } catch (error) {
    return handleApiError(error, "Failed to update add-on");
  }
}

/**
 * DELETE /api/provider/services/[id]/addons/[addonId]
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id: _serviceId, addonId } = await params;
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: existing } = await supabase
      .from("offerings")
      .select("id, provider_id")
      .eq("id", addonId)
      .eq("provider_id", providerId)
      .eq("service_type", "addon")
      .single();

    if (!existing) return notFoundResponse("Add-on not found");

    const { error } = await supabase
      .from("offerings")
      .delete()
      .eq("id", addonId);

    if (error) throw error;

    return successResponse({ deleted: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete add-on");
  }
}

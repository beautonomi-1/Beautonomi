import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  successResponse,
  notFoundResponse,
  handleApiError,
  requireRoleInApi,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";

/**
 * PATCH /api/provider/services/[id]/variants/[variantId]
 *
 * Update a variant (title, price, duration_minutes, variant_name, variant_sort_order).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; variantId: string }> }
) {
  try {
    const { id: serviceId, variantId } = await params;

    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    // Verify the variant belongs to this provider's service
    const { data: existing, error: existingError } = await supabase
      .from("offerings")
      .select("id, provider_id, parent_service_id, service_type")
      .eq("id", variantId)
      .eq("provider_id", providerId)
      .eq("parent_service_id", serviceId)
      .eq("service_type", "variant")
      .single();

    if (existingError || !existing) return notFoundResponse("Variant not found");

    const body = await request.json();
    const { title, variant_name, description, price, duration_minutes, variant_sort_order } = body;

    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title;
    if (variant_name !== undefined) updateData.variant_name = variant_name;
    if (description !== undefined) updateData.description = description;
    if (price !== undefined) updateData.price = Number(price);
    if (duration_minutes !== undefined) updateData.duration_minutes = Number(duration_minutes);
    if (variant_sort_order !== undefined) updateData.variant_sort_order = Number(variant_sort_order);

    const { data: updated, error } = await supabase
      .from("offerings")
      .update(updateData)
      .eq("id", variantId)
      .select()
      .single();

    if (error || !updated) throw error || new Error("Failed to update variant");

    return successResponse(updated);
  } catch (error) {
    return handleApiError(error, "Failed to update variant");
  }
}

/**
 * DELETE /api/provider/services/[id]/variants/[variantId]
 *
 * Soft-delete a variant by setting is_active = false.
 * This preserves booking history that references the variant's offering_id.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; variantId: string }> }
) {
  try {
    const { id: serviceId, variantId } = await params;

    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    // Verify the variant belongs to this provider's service
    const { data: existing, error: existingError } = await supabase
      .from("offerings")
      .select("id, provider_id, parent_service_id, service_type")
      .eq("id", variantId)
      .eq("provider_id", providerId)
      .eq("parent_service_id", serviceId)
      .eq("service_type", "variant")
      .single();

    if (existingError || !existing) return notFoundResponse("Variant not found");

    // Soft-delete: set is_active = false so historical booking records remain valid
    const { error } = await supabase
      .from("offerings")
      .update({ is_active: false })
      .eq("id", variantId);

    if (error) throw error;

    return successResponse({ id: variantId, deleted: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete variant");
  }
}

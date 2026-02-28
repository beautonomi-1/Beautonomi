import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import type { OfferingCard } from "@/types/beautonomi";

/**
 * GET /api/provider/services/[id]
 * Get a specific service. Uses requireRoleInApi(request) so mobile Bearer token works.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { id } = await params;
    const { data: service, error } = await supabase
      .from("offerings")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !service) return notFoundResponse("Service not found");
    return successResponse(service as OfferingCard);
  } catch (error) {
    return handleApiError(error, "Failed to fetch service");
  }
}

/**
 * PATCH /api/provider/services/[id]
 * Update a service.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permissionCheck = await requirePermission("edit_services", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;

    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(permissionCheck.user!.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { id } = await params;
    const body = await request.json();

    const { data: existingService } = await supabase
      .from("offerings")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existingService) return notFoundResponse("Service not found");

    // Update service
    const updateData: any = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.name !== undefined) updateData.title = body.name; // Support both title and name
    if (body.service_type !== undefined) updateData.service_type = body.service_type;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.aftercare_description !== undefined) updateData.aftercare_description = body.aftercare_description;
    if (body.price !== undefined) updateData.price = parseFloat(body.price);
    if (body.duration_minutes !== undefined)
      updateData.duration_minutes = parseInt(body.duration_minutes);
    if (body.category_id !== undefined) updateData.category_id = body.category_id;
    if (body.provider_category_id !== undefined) updateData.provider_category_id = body.provider_category_id;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.online_booking_enabled !== undefined) updateData.online_booking_enabled = body.online_booking_enabled;
    if (body.service_available_for !== undefined) updateData.service_available_for = body.service_available_for;
    if (body.team_member_commission_enabled !== undefined) updateData.team_member_commission_enabled = body.team_member_commission_enabled;
    if (body.price_type !== undefined) updateData.price_type = body.price_type;
    if (body.pricing_name !== undefined) updateData.pricing_name = body.pricing_name;
    if (body.extra_time_enabled !== undefined) updateData.extra_time_enabled = body.extra_time_enabled;
    if (body.extra_time_duration !== undefined) updateData.extra_time_duration = parseInt(body.extra_time_duration);
    if (body.reminder_to_rebook_enabled !== undefined) updateData.reminder_to_rebook_enabled = body.reminder_to_rebook_enabled;
    if (body.reminder_to_rebook_weeks !== undefined) updateData.reminder_to_rebook_weeks = parseInt(body.reminder_to_rebook_weeks);
    if (body.service_cost_percentage !== undefined) updateData.service_cost_percentage = parseFloat(body.service_cost_percentage);
    if (body.tax_rate !== undefined) updateData.tax_rate = parseFloat(body.tax_rate);
    if (body.included_services !== undefined) updateData.included_services = body.included_services;
    if (body.team_member_ids !== undefined) updateData.team_member_ids = body.team_member_ids;
    if (body.pricing_options !== undefined) updateData.pricing_options = Array.isArray(body.pricing_options) ? body.pricing_options : [];
    if (body.display_order !== undefined) updateData.display_order = parseInt(body.display_order);
    // Location support fields
    if (body.supports_at_salon !== undefined) updateData.supports_at_salon = body.supports_at_salon;
    if (body.supports_at_home !== undefined) updateData.supports_at_home = body.supports_at_home;
    if (body.at_home_radius_km !== undefined) updateData.at_home_radius_km = body.at_home_radius_km !== null ? parseFloat(body.at_home_radius_km) : null;
    if (body.at_home_price_adjustment !== undefined) updateData.at_home_price_adjustment = parseFloat(body.at_home_price_adjustment) || 0;
    // Variant fields
    if (body.parent_service_id !== undefined) updateData.parent_service_id = body.parent_service_id || null;
    if (body.variant_name !== undefined) updateData.variant_name = body.variant_name || null;
    if (body.variant_sort_order !== undefined) updateData.variant_sort_order = parseInt(body.variant_sort_order) || 0;
    // Add-on fields
    if (body.addon_category !== undefined) updateData.addon_category = body.addon_category || null;
    if (body.applicable_service_ids !== undefined) updateData.applicable_service_ids = body.applicable_service_ids || null;
    if (body.is_recommended !== undefined) updateData.is_recommended = body.is_recommended || false;
    // Advanced pricing
    if (body.advanced_pricing_rules !== undefined) updateData.advanced_pricing_rules = Array.isArray(body.advanced_pricing_rules) ? body.advanced_pricing_rules : [];
    if (body.image_url !== undefined) updateData.image_url = body.image_url;

    const { data: updatedService, error: updateError } = await (supabase
      .from("offerings") as any)
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError || !updatedService) throw updateError ?? new Error("Failed to update service");
    return successResponse(updatedService as OfferingCard);
  } catch (error) {
    return handleApiError(error, "Failed to update service");
  }
}

/**
 * DELETE /api/provider/services/[id]
 * Delete a service.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permissionCheck = await requirePermission("edit_services", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;

    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(permissionCheck.user!.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { id } = await params;
    const { data: existingService } = await supabase
      .from("offerings")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existingService) return notFoundResponse("Service not found");

    const { error: deleteError } = await supabase.from("offerings").delete().eq("id", id);
    if (deleteError) throw deleteError;
    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete service");
  }
}

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import type { OfferingCard } from "@/types/beautonomi";
import {
  mergePrimaryTierIntoStoredPricingOptions,
  shouldSyncPricingOptionVariants,
  syncVariantOfferings,
  type RawPricingOption,
} from "../_helpers/sync-variants";
import {
  isMissingColumnError,
  normalizeAdvancedPricingRules,
} from "../_helpers/advanced-pricing-rules";

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

    const updateData: Record<string, unknown> = {};
    const parseFiniteNumber = (value: unknown, field: string): number | null => {
      if (value === null || value === "") return null;
      const n = typeof value === "number" ? value : Number(String(value).trim());
      if (!Number.isFinite(n)) {
        throw new Error(`Invalid numeric value for ${field}`);
      }
      return n;
    };
    const parseFiniteInt = (value: unknown, field: string): number | null => {
      const n = parseFiniteNumber(value, field);
      return n == null ? null : Math.trunc(n);
    };
    if (body.title !== undefined) updateData.title = body.title;
    if (body.name !== undefined) updateData.title = body.name; // Support both title and name
    if (body.service_type !== undefined) updateData.service_type = body.service_type;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.aftercare_description !== undefined) updateData.aftercare_description = body.aftercare_description;
    if (body.price !== undefined) updateData.price = parseFiniteNumber(body.price, "price");
    if (body.duration_minutes !== undefined)
      updateData.duration_minutes = parseFiniteInt(body.duration_minutes, "duration_minutes");
    // `category_id` is the master/service-category column; provider catalogue categories
    // must write `provider_category_id`. Older mobile/web clients sent provider category
    // selection as `category_id`, so normalize it after verifying ownership.
    const incomingProviderCategory =
      body.provider_category_id !== undefined ? body.provider_category_id : body.category_id;
    if (incomingProviderCategory !== undefined) {
      const categoryId =
        typeof incomingProviderCategory === "string" && incomingProviderCategory.trim()
          ? incomingProviderCategory.trim()
          : null;
      if (categoryId) {
        const { data: cat, error: catErr } = await supabase
          .from("provider_categories")
          .select("id")
          .eq("id", categoryId)
          .eq("provider_id", providerId)
          .maybeSingle();
        if (catErr) throw catErr;
        if (!cat) {
          return errorResponse("Selected category does not belong to this provider.", "INVALID_CATEGORY", 400);
        }
      }
      updateData.provider_category_id = categoryId;
    }
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.online_booking_enabled !== undefined) updateData.online_booking_enabled = body.online_booking_enabled;
    if (body.service_available_for !== undefined) updateData.service_available_for = body.service_available_for;
    if (body.team_member_commission_enabled !== undefined) updateData.team_member_commission_enabled = body.team_member_commission_enabled;
    if (body.price_type !== undefined) updateData.price_type = body.price_type;
    if (body.pricing_name !== undefined) updateData.pricing_name = body.pricing_name;
    if (body.extra_time_enabled !== undefined) updateData.extra_time_enabled = body.extra_time_enabled;
    if (body.extra_time_duration !== undefined) updateData.extra_time_duration = parseFiniteInt(body.extra_time_duration, "extra_time_duration");
    if (body.reminder_to_rebook_enabled !== undefined) updateData.reminder_to_rebook_enabled = body.reminder_to_rebook_enabled;
    if (body.reminder_to_rebook_weeks !== undefined) updateData.reminder_to_rebook_weeks = parseFiniteInt(body.reminder_to_rebook_weeks, "reminder_to_rebook_weeks");
    if (body.service_cost_percentage !== undefined) updateData.service_cost_percentage = parseFiniteNumber(body.service_cost_percentage, "service_cost_percentage");
    if (body.tax_rate !== undefined) updateData.tax_rate = parseFiniteNumber(body.tax_rate, "tax_rate");
    if (body.included_services !== undefined) updateData.included_services = body.included_services;
    if (body.team_member_ids !== undefined) updateData.team_member_ids = body.team_member_ids;
    if (body.pricing_options !== undefined) updateData.pricing_options = Array.isArray(body.pricing_options) ? body.pricing_options : [];
    if (body.display_order !== undefined) updateData.display_order = parseFiniteInt(body.display_order, "display_order");
    // Location support fields
    if (body.supports_at_salon !== undefined) updateData.supports_at_salon = body.supports_at_salon;
    if (body.supports_at_home !== undefined) updateData.supports_at_home = body.supports_at_home;
    if (body.at_home_radius_km !== undefined) updateData.at_home_radius_km = parseFiniteNumber(body.at_home_radius_km, "at_home_radius_km");
    if (body.at_home_price_adjustment !== undefined) updateData.at_home_price_adjustment = parseFiniteNumber(body.at_home_price_adjustment, "at_home_price_adjustment") ?? 0;
    // Variant fields
    if (body.parent_service_id !== undefined) updateData.parent_service_id = body.parent_service_id || null;
    if (body.variant_name !== undefined) updateData.variant_name = body.variant_name || null;
    if (body.variant_sort_order !== undefined) updateData.variant_sort_order = parseFiniteInt(body.variant_sort_order, "variant_sort_order") ?? 0;
    // Add-on fields
    if (body.addon_category !== undefined) updateData.addon_category = body.addon_category || null;
    if (body.applicable_service_ids !== undefined) updateData.applicable_service_ids = body.applicable_service_ids || null;
    if (body.is_recommended !== undefined) updateData.is_recommended = body.is_recommended || false;
    // Advanced pricing
    if (body.advanced_pricing_rules !== undefined) {
      updateData.advanced_pricing_rules = normalizeAdvancedPricingRules(body.advanced_pricing_rules);
    }
    if (body.image_url !== undefined) updateData.image_url = body.image_url;

    let { data: updatedService, error: updateError } = await supabase
      .from("offerings")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (
      updateError &&
      isMissingColumnError(updateError, "advanced_pricing_rules") &&
      "advanced_pricing_rules" in updateData
    ) {
      console.warn(
        "[PATCH /api/provider/services] advanced_pricing_rules column missing — saving without rules. Apply migration 638_offerings_advanced_pricing_rules.sql.",
      );
      const { advanced_pricing_rules: _dropped, ...updateWithoutRules } = updateData;
      ({ data: updatedService, error: updateError } = await supabase
        .from("offerings")
        .update(updateWithoutRules)
        .eq("id", id)
        .select()
        .single());
    }

    if (updateError || !updatedService) throw updateError ?? new Error("Failed to update service");

    // Sync child variant offerings when pricing_options are explicitly updated,
    // or when primary price/duration changed on a multi-tier service (quick-edit safety net).
    let variant_sync = null;
    if (shouldSyncPricingOptionVariants(updatedService.service_type)) {
      if (body.pricing_options !== undefined) {
        const opts = Array.isArray(body.pricing_options) ? body.pricing_options : [];
        variant_sync = await syncVariantOfferings(
          supabase,
          updatedService as Record<string, unknown>,
          opts,
        );
      } else if (body.price !== undefined || body.duration_minutes !== undefined) {
        const merged = mergePrimaryTierIntoStoredPricingOptions(
          updatedService.pricing_options as RawPricingOption[],
          Number(updatedService.price),
          Number(updatedService.duration_minutes),
        );
        if (merged) {
          const { data: resynced, error: mergeError } = await supabase
            .from("offerings")
            .update({ pricing_options: merged })
            .eq("id", id)
            .select()
            .single();
          if (mergeError || !resynced) {
            throw mergeError ?? new Error("Failed to update pricing_options for tier sync");
          }
          variant_sync = await syncVariantOfferings(
            supabase,
            resynced as Record<string, unknown>,
            merged,
          );
          return successResponse({ ...(resynced as OfferingCard), variant_sync });
        }
      }
    }

    return successResponse({ ...(updatedService as OfferingCard), variant_sync });
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

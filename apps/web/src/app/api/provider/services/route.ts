import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, notFoundResponse, handleApiError, requireRoleInApi, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import type { OfferingCard } from "@/types/beautonomi";

/**
 * GET /api/provider/services
 * 
 * Get provider's services/offerings
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff'], request);
    const supabase = await getSupabaseServer(request);

    // Get provider ID for user
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: services, error } = await supabase
      .from("offerings")
      .select(`
        *,
        provider_categories (
          id,
          name,
          slug,
          color,
          description
        )
      `)
      .eq("provider_id", providerId)
      .eq("is_active", true)
      .order("display_order", { ascending: true, nullsFirst: false })
      .order("title", { ascending: true });

    if (error) {
      console.error("Error fetching services:", error);
      throw error;
    }

    console.log(`Fetched ${(services || []).length} services for provider ${providerId}`);

    return successResponse((services || []) as OfferingCard[]);
  } catch (error) {
    return handleApiError(error, "Failed to fetch services");
  }
}

/**
 * POST /api/provider/services
 * 
 * Create a new service/offering
 */
export async function POST(request: Request) {
  try {
    // Check permission to edit services
    const permissionCheck = await requirePermission('edit_services', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const {
      title,
      name,
      service_type,
      description,
      aftercare_description,
      price,
      duration_minutes,
      buffer_minutes,
      master_service_id,
      category_id,
      provider_category_id,
      subcategory_id,
      supports_at_home,
      supports_at_salon,
      at_home_radius_km,
      at_home_price_adjustment,
      currency,
      is_active,
      online_booking_enabled,
      service_available_for,
      team_member_ids,
      team_member_commission_enabled,
      price_type,
      pricing_name,
      pricing_options,
      extra_time_enabled,
      extra_time_duration,
      reminder_to_rebook_enabled,
      reminder_to_rebook_weeks,
      service_cost_percentage,
      tax_rate,
      included_services,
      display_order,
      // Add-on fields
      addon_category,
      applicable_service_ids,
      is_recommended,
      // Variant fields
      parent_service_id,
      variant_name,
      variant_sort_order,
    } = body;

    const serviceTitle = title || name;
    if (!serviceTitle || !price || !duration_minutes) {
      return handleApiError(new Error("title/name, price, and duration_minutes are required"), "Validation failed", "VALIDATION_ERROR", 400);
    }
    
    // Validate variant fields
    if (service_type === 'variant' && !parent_service_id) {
      return handleApiError(new Error("parent_service_id is required for variant services"), "Validation failed", "VALIDATION_ERROR", 400);
    }

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Use provider_category_id if provided, otherwise fall back to category_id
    const finalCategoryId = provider_category_id || category_id || null;

    const { data: service, error } = await supabase
      .from("offerings")
      .insert({
        provider_id: providerId,
        title: serviceTitle,
        service_type: service_type || 'basic',
        description: description || null,
        aftercare_description: aftercare_description || null,
        price: parseFloat(price),
        duration_minutes: parseInt(duration_minutes),
        buffer_minutes: buffer_minutes || 15,
        master_service_id: master_service_id || null,
        category_id: category_id || null, // Keep for backward compatibility
        provider_category_id: finalCategoryId,
        subcategory_id: subcategory_id || null,
        supports_at_home: supports_at_home ?? false,
        supports_at_salon: supports_at_salon ?? true,
        at_home_radius_km: at_home_radius_km || null,
        at_home_price_adjustment: at_home_price_adjustment || 0,
        currency: currency || 'ZAR',
        is_active: is_active ?? true,
        online_booking_enabled: online_booking_enabled ?? true,
        service_available_for: service_available_for || 'everyone',
        team_member_commission_enabled: team_member_commission_enabled ?? false,
        price_type: price_type || 'fixed',
        pricing_name: pricing_name || null,
        extra_time_enabled: extra_time_enabled ?? false,
        extra_time_duration: extra_time_duration || 0,
        reminder_to_rebook_enabled: reminder_to_rebook_enabled ?? false,
        reminder_to_rebook_weeks: reminder_to_rebook_weeks || 4,
        service_cost_percentage: service_cost_percentage || 0,
        tax_rate: tax_rate || 0,
        included_services: included_services || [],
        team_member_ids: team_member_ids && Array.isArray(team_member_ids) ? team_member_ids : [],
        pricing_options: pricing_options && Array.isArray(pricing_options) ? pricing_options : [],
        display_order: display_order || 0,
        // Add-on fields
        addon_category: service_type === 'addon' ? (addon_category || 'general') : null,
        applicable_service_ids: service_type === 'addon' && applicable_service_ids?.length > 0 ? applicable_service_ids : null,
        is_recommended: is_recommended ?? false,
        // Variant fields
        parent_service_id: service_type === 'variant' ? (parent_service_id || null) : null,
        variant_name: service_type === 'variant' ? (variant_name || null) : null,
        variant_sort_order: variant_sort_order || 0,
      })
      .select()
      .single();

    if (error || !service) {
      throw error || new Error("Failed to create service");
    }

    return successResponse(service as OfferingCard);
  } catch (error) {
    return handleApiError(error, "Failed to create service");
  }
}

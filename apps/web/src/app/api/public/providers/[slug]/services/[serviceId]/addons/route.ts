import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";

/** Empty addons response so booking flow never 404s on addons */
function emptyAddonsResponse(serviceId: string) {
  return successResponse({
    service_id: serviceId,
    service_name: null,
    categories: [],
    all_addons: [],
    total_count: 0,
    has_recommended: false,
  });
}

/**
 * GET /api/public/providers/[slug]/services/[serviceId]/addons
 *
 * Get all add-ons applicable to a specific service (public endpoint for checkout).
 * Accepts either an offering id or a service id. Returns 200 with empty addons when
 * the service is not found so the booking flow does not break.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; serviceId: string }> }
) {
  try {
    const { slug, serviceId } = await params;
    const supabase = await getSupabaseServer();

    // Get provider by slug
    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("id")
      .eq("slug", slug)
      .single();

    if (providerError || !provider) {
      return notFoundResponse("Provider not found");
    }

    // Resolve service: try as offering id first, then as service_id on offerings
    let service: { id: string; title: string; provider_id: string; service_id?: string | null } | null = null;
    const byOfferingId = await supabase
      .from("offerings")
      .select("id, title, provider_id, service_id")
      .eq("id", serviceId)
      .eq("provider_id", provider.id)
      .single();

    if (byOfferingId.data) {
      service = byOfferingId.data;
    } else {
      const byServiceId = await supabase
        .from("offerings")
        .select("id, title, provider_id, service_id")
        .eq("service_id", serviceId)
        .eq("provider_id", provider.id)
        .limit(1)
        .maybeSingle();
      if (byServiceId.data) service = byServiceId.data;
    }

    if (!service) {
      return emptyAddonsResponse(serviceId);
    }

    // applicable_service_ids may reference service_id or offering id; match both when available
    const orClause =
      service.service_id && service.service_id !== serviceId
        ? `applicable_service_ids.is.null,applicable_service_ids.cs.{${serviceId}},applicable_service_ids.cs.{${service.service_id}}`
        : `applicable_service_ids.is.null,applicable_service_ids.cs.{${serviceId}}`;

    const { data: addons, error } = await supabase
      .from("offerings")
      .select(`
        id,
        title,
        description,
        price,
        duration_minutes,
        currency,
        addon_category,
        is_recommended,
        applicable_service_ids,
        display_order
      `)
      .eq("provider_id", provider.id)
      .eq("service_type", "addon")
      .eq("is_active", true)
      .eq("online_booking_enabled", true)
      .or(orClause)
      .order("is_recommended", { ascending: false })
      .order("addon_category")
      .order("display_order");

    if (error) {
      throw error;
    }

    // Group add-ons by category
    const groupedAddons: Record<string, { name: string; addons: any[] }> = {};
    
    const categoryLabels: Record<string, string> = {
      hair_treatments: "Hair Treatments",
      nail_enhancements: "Nail Enhancements",
      skin_treatments: "Skin Treatments",
      massage_extras: "Massage Extras",
      styling_extras: "Styling Extras",
      waxing_extras: "Waxing Extras",
      general: "Additional Options",
    };

    (addons || []).forEach((addon: any) => {
      const category = addon.addon_category || "general";
      if (!groupedAddons[category]) {
        groupedAddons[category] = {
          name: categoryLabels[category] || category,
          addons: [],
        };
      }
      groupedAddons[category].addons.push({
        id: addon.id,
        title: addon.title,
        description: addon.description,
        price: addon.price,
        duration_minutes: addon.duration_minutes,
        currency: addon.currency,
        is_recommended: addon.is_recommended,
      });
    });

    // Convert to sorted array (recommended categories first)
    const sortedCategories = Object.entries(groupedAddons)
      .map(([key, value]) => ({
        category: key,
        name: value.name,
        addons: value.addons,
      }))
      .sort((a, b) => {
        // Put categories with recommended items first
        const aHasRecommended = a.addons.some((addon) => addon.is_recommended);
        const bHasRecommended = b.addons.some((addon) => addon.is_recommended);
        if (aHasRecommended && !bHasRecommended) return -1;
        if (!aHasRecommended && bHasRecommended) return 1;
        return 0;
      });

    return successResponse({
      service_id: serviceId,
      service_name: service.title,
      categories: sortedCategories,
      all_addons: addons || [],
      total_count: (addons || []).length,
      has_recommended: (addons || []).some((a: any) => a.is_recommended),
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch add-ons");
  }
}

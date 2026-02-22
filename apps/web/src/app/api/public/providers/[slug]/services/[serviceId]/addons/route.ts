import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/public/providers/[slug]/services/[serviceId]/addons
 * 
 * Get all add-ons applicable to a specific service (public endpoint for checkout)
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

    // Verify the service belongs to this provider
    const { data: service, error: serviceError } = await supabase
      .from("offerings")
      .select("id, title, provider_id")
      .eq("id", serviceId)
      .eq("provider_id", provider.id)
      .single();

    if (serviceError || !service) {
      return notFoundResponse("Service not found");
    }

    // Get all add-ons for this provider that are applicable to this service
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
      .or(`applicable_service_ids.is.null,applicable_service_ids.cs.{${serviceId}}`)
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

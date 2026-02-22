import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse } from "@/lib/supabase/api-helpers";

/**
 * GET /api/public/providers/[slug]/group-booking-settings
 *
 * Get group booking settings for a provider (public endpoint for client booking)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = await getSupabaseServer();

    if (!supabase) {
      // Return default values if database connection is not available
      return successResponse({
        enabled: false,
        maxGroupSize: 10,
        excludedServices: [],
        enabledLocations: [],
      });
    }

    // Decode slug safely
    let decodedSlug: string;
    try {
      decodedSlug = decodeURIComponent(slug);
    } catch {
      decodedSlug = slug;
    }

    // Get provider by slug - try without status filter first, then with it
    let provider: { id: string; online_group_booking_enabled: boolean | null; max_group_size: number | null } | null = null;
    
    // First try with decoded slug without status filter
    const { data: providerData1 } = await supabase
      .from("providers")
      .select("id, online_group_booking_enabled, max_group_size")
      .eq("slug", decodedSlug)
      .maybeSingle();

    if (providerData1) {
      provider = providerData1;
    } else {
      // Try with original slug without status filter
      const { data: providerData2 } = await supabase
        .from("providers")
        .select("id, online_group_booking_enabled, max_group_size")
        .eq("slug", slug)
        .maybeSingle();
      
      if (providerData2) {
        provider = providerData2;
      }
    }

    // If provider not found, return default values (don't return 404)
    if (!provider || !provider.id) {
      return successResponse({
        enabled: false,
        maxGroupSize: 10,
        excludedServices: [],
        enabledLocations: [],
      });
    }

    // Get excluded services and enabled locations from provider settings
    const { data: settings } = await supabase
      .from("provider_settings")
      .select("group_booking_excluded_services, group_booking_enabled_locations")
      .eq("provider_id", provider.id)
      .maybeSingle();

    return successResponse({
      enabled: provider.online_group_booking_enabled ?? false,
      maxGroupSize: provider.max_group_size ?? 10,
      excludedServices: settings?.group_booking_excluded_services || [],
      enabledLocations: settings?.group_booking_enabled_locations || [],
    });
  } catch (error) {
    // Return default values on error instead of error response
    console.error("[Group Booking Settings] Error:", error);
    return successResponse({
      enabled: false,
      maxGroupSize: 10,
      excludedServices: [],
      enabledLocations: [],
    });
  }
}

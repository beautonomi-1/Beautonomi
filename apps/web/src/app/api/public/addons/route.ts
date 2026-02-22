import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/public/addons
 * 
 * Get available addons for a service or provider (public endpoint)
 */
export async function GET(request: Request) {
  try {
    const supabase = await getSupabaseServer();
    const { searchParams } = new URL(request.url);
    const serviceId = searchParams.get("service_id");
    const providerId = searchParams.get("provider_id");
    const locationId = searchParams.get("location_id");
    const type = searchParams.get("type");

    let query = supabase
      .from("service_addons")
      .select("*")
      .eq("is_active", true)
      .order("is_recommended", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (providerId) {
      // Get provider-specific addons and global addons
      query = query.or(`provider_id.eq.${providerId},provider_id.is.null`);
    } else {
      // Only global addons
      query = query.is("provider_id", null);
    }

    if (type) {
      query = query.eq("type", type);
    }

    const { data: addons, error } = await query;

    if (error) {
      console.error("Error fetching addons:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to fetch addons",
            code: "FETCH_ERROR",
          },
        },
        { status: 500 }
      );
    }

    // Filter by location (branch): when location_id provided, only addons available at that location
    let filteredAddons = addons ?? [];
    if (locationId && filteredAddons.length > 0) {
      const addonIds = filteredAddons.map((a: any) => a.id);
      const { data: addonLocs } = await supabase
        .from("addon_locations")
        .select("addon_id")
        .in("addon_id", addonIds)
        .eq("location_id", locationId);
      const addonIdsAtLocation = new Set((addonLocs ?? []).map((r: any) => r.addon_id));
      const { data: allAddonLocs } = await supabase
        .from("addon_locations")
        .select("addon_id")
        .in("addon_id", addonIds);
      const addonIdsWithRestriction = new Set((allAddonLocs ?? []).map((r: any) => r.addon_id));
      filteredAddons = filteredAddons.filter(
        (a: any) => !addonIdsWithRestriction.has(a.id) || addonIdsAtLocation.has(a.id)
      );
    }

    // Filter by service if specified
    if (serviceId && filteredAddons.length > 0) {
      const { data: associations } = await supabase
        .from("service_addon_associations")
        .select("addon_id")
        .eq("service_id", serviceId);

      const associatedAddonIds = new Set(associations?.map((a: any) => a.addon_id) || []);

      // Include addons that are either:
      // 1. Associated with this service
      // 2. Not restricted to specific services (no associations)
      const { data: allAssociations } = await supabase
        .from("service_addon_associations")
        .select("addon_id");

      const addonsWithRestrictions = new Set(
        allAssociations?.map((a: any) => a.addon_id) || []
      );

      const byService = filteredAddons.filter((addon: any) => {
        if (!addonsWithRestrictions.has(addon.id)) return true;
        return associatedAddonIds.has(addon.id);
      });

      return NextResponse.json({
        data: byService,
        error: null,
      });
    }

    return NextResponse.json({
      data: filteredAddons,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/public/addons:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch addons",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

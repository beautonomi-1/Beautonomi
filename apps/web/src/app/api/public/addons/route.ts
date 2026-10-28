import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { AddonTargetIds } from "@/lib/offerings/addon-applicability";
import {
  filterAddonsByLocation,
  filterAddonsByService,
  mapOfferingRowToAddonApi,
  OFFERING_ADDON_SELECT,
  shouldReturnEmptyForAddonTypeFilter,
  type OfferingAddonRow,
} from "@/lib/offerings/addon-offering-api";

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

    if (!providerId) {
      return NextResponse.json({ data: [], error: null });
    }

    if (shouldReturnEmptyForAddonTypeFilter(type)) {
      return NextResponse.json({ data: [], error: null });
    }

    const { data: addons, error } = await supabase
      .from("offerings")
      .select(OFFERING_ADDON_SELECT)
      .eq("provider_id", providerId)
      .eq("service_type", "addon")
      .eq("is_active", true)
      .eq("online_booking_enabled", true)
      .order("is_recommended", { ascending: false })
      .order("display_order", { ascending: true })
      .order("title", { ascending: true });

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
        { status: 500 },
      );
    }

    let filteredAddons = (addons ?? []) as OfferingAddonRow[];

    if (locationId && filteredAddons.length > 0) {
      const addonIds = filteredAddons.map((a) => a.id);
      const { data: addonLocs, error: locErr } = await supabase
        .from("addon_locations")
        .select("addon_id")
        .in("addon_id", addonIds)
        .eq("location_id", locationId);
      const { data: allAddonLocs } = locErr
        ? { data: null as { addon_id: string }[] | null }
        : await supabase.from("addon_locations").select("addon_id").in("addon_id", addonIds);
      if (!locErr) {
        filteredAddons = filterAddonsByLocation(
          filteredAddons,
          locationId,
          addonLocs,
          allAddonLocs,
        );
      }
    }

    if (serviceId && filteredAddons.length > 0) {
      const { data: serviceRow } = await supabase
        .from("offerings")
        .select("id, parent_service_id, master_service_id")
        .eq("id", serviceId)
        .eq("provider_id", providerId)
        .maybeSingle();

      const target: AddonTargetIds | null = serviceRow
        ? {
            id: serviceRow.id,
            parent_service_id: (serviceRow as { parent_service_id?: string | null })
              .parent_service_id,
            master_service_id: (serviceRow as { master_service_id?: string | null })
              .master_service_id,
          }
        : { id: serviceId };

      filteredAddons = filterAddonsByService(filteredAddons, target);
    }

    return NextResponse.json({
      data: filteredAddons.map(mapOfferingRowToAddonApi),
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
      { status: 500 },
    );
  }
}

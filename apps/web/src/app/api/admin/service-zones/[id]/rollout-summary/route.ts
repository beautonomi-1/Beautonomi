import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@/lib/admin-sections";

const CHUNK = 400;

/**
 * GET /api/admin/service-zones/[id]/rollout-summary
 * Distinct cities / provinces covered by postal inclusions (for city-by-city rollout visibility).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();
    const { id } = await params;

    const { data: zone, error: zErr } = await supabase
      .from("platform_zones")
      .select("id, country_code")
      .eq("id", id)
      .single();

    if (zErr || !zone) return notFoundResponse("Zone not found");

    const country = (zone as { country_code?: string }).country_code;
    if (!country) {
      return successResponse({
        postal_area_count: 0,
        cities: [] as string[],
        provinces: [] as string[],
        towns: [] as string[],
      });
    }

    const { data: rows } = await supabase
      .from("platform_zone_inclusions")
      .select("ref_code, type")
      .eq("zone_id", id)
      .eq("type", "postal_code");

    const codes = [
      ...new Set(
        (rows || [])
          .map((r: { ref_code?: string }) => r.ref_code?.trim())
          .filter((c): c is string => !!c)
      ),
    ];

    if (codes.length === 0) {
      return successResponse({
        postal_area_count: 0,
        cities: [],
        provinces: [],
        towns: [],
      });
    }

    const cities = new Set<string>();
    const provinces = new Set<string>();
    const towns = new Set<string>();

    for (let i = 0; i < codes.length; i += CHUNK) {
      const chunk = codes.slice(i, i + CHUNK);
      const { data: areas, error: aErr } = await admin
        .from("postal_areas")
        .select("city_name, province_name, town_name")
        .eq("country_code", country.toUpperCase())
        .in("postal_code", chunk);

      if (aErr) throw aErr;
      type A = { city_name?: string; province_name?: string; town_name?: string };
      for (const a of (areas || []) as A[]) {
        if (a.city_name) cities.add(a.city_name);
        if (a.province_name) provinces.add(a.province_name);
        if (a.town_name) towns.add(a.town_name);
      }
    }

    return successResponse({
      postal_area_count: codes.length,
      cities: Array.from(cities).sort((a, b) => a.localeCompare(b)),
      provinces: Array.from(provinces).sort((a, b) => a.localeCompare(b)),
      towns: Array.from(towns).sort((a, b) => a.localeCompare(b)),
    });
  } catch (error) {
    return handleApiError(error, "Failed to build rollout summary");
  }
}

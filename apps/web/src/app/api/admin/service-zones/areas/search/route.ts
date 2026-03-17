import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
 } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@/lib/admin-sections";

const MAX_RESULTS = 50;

/**
 * GET /api/admin/service-zones/areas/search
 * Search provinces, cities, towns, postal codes by text (metadata only).
 * Query: country (required), q (search string)
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);
    const country = searchParams.get("country")?.trim();
    const q = searchParams.get("q")?.trim()?.toLowerCase();

    if (!country) {
      return errorResponse("country is required", "VALIDATION_ERROR", 400);
    }

    if (!q || q.length < 2) {
      return successResponse({ provinces: [], cities: [], towns: [], postal_codes: [] });
    }

    const pattern = `%${q}%`;

    const [provincesRes, citiesRes, townsRes, postalRes] = await Promise.all([
      supabase
        .from("postal_areas")
        .select("province_name")
        .eq("country_code", country.toUpperCase())
        .ilike("province_name", pattern)
        .not("province_name", "is", null)
        .limit(MAX_RESULTS),
      supabase
        .from("postal_areas")
        .select("city_name")
        .eq("country_code", country.toUpperCase())
        .ilike("city_name", pattern)
        .not("city_name", "is", null)
        .limit(MAX_RESULTS),
      supabase
        .from("postal_areas")
        .select("town_name")
        .eq("country_code", country.toUpperCase())
        .ilike("town_name", pattern)
        .not("town_name", "is", null)
        .limit(MAX_RESULTS),
      supabase
        .from("postal_areas")
        .select("postal_code")
        .eq("country_code", country.toUpperCase())
        .ilike("postal_code", pattern)
        .not("postal_code", "is", null)
        .limit(MAX_RESULTS),
    ]);

    const uniq = <T>(arr: T[], key?: (x: T) => unknown): T[] => {
      const seen = new Set<unknown>();
      return arr.filter((x) => {
        const k = key ? key(x) : x;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    };

    type AreaRow = { province_name?: string; city_name?: string; town_name?: string; postal_code?: string };
    const provinces = uniq((provincesRes.data || []).map((r: AreaRow) => r.province_name).filter(Boolean) as string[]);
    const cities = uniq((citiesRes.data || []).map((r: AreaRow) => r.city_name).filter(Boolean) as string[]);
    const towns = uniq((townsRes.data || []).map((r: AreaRow) => r.town_name).filter(Boolean) as string[]);
    const postal_codes = uniq((postalRes.data || []).map((r: AreaRow) => r.postal_code).filter(Boolean) as string[]);

    return successResponse({
      provinces,
      cities,
      towns,
      postal_codes,
    });
  } catch (error) {
    return handleApiError(error, "Failed to search areas");
  }
}

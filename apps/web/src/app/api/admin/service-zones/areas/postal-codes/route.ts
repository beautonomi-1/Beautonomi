import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
 } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OPERATIONS } from "@/lib/admin-sections";

const MAX_POSTAL_CODES = 1000;

/**
 * GET /api/admin/service-zones/areas/postal-codes
 * List postal codes for a country, optionally filtered by province/city/town.
 * Query: country (required), province?, city?, town?
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_OPERATIONS, request);
    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);
    const country = searchParams.get("country")?.trim();
    const province = searchParams.get("province")?.trim();
    const city = searchParams.get("city")?.trim();
    const town = searchParams.get("town")?.trim();

    if (!country) {
      return errorResponse("country is required", "VALIDATION_ERROR", 400);
    }

    let query = supabase
      .from("postal_areas")
      .select("postal_code, province_name, city_name, town_name")
      .eq("country_code", country.toUpperCase())
      .not("postal_code", "is", null);

    if (province) query = query.eq("province_name", province);
    if (city) query = query.eq("city_name", city);
    if (town) query = query.eq("town_name", town);

    const { data, error } = await query.limit(MAX_POSTAL_CODES);

    if (error) throw error;

    const uniq = new Map<string, { postal_code: string; province_name?: string; city_name?: string; town_name?: string }>();
    type Row = { postal_code?: string; province_name?: string; city_name?: string; town_name?: string };
    (data || []).forEach((r: Row) => {
      if (r.postal_code && !uniq.has(r.postal_code)) {
        uniq.set(r.postal_code, {
          postal_code: r.postal_code,
          province_name: r.province_name,
          city_name: r.city_name,
          town_name: r.town_name,
        });
      }
    });

    return successResponse(Array.from(uniq.values()));
  } catch (error) {
    return handleApiError(error, "Failed to list postal codes");
  }
}

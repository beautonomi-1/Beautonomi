import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@/lib/admin-sections";

const MAX_GROUPS = 40;
/** Rows scanned per dimension to estimate postal counts (cap for performance). */
const AGG_SCAN_LIMIT = 12_000;

export type AreaSearchHit = {
  name: string;
  /** Number of postal area rows in `postal_areas` for this name (under scan cap). */
  postal_count: number;
  /** True when scan hit the row cap; true counts may be higher. */
  count_is_floor: boolean;
};

/**
 * GET /api/admin/service-zones/areas/search
 * Search provinces, cities, towns, postal codes with approximate postal row counts.
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
      return successResponse({
        provinces: [] as AreaSearchHit[],
        cities: [] as AreaSearchHit[],
        towns: [] as AreaSearchHit[],
        postal_codes: [] as string[],
      });
    }

    const pattern = `%${q}%`;
    const cc = country.toUpperCase();

    const [provincesRes, citiesRes, townsRes, postalRes] = await Promise.all([
      supabase
        .from("postal_areas")
        .select("province_name")
        .eq("country_code", cc)
        .ilike("province_name", pattern)
        .not("province_name", "is", null)
        .limit(AGG_SCAN_LIMIT),
      supabase
        .from("postal_areas")
        .select("city_name")
        .eq("country_code", cc)
        .ilike("city_name", pattern)
        .not("city_name", "is", null)
        .limit(AGG_SCAN_LIMIT),
      supabase
        .from("postal_areas")
        .select("town_name")
        .eq("country_code", cc)
        .ilike("town_name", pattern)
        .not("town_name", "is", null)
        .limit(AGG_SCAN_LIMIT),
      supabase
        .from("postal_areas")
        .select("postal_code")
        .eq("country_code", cc)
        .ilike("postal_code", pattern)
        .not("postal_code", "is", null)
        .limit(80),
    ]);

    const aggregateColumn = (
      rows: { province_name?: string; city_name?: string; town_name?: string }[],
      key: "province_name" | "city_name" | "town_name"
    ): AreaSearchHit[] => {
      const hitCap = rows.length >= AGG_SCAN_LIMIT;
      const counts = new Map<string, number>();
      for (const r of rows) {
        // Normalize whitespace/casing variance in dataset rows so operators
        // see one canonical hit (e.g. "Western Cape", not separate chips for
        // "Western Cape " and "western cape").
        const raw = r[key];
        const name = typeof raw === "string" ? raw.trim() : "";
        if (!name) continue;
        counts.set(name, (counts.get(name) || 0) + 1);
      }
      return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, MAX_GROUPS)
        .map(([name, postal_count]) => ({
          name,
          postal_count,
          count_is_floor: hitCap,
        }));
    };

    type PRow = { province_name?: string };
    type CRow = { city_name?: string };
    type TRow = { town_name?: string };
    type PrRow = { postal_code?: string };

    const provinces = aggregateColumn((provincesRes.data || []) as PRow[], "province_name");
    const cities = aggregateColumn((citiesRes.data || []) as CRow[], "city_name");
    const towns = aggregateColumn((townsRes.data || []) as TRow[], "town_name");

    const seenPostal = new Set<string>();
    const postal_codes: string[] = [];
    for (const r of (postalRes.data || []) as PrRow[]) {
      const c = r.postal_code;
      if (c && !seenPostal.has(c)) {
        seenPostal.add(c);
        postal_codes.push(c);
      }
    }

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

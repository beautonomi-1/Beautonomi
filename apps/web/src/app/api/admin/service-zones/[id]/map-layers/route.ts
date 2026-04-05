import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@/lib/admin-sections";

type GeoJsonGeometry = { type: string; coordinates: unknown };

/**
 * GET /api/admin/service-zones/[id]/map-layers
 * Optional preview layers: union of included areas, union of excluded areas, final coverage.
 * Safe no-op when RPCs are missing (returns nulls for optional layers).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    const { data: zone, error: zErr } = await supabase.from("platform_zones").select("id").eq("id", id).maybeSingle();
    if (zErr || !zone) return notFoundResponse("Market not found");

    let inclusion_geometry: GeoJsonGeometry | null = null;
    let exclusion_geometry: GeoJsonGeometry | null = null;
    let coverage_geometry: GeoJsonGeometry | null = null;

    try {
      const { data } = await supabase.rpc("st_asgeojson_zone_inclusions_union_simplified", {
        p_zone_id: id,
        p_tolerance: 0.0001,
      });
      if (data && typeof data === "object" && "type" in data) {
        inclusion_geometry = data as GeoJsonGeometry;
      }
    } catch {
      /* RPC not deployed yet */
    }

    try {
      const { data } = await supabase.rpc("st_asgeojson_zone_exclusions_union_simplified", {
        p_zone_id: id,
        p_tolerance: 0.0001,
      });
      if (data && typeof data === "object" && "type" in data) {
        exclusion_geometry = data as GeoJsonGeometry;
      }
    } catch {
      /* RPC not deployed yet */
    }

    try {
      const { data } = await supabase.rpc("st_asgeojson_zone_simplified", {
        p_zone_id: id,
        p_tolerance: 0.0001,
      });
      if (data && typeof data === "object" && "type" in data) {
        coverage_geometry = data as GeoJsonGeometry;
      }
    } catch {
      /* ignore */
    }

    return successResponse({
      inclusion_geometry,
      exclusion_geometry,
      coverage_geometry,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load map layers");
  }
}

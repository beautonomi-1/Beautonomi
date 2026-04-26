import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OPERATIONS } from "@/lib/admin-sections";
import { legacyZoneCoverageGeometry } from "@/lib/service-zones/legacyZonePreviewGeometry";

type GeoJsonGeometry = { type: string; coordinates: unknown };

function maxBBoxSpanDegrees(bbox: unknown): number {
  if (!bbox || typeof bbox !== "object") return 0;
  let minLng: number;
  let minLat: number;
  let maxLng: number;
  let maxLat: number;
  if (Array.isArray(bbox) && bbox.length >= 4) {
    [minLng, minLat, maxLng, maxLat] = bbox as [number, number, number, number];
  } else if ("minLng" in bbox && "maxLng" in bbox) {
    const b = bbox as { minLng: number; minLat: number; maxLng: number; maxLat: number };
    ({ minLng, minLat, maxLng, maxLat } = b);
  } else {
    return 0;
  }
  if (![minLng, minLat, maxLng, maxLat].every((n) => Number.isFinite(n))) return 0;
  return Math.max(Math.abs(maxLng - minLng), Math.abs(maxLat - minLat));
}

/** Coarser simplification for national-scale unions so GeoJSON stays usable in the browser. */
function simplifyToleranceForZone(bbox: unknown): number {
  const span = maxBBoxSpanDegrees(bbox);
  if (span > 10) return 0.08;
  if (span > 5) return 0.035;
  if (span > 2) return 0.012;
  if (span > 0.8) return 0.004;
  return 0.0001;
}

/**
 * GET /api/admin/service-zones/[id]/map-layers
 * Optional preview layers: union of included areas, union of excluded areas, final coverage.
 * Safe no-op when RPCs are missing (returns nulls for optional layers).
 *
 * When `platform_zones.geometry` is unset (e.g. legacy radius national seed), `coverage_geometry`
 * falls back to a preview ring built from `center_*` + `radius_km` or `polygon_coordinates`.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSection(ADMIN_SECTION_OPERATIONS, request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    const { data: zone, error: zErr } = await supabase
      .from("platform_zones")
      .select(
        "id, bbox, zone_type, center_latitude, center_longitude, radius_km, polygon_coordinates, geometry"
      )
      .eq("id", id)
      .maybeSingle();
    if (zErr || !zone) return notFoundResponse("Market not found");

    const tolerance = simplifyToleranceForZone(zone.bbox);

    let inclusion_geometry: GeoJsonGeometry | null = null;
    let exclusion_geometry: GeoJsonGeometry | null = null;
    let coverage_geometry: GeoJsonGeometry | null = null;

    try {
      const { data } = await supabase.rpc("st_asgeojson_zone_inclusions_union_simplified", {
        p_zone_id: id,
        p_tolerance: tolerance,
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
        p_tolerance: tolerance,
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
        p_tolerance: tolerance,
      });
      if (data && typeof data === "object" && "type" in data) {
        coverage_geometry = data as GeoJsonGeometry;
      }
    } catch {
      /* ignore */
    }

    if (!coverage_geometry && !zone.geometry) {
      const legacy = legacyZoneCoverageGeometry(zone);
      if (legacy) coverage_geometry = legacy as GeoJsonGeometry;
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

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

const bodySchema = z.object({
  country_code: z.string().length(2),
  postal_codes: z.array(z.string()).max(500).optional(),
  province: z.string().optional(),
  city: z.string().optional(),
  town: z.string().optional(),
  simplify_tolerance: z.number().min(0).optional(),
});

/**
 * POST /api/admin/service-zones/areas/geometry
 * Fetch (simplified) geometry for given areas. Used for map preview.
 */
export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const body = await request.json();
    const parse = bodySchema.safeParse(body);
    if (!parse.success) {
      return errorResponse(
        parse.error.issues.map((i) => i.message).join(", "),
        "VALIDATION_ERROR",
        400
      );
    }

    const { country_code, postal_codes, province, city, town, simplify_tolerance } = parse.data;
    const tolerance = simplify_tolerance ?? 0.0001;

    const supabase = getSupabaseAdmin();

    const { data: geojson, error: rpcError } = await supabase.rpc("get_postal_areas_geometry_geojson", {
      p_country_code: country_code.toUpperCase(),
      p_postal_codes: postal_codes || null,
      p_province: province || null,
      p_city: city || null,
      p_town: town || null,
      p_tolerance: tolerance,
    });

    if (rpcError) {
      // Fallback: return empty if RPC not yet created (migration 293 can add it)
      if (rpcError.code === "42883") {
        return successResponse({ type: "FeatureCollection", features: [] });
      }
      throw rpcError;
    }

    return successResponse(geojson || { type: "FeatureCollection", features: [] });
  } catch (error) {
    return handleApiError(error, "Failed to fetch area geometry");
  }
}

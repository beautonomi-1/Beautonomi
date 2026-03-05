import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

const MAX_INCLUDE = 500;

const bodySchema = z.object({
  type: z.enum(["country", "province", "city", "town", "postal_code"]),
  ref_code: z.string().min(1),
  ref_name: z.string().optional(),
  version: z.number().int().optional(),
});

/**
 * POST /api/admin/service-zones/[id]/include
 * Add inclusion area(s). Resolves postal_areas, inserts rows with geom snapshot, recomputes zone geometry.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();
    const { id: zone_id } = await params;
    const body = await request.json();
    const parse = bodySchema.safeParse(body);
    if (!parse.success) {
      return errorResponse(
        parse.error.issues.map((i) => i.message).join(", "),
        "VALIDATION_ERROR",
        400
      );
    }

    const { data: zone } = await supabase
      .from("platform_zones")
      .select("id, country_code, version")
      .eq("id", zone_id)
      .single();

    if (!zone) return notFoundResponse("Zone not found");
    if (parse.data.version != null && (zone as any).version !== parse.data.version) {
      return errorResponse("Version conflict; refresh and retry", "CONFLICT", 409);
    }

    const country = (zone as any).country_code;
    if (!country) {
      return errorResponse("Zone has no country_code", "VALIDATION_ERROR", 400);
    }

    let query = admin
      .from("postal_areas")
      .select("id, postal_code, province_name, city_name, town_name, geom")
      .eq("country_code", country)
      .not("geom", "is", null)
      .limit(MAX_INCLUDE);

    const { type, ref_code, ref_name } = parse.data;
    if (type === "province") query = query.eq("province_name", ref_code);
    else if (type === "city") query = query.eq("city_name", ref_code);
    else if (type === "town") query = query.eq("town_name", ref_code);
    else if (type === "postal_code") query = query.eq("postal_code", ref_code);
    else if (type === "country") {
      query = query.limit(MAX_INCLUDE);
    }

    const { data: areas, error: fetchError } = await query;

    if (fetchError) throw fetchError;
    if (!areas?.length && type !== "country") {
      return successResponse({ included: 0, message: "No matching areas found" });
    }

    const toInsert = (areas || []).map((a: any) => ({
      zone_id,
      type,
      ref_code: a.postal_code || a.province_name || a.city_name || a.town_name || ref_code,
      ref_name: ref_name ?? a.postal_code ?? a.province_name ?? a.city_name ?? a.town_name ?? ref_code,
      source: "postal_dataset",
      geom: a.geom,
    }));

    const { error: insertError } = await admin.from("platform_zone_inclusions").insert(toInsert);
    if (insertError) throw insertError;

    const { error: rpcError } = await admin.rpc("update_platform_zone_geometry", { p_zone_id: zone_id });
    if (rpcError) throw rpcError;

    const { data: updated } = await supabase
      .from("platform_zones")
      .select("version, geometry")
      .eq("id", zone_id)
      .single();

    return successResponse({
      included: toInsert.length,
      version: (updated as any)?.version,
      has_geometry: !!(updated as any)?.geometry,
    });
  } catch (error) {
    return handleApiError(error, "Failed to add inclusion");
  }
}

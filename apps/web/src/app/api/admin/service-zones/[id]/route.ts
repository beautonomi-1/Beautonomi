import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  version: z.number().int().optional(),
});

/**
 * GET /api/admin/service-zones/[id]
 * Zone detail with simplified geometry for display.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    const { data: zone, error } = await supabase
      .from("platform_zones")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !zone) return notFoundResponse("Zone not found");

    const { data: inclusions } = await supabase
      .from("platform_zone_inclusions")
      .select("id, type, ref_code, ref_name, created_at")
      .eq("zone_id", id);

    const { data: exclusions } = await supabase
      .from("platform_zone_exclusions")
      .select("id, type, ref_code, ref_name, created_at")
      .eq("zone_id", id);

    const out: any = {
      id: zone.id,
      name: zone.name,
      country_code: zone.country_code,
      status: zone.status,
      version: zone.version,
      bbox: zone.bbox,
      centroid: zone.centroid,
      created_at: zone.created_at,
      updated_at: zone.updated_at,
      inclusions: inclusions || [],
      exclusions: exclusions || [],
    };

    if (zone.geometry) {
      try {
        const { data: geojson } = await supabase.rpc("st_asgeojson_zone_simplified", {
          p_zone_id: id,
          p_tolerance: 0.0001,
        });
        out.geometry_geojson = geojson ?? null;
        try {
          const { data: fragCount } = await supabase.rpc("st_zone_geometry_fragment_count", { p_zone_id: id });
          const n = Array.isArray(fragCount) ? (fragCount[0] ?? 0) : (typeof fragCount === "number" ? fragCount : 0);
          out.fragment_count = n;
          out.disconnected_fragments = n > 1;
        } catch {
          out.fragment_count = 1;
          out.disconnected_fragments = false;
        }
      } catch {
        out.geometry_geojson = null;
        out.fragment_count = 0;
        out.disconnected_fragments = false;
      }
    } else {
      out.geometry_geojson = null;
      out.fragment_count = 0;
      out.disconnected_fragments = false;
    }

    return successResponse(out);
  } catch (error) {
    return handleApiError(error, "Failed to fetch zone");
  }
}

/**
 * PATCH /api/admin/service-zones/[id]
 * Update name/status with optimistic concurrency (version).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json();
    const parse = patchSchema.safeParse(body);
    if (!parse.success) {
      return errorResponse(
        parse.error.issues.map((i) => i.message).join(", "),
        "VALIDATION_ERROR",
        400
      );
    }

    const { data: existing } = await supabase
      .from("platform_zones")
      .select("id, version")
      .eq("id", id)
      .single();

    if (!existing) return notFoundResponse("Zone not found");

    if (parse.data.version != null && (existing as any).version !== parse.data.version) {
      return errorResponse("Version conflict; refresh and retry", "CONFLICT", 409);
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parse.data.name !== undefined) update.name = parse.data.name;
    if (parse.data.status !== undefined) update.status = parse.data.status;

    const { data: zone, error } = await supabase
      .from("platform_zones")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return successResponse(zone);
  } catch (error) {
    return handleApiError(error, "Failed to update zone");
  }
}

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
 } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@/lib/admin-sections";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  country_code: z.string().length(2),
});

/**
 * GET /api/admin/service-zones
 * List platform zones (draft + active) for control plane.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    const supabase = await getSupabaseServer(request);

    const { data, error } = await supabase
      .from("platform_zones")
      .select("id, name, country_code, status, version, geometry, centroid, bbox, created_at, updated_at")
      .in("status", ["draft", "active"])
      .order("updated_at", { ascending: false });

    if (error) throw error;

    type ZoneRow = { id: string; name?: string; country_code?: string; status?: string; version?: number; bbox?: unknown; created_at?: string; updated_at?: string; geometry?: unknown };
    const zones = (data || []).map((row: ZoneRow) => ({
      id: row.id,
      name: row.name,
      country_code: row.country_code,
      status: row.status,
      version: row.version,
      bbox: row.bbox,
      created_at: row.created_at,
      updated_at: row.updated_at,
      has_geometry: !!row.geometry,
    }));

    return successResponse(zones);
  } catch (error) {
    return handleApiError(error, "Failed to list service zones");
  }
}

/**
 * POST /api/admin/service-zones
 * Create a new draft zone (name + country_code only).
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const parse = createSchema.safeParse(body);
    if (!parse.success) {
      return errorResponse(
        parse.error.issues.map((i) => i.message).join(", "),
        "VALIDATION_ERROR",
        400
      );
    }

    const { data: zone, error } = await supabase
      .from("platform_zones")
      .insert({
        name: parse.data.name,
        country_code: parse.data.country_code.toUpperCase(),
        status: "draft",
        is_active: false,
        zone_type: "polygon",
        polygon_coordinates: null,
        created_by: user.id,
      })
      .select("id, name, country_code, status, version, created_at")
      .single();

    if (error) throw error;

    return successResponse(zone);
  } catch (error) {
    return handleApiError(error, "Failed to create service zone");
  }
}

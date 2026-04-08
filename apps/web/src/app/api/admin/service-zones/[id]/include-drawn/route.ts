import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OPERATIONS } from "@/lib/admin-sections";
import { z } from "zod";

const bodySchema = z.object({
  type: z.literal("custom_polygon"),
  geojson: z.object({
    type: z.literal("Polygon"),
    coordinates: z.any(),
  }),
  version: z.number().int().optional(),
});

const MAX_INCLUDE = 12_000;

/**
 * POST /api/admin/service-zones/[id]/include-drawn
 * Draw an included polygon and auto-include intersecting postal areas.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSection(ADMIN_SECTION_OPERATIONS, request);
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
      .select("id, version")
      .eq("id", zone_id)
      .single();

    if (!zone) return notFoundResponse("Zone not found");
    if (parse.data.version != null && zone.version !== parse.data.version) {
      return errorResponse("Version conflict; refresh and retry", "CONFLICT", 409);
    }

    const { data: rpcData, error: rpcError } = await admin.rpc(
      "insert_platform_zone_inclusions_from_custom_polygon",
      {
        p_zone_id: zone_id,
        p_geojson: parse.data.geojson,
        p_max_rows: MAX_INCLUDE,
      }
    );

    if (rpcError) throw rpcError;

    const result =
      rpcData && typeof rpcData === "object"
        ? (rpcData as { included?: number; matched_areas?: number; truncated?: boolean })
        : {};

    const { data: updated } = await supabase
      .from("platform_zones")
      .select("version, geometry")
      .eq("id", zone_id)
      .single();

    return successResponse({
      included: Number(result.included ?? 0),
      matched_areas: Number(result.matched_areas ?? 0),
      truncated: Boolean(result.truncated),
      version: updated?.version,
      has_geometry: !!updated?.geometry,
    });
  } catch (error) {
    return handleApiError(error, "Failed to add included area from drawing");
  }
}

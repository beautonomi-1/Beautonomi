import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
  notFoundResponse,
 } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OPERATIONS } from "@/lib/admin-sections";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { z } from "zod";

const bodySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("postal_code"), postal_code: z.string().min(1), version: z.number().int().optional() }),
  z.object({
    type: z.literal("custom_polygon"),
    geojson: z.object({ type: z.string(), coordinates: z.any() }),
    version: z.number().int().optional(),
  }),
]);

/**
 * POST /api/admin/service-zones/[id]/exclude
 * Add exclusion (postal code or custom polygon), then recompute zone geometry.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_OPERATIONS, request);
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
    type ZoneRow = { version?: number; country_code?: string };
    const zoneRow = zone as ZoneRow;
    if (parse.data.version != null && zoneRow.version !== parse.data.version) {
      return errorResponse("Version conflict; refresh and retry", "CONFLICT", 409);
    }

    if (parse.data.type === "custom_polygon") {
      const { error: rpcError } = await admin.rpc("insert_platform_zone_exclusion_custom_polygon", {
        p_zone_id: zone_id,
        p_geojson: parse.data.geojson,
      });
      if (rpcError) throw rpcError;
    } else {
      const { data: area } = await admin
        .from("postal_areas")
        .select("geom, postal_code")
        .eq("country_code", zoneRow.country_code)
        .eq("postal_code", parse.data.postal_code)
        .not("geom", "is", null)
        .limit(1)
        .single();
      if (!area) {
        return errorResponse("Postal code not found in dataset", "NOT_FOUND", 404);
      }
      type AreaRow = { geom?: unknown };
      const areaRow = area as AreaRow;
      const { error: insertError } = await admin.from("platform_zone_exclusions").insert({
        zone_id,
        type: "postal_code",
        ref_code: parse.data.postal_code,
        ref_name: parse.data.postal_code,
        geom: areaRow.geom,
      });
      if (insertError) throw insertError;
      const { error: rpcError } = await admin.rpc("update_platform_zone_geometry", { p_zone_id: zone_id });
      if (rpcError) throw rpcError;
    }

    const { data: updated } = await supabase
      .from("platform_zones")
      .select("version, geometry")
      .eq("id", zone_id)
      .single();

    type UpdatedRow = { version?: number; geometry?: unknown };
    const updatedRow = updated as UpdatedRow | null;

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id, actor_role: user.role,
      action: "admin.service_zone.exclude", entity_type: "platform_zone",
      entity_id: zone_id, module: "operations", risk_level: "medium",
      retention_tier: "operational", status: "succeeded",
      ip_address: reqMeta.ip_address, user_agent: reqMeta.user_agent,
    });

    return successResponse({
      excluded: true,
      version: updatedRow?.version,
      has_geometry: !!updatedRow?.geometry,
    });
  } catch (error) {
    return handleApiError(error, "Failed to add exclusion");
  }
}

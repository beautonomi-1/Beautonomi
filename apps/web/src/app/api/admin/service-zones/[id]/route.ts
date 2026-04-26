import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
  notFoundResponse,
 } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OPERATIONS } from "@/lib/admin-sections";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { z } from "zod";
import { legacyZoneCoverageGeometry } from "@/lib/service-zones/legacyZonePreviewGeometry";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  /** ISO-3166-1 alpha-2. Only while there are no included areas, or when fixing a null country. */
  country_code: z.string().length(2).optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  version: z.number().int().optional(),
  /** Shallow-merged into existing ops_metadata (rollout mode, notes, target dates). */
  ops_metadata: z.record(z.string(), z.unknown()).optional(),
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
    await requireAdminSection(ADMIN_SECTION_OPERATIONS, request);
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

    type ZoneFull = typeof zone & { published_at?: string | null; ops_metadata?: Record<string, unknown> | null };
    const zf = zone as ZoneFull;

    const out: Record<string, unknown> = {
      id: zone.id,
      name: zone.name,
      country_code: zone.country_code,
      status: zone.status,
      version: zone.version,
      bbox: zone.bbox,
      centroid: zone.centroid,
      created_at: zone.created_at,
      updated_at: zone.updated_at,
      published_at: zf.published_at ?? null,
      ops_metadata: zf.ops_metadata && typeof zf.ops_metadata === "object" ? zf.ops_metadata : {},
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
      const legacy = legacyZoneCoverageGeometry(zone);
      out.geometry_geojson = legacy ?? null;
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
    const { user } = await requireAdminSection(ADMIN_SECTION_OPERATIONS, request);
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
      .select("id, version, ops_metadata, country_code")
      .eq("id", id)
      .single();

    if (!existing) return notFoundResponse("Zone not found");

    const existingRow = existing as {
      version?: number;
      ops_metadata?: Record<string, unknown> | null;
      country_code?: string | null;
    };
    if (parse.data.version != null && existingRow.version !== parse.data.version) {
      return errorResponse("Version conflict; refresh and retry", "CONFLICT", 409);
    }

    if (parse.data.country_code !== undefined) {
      const nextCc = parse.data.country_code.toUpperCase();
      const prevCc = (existingRow.country_code || "").trim().toUpperCase();
      if (nextCc !== prevCc) {
        const { count, error: cntErr } = await supabase
          .from("platform_zone_inclusions")
          .select("id", { count: "exact", head: true })
          .eq("zone_id", id);
        if (cntErr) throw cntErr;
        const incCount = count ?? 0;
        if (incCount > 0) {
          return errorResponse(
            "Cannot change country while this market has included areas. Remove inclusions first, then set country.",
            "VALIDATION_ERROR",
            400
          );
        }
      }
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parse.data.name !== undefined) update.name = parse.data.name;
    if (parse.data.country_code !== undefined) update.country_code = parse.data.country_code.toUpperCase();
    if (parse.data.status !== undefined) {
      update.status = parse.data.status;
      update.is_active = parse.data.status === "active";
    }
    if (parse.data.ops_metadata !== undefined) {
      const cur =
        existingRow.ops_metadata && typeof existingRow.ops_metadata === "object"
          ? existingRow.ops_metadata
          : {};
      update.ops_metadata = { ...cur, ...parse.data.ops_metadata };
    }

    const { data: zone, error } = await supabase
      .from("platform_zones")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id, actor_role: user.role,
      action: "admin.service_zone.update", entity_type: "platform_zone",
      entity_id: id, module: "operations", risk_level: "medium",
      retention_tier: "operational", status: "succeeded",
      ip_address: reqMeta.ip_address, user_agent: reqMeta.user_agent,
    });

    return successResponse(zone);
  } catch (error) {
    return handleApiError(error, "Failed to update zone");
  }
}

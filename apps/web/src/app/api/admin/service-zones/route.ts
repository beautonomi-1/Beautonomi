import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
 } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OPERATIONS } from "@/lib/admin-sections";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { z } from "zod";
import { legacyZoneListBbox } from "@/lib/service-zones/legacyZonePreviewGeometry";

const createSchema = z.object({
  name: z.string().min(1),
  country_code: z.string().length(2),
});

/**
 * GET /api/admin/service-zones
 * List platform zones for control plane.
 * Query: include_archived=1 | true — include archived rows (default: draft + active only).
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_OPERATIONS, request);
    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);
    const raw = searchParams.get("include_archived")?.toLowerCase();
    const includeArchived = raw === "1" || raw === "true" || raw === "yes";
    const statuses = includeArchived ? (["draft", "active", "archived"] as const) : (["draft", "active"] as const);

    const { data, error } = await supabase
      .from("platform_zones")
      .select(
        "id, name, country_code, status, version, geometry, centroid, bbox, created_at, updated_at, published_at, ops_metadata, zone_type, center_latitude, center_longitude, radius_km, polygon_coordinates"
      )
      .in("status", [...statuses])
      .order("updated_at", { ascending: false });

    if (error) throw error;

    const zoneIds = (data || []).map((r) => r.id as string);

    // Fetch per-zone inclusion counts in a single query
    const inclusionCountMap = new Map<string, number>();
    if (zoneIds.length > 0) {
      const { data: incRows } = await supabase
        .from("platform_zone_inclusions")
        .select("zone_id")
        .in("zone_id", zoneIds);
      for (const row of incRows ?? []) {
        const id = row.zone_id as string;
        inclusionCountMap.set(id, (inclusionCountMap.get(id) ?? 0) + 1);
      }
    }

    type ZoneRow = {
      id: string;
      name?: string;
      country_code?: string;
      status?: string;
      version?: number;
      bbox?: unknown;
      created_at?: string;
      updated_at?: string;
      geometry?: unknown;
      published_at?: string | null;
      ops_metadata?: Record<string, unknown> | null;
      zone_type?: string | null;
      center_latitude?: number | string | null;
      center_longitude?: number | string | null;
      radius_km?: number | string | null;
      polygon_coordinates?: unknown;
    };
    const zones = (data || []).map((row: ZoneRow) => {
      let bbox = row.bbox;
      if (!bbox && !row.geometry) {
        const syn = legacyZoneListBbox(row);
        if (syn) {
          const [minLng, minLat, maxLng, maxLat] = syn;
          bbox = { minLng, minLat, maxLng, maxLat };
        }
      }
      return {
        id: row.id,
        name: row.name,
        country_code: row.country_code,
        status: row.status,
        version: row.version,
        bbox,
        created_at: row.created_at,
        updated_at: row.updated_at,
        has_geometry: !!row.geometry,
        published_at: row.published_at ?? null,
        ops_metadata: row.ops_metadata ?? null,
        inclusion_count: inclusionCountMap.get(row.id) ?? 0,
      };
    });

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
    const { user } = await requireAdminSection(ADMIN_SECTION_OPERATIONS, request);
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
        /**
         * Legacy schema compatibility:
         * platform_zones still has constraint `valid_polygon_zone` from the
         * original two-tier zone system, requiring polygon_coordinates to be
         * non-null when zone_type='polygon'.
         *
         * Control-plane coverage uses platform_zone_inclusions/exclusions +
         * computed PostGIS geometry, not this JSON field. We therefore store a
         * harmless empty JSON object here so draft creation does not fail with:
         *   23514 valid_polygon_zone
         */
        zone_type: "polygon",
        polygon_coordinates: {},
        created_by: user.id,
      })
      .select("id, name, country_code, status, version, created_at")
      .single();

    if (error) throw error;

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id, actor_role: user.role,
      action: "admin.service_zone.create", entity_type: "platform_zone",
      entity_id: zone.id, module: "operations", risk_level: "medium",
      retention_tier: "operational", status: "succeeded",
      ip_address: reqMeta.ip_address, user_agent: reqMeta.user_agent,
    });

    return successResponse(zone);
  } catch (error) {
    return handleApiError(error, "Failed to create service zone");
  }
}

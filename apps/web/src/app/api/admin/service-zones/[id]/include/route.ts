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

/** Max postal area rows per include request (large metros need headroom). */
const MAX_INCLUDE = 12_000;
const INSERT_CHUNK = 500;

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

    type ZoneRow = { version?: number; country_code?: string };
    const zoneRow = zone as ZoneRow;
    if (!zone) return notFoundResponse("Zone not found");
    if (parse.data.version != null && zoneRow.version !== parse.data.version) {
      return errorResponse("Version conflict; refresh and retry", "CONFLICT", 409);
    }

    const country = zoneRow.country_code;
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
    const ref = ref_code.trim();
    if (type === "province") query = query.ilike("province_name", ref);
    else if (type === "city") query = query.ilike("city_name", ref);
    else if (type === "town") query = query.ilike("town_name", ref);
    else if (type === "postal_code") query = query.eq("postal_code", ref);
    else if (type === "country") {
      query = query.limit(MAX_INCLUDE);
    }

    let { data: areas, error: fetchError } = await query;
    // Some postal datasets carry trailing spaces or minor label variance.
    // If strict ilike/eq did not match, retry with a broader contains pattern.
    if ((!areas || areas.length === 0) && !fetchError && (type === "province" || type === "city" || type === "town")) {
      let fallback = admin
        .from("postal_areas")
        .select("id, postal_code, province_name, city_name, town_name, geom")
        .eq("country_code", country)
        .not("geom", "is", null)
        .limit(MAX_INCLUDE);
      const fuzzy = `%${ref}%`;
      if (type === "province") fallback = fallback.ilike("province_name", fuzzy);
      else if (type === "city") fallback = fallback.ilike("city_name", fuzzy);
      else fallback = fallback.ilike("town_name", fuzzy);
      const fallbackRes = await fallback;
      areas = fallbackRes.data ?? [];
      fetchError = fallbackRes.error ?? null;
    }

    if (fetchError) throw fetchError;
    if (!areas?.length) {
      return successResponse({ included: 0, message: "No matching areas found" });
    }

    type AreaRow = {
      postal_code?: string;
      province_name?: string;
      city_name?: string;
      town_name?: string;
      geom?: unknown;
    };

    const { data: existingRows } = await admin
      .from("platform_zone_inclusions")
      .select("ref_code")
      .eq("zone_id", zone_id);

    const existingRef = new Set((existingRows || []).map((r: { ref_code: string }) => r.ref_code));

    const toInsert: {
      zone_id: string;
      type: string;
      ref_code: string;
      ref_name: string;
      source: string;
      geom: unknown;
    }[] = [];

    const seen = new Set<string>();
    for (const a of areas || []) {
      const pc = a.postal_code?.trim();

      // If no postal_code, build a geographic composite key from the most-specific names.
      // This handles boundary rows that represent city/province polygons without postal codes.
      const areaRefCode =
        pc ||
        [a.town_name, a.city_name, a.province_name]
          .filter(Boolean)
          .join("/");

      if (!areaRefCode) continue;
      if (seen.has(areaRefCode) || existingRef.has(areaRefCode)) continue;
      seen.add(areaRefCode);

      const areaType = pc ? "postal_code" : type;
      const areaLabel = [a.city_name, a.town_name, a.province_name].filter(Boolean).join(" · ");
      const refLabel = [ref_name || ref_code, areaLabel].filter(Boolean).join(" · ");

      toInsert.push({
        zone_id,
        type: areaType,
        ref_code: areaRefCode,
        ref_name: refLabel || areaRefCode,
        source: "postal_dataset",
        geom: a.geom,
      });
    }

    if (toInsert.length === 0) {
      return successResponse({
        included: 0,
        message: "All matching postal areas were already included",
        skipped_existing: (areas || []).length,
        matched_areas: (areas || []).length,
        truncated: (areas || []).length >= MAX_INCLUDE,
      });
    }

    for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
      const chunk = toInsert.slice(i, i + INSERT_CHUNK);
      const { error: insertError } = await admin.from("platform_zone_inclusions").insert(chunk);
      if (insertError) throw insertError;
    }

    const { error: rpcError } = await admin.rpc("update_platform_zone_geometry", { p_zone_id: zone_id });
    if (rpcError) throw rpcError;

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
      action: "admin.service_zone.include", entity_type: "platform_zone",
      entity_id: zone_id, module: "operations", risk_level: "medium",
      retention_tier: "operational", status: "succeeded",
      ip_address: reqMeta.ip_address, user_agent: reqMeta.user_agent,
    });

    return successResponse({
      included: toInsert.length,
      matched_areas: (areas || []).length,
      truncated: (areas || []).length >= MAX_INCLUDE,
      version: updatedRow?.version,
      has_geometry: !!updatedRow?.geometry,
    });
  } catch (error) {
    return handleApiError(error, "Failed to add inclusion");
  }
}

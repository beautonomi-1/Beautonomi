import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@/lib/admin-sections";
import { z } from "zod";

const bodySchema = z.object({
  source_zone_id: z.string().uuid(),
  name: z.string().min(1).max(255),
});

/**
 * POST /api/admin/service-zones/clone
 * Create a new draft zone in the same country (empty coverage) — typical for launching the next city/market.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const parse = bodySchema.safeParse(body);
    if (!parse.success) {
      return errorResponse(
        parse.error.issues.map((i) => i.message).join(", "),
        "VALIDATION_ERROR",
        400
      );
    }

    const { source_zone_id, name } = parse.data;

    const { data: src, error: srcErr } = await supabase
      .from("platform_zones")
      .select("id, name, country_code, ops_metadata")
      .eq("id", source_zone_id)
      .single();

    if (srcErr || !src) return notFoundResponse("Source zone not found");

    type Src = { country_code?: string; ops_metadata?: Record<string, unknown> };
    const s = src as Src;
    if (!s.country_code) {
      return errorResponse("Source zone has no country_code", "VALIDATION_ERROR", 400);
    }

    const priorMeta = (s.ops_metadata && typeof s.ops_metadata === "object" ? s.ops_metadata : {}) as Record<
      string,
      unknown
    >;
    const ops_metadata = {
      ...priorMeta,
      rolloutMode: priorMeta.rolloutMode ?? "city_by_city",
      clonedFromZoneId: source_zone_id,
      clonedFromName: (src as { name?: string }).name,
    };

    const { data: created, error: insErr } = await supabase
      .from("platform_zones")
      .insert({
        name: name.trim(),
        country_code: s.country_code.toUpperCase(),
        status: "draft",
        is_active: false,
        zone_type: "polygon",
        polygon_coordinates: null,
        created_by: user.id,
        ops_metadata,
      })
      .select("id, name, country_code, status, version, created_at, ops_metadata")
      .single();

    if (insErr) throw insErr;

    return successResponse(created);
  } catch (error) {
    return handleApiError(error, "Failed to clone service zone");
  }
}

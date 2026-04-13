import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OPERATIONS } from "@/lib/admin-sections";
import { z } from "zod";

const bodySchema = z.object({
  country_code: z.string().min(2).max(2),
  /** Accept numbers or numeric strings from clients */
  lat: z.coerce.number().gte(-90).lte(90),
  lng: z.coerce.number().gte(-180).lte(180),
});

export type ResolvedPostalArea = {
  postal_code: string;
  province_name?: string | null;
  city_name?: string | null;
  town_name?: string | null;
};

function normalizePostalAreasFromRpc(data: unknown): ResolvedPostalArea[] {
  if (data == null) return [];
  if (Array.isArray(data)) {
    return data.filter(
      (row): row is ResolvedPostalArea =>
        row !== null && typeof row === "object" && typeof (row as ResolvedPostalArea).postal_code === "string",
    );
  }
  if (typeof data === "string") {
    try {
      return normalizePostalAreasFromRpc(JSON.parse(data) as unknown);
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * POST /api/admin/service-zones/areas/resolve-point
 * Find postal area(s) in the dataset that cover this WGS84 point — used to populate inclusions/exclusions from coordinates.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_OPERATIONS, request);
    const body = await request.json();
    const parse = bodySchema.safeParse(body);
    if (!parse.success) {
      return errorResponse(parse.error.issues.map((i) => i.message).join(", "), "VALIDATION_ERROR", 400);
    }

    const { country_code, lat, lng } = parse.data;
    const admin = getSupabaseAdmin();

    const { data, error } = await admin.rpc("resolve_postal_areas_at_point", {
      p_country_code: country_code.toUpperCase(),
      p_lng: lng,
      p_lat: lat,
      p_max_rows: 200,
    });

    if (error) {
      // undefined_function — migration 477 not applied yet
      if (error.code === "42883") {
        return successResponse({
          postal_areas: [] as ResolvedPostalArea[],
          note: "Database function resolve_postal_areas_at_point is not deployed; run migrations.",
        });
      }
      throw error;
    }

    const postal_areas = normalizePostalAreasFromRpc(data);

    return successResponse({ postal_areas });
  } catch (error) {
    return handleApiError(error, "Failed to resolve point to postal areas");
  }
}

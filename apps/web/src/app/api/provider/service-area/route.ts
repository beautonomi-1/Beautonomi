/**
 * GET /api/provider/service-area - Get current provider's service area
 * PUT /api/provider/service-area - Create or update service area
 */

import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

async function getProviderId(request: NextRequest): Promise<string | null> {
  const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
  const supabase = getSupabaseAdmin();
  const { data: byOwner } = await supabase.from("providers").select("id").eq("user_id", user.id).limit(1).maybeSingle();
  if (byOwner) return byOwner.id;
  const { data: staff } = await supabase.from("provider_staff").select("provider_id").eq("user_id", user.id).limit(1).maybeSingle();
  return staff?.provider_id ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const providerId = await getProviderId(request);
    if (!providerId) return errorResponse("Provider not found", "NOT_FOUND", 404);

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("provider_service_area")
      .select("*")
      .eq("provider_id", providerId)
      .maybeSingle();

    if (error) throw error;
    return successResponse(data);
  } catch (error) {
    return handleApiError(error as Error, "Failed to get service area");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const providerId = await getProviderId(request);
    if (!providerId) return errorResponse("Provider not found", "NOT_FOUND", 404);

    const body = await request.json();
    const mode = (body.mode as string) || "radius";
    const radius_km = body.radius_km != null ? Number(body.radius_km) : null;
    const home_latitude = body.home_latitude != null ? Number(body.home_latitude) : null;
    const home_longitude = body.home_longitude != null ? Number(body.home_longitude) : null;
    const zones = Array.isArray(body.zones) ? body.zones : [];

    const supabase = getSupabaseAdmin();
    const payload = {
      provider_id: providerId,
      mode,
      radius_km: mode === "radius" ? radius_km : null,
      home_latitude: mode === "radius" ? home_latitude : null,
      home_longitude: mode === "radius" ? home_longitude : null,
      zones: mode === "zones" ? zones : [],
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("provider_service_area")
      .upsert(payload, { onConflict: "provider_id" })
      .select()
      .single();

    if (error) throw error;
    return successResponse(data);
  } catch (error) {
    return handleApiError(error as Error, "Failed to update service area");
  }
}

/**
 * GET /api/provider/ads/campaigns - List current provider's ad campaigns
 * POST /api/provider/ads/campaigns - Create a campaign (draft). Gated by ads.enabled.
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
      .from("ads_campaigns")
      .select("id, status, budget, spent, start_at, end_at, targeting, bid_settings, created_at, updated_at")
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return successResponse(data ?? []);
  } catch (error) {
    return handleApiError(error as Error, "Failed to list campaigns");
  }
}

export async function POST(request: NextRequest) {
  try {
    const providerId = await getProviderId(request);
    if (!providerId) return errorResponse("Provider not found", "NOT_FOUND", 404);

    const body = await request.json();
    const budget = Number(body.budget) || 0;
    const startAt = body.start_at ?? null;
    const endAt = body.end_at ?? null;
    const targeting = body.targeting ?? {};
    const bidSettings = body.bid_settings ?? {};

    const supabase = getSupabaseAdmin();
    const { data: config } = await supabase.from("ads_module_config").select("enabled").eq("environment", process.env.NODE_ENV === "production" ? "production" : "development").maybeSingle();
    if (!config?.enabled) return errorResponse("Ads module is disabled", "DISABLED", 403);

    const { data, error } = await supabase
      .from("ads_campaigns")
      .insert({
        provider_id: providerId,
        status: "draft",
        budget,
        spent: 0,
        start_at: startAt,
        end_at: endAt,
        targeting,
        bid_settings: bidSettings,
      })
      .select()
      .single();

    if (error) throw error;
    return successResponse(data);
  } catch (error) {
    return handleApiError(error as Error, "Failed to create campaign");
  }
}

/**
 * GET /api/provider/ads/packs - List active impression packs (for purchase)
 */

import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["provider_owner", "provider_staff"], request);

    const supabase = getSupabaseAdmin();
    const { data: config } = await supabase
      .from("ads_module_config")
      .select("enabled")
      .eq("environment", process.env.NODE_ENV === "production" ? "production" : "development")
      .maybeSingle();
    if (!config?.enabled) {
      return successResponse([]);
    }

    const { data, error } = await supabase
      .from("ads_impression_packs")
      .select("id, impressions, price_zar, display_order")
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("impressions", { ascending: true });

    if (error) throw error;
    return successResponse(data ?? []);
  } catch (error) {
    return handleApiError(error as Error, "Failed to fetch packs");
  }
}

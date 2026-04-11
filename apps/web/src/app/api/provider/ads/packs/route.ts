/**
 * GET /api/provider/ads/packs - List active impression packs, time packs, and available models
 */

import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["provider_owner", "provider_staff"], request);

    const supabase = getSupabaseAdmin();
    const env = process.env.NODE_ENV === "production" ? "production" : "development";
    const { data: config } = await supabase
      .from("ads_module_config")
      .select("enabled, available_models, default_model")
      .eq("environment", env)
      .maybeSingle();
    if (!config?.enabled) {
      return successResponse({ impression_packs: [], time_packs: [], available_models: [], default_model: "time_based" });
    }

    const availableModels: string[] = (config as any).available_models ?? ["cpc_budget", "impression_pack", "time_based"];
    const defaultModel: string = (config as any).default_model ?? "time_based";

    const [impressionRes, timeRes] = await Promise.all([
      availableModels.includes("impression_pack")
        ? supabase.from("ads_impression_packs").select("id, impressions, price_zar, display_order").eq("is_active", true).order("display_order", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      availableModels.includes("time_based")
        ? supabase.from("ads_time_packs").select("id, duration_days, label, price_zar, display_order").eq("is_active", true).order("display_order", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);

    return successResponse({
      impression_packs: impressionRes.data ?? [],
      time_packs: timeRes.data ?? [],
      available_models: availableModels,
      default_model: defaultModel,
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to fetch packs");
  }
}

/**
 * GET /api/provider/ads/packs - List active impression packs, time packs, and available models
 */

import { NextRequest } from "next/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  resolveAdPackAmountMajor,
  resolveAdPackCurrency,
  type AdPackPriceRow,
} from "@/lib/ads/resolve-ad-pack-price";

function mapPackRow(row: Record<string, unknown>) {
  const amountMajor = resolveAdPackAmountMajor(row as AdPackPriceRow);
  const currency = resolveAdPackCurrency(row as AdPackPriceRow);
  return {
    ...row,
    price_minor:
      row.price_minor != null ? Number(row.price_minor) : Math.round(amountMajor * 100),
    currency,
    /** Major units for display + legacy clients (derived from price_minor when set). */
    price_zar: amountMajor,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const admin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, admin);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const env = process.env.NODE_ENV === "production" ? "production" : "development";
    const { data: config } = await admin
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
        ? admin
            .from("ads_impression_packs")
            .select(
              "id, impressions, price_zar, price_minor, currency, display_order, apple_product_id",
            )
            .eq("is_active", true)
            .order("display_order", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      availableModels.includes("time_based")
        ? admin
            .from("ads_time_packs")
            .select(
              "id, duration_days, label, price_zar, price_minor, currency, display_order, apple_product_id",
            )
            .eq("is_active", true)
            .order("display_order", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);

    return successResponse({
      impression_packs: (impressionRes.data ?? []).map((r) =>
        mapPackRow(r as Record<string, unknown>),
      ),
      time_packs: (timeRes.data ?? []).map((r) => mapPackRow(r as Record<string, unknown>)),
      available_models: availableModels,
      default_model: defaultModel,
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to fetch packs");
  }
}

/**
 * GET /api/provider/ads/campaigns - List current provider's ad campaigns
 * POST /api/provider/ads/campaigns - Create a campaign (draft). Budget > 0 requires pre-pay; returns payment_url.
 */

import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { initializePaystackTransaction } from "@/lib/payments/paystack-server";
import { convertToSmallestUnit, generateTransactionReference } from "@/lib/payments/paystack";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { resourceTenantMatchesHostTenant } from "@/lib/bookings/resolve-payment-tenant";

async function getProviderId(userId: string, request: NextRequest): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  return getProviderIdForUser(userId, supabase as never, { request });
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const providerId = await getProviderId(user.id, request);
    if (!providerId) return errorResponse("Provider not found", "NOT_FOUND", 404);

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("ads_campaigns")
      .select("id, status, budget, spent, daily_budget, bid_cpc, start_at, end_at, targeting, bid_settings, pack_impressions, billing_model, duration_days, created_at, updated_at")
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
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const providerId = await getProviderId(user.id, request);
    if (!providerId) return errorResponse("Provider not found", "NOT_FOUND", 404);

    const supabase = getSupabaseAdmin();
    const { data: providerTenantRow } = await supabase
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    if (
      !resourceTenantMatchesHostTenant(
        tenantId,
        (providerTenantRow as { tenant_id?: string | null } | null)?.tenant_id,
      )
    ) {
      return errorResponse(
        "Your provider account is not on this market. Use the site or app for the correct region.",
        "TENANT_MISMATCH",
        403,
      );
    }

    const body = await request.json();
    /** When `provider_inapp`, Paystack returns to a minimal page that notifies the RN WebView (see `/provider/settings/ads/payment-return`). */
    const paymentRedirect = String(body.payment_redirect ?? "web").toLowerCase();
    const impressionPackId = body.impression_pack_id ?? null;
    const timePackId = body.time_pack_id ?? null;
    let budget = Number(body.budget) || 0;
    let packImpressions: number | null = null;
    let billingModel: "cpc_budget" | "impression_pack" | "time_based" = "cpc_budget";
    let durationDays: number | null = null;

    const env = process.env.NODE_ENV === "production" ? "production" : "development";
    const { data: config } = await supabase
      .from("ads_module_config")
      .select("enabled, available_models")
      .eq("environment", env)
      .maybeSingle();
    if (!config?.enabled) return errorResponse("Ads module is disabled", "DISABLED", 403);

    const availableModels: string[] = (config as any).available_models ?? ["cpc_budget", "impression_pack", "time_based"];

    if (timePackId) {
      if (!availableModels.includes("time_based")) {
        return errorResponse("Time-based ads are not available on this platform", "MODEL_DISABLED", 400);
      }
      const { data: pack } = await supabase
        .from("ads_time_packs")
        .select("id, duration_days, price_zar, label")
        .eq("id", timePackId)
        .eq("is_active", true)
        .single();
      if (!pack) return errorResponse("Invalid or inactive time pack", "VALIDATION", 400);
      budget = Number((pack as any).price_zar);
      durationDays = Number((pack as any).duration_days);
      billingModel = "time_based";
    } else if (impressionPackId) {
      if (!availableModels.includes("impression_pack")) {
        return errorResponse("Impression packs are not available on this platform", "MODEL_DISABLED", 400);
      }
      const { data: pack } = await supabase
        .from("ads_impression_packs")
        .select("id, impressions, price_zar")
        .eq("id", impressionPackId)
        .eq("is_active", true)
        .single();
      if (!pack) return errorResponse("Invalid or inactive impression pack", "VALIDATION", 400);
      budget = Number((pack as any).price_zar);
      packImpressions = Number((pack as any).impressions);
      billingModel = "impression_pack";
    } else {
      if (!availableModels.includes("cpc_budget")) {
        return errorResponse("CPC budget ads are not available on this platform", "MODEL_DISABLED", 400);
      }
      budget = Number(body.budget) || 0;
      billingModel = "cpc_budget";
    }

    const dailyBudget = body.daily_budget != null ? Number(body.daily_budget) : null;
    const bidCpc = Number(body.bid_cpc) || 0;
    const startAt = billingModel === "time_based" ? new Date().toISOString() : (body.start_at ?? null);
    const endAt = billingModel === "time_based" && durationDays
      ? new Date(Date.now() + durationDays * 86400000).toISOString()
      : (body.end_at ?? null);
    const targeting = body.targeting ?? {};
    const bidSettings = body.bid_settings ?? {};

    const tenantRegion = await getTenantRegionConfig(tenantId);
    const currency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const insertBudget = budget > 0 ? 0 : budget;

    const { data: campaign, error: campaignError } = await supabase
      .from("ads_campaigns")
      .insert({
        provider_id: providerId,
        status: "draft",
        budget: insertBudget,
        spent: 0,
        daily_budget: billingModel === "cpc_budget" ? dailyBudget : null,
        bid_cpc: billingModel === "cpc_budget" ? bidCpc : 0,
        start_at: startAt,
        end_at: endAt,
        targeting,
        bid_settings: bidSettings,
        pack_impressions: packImpressions,
        billing_model: billingModel,
        duration_days: durationDays,
      })
      .select()
      .single();

    if (campaignError || !campaign) throw campaignError || new Error("Failed to create campaign");

    if (budget <= 0) {
      return successResponse(campaign);
    }

    const { data: order, error: orderError } = await supabase
      .from("ads_budget_orders")
      .insert({
        provider_id: providerId,
        campaign_id: campaign.id,
        amount: budget,
        currency,
        status: "pending",
      })
      .select()
      .single();

    if (orderError || !order) throw orderError || new Error("Failed to create budget order");

    const { data: userRow } = await supabase.from("users").select("email").eq("id", user.id).single();
    const email = (userRow as any)?.email || user.email;
    if (!email) return errorResponse("User email required for payment", "VALIDATION", 400);

    const reference = generateTransactionReference("ads_budget", order.id);
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin || "").replace(/\/$/, "");
    const callbackUrl = `${baseUrl}/provider/settings/ads/payment-return?success=1&order_id=${encodeURIComponent(order.id)}&context=${
      paymentRedirect === "provider_inapp" ? "app" : "web"
    }`;

    const paystackData = await initializePaystackTransaction({
      email,
      amountInSmallestUnit: Math.max(100, convertToSmallestUnit(budget)),
      currency,
      reference,
      callback_url: callbackUrl,
      metadata: {
        ads_budget_order_id: order.id,
        provider_id: providerId,
        campaign_id: campaign.id,
      },
      tenantId,
    });

    await supabase
      .from("ads_budget_orders")
      .update({ paystack_reference: reference, updated_at: new Date().toISOString() })
      .eq("id", order.id);

    const paymentUrl = paystackData?.data?.authorization_url || null;
    return successResponse({
      campaign,
      requires_payment: true,
      payment_url: paymentUrl,
      order_id: order.id,
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to create campaign");
  }
}

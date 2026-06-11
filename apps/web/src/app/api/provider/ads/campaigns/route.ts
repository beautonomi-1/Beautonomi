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
import {
  checkNewGateFeatureAccess,
  SUBSCRIPTION_FEATURE_KEYS,
} from "@/lib/subscriptions/feature-access";
import { reverseAdsBudgetOrderPayment } from "@/lib/ads/ads-budget-order-payment";

async function getProviderId(userId: string, request: NextRequest): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  return getProviderIdForUser(userId, supabase as never, { request });
}

type CampaignRow = {
  id: string;
  status?: string | null;
  budget?: number | string | null;
  spent?: number | string | null;
  daily_budget?: number | string | null;
  bid_cpc?: number | string | null;
  start_at?: string | null;
  end_at?: string | null;
  targeting?: unknown;
  bid_settings?: unknown;
  pack_impressions?: number | string | null;
  billing_model?: string | null;
  duration_days?: number | string | null;
  created_at?: string;
  updated_at?: string;
};

type BudgetOrderRow = {
  id: string;
  campaign_id: string | null;
  status: string;
  amount: number | string | null;
  currency: string | null;
  created_at: string;
};

type CampaignPaymentState = "none" | "unpaid" | "pending" | "failed" | "paid";

export type CampaignLifecycle =
  | "awaiting_payment"
  | "confirming"
  | "payment_failed"
  | "active"
  | "paused"
  | "budget_exhausted"
  | "expired"
  | "delivered"
  | "cancelled";

const PENDING_ORDER_TTL_MS = 30 * 60 * 1000;

/**
 * §Provider-paystack-audit 2026-05: Derive the payment state shown on each
 * campaign card from the campaign + its most recent `ads_budget_orders` row.
 * Mobile + web rely on this so unfunded campaigns can offer "Complete payment"
 * (unpaid), "Try again" (failed), or "Confirming payment…" (pending) instead
 * of a single passive "awaiting payment" badge with no actions.
 */
function deriveCampaignPaymentState(
  campaign: CampaignRow,
  latestOrder: BudgetOrderRow | null,
): CampaignPaymentState {
  const budget = Number(campaign.budget ?? 0);
  const status = String(campaign.status ?? "");
  const isTime = campaign.billing_model === "time_based";
  const isPack = campaign.pack_impressions != null;

  if (status === "active" || status === "paused") {
    if (budget > 0 || isTime || isPack) return "paid";
  }
  if (latestOrder) {
    if (latestOrder.status === "paid") return "paid";
    if (latestOrder.status === "pending") return "pending";
    if (latestOrder.status === "failed" || latestOrder.status === "refunded") return "failed";
  }
  if (status === "draft" || status === "paused") {
    if (isTime || isPack) return "unpaid";
    if (budget > 0) return "unpaid";
    return "none";
  }
  return "none";
}

/**
 * Server-derived lifecycle sub-state so web + mobile render identical badges
 * and action rows without re-implementing payment / exhaustion heuristics.
 */
function deriveCampaignLifecycle(
  campaign: CampaignRow,
  paymentState: CampaignPaymentState,
  latestOrder: BudgetOrderRow | null,
  nowIso: string,
): CampaignLifecycle {
  if (paymentState === "pending") return "confirming";
  if (paymentState === "failed") return "payment_failed";
  if (paymentState === "unpaid") return "awaiting_payment";

  const status = String(campaign.status ?? "");
  if (status === "active") return "active";
  if (status === "paused") return "paused";

  if (status === "ended") {
    const budget = Number(campaign.budget ?? 0);
    const spent = Number(campaign.spent ?? 0);
    const billingModel = String(campaign.billing_model ?? "cpc_budget");

    if (budget <= 0 && spent <= 0 && paymentState !== "paid") {
      return "cancelled";
    }

    if (billingModel === "time_based") {
      const endAt = campaign.end_at;
      if (typeof endAt === "string" && endAt.length > 0 && endAt <= nowIso) {
        return "expired";
      }
      return "cancelled";
    }

    if (campaign.pack_impressions != null) {
      if (budget > 0 && spent >= budget) return "delivered";
      return "cancelled";
    }

    if (billingModel === "cpc_budget" && budget > 0 && spent >= budget) {
      return "budget_exhausted";
    }

    return "cancelled";
  }

  return "paused";
}

async function expireStalePendingOrders(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  providerId: string,
): Promise<void> {
  const cutoffIso = new Date(Date.now() - PENDING_ORDER_TTL_MS).toISOString();
  const { data: staleRows } = await supabase
    .from("ads_budget_orders")
    .select("id")
    .eq("provider_id", providerId)
    .eq("status", "pending")
    .lt("created_at", cutoffIso);

  for (const row of (staleRows as { id: string }[] | null) ?? []) {
    await reverseAdsBudgetOrderPayment({
      supabase,
      orderId: row.id,
      finalOrderStatus: "failed",
      reason: "payment_timeout",
    });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const providerId = await getProviderId(user.id, request);
    if (!providerId) return errorResponse("Provider not found", "NOT_FOUND", 404);

    const supabase = getSupabaseAdmin();
    const nowIso = new Date().toISOString();

    await expireStalePendingOrders(supabase, providerId);

    const { data, error } = await supabase
      .from("ads_campaigns")
      .select("id, status, budget, spent, daily_budget, bid_cpc, start_at, end_at, targeting, bid_settings, pack_impressions, billing_model, duration_days, created_at, updated_at")
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    let rows: CampaignRow[] = (data as CampaignRow[] | null) ?? [];
    // Align list with reality without waiting for cron: end time-based campaigns whose window has passed.
    const timeExpiredIds = rows
      .filter(
        (c) =>
          c.billing_model === "time_based" &&
          c.status === "active" &&
          typeof c.end_at === "string" &&
          c.end_at.length > 0 &&
          c.end_at < nowIso,
      )
      .map((c) => c.id);
    if (timeExpiredIds.length > 0) {
      await supabase
        .from("ads_campaigns")
        .update({ status: "ended", updated_at: nowIso })
        .in("id", timeExpiredIds)
        .eq("provider_id", providerId);
      const { data: refreshed, error: refreshErr } = await supabase
        .from("ads_campaigns")
        .select("id, status, budget, spent, daily_budget, bid_cpc, start_at, end_at, targeting, bid_settings, pack_impressions, billing_model, duration_days, created_at, updated_at")
        .eq("provider_id", providerId)
        .order("created_at", { ascending: false });
      if (!refreshErr && refreshed?.length) {
        rows = refreshed as CampaignRow[];
      } else {
        rows = rows.map((c) =>
          timeExpiredIds.includes(c.id) ? { ...c, status: "ended" } : c,
        );
      }
    }

    /**
     * Enrich each campaign with its newest budget order so the UI can
     * distinguish unpaid / pending / failed and surface the correct CTA.
     * One round-trip to `ads_budget_orders` is cheaper than per-card
     * fetches and stays inside the existing RLS policy (provider scope).
     */
    const campaignIds = rows.map((c) => c.id).filter(Boolean);
    const latestOrderByCampaign = new Map<string, BudgetOrderRow>();
    if (campaignIds.length > 0) {
      const { data: orderRows } = await supabase
        .from("ads_budget_orders")
        .select("id, campaign_id, status, amount, currency, created_at")
        .eq("provider_id", providerId)
        .in("campaign_id", campaignIds)
        .order("created_at", { ascending: false });
      const orders = (orderRows as BudgetOrderRow[] | null) ?? [];
      for (const order of orders) {
        if (!order.campaign_id) continue;
        if (!latestOrderByCampaign.has(order.campaign_id)) {
          latestOrderByCampaign.set(order.campaign_id, order);
        }
      }
    }

    const enriched = rows.map((c) => {
      const order = latestOrderByCampaign.get(c.id) ?? null;
      const payment_state = deriveCampaignPaymentState(c, order);
      const lifecycle = deriveCampaignLifecycle(c, payment_state, order, nowIso);
      const latest_budget_order = order
        ? {
            id: order.id,
            status: order.status,
            amount: Number(order.amount ?? 0),
            currency: order.currency ?? null,
            created_at: order.created_at,
          }
        : null;
      return { ...c, payment_state, lifecycle, latest_budget_order };
    });
    return successResponse(enriched);
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
    const adsOk = await checkNewGateFeatureAccess(
      providerId,
      SUBSCRIPTION_FEATURE_KEYS.platformAds,
      supabase,
    );
    if (!adsOk) {
      return errorResponse(
        "Platform ads are not included in your current subscription plan. Upgrade to create campaigns.",
        "SUBSCRIPTION_FEATURE_DISABLED",
        403,
      );
    }
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

    // §Ads-enterprise-hardening 2026-06: supersede any stale `pending` budget
    // orders for this campaign before opening a fresh one, so a campaign never
    // has multiple in-flight orders (mirrors the retry-checkout route).
    await supabase
      .from("ads_budget_orders")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("campaign_id", campaign.id)
      .eq("provider_id", providerId)
      .eq("status", "pending");

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
    /**
     * §Provider-paystack-audit 2026-05: Paystack `callback_url` MUST be HTTPS.
     * The provider app opens this URL inside `WebBrowser.openAuthSessionAsync` and
     * the auth session resolves on prefix match against the HTTPS bridge page
     * (`/provider/settings/ads/payment-return`). Custom schemes (`provider://`)
     * caused Paystack to fall back to the merchant default and dump providers on
     * the customer `/checkout/success` page. The bridge handles both web (`context=web`)
     * and the mobile auth-session return (`context=app`) so a single HTTPS path
     * serves every platform.
     */
    const adsContext = paymentRedirect === "provider_inapp" ? "app" : "web";
    const callbackUrl = `${baseUrl}/provider/settings/ads/payment-return?success=1&order_id=${encodeURIComponent(order.id)}&context=${adsContext}`;

    const adsCancelAction = `${baseUrl}/provider/settings/ads/payment-return?cancelled=1&order_id=${encodeURIComponent(order.id)}&context=${adsContext}`;

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
        cancel_action: adsCancelAction,
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

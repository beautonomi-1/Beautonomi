/**
 * GET /api/provider/ads/campaigns - List current provider's ad campaigns
 * POST /api/provider/ads/campaigns - Create a campaign (draft). Budget > 0 requires pre-pay; returns payment_url.
 */

import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { initializePaystackTransaction } from "@/lib/payments/paystack-server";
import { convertToSmallestUnit, generateTransactionReference } from "@/lib/payments/paystack";

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
      .select("id, status, budget, spent, daily_budget, bid_cpc, start_at, end_at, targeting, bid_settings, pack_impressions, created_at, updated_at")
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
    const providerId = await getProviderId(request);
    if (!providerId) return errorResponse("Provider not found", "NOT_FOUND", 404);

    const body = await request.json();
    const supabase = getSupabaseAdmin();
    const impressionPackId = body.impression_pack_id ?? null;
    let budget = Number(body.budget) || 0;
    let packImpressions: number | null = null;
    if (impressionPackId) {
      const { data: pack } = await supabase
        .from("ads_impression_packs")
        .select("id, impressions, price_zar")
        .eq("id", impressionPackId)
        .eq("is_active", true)
        .single();
      if (!pack) return errorResponse("Invalid or inactive impression pack", "VALIDATION", 400);
      budget = Number((pack as any).price_zar);
      packImpressions = Number((pack as any).impressions);
    } else {
      budget = Number(body.budget) || 0;
    }
    const dailyBudget = body.daily_budget != null ? Number(body.daily_budget) : null;
    const bidCpc = Number(body.bid_cpc) || 0;
    const startAt = body.start_at ?? null;
    const endAt = body.end_at ?? null;
    const targeting = body.targeting ?? {};
    const bidSettings = body.bid_settings ?? {};

    const { data: config } = await supabase.from("ads_module_config").select("enabled").eq("environment", process.env.NODE_ENV === "production" ? "production" : "development").maybeSingle();
    if (!config?.enabled) return errorResponse("Ads module is disabled", "DISABLED", 403);

    const currency = "ZAR";
    const insertBudget = budget > 0 ? 0 : budget;

    const { data: campaign, error: campaignError } = await supabase
      .from("ads_campaigns")
      .insert({
        provider_id: providerId,
        status: "draft",
        budget: insertBudget,
        spent: 0,
        daily_budget: packImpressions != null ? null : dailyBudget,
        bid_cpc: packImpressions != null ? 0 : bidCpc,
        start_at: startAt,
        end_at: endAt,
        targeting,
        bid_settings: bidSettings,
        pack_impressions: packImpressions,
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
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const callbackUrl = `${baseUrl}/provider/settings/ads?payment_success=1&order_id=${order.id}`;

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

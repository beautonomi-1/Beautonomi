/**
 * POST /api/provider/ads/campaigns/[id]/checkout — Retry Paystack for a draft
 * campaign whose first payment didn't land.
 *
 * §Provider-paystack-audit 2026-05: when a provider closed Paystack, had a
 * card declined, or otherwise ended up on an "awaiting payment" draft, they
 * need a way to re-open Paystack against the same campaign without creating
 * a brand-new draft. This endpoint mirrors the Paystack init in
 * `POST /api/provider/ads/campaigns` but skips the campaign creation step,
 * recomputes the amount from the persisted billing model, marks any stale
 * `pending` budget order as `failed`, and issues a fresh HTTPS callback URL.
 */

import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
  userHasProviderAccessAdmin,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { initializePaystackTransaction } from "@/lib/payments/paystack-server";
import { convertToSmallestUnit, generateTransactionReference } from "@/lib/payments/paystack";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { resourceTenantMatchesHostTenant } from "@/lib/bookings/resolve-payment-tenant";

type CampaignRow = {
  id: string;
  provider_id: string;
  status: string;
  budget: number | string | null;
  spent: number | string | null;
  billing_model: "cpc_budget" | "impression_pack" | "time_based" | string | null;
  pack_impressions: number | string | null;
  duration_days: number | string | null;
  start_at: string | null;
  end_at: string | null;
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const tenantId = await resolveTenantIdWithZaFallback(request);

    const { id: campaignId } = await params;
    const body = await request.json().catch(() => ({}));
    const paymentRedirect = String(body?.payment_redirect ?? "web").toLowerCase();

    const supabase = getSupabaseAdmin();
    const { data: campaign } = await supabase
      .from("ads_campaigns")
      .select(
        "id, provider_id, status, budget, spent, billing_model, pack_impressions, duration_days, start_at, end_at"
      )
      .eq("id", campaignId)
      .maybeSingle();

    if (!campaign) {
      return errorResponse("Campaign not found", "NOT_FOUND", 404);
    }
    const campaignProviderId = String((campaign as CampaignRow).provider_id ?? "");
    if (!campaignProviderId || !(await userHasProviderAccessAdmin(supabase, user.id, campaignProviderId))) {
      return errorResponse("You do not have access to this campaign", "FORBIDDEN", 403);
    }

    const { data: providerTenantRow } = await supabase
      .from("providers")
      .select("tenant_id")
      .eq("id", campaignProviderId)
      .maybeSingle();
    if (
      !resourceTenantMatchesHostTenant(
        tenantId,
        (providerTenantRow as { tenant_id?: string | null } | null)?.tenant_id
      )
    ) {
      return errorResponse(
        "Your provider account is not on this market. Use the site or app for the correct region.",
        "TENANT_MISMATCH",
        403
      );
    }
    const c = campaign as CampaignRow;
    if (c.status === "ended") {
      return errorResponse("This campaign has been cancelled.", "VALIDATION", 400);
    }
    if (c.status !== "draft" && c.status !== "paused") {
      return errorResponse("This campaign is already paid for.", "VALIDATION", 400);
    }
    const currentBudget = Number(c.budget ?? 0);
    if (currentBudget > 0) {
      return errorResponse("This campaign has already been funded.", "VALIDATION", 400);
    }

    /**
     * Recompute the amount due from the campaign's persisted billing model so
     * we always match the price the provider originally agreed to. For pack /
     * time-based campaigns we read the active price from the catalog table
     * (the price column is in ZAR which `convertToSmallestUnit` handles).
     */
    let amountDue = 0;
    if (c.billing_model === "time_based" && c.duration_days != null) {
      const { data: pack } = await supabase
        .from("ads_time_packs")
        .select("price_zar, duration_days")
        .eq("duration_days", Number(c.duration_days))
        .eq("is_active", true)
        .maybeSingle();
      amountDue = Number((pack as { price_zar?: number } | null)?.price_zar ?? 0);
    } else if (c.pack_impressions != null) {
      const { data: pack } = await supabase
        .from("ads_impression_packs")
        .select("price_zar, impressions")
        .eq("impressions", Number(c.pack_impressions))
        .eq("is_active", true)
        .maybeSingle();
      amountDue = Number((pack as { price_zar?: number } | null)?.price_zar ?? 0);
    } else {
      // CPC: re-use the most recent budget order amount as the agreed amount.
      const { data: latest } = await supabase
        .from("ads_budget_orders")
        .select("amount")
        .eq("campaign_id", campaignId)
        .eq("provider_id", campaignProviderId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      amountDue = Number((latest as { amount?: number } | null)?.amount ?? 0);
    }

    if (!Number.isFinite(amountDue) || amountDue <= 0) {
      return errorResponse(
        "Couldn't determine a price for this campaign. Please cancel and create a new one.",
        "VALIDATION",
        400
      );
    }

    // Mark any stale `pending` orders on this campaign as `failed` so the UI
    // can reflect the failed state and we don't keep multiple "in flight" rows.
    await supabase
      .from("ads_budget_orders")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("campaign_id", campaignId)
      .eq("provider_id", campaignProviderId)
      .eq("status", "pending");

    const tenantRegion = await getTenantRegionConfig(tenantId);
    const currency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const { data: order, error: orderError } = await supabase
      .from("ads_budget_orders")
      .insert({
        provider_id: campaignProviderId,
        campaign_id: campaignId,
        amount: amountDue,
        currency,
        status: "pending",
      })
      .select()
      .single();
    if (orderError || !order) throw orderError || new Error("Failed to create budget order");

    const { data: userRow } = await supabase
      .from("users")
      .select("email")
      .eq("id", user.id)
      .single();
    const email = (userRow as { email?: string } | null)?.email || user.email;
    if (!email) return errorResponse("User email required for payment", "VALIDATION", 400);

    const reference = generateTransactionReference("ads_budget", order.id);
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin || "").replace(
      /\/$/,
      ""
    );
    const adsContext = paymentRedirect === "provider_inapp" ? "app" : "web";
    const callbackUrl = `${baseUrl}/provider/settings/ads/payment-return?success=1&order_id=${encodeURIComponent(order.id)}&context=${adsContext}`;
    const cancelAction = `${baseUrl}/provider/settings/ads/payment-return?cancelled=1&order_id=${encodeURIComponent(order.id)}&context=${adsContext}`;

    const paystackData = await initializePaystackTransaction({
      email,
      amountInSmallestUnit: Math.max(100, convertToSmallestUnit(amountDue)),
      currency,
      reference,
      callback_url: callbackUrl,
      metadata: {
        ads_budget_order_id: order.id,
        provider_id: campaignProviderId,
        campaign_id: campaignId,
        cancel_action: cancelAction,
      },
      tenantId,
    });

    await supabase
      .from("ads_budget_orders")
      .update({ paystack_reference: reference, updated_at: new Date().toISOString() })
      .eq("id", order.id);

    const paymentUrl = paystackData?.data?.authorization_url || null;
    return successResponse({
      requires_payment: true,
      payment_url: paymentUrl,
      order_id: order.id,
      campaign_id: campaignId,
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to start payment");
  }
}

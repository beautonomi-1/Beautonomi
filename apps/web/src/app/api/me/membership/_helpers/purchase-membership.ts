import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { convertToSmallestUnit, generateTransactionReference } from "@/lib/payments/paystack";
import { initializePaystackTransaction } from "@/lib/payments/paystack-server";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { resourceTenantMatchesHostTenant } from "@/lib/bookings/resolve-payment-tenant";

export type MembershipPurchaseAttribution = {
  source?: string;
  campaign_id?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  referrer_path?: string;
};

export type MembershipPurchaseResult = {
  order_id: string;
  reference: string | null;
  payment_url: string | null;
  status: "pending" | "paid";
};

type PurchaseMembershipInput = {
  userId: string;
  userEmail?: string | null;
  planId: string;
  expectedProviderId?: string | null;
  tenantId: string | null;
  attribution?: MembershipPurchaseAttribution;
  /** Optional mobile-app return URL (e.g. `customer://membership-paystack`).
   *  When provided: used as the Paystack callback_url and cancel_action is derived from it. */
  callbackUrl?: string;
};

function httpError(message: string, status: number, code: string) {
  return Object.assign(new Error(message), { status, code });
}

function cleanAttribution(attribution?: MembershipPurchaseAttribution): MembershipPurchaseAttribution {
  const out: MembershipPurchaseAttribution = {};
  for (const [key, value] of Object.entries(attribution ?? {})) {
    if (typeof value === "string" && value.trim()) {
      out[key as keyof MembershipPurchaseAttribution] = value.trim().slice(0, 500);
    }
  }
  return out;
}

async function activateFreeMembership(input: {
  userId: string;
  providerId: string;
  planId: string;
  orderId: string;
  attribution: MembershipPurchaseAttribution;
}) {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const { data: existingMembership } = await (supabase.from("user_memberships") as any)
    .select("id, status, started_at, expires_at")
    .eq("user_id", input.userId)
    .eq("provider_id", input.providerId)
    .maybeSingle();

  const existing = existingMembership as
    | { status?: string | null; started_at?: string | null; expires_at?: string | null }
    | null;
  const existingExpiry = existing?.expires_at ? new Date(existing.expires_at) : null;
  const hasFutureActiveTerm =
    existing?.status === "active" &&
    existingExpiry &&
    Number.isFinite(existingExpiry.getTime()) &&
    existingExpiry.getTime() > now.getTime();
  const renewalStart = hasFutureActiveTerm ? existingExpiry : now;
  const expiresAt = new Date(renewalStart);
  expiresAt.setMonth(expiresAt.getMonth() + 1);

  await supabase.from("user_memberships").upsert(
    {
      user_id: input.userId,
      provider_id: input.providerId,
      plan_id: input.planId,
      status: "active",
      started_at: hasFutureActiveTerm && existing?.started_at ? existing.started_at : now.toISOString(),
      expires_at: expiresAt.toISOString(),
      metadata: {
        source: "purchase",
        membership_order_id: input.orderId,
        attribution: input.attribution,
      },
      updated_at: now.toISOString(),
    },
    { onConflict: "user_id,provider_id" },
  );
}

export async function createMembershipPurchase(input: PurchaseMembershipInput): Promise<MembershipPurchaseResult> {
  const supabase = getSupabaseAdmin();
  const tenantRegion = await getTenantRegionConfig(input.tenantId);
  const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

  const { data: plan, error: planError } = await (supabase.from("membership_plans") as any)
    .select("id, provider_id, price_monthly, currency, is_active")
    .eq("id", input.planId)
    .eq("is_active", true)
    .single();

  if (planError || !plan) {
    throw httpError("Membership plan not found", 404, "NOT_FOUND");
  }

  const planData = plan as {
    id: string;
    provider_id: string;
    price_monthly?: number | string | null;
    currency?: string | null;
  };

  if (input.expectedProviderId && planData.provider_id !== input.expectedProviderId) {
    throw httpError("Plan does not belong to this provider", 403, "FORBIDDEN");
  }

  const { data: providerRow } = await supabase
    .from("providers")
    .select("tenant_id, status")
    .eq("id", planData.provider_id)
    .maybeSingle();

  const provider = providerRow as { tenant_id?: string | null; status?: string | null } | null;
  if (!provider || provider.status !== "active") {
    throw httpError("Membership plan not found", 404, "NOT_FOUND");
  }

  if (!resourceTenantMatchesHostTenant(input.tenantId, provider.tenant_id)) {
    throw httpError("This membership is not available in your current market.", 403, "TENANT_MISMATCH");
  }

  const amount = Number(planData.price_monthly ?? 0);
  if (!Number.isFinite(amount) || amount < 0) {
    throw httpError("Membership price is invalid.", 400, "INVALID_MEMBERSHIP_PRICE");
  }

  const currency = planData.currency || lastResortCurrency;
  const attribution = cleanAttribution(input.attribution);
  const orderMetadata = {
    source: "membership_purchase",
    attribution,
  };
  const email =
    input.userEmail ||
    (await supabase.from("users").select("email").eq("id", input.userId).maybeSingle()).data?.email;
  if (amount > 0 && !email) {
    throw httpError("Add an email address to your account before buying a membership.", 400, "EMAIL_REQUIRED");
  }

  const { data: order, error: orderError } = await (supabase.from("membership_orders") as any)
    .insert({
      tenant_id: input.tenantId,
      user_id: input.userId,
      provider_id: planData.provider_id,
      plan_id: planData.id,
      amount,
      currency,
      status: amount === 0 ? "paid" : "pending",
      metadata: orderMetadata,
    })
    .select("*")
    .single();

  if (orderError || !order) {
    throw orderError || new Error("Failed to create membership order");
  }

  if (amount === 0) {
    await activateFreeMembership({
      userId: input.userId,
      providerId: planData.provider_id,
      planId: planData.id,
      orderId: order.id,
      attribution,
    });
    return { order_id: order.id, reference: null, payment_url: null, status: "paid" };
  }

  const reference = generateTransactionReference("membership", order.id);
  const membershipAppUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  // Use caller-provided callback URL (mobile app scheme) when available, else web success page.
  const isMobileCallback =
    typeof input.callbackUrl === "string" &&
    (input.callbackUrl.startsWith("customer://") || input.callbackUrl.startsWith("exp://"));
  const callbackUrl = isMobileCallback ? input.callbackUrl! : `${membershipAppUrl}/checkout/success`;
  const membershipCancelAction = isMobileCallback
    ? `${callbackUrl}${callbackUrl.includes("?") ? "&" : "?"}cancelled=1`
    : `${membershipAppUrl}/explore?membership_cancelled=1`;

  let paystackData: Awaited<ReturnType<typeof initializePaystackTransaction>>;
  try {
    paystackData = await initializePaystackTransaction({
      email: email!,
      amountInSmallestUnit: convertToSmallestUnit(amount),
      currency,
      reference,
      callback_url: callbackUrl,
      metadata: {
        membership_order_id: order.id,
        user_id: input.userId,
        provider_id: planData.provider_id,
        plan_id: planData.id,
        attribution,
        cancel_action: membershipCancelAction,
        // Save card so we can auto-charge renewals via chargeAuthorization.
        save_card: true,
        set_as_default: false,
        enable_auto_renew: true,
      },
      tenantId: input.tenantId,
    });
  } catch (error) {
    await (supabase.from("membership_orders") as any)
      .update({ status: "failed", paystack_reference: reference, metadata: orderMetadata })
      .eq("id", order.id);
    throw error;
  }

  const paymentUrl = paystackData?.data?.authorization_url || null;
  const { error: updateError } = await (supabase.from("membership_orders") as any)
    .update({ paystack_reference: reference, metadata: orderMetadata })
    .eq("id", order.id);
  if (updateError) throw updateError;

  return { order_id: order.id, reference, payment_url: paymentUrl, status: "pending" };
}

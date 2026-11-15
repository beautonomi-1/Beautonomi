import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { convertToSmallestUnit, generateTransactionReference } from "@/lib/payments/paystack";
import { initializeOnlinePayment } from "@/lib/payments/online-payment";
import {
  paystackChannelsForInitialize,
  resolveHostedCheckoutCallbacks,
} from "@/lib/payments/resolve-paystack-hosted-callback";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { resourceTenantMatchesHostTenant } from "@/lib/bookings/resolve-payment-tenant";
import { recordMembershipPayment } from "@/lib/memberships/membership-payment";
import { membershipExpiresStillOpen, renewalPeriodEnd } from "@/lib/memberships/membership-renewal-retry";

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
  tender?: "paystack" | "wallet";
  /** User-scoped client required for `wallet_debit_self`. */
  authClient?: SupabaseClient;
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
    .select("id, status, started_at, expires_at, metadata")
    .eq("user_id", input.userId)
    .eq("provider_id", input.providerId)
    .maybeSingle();

  const existing = existingMembership as
    | {
        status?: string | null;
        started_at?: string | null;
        expires_at?: string | null;
        metadata?: { membership_order_id?: string | null } | null;
      }
    | null;
  if (existing?.metadata?.membership_order_id === input.orderId) return;
  const stillOpen = membershipExpiresStillOpen(existing?.expires_at, now);
  const expiresAt = renewalPeriodEnd(existing?.expires_at, now);

  const { error: upsertError } = await supabase.from("user_memberships").upsert(
    {
      user_id: input.userId,
      provider_id: input.providerId,
      plan_id: input.planId,
      status: "active",
      started_at: stillOpen && existing?.started_at ? existing.started_at : now.toISOString(),
      expires_at: expiresAt.toISOString(),
      next_billing_at: expiresAt.toISOString(),
      last_payment_at: now.toISOString(),
      renewal_failure_count: 0,
      past_due_since: null,
      metadata: {
        source: "purchase",
        membership_order_id: input.orderId,
        attribution: input.attribution,
      },
      updated_at: now.toISOString(),
    },
    { onConflict: "user_id,provider_id" },
  );
  if (upsertError) throw upsertError;
}

/**
 * A wallet debit whose payment row was saved and whose month did not open
 * leaves the order pending. A later purchase of the same plan finishes that
 * order. It does not debit the wallet again.
 */
async function walletMembershipDebitState(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  orderId: string,
  userId: string,
): Promise<"held" | "returned" | "absent"> {
  const rollbackKey = `wallet_membership_rollback:${orderId}`;
  const { data: rollback, error: rollbackError } = await supabase
    .from("wallet_transactions")
    .select("id")
    .eq("idempotency_key", rollbackKey)
    .maybeSingle();
  if (rollbackError) throw rollbackError;
  if (rollback) return "returned";

  const { data: wallet, error: walletError } = await supabase
    .from("user_wallets")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (walletError) throw walletError;
  if (!wallet) return "absent";

  const { data: debit, error: debitError } = await supabase
    .from("wallet_transactions")
    .select("id")
    .eq("wallet_id", (wallet as { id: string }).id)
    .eq("reference_id", orderId)
    .eq("reference_type", "membership_order")
    .eq("type", "debit")
    .maybeSingle();
  if (debitError) throw debitError;
  return debit ? "held" : "absent";
}

async function resumeSavedWalletMembership(input: {
  userId: string;
  providerId: string;
  planId: string;
  tenantId: string | null;
  attribution: MembershipPurchaseAttribution;
}): Promise<MembershipPurchaseResult | null> {
  const supabase = getSupabaseAdmin();
  const { data: priorOrders, error: ordersError } = await supabase
    .from("membership_orders")
    .select("id, status, amount, currency")
    .eq("user_id", input.userId)
    .eq("provider_id", input.providerId)
    .eq("plan_id", input.planId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(5);
  if (ordersError || !priorOrders?.length) return null;

  const { data: existingMembership } = await supabase
    .from("user_memberships")
    .select("metadata")
    .eq("user_id", input.userId)
    .eq("provider_id", input.providerId)
    .maybeSingle();
  const openOrderId = (
    existingMembership as { metadata?: { membership_order_id?: string | null } | null } | null
  )?.metadata?.membership_order_id;

  let resumed: MembershipPurchaseResult | null = null;
  for (const row of priorOrders) {
    const order = row as { id: string; status?: string | null; amount?: number | string | null };
    const reference = `wallet_membership_${order.id}`;
    const { data: savedPayment, error: paymentError } = await supabase
      .from("payment_transactions")
      .select("id")
      .eq("provider", "wallet")
      .eq("reference", reference)
      .eq("status", "success")
      .maybeSingle();
    if (paymentError) throw paymentError;
    if (!savedPayment) {
      const debitState = await walletMembershipDebitState(supabase, order.id, input.userId);
      if (debitState !== "held") continue;
      const grossAmount = Number(order.amount);
      if (!Number.isFinite(grossAmount) || grossAmount <= 0) continue;
      const membershipPayment = await recordMembershipPayment({
        supabase,
        reference,
        orderId: order.id,
        userId: input.userId,
        providerId: input.providerId,
        planId: input.planId,
        grossAmount,
        feeAmount: 0,
        kind: "membership_order",
        tenantIdHint: input.tenantId,
        paymentProvider: "wallet",
      });
      if (!membershipPayment.recorded && !membershipPayment.alreadyRecorded) {
        throw new Error("membership payment was not recorded");
      }
    }
    if (openOrderId !== order.id) {
      await activateFreeMembership({
        userId: input.userId,
        providerId: input.providerId,
        planId: input.planId,
        orderId: order.id,
        attribution: input.attribution,
      });
    }
    const { error: paidError } = await supabase
      .from("membership_orders")
      .update({
        status: "paid",
        paystack_reference: reference,
        metadata: { source: "membership_purchase", tender: "wallet", attribution: input.attribution },
      })
      .eq("id", order.id);
    if (paidError) throw paidError;
    resumed = { order_id: order.id, reference, payment_url: null, status: "paid" };
  }
  return resumed;
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

  if (input.tender === "wallet" && amount > 0) {
    const resumed = await resumeSavedWalletMembership({
      userId: input.userId,
      providerId: planData.provider_id,
      planId: planData.id,
      tenantId: input.tenantId,
      attribution,
    });
    if (resumed) return resumed;
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

  if (input.tender === "wallet") {
    if (!input.authClient) {
      throw httpError("Wallet payment requires a signed-in session.", 401, "AUTH_REQUIRED");
    }
    const { data: debitResult, error: walletErr } = await (input.authClient.rpc as any)("wallet_debit_self", {
      p_amount: amount,
      p_description: `Membership ${planData.id}`,
      p_reference_id: order.id,
      p_reference_type: "membership_order",
      p_tenant_id: input.tenantId,
      p_idempotency_key: `wallet_membership_debit:${order.id}`,
    });
    if (walletErr || !debitResult) {
      await (supabase.from("membership_orders") as any)
        .update({ status: "failed", metadata: { ...orderMetadata, tender: "wallet" } })
        .eq("id", order.id);
      throw httpError(
        walletErr?.message || "We could not debit your wallet. Please try again.",
        400,
        "WALLET_ERROR",
      );
    }

    const reference = `wallet_membership_${order.id}`;
    try {
      const membershipPayment = await recordMembershipPayment({
        supabase,
        reference,
        orderId: order.id,
        userId: input.userId,
        providerId: planData.provider_id,
        planId: planData.id,
        grossAmount: amount,
        feeAmount: 0,
        kind: "membership_order",
        tenantIdHint: input.tenantId,
        paymentProvider: "wallet",
      });
      if (!membershipPayment.recorded && !membershipPayment.alreadyRecorded) {
        throw new Error("membership payment was not recorded");
      }
    } catch (recordErr) {
      const { error: creditErr } = await (supabase.rpc as any)("wallet_credit_admin", {
        p_user_id: input.userId,
        p_amount: amount,
        p_currency: currency,
        p_description: `Membership refund ${planData.id}`,
        p_reference_id: order.id,
        p_reference_type: "membership_order",
        p_tenant_id: input.tenantId,
        p_idempotency_key: `wallet_membership_rollback:${order.id}`,
      });
      if (!creditErr) {
        await (supabase.from("membership_orders") as any)
          .update({ status: "failed", metadata: { ...orderMetadata, tender: "wallet" } })
          .eq("id", order.id);
      }
      throw recordErr;
    }
    await activateFreeMembership({
      userId: input.userId,
      providerId: planData.provider_id,
      planId: planData.id,
      orderId: order.id,
      attribution,
    });
    await (supabase.from("membership_orders") as any)
      .update({
        status: "paid",
        paystack_reference: reference,
        metadata: { ...orderMetadata, tender: "wallet" },
      })
      .eq("id", order.id);
    return { order_id: order.id, reference, payment_url: null, status: "paid" };
  }

  const reference = generateTransactionReference("membership", order.id);
  const membershipAppUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://beautonomi.com").replace(/\/$/, "");
  const hostedMembership = resolveHostedCheckoutCallbacks({
    baseUrl: membershipAppUrl,
    clientCallbackUrl: input.callbackUrl,
    defaultSuccessPath: "/checkout/success",
    defaultCancelPath: "/explore",
    query: { payment_type: "membership" },
  });
  const callbackUrl = hostedMembership.successUrl;
  const membershipCancelAction = hostedMembership.inApp
    ? `${membershipAppUrl}/checkout/cancelled?payment_type=membership&membership_cancelled=1&context=app`
    : `${membershipAppUrl}/explore?membership_cancelled=1`;

  const membershipChannelExtras = paystackChannelsForInitialize({ saveCard: true });
  let onlineInit: Awaited<ReturnType<typeof initializeOnlinePayment>>;
  try {
    onlineInit = await initializeOnlinePayment({
      tenantId: input.tenantId,
      email: email!,
      amountInSmallestUnit: convertToSmallestUnit(amount, currency),
      currency,
      reference,
      callbackUrl,
      lineItemName: "Membership",
      saveCard: true,
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
      ...(membershipChannelExtras.channels
        ? { channels: membershipChannelExtras.channels }
        : {}),
    });
  } catch (error) {
    await (supabase.from("membership_orders") as any)
      .update({ status: "failed", paystack_reference: reference, metadata: orderMetadata })
      .eq("id", order.id);
    throw error;
  }

  const paymentUrl = onlineInit.authorizationUrl || null;
  const { error: updateError } = await (supabase.from("membership_orders") as any)
    .update({ paystack_reference: reference, metadata: orderMetadata })
    .eq("id", order.id);
  if (updateError) throw updateError;

  return { order_id: order.id, reference, payment_url: paymentUrl, status: "pending" };
}

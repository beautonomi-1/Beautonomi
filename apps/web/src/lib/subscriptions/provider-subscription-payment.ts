/**
 * Provider subscription payment — unified idempotent finalize/reverse helpers.
 *
 * Every subscription money side effect flows through exactly two functions so
 * the authorization charge, one-off renewal orders, recurring invoices, the
 * client verify path, refunds, and disputes all agree on revenue recognition:
 *
 *   - recordProviderSubscriptionPayment(): idempotently record ONE recognized
 *     subscription payment (payment_transactions + finance_transactions
 *     `provider_subscription_payment`, net of Paystack fees) keyed on the
 *     Paystack reference. Callers keep their own provider_subscriptions row
 *     state machine (activate / extend), but the money is posted here exactly
 *     once — duplicate webhooks, verify-after-webhook, and the invoice/charge
 *     overlap can never double-post.
 *   - reverseProviderSubscriptionPayment(): idempotently back out a recognized
 *     subscription payment (full negative `provider_subscription_refund`),
 *     revoke paid access by falling the provider back to the free plan, disable
 *     the Paystack subscription, and mark any order refunded.
 *
 * Accounting: provider_subscription_payment is posted with `amount = net`
 * (gross − fees) and shadow-ledgered DR Cash 1000 / CR Subscription revenue
 * 3100. The refund mirrors it (DR 3100 / CR 1000, migration 665) so a full
 * reversal nets the GL to zero.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { resolveCatalogPlanIdForProviderSubscription } from "@/lib/subscriptions/ensure-provider-free-subscription";
import { buildProviderSubscriptionReceiptUrl } from "@/lib/receipts/receipt-download-token";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { resolvePaystackFeeMajor } from "@/lib/payments/resolve-paystack-fee";

export type RecordProviderSubscriptionPaymentResult = {
  recorded: boolean;
  alreadyRecorded: boolean;
  netAmount: number;
  reference: string;
  /** finance_transactions.id of the recognized payment (null when not recorded). */
  financeTransactionId: string | null;
};

export type ReverseProviderSubscriptionPaymentResult = {
  reversed: boolean;
  alreadyReversed: boolean;
  ledgerReversed: boolean;
  providerId: string | null;
};

function toNumber(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function notifyProviderSafe(
  providerId: string,
  payload: {
    type: string;
    title: string;
    message: string;
    data?: Record<string, unknown>;
    action_url?: string;
  },
): Promise<void> {
  try {
    const { notifyProviderTeamUsers } = await import("@/lib/notifications/notify-provider-team");
    await notifyProviderTeamUsers(providerId, payload);
  } catch (notificationError) {
    console.warn("[provider_subscription] notification failed:", notificationError);
  }
}

/**
 * Best-effort emailed subscription receipt. Sends the `subscription_receipt`
 * template (email + push) to the provider owner with a signed, long-lived link
 * to the receipt PDF. Any failure is swallowed so it can never break payment
 * recognition inside the webhook.
 */
async function sendSubscriptionReceiptEmailSafe(params: {
  supabase: SupabaseClient;
  providerId: string;
  planId: string | null;
  amountMajor: number;
  financeTransactionId: string;
  reference: string;
  tenantIdHint: string | null;
  paidAtIso: string;
  isRenewal: boolean;
}): Promise<void> {
  const {
    supabase,
    providerId,
    planId,
    amountMajor,
    financeTransactionId,
    reference,
    tenantIdHint,
    paidAtIso,
    isRenewal,
  } = params;
  try {
    const { data: providerRow } = await supabase
      .from("providers")
      .select("user_id, business_name, tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    const provider = providerRow as
      | { user_id?: string | null; business_name?: string | null; tenant_id?: string | null }
      | null;
    if (!provider?.user_id) return;

    let planName = "Subscription plan";
    let planCurrency: string | null = null;
    if (planId) {
      const { data: planRow } = await supabase
        .from("subscription_plans")
        .select("name, currency")
        .eq("id", planId)
        .maybeSingle();
      const plan = planRow as { name?: string | null; currency?: string | null } | null;
      if (plan?.name) planName = plan.name;
      if (plan?.currency) planCurrency = plan.currency;
    }

    const tenantForCurrency = tenantIdHint ?? provider.tenant_id ?? null;
    const currency =
      planCurrency ||
      (tenantForCurrency
        ? (await getTenantRegionConfig(tenantForCurrency))?.defaultCurrency ?? LAST_RESORT_CURRENCY
        : LAST_RESORT_CURRENCY);

    const receiptUrl = buildProviderSubscriptionReceiptUrl({
      financeTxId: financeTransactionId,
      userId: provider.user_id,
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://beautonomi.com";
    const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
    await sendTemplateNotification(
      "subscription_receipt",
      [provider.user_id],
      {
        business_name: provider.business_name || "Provider",
        plan_name: planName,
        amount: `${currency} ${Number(amountMajor).toLocaleString()}`,
        payment_date: new Date(paidAtIso).toLocaleDateString(),
        reference,
        payment_kind: isRenewal ? "renewal" : "payment",
        receipt_url: receiptUrl || `${appUrl}/provider/settings/billing`,
        app_url: appUrl,
        year: new Date().getFullYear().toString(),
      },
      ["push", "email"],
      { appType: "provider", tenantId: tenantForCurrency },
    );
  } catch (receiptError) {
    console.warn("[provider_subscription] receipt email failed:", receiptError);
  }
}

/**
 * Idempotently record one recognized subscription payment. Returns
 * `alreadyRecorded: true` (without posting) when a payment_transactions row for
 * the same Paystack reference already exists, so every caller (authorization
 * charge, renewal order, recurring invoice, verify path) is safe to call more
 * than once for the same money event.
 */
export async function recordProviderSubscriptionPayment(params: {
  supabase: SupabaseClient;
  /** Paystack reference — the idempotency key (charge ref, invoice code, or synthetic). */
  reference: string;
  providerId: string;
  /** Gross paid amount in major currency units (already converted from kobo). */
  amountMajor: number;
  /** Paystack fees in major currency units (already converted). */
  feesMajor: number;
  planId?: string | null;
  orderId?: string | null;
  subscriptionCode?: string | null;
  invoiceCode?: string | null;
  /** payment_transactions.transaction_type ("charge" for orders/auth, "provider_subscription_payment" for renewals). */
  paymentTransactionType?: string;
  /** metadata.kind label (e.g. "provider_subscription_order", "subscription_authorization", "subscription_renewal"). */
  kind: string;
  description?: string;
  tenantIdHint?: string | null;
}): Promise<RecordProviderSubscriptionPaymentResult> {
  const {
    supabase,
    reference,
    providerId,
    amountMajor,
    feesMajor,
    planId = null,
    orderId = null,
    subscriptionCode = null,
    invoiceCode = null,
    paymentTransactionType = "charge",
    kind,
    description = "Provider subscription payment",
    tenantIdHint = null,
  } = params;

  let resolvedFeesMajor = feesMajor;
  const resolvedFees = await resolvePaystackFeeMajor(supabase, {
    feesSmallestOrMajor: feesMajor,
    amountMajor,
    alreadyMajor: true,
  });
  resolvedFeesMajor = resolvedFees.feesMajor;
  const netAmount = amountMajor - resolvedFeesMajor;

  if (!reference || !providerId) {
    console.error("[provider_subscription] recordProviderSubscriptionPayment: missing reference/providerId", {
      reference,
      providerId,
    });
    return { recorded: false, alreadyRecorded: false, netAmount, reference, financeTransactionId: null };
  }

  // Idempotency: one recognized payment per Paystack reference.
  // A prior failed row (charge.failed / invoice.payment_failed) must not block
  // a later successful recognition of the same reference — clear it and proceed.
  const { data: existingTx } = await supabase
    .from("payment_transactions")
    .select("id, status")
    .eq("provider", "paystack")
    .eq("reference", reference)
    .maybeSingle();
  if (existingTx) {
    const existingStatus = String(
      (existingTx as { status?: string }).status ?? "",
    ).toLowerCase();
    if (existingStatus === "success") {
      return { recorded: false, alreadyRecorded: true, netAmount, reference, financeTransactionId: null };
    }
    if (existingStatus === "failed") {
      await supabase
        .from("payment_transactions")
        .delete()
        .eq("id", (existingTx as { id: string }).id);
    } else {
      return { recorded: false, alreadyRecorded: true, netAmount, reference, financeTransactionId: null };
    }
  }

  const financeTenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: tenantIdHint,
    provider_id: providerId,
  });

  const nowIso = new Date().toISOString();

  const { error: ptError } = await supabase.from("payment_transactions").insert({
    booking_id: null,
    reference,
    amount: amountMajor,
    fees: resolvedFeesMajor,
    net_amount: netAmount,
    status: "success",
    provider: "paystack",
    transaction_type: paymentTransactionType,
    metadata: {
      kind,
      provider_subscription_order_id: orderId,
      provider_id: providerId,
      plan_id: planId,
      subscription_code: subscriptionCode,
      invoice_code: invoiceCode,
    },
    created_at: nowIso,
  });

  if (ptError) {
    // 23505 = unique_violation on (provider, reference): a concurrent webhook
    // (e.g. charge.success racing invoice.update for the same renewal) already
    // inserted this payment. Bail out BEFORE posting finance_transactions so
    // revenue is never double-recognized. Non-idempotency errors are surfaced.
    if ((ptError as { code?: string }).code === "23505") {
      return { recorded: false, alreadyRecorded: true, netAmount, reference, financeTransactionId: null };
    }
    console.error("[provider_subscription] payment_transactions insert failed:", ptError);
    return { recorded: false, alreadyRecorded: false, netAmount, reference, financeTransactionId: null };
  }

  const { data: financeRow } = await supabase
    .from("finance_transactions")
    .insert({
      booking_id: null,
      provider_id: providerId,
      tenant_id: financeTenantId,
      transaction_type: "provider_subscription_payment",
      // `amount` holds the GROSS the provider was charged (matches the
      // ads/marketing-credit convention and the receipt shown to providers).
      // `net` (gross − gateway fees) is what platform revenue recognition sums.
      amount: amountMajor,
      fees: resolvedFeesMajor,
      commission: 0,
      net: netAmount,
      description,
      metadata: {
        kind,
        reference,
        provider_subscription_order_id: orderId,
        plan_id: planId,
        subscription_code: subscriptionCode,
        invoice_code: invoiceCode,
        fee_source: resolvedFees.feeSource,
      },
      created_at: nowIso,
    })
    .select("id")
    .single();

  const financeTransactionId = (financeRow as { id?: string } | null)?.id ?? null;

  // Email the provider a receipt for every recognized charge (initial order,
  // authorization, and recurring renewal all flow through here exactly once).
  // Best-effort: a notification failure must never fail payment recognition.
  if (financeTransactionId) {
    await sendSubscriptionReceiptEmailSafe({
      supabase,
      providerId,
      planId,
      amountMajor,
      financeTransactionId,
      reference,
      tenantIdHint: financeTenantId,
      paidAtIso: nowIso,
      isRenewal: kind === "subscription_renewal",
    });
  }

  return { recorded: true, alreadyRecorded: false, netAmount, reference, financeTransactionId };
}

/**
 * Reverse a recognized subscription payment: post a full negative
 * `provider_subscription_refund`, revoke paid access (fall the provider back to
 * the free catalog plan + disable the Paystack subscription), and mark any
 * order refunded. Idempotent — guarded by an existing-refund lookup.
 *
 * Identify the original payment by `reference` (preferred), else by `orderId`,
 * else by `subscriptionCode`; the reversal amount is the originally recognized
 * net so the GL nets to zero.
 */
export async function reverseProviderSubscriptionPayment(params: {
  supabase: SupabaseClient;
  reason: string;
  /** At least one locator is required. */
  reference?: string | null;
  orderId?: string | null;
  subscriptionCode?: string | null;
  providerIdHint?: string | null;
}): Promise<ReverseProviderSubscriptionPaymentResult> {
  const { supabase, reason } = params;
  const reference = params.reference ?? null;
  const orderId = params.orderId ?? null;
  const subscriptionCode = params.subscriptionCode ?? null;

  // 1) Locate the original recognized payment (finance_transactions row).
  let original: { provider_id: string | null; net: number | null; amount: number | null } | null = null;
  if (reference) {
    const { data } = await supabase
      .from("finance_transactions")
      .select("provider_id, net, amount")
      .eq("transaction_type", "provider_subscription_payment")
      .contains("metadata", { reference })
      .maybeSingle();
    original = (data as typeof original) ?? null;
  }
  if (!original && orderId) {
    const { data } = await supabase
      .from("finance_transactions")
      .select("provider_id, net, amount")
      .eq("transaction_type", "provider_subscription_payment")
      .contains("metadata", { provider_subscription_order_id: orderId })
      .maybeSingle();
    original = (data as typeof original) ?? null;
  }
  if (!original && subscriptionCode) {
    const { data } = await supabase
      .from("finance_transactions")
      .select("provider_id, net, amount")
      .eq("transaction_type", "provider_subscription_payment")
      .contains("metadata", { subscription_code: subscriptionCode })
      .maybeSingle();
    original = (data as typeof original) ?? null;
  }

  const providerId = String(original?.provider_id || params.providerIdHint || "").trim();

  // 2) Resolve the order (for terminal status + provider/tenant) when present.
  let orderRow: { id: string; provider_id: string | null; status: string | null } | null = null;
  if (orderId) {
    const { data } = await supabase
      .from("provider_subscription_orders")
      .select("id, provider_id, status")
      .eq("id", orderId)
      .maybeSingle();
    orderRow = (data as typeof orderRow) ?? null;
  }

  const resolvedProviderId = providerId || String(orderRow?.provider_id || "").trim();
  if (!resolvedProviderId) {
    console.error("[provider_subscription] reverseProviderSubscriptionPayment: could not resolve provider", {
      reference,
      orderId,
      subscriptionCode,
    });
    return { reversed: false, alreadyReversed: false, ledgerReversed: false, providerId: null };
  }

  const nowIso = new Date().toISOString();

  // 3) Idempotency: do not double-post a refund for the same locator.
  const refundMetadataMatch = reference
    ? { reference }
    : orderId
      ? { provider_subscription_order_id: orderId }
      : { subscription_code: subscriptionCode };
  const { data: existingReversal } = await supabase
    .from("finance_transactions")
    .select("id")
    .eq("provider_id", resolvedProviderId)
    .eq("transaction_type", "provider_subscription_refund")
    .contains("metadata", refundMetadataMatch as Record<string, unknown>)
    .maybeSingle();

  if (existingReversal) {
    return { reversed: false, alreadyReversed: true, ledgerReversed: false, providerId: resolvedProviderId };
  }

  // 4) Load the current subscription (for Paystack code + tenant).
  const { data: subRow } = await supabase
    .from("provider_subscriptions")
    .select("id, tenant_id, paystack_subscription_code")
    .eq("provider_id", resolvedProviderId)
    .maybeSingle();
  const subscription = subRow as
    | { id: string; tenant_id: string | null; paystack_subscription_code: string | null }
    | null;

  // 5) Ledger reversal — only if revenue had been recognized.
  let ledgerReversed = false;
  const recognizedNet = original ? toNumber(original.net ?? original.amount) : 0;
  if (recognizedNet > 0) {
    const financeTenantId = await resolveTenantIdForFinanceLedger(supabase, {
      tenant_id: subscription?.tenant_id ?? null,
      provider_id: resolvedProviderId,
    });
    await supabase.from("finance_transactions").insert({
      booking_id: null,
      provider_id: resolvedProviderId,
      tenant_id: financeTenantId,
      transaction_type: "provider_subscription_refund",
      amount: -recognizedNet,
      fees: 0,
      commission: 0,
      net: -recognizedNet,
      description: `Provider subscription payment reversed (${reason})`,
      metadata: {
        kind: "provider_subscription_refund",
        reference,
        provider_subscription_order_id: orderId,
        subscription_code: subscriptionCode,
        reason,
      },
      created_at: nowIso,
    });
    ledgerReversed = true;
  }

  // 6) Stop Paystack recurring billing (best effort).
  const paystackCode = subscription?.paystack_subscription_code ?? subscriptionCode ?? null;
  if (paystackCode) {
    try {
      const { disableSubscriptionByCode } = await import("@/lib/payments/paystack-complete");
      await disableSubscriptionByCode(paystackCode, { tenantId: subscription?.tenant_id ?? null });
    } catch (disableError) {
      console.warn("[provider_subscription] failed to disable Paystack subscription on reversal:", disableError);
    }
  }

  // 7) Revoke paid access: fall the provider back to the free catalog plan.
  if (subscription) {
    const freePlanId = await resolveCatalogPlanIdForProviderSubscription(supabase);
    const update: Record<string, unknown> = {
      status: "active",
      expires_at: null,
      cancelled_at: nowIso,
      auto_renew: false,
      paystack_subscription_code: null,
      paystack_authorization_code: null,
      updated_at: nowIso,
    };
    if (freePlanId) update.plan_id = freePlanId;
    await supabase.from("provider_subscriptions").update(update).eq("id", subscription.id);
  }

  // 8) Mark the order refunded (when this reversal traces to an order).
  if (orderRow && orderRow.status !== "refunded") {
    await supabase
      .from("provider_subscription_orders")
      .update({ status: "refunded", updated_at: nowIso })
      .eq("id", orderRow.id);
  }

  await notifyProviderSafe(resolvedProviderId, {
    type: "subscription_update",
    title: "Subscription payment reversed",
    message:
      "Your subscription payment was reversed, so your account has been moved to the free plan. You can upgrade again anytime.",
    data: { reference, provider_subscription_order_id: orderId, reason },
    action_url: "/provider/subscription",
  });

  return { reversed: true, alreadyReversed: false, ledgerReversed, providerId: resolvedProviderId };
}

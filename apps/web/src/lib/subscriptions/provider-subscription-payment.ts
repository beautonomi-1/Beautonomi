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
 * Accounting (Phase 11 accrual): provider_subscription_payment posts gross cash
 * with `net = 0` (deferred revenue). Gateway fees sit in `fees`. Recognition
 * rows (`subscription_recognition`) are inserted by the daily cron. Refunds
 * debit deferred liability first (migration 665/863).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { resolveCatalogPlanIdForProviderSubscription } from "@/lib/subscriptions/ensure-provider-free-subscription";
import { buildProviderSubscriptionReceiptUrl } from "@/lib/receipts/receipt-download-token";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { getPlatformDefaultTaxRate } from "@/lib/platform-tax-settings";
import { computeVatInclusiveBreakdown } from "@/lib/receipts/vat-inclusive-breakdown";
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

export type SubscriptionVatSource = "provider_subscription_payment" | "provider_subscription_refund";

/**
 * Post (idempotently, keyed on source payment + vat_source) the VAT `tax` leg
 * for a subscription payment or its refund. Amount is signed: positive for a
 * payment, negative for a refund. `net` is always 0 (a VAT leg is never
 * revenue). Best-effort: a failure here never fails the money event, but it
 * is logged so reconciliation can pick it up.
 */
export async function postSubscriptionVatLeg(
  supabase: SupabaseClient,
  params: {
    providerId: string;
    tenantId: string | null;
    currency: string | null;
    /** Absolute VAT portion in major units. */
    amount: number;
    ratePercent: number;
    /** finance_transactions.id of the original provider_subscription_payment. */
    sourcePaymentId: string;
    reference: string | null;
    vatSource: SubscriptionVatSource;
    createdAtIso: string;
  },
): Promise<{ posted: boolean; alreadyPosted: boolean }> {
  const absAmount = Math.round(Math.abs(Number(params.amount) || 0) * 100) / 100;
  if (absAmount <= 0 || !params.sourcePaymentId) return { posted: false, alreadyPosted: false };
  const signed = params.vatSource === "provider_subscription_refund" ? -absAmount : absAmount;

  try {
    const { data: existing } = await supabase
      .from("finance_transactions")
      .select("id")
      .eq("transaction_type", "tax")
      .contains("metadata", { vat_source: params.vatSource, source_payment_id: params.sourcePaymentId })
      .maybeSingle();
    if (existing) return { posted: false, alreadyPosted: true };

    const { error } = await supabase.from("finance_transactions").insert({
      booking_id: null,
      provider_id: params.providerId,
      tenant_id: params.tenantId,
      transaction_type: "tax",
      amount: signed,
      fees: 0,
      commission: 0,
      net: 0,
      currency: params.currency,
      description:
        params.vatSource === "provider_subscription_refund"
          ? "VAT on provider subscription payment reversed"
          : "VAT on provider subscription payment",
      metadata: {
        kind: "subscription_vat",
        vat_source: params.vatSource,
        source_payment_id: params.sourcePaymentId,
        reference: params.reference,
        vat_rate_percent: params.ratePercent,
      },
      created_at: params.createdAtIso,
    });
    if (error) {
      console.error("[provider_subscription] VAT tax leg insert failed:", error.message);
      return { posted: false, alreadyPosted: false };
    }
    return { posted: true, alreadyPosted: false };
  } catch (err) {
    console.error("[provider_subscription] VAT tax leg failed:", err);
    return { posted: false, alreadyPosted: false };
  }
}

/**
 * Sum of `subscription_recognition` rows already posted against an original
 * subscription payment (the daily recognize-period-revenue cron links each
 * recognition row via metadata.source_payment_id). Used to split a refund
 * into the deferred vs already-recognized components.
 */
export async function sumRecognizedForSubscriptionPayment(
  supabase: SupabaseClient,
  sourcePaymentId: string,
): Promise<number> {
  if (!sourcePaymentId) return 0;
  try {
    const { data } = await supabase
      .from("finance_transactions")
      .select("amount")
      .eq("transaction_type", "subscription_recognition")
      .contains("metadata", { source_payment_id: sourcePaymentId });
    const rows = (data ?? []) as Array<{ amount?: number | string | null }>;
    const total = rows.reduce((s, r) => s + toNumber(r.amount), 0);
    return Math.round(Math.max(0, total) * 100) / 100;
  } catch {
    return 0;
  }
}

/**
 * Pure split of a refund into the part that reverses still-deferred revenue
 * (2810) and the part that reverses already-recognized revenue (3100).
 */
export function splitSubscriptionRefundComponents(
  reversalAmount: number,
  recognizedSoFar: number,
): { deferred_reversed: number; recognized_reversed: number } {
  const round = (n: number) => Math.round(n * 100) / 100;
  const total = round(Math.max(0, toNumber(reversalAmount)));
  // Round the recognized part first so the two components always sum to total.
  const recognized = Math.min(total, round(Math.max(0, toNumber(recognizedSoFar))));
  return { deferred_reversed: round(total - recognized), recognized_reversed: recognized };
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
  paymentProvider?: "paystack" | "apple";
  paymentMetadata?: Record<string, unknown>;
  /** Billing term for recognition (defaults to monthly from paid-at). */
  billingPeriod?: "monthly" | "yearly" | null;
  currency?: string | null;
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
    paymentProvider = "paystack",
    paymentMetadata = {},
    billingPeriod = "monthly",
    currency: currencyHint = null,
  } = params;

  let resolvedFeesMajor = feesMajor;
  if (paymentProvider === "paystack") {
    const resolvedFees = await resolvePaystackFeeMajor(supabase, {
      feesSmallestOrMajor: feesMajor,
      amountMajor,
      alreadyMajor: true,
    });
    resolvedFeesMajor = resolvedFees.feesMajor;
  }
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
    .eq("provider", paymentProvider)
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
  const termStart = nowIso;
  const termEnd = new Date(
    Date.now() + (billingPeriod === "yearly" ? 365 : 30) * 86400000,
  ).toISOString();

  // Currency resolution is best-effort: a lookup failure must not block
  // recording a payment that Paystack already captured.
  let resolvedCurrency = currencyHint;
  try {
    if (!resolvedCurrency && planId) {
      const { data: planRow } = await supabase
        .from("subscription_plans")
        .select("currency")
        .eq("id", planId)
        .maybeSingle();
      resolvedCurrency = (planRow as { currency?: string | null } | null)?.currency ?? null;
    }
    if (!resolvedCurrency && financeTenantId) {
      const { data: tenantRow } = await supabase
        .from("tenants")
        .select("default_currency")
        .eq("id", financeTenantId)
        .maybeSingle();
      resolvedCurrency = (tenantRow as { default_currency?: string | null } | null)?.default_currency ?? null;
    }
  } catch (err) {
    console.warn("[recordProviderSubscriptionPayment] currency lookup failed; using fallback", err);
  }
  resolvedCurrency = resolvedCurrency || LAST_RESORT_CURRENCY;

  const vatRate = await getPlatformDefaultTaxRate();
  const vatBreakdown = computeVatInclusiveBreakdown(amountMajor, vatRate);
  const vatMetadata =
    vatBreakdown.ratePercent > 0
      ? {
          vat_rate_percent: vatBreakdown.ratePercent,
          vat_amount: vatBreakdown.vatAmount,
          subtotal_excl_vat: vatBreakdown.subtotalExclVat,
        }
      : {};

  const { error: ptError } = await supabase.from("payment_transactions").insert({
    booking_id: null,
    reference,
    amount: amountMajor,
    fees: resolvedFeesMajor,
    net_amount: netAmount,
    status: "success",
    provider: paymentProvider,
    transaction_type: paymentTransactionType,
    metadata: {
      kind,
      provider_subscription_order_id: orderId,
      provider_id: providerId,
      plan_id: planId,
      subscription_code: subscriptionCode,
      invoice_code: invoiceCode,
      payment_provider: paymentProvider,
      ...paymentMetadata,
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
      amount: amountMajor,
      fees: resolvedFeesMajor,
      commission: 0,
      net: 0,
      currency: resolvedCurrency,
      description,
      metadata: {
        kind,
        reference,
        provider_subscription_order_id: orderId,
        plan_id: planId,
        subscription_code: subscriptionCode,
        invoice_code: invoiceCode,
        fee_source: paymentProvider === "paystack" ? "paystack" : "apple_commission",
        payment_provider: paymentProvider,
        recognition_basis: "term",
        term_start: termStart,
        term_end: termEnd,
        billing_period: billingPeriod,
        ...vatMetadata,
        ...paymentMetadata,
      },
      created_at: nowIso,
    })
    .select("id")
    .single();

  const financeTransactionId = (financeRow as { id?: string } | null)?.id ?? null;

  // VAT output-tax leg (Part C1/C2). The platform is the supplier of the
  // subscription, so VAT is due when the platform's configured rate
  // (getPlatformDefaultTaxRate — the platform's VAT-registration signal) is > 0.
  // Posting rule, consistent with how 863 treats `tax` rows (amount = VAT,
  // net = 0 → never counted as revenue by the aggregator): a separate `tax`
  // finance row with metadata.vat_source = 'provider_subscription_payment'.
  // The shadow GL (migration 870) reclasses it DR Subscription revenue 3100 /
  // CR VAT payable 2100 so that once the term is fully recognized, revenue =
  // gross − VAT and VAT payable = VAT; the cash leg is untouched (cash already
  // includes VAT via the payment row). The aggregator excludes vat_source rows
  // from booking `taxes_gross` and reports them as `subscription_vat`.
  if (financeTransactionId && vatBreakdown.ratePercent > 0 && vatBreakdown.vatAmount > 0) {
    await postSubscriptionVatLeg(supabase, {
      providerId,
      tenantId: financeTenantId,
      currency: resolvedCurrency,
      amount: vatBreakdown.vatAmount,
      ratePercent: vatBreakdown.ratePercent,
      sourcePaymentId: financeTransactionId,
      reference,
      vatSource: "provider_subscription_payment",
      createdAtIso: nowIso,
    });
  }

  await supabase
    .from("provider_subscriptions")
    .update({
      billing_period_start: termStart,
      billing_period_end: termEnd,
      last_payment_at: nowIso,
      updated_at: nowIso,
    })
    .eq("provider_id", providerId);

  // Email the provider a receipt for every recognized charge (initial order,
  // authorization, and recurring renewal all flow through here exactly once).
  // Best-effort: a notification failure must never fail payment recognition.
  if (financeTransactionId) {
    if (paymentProvider !== "apple") {
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
  type OriginalPaymentRow = {
    id?: string | null;
    provider_id: string | null;
    net: number | null;
    amount: number | null;
    currency?: string | null;
    metadata?: Record<string, unknown> | null;
  };
  const ORIGINAL_COLUMNS = "id, provider_id, net, amount, currency, metadata";
  let original: OriginalPaymentRow | null = null;
  if (reference) {
    const { data } = await supabase
      .from("finance_transactions")
      .select(ORIGINAL_COLUMNS)
      .eq("transaction_type", "provider_subscription_payment")
      .contains("metadata", { reference })
      .maybeSingle();
    original = (data as OriginalPaymentRow | null) ?? null;
  }
  if (!original && orderId) {
    const { data } = await supabase
      .from("finance_transactions")
      .select(ORIGINAL_COLUMNS)
      .eq("transaction_type", "provider_subscription_payment")
      .contains("metadata", { provider_subscription_order_id: orderId })
      .maybeSingle();
    original = (data as OriginalPaymentRow | null) ?? null;
  }
  if (!original && subscriptionCode) {
    const { data } = await supabase
      .from("finance_transactions")
      .select(ORIGINAL_COLUMNS)
      .eq("transaction_type", "provider_subscription_payment")
      .contains("metadata", { subscription_code: subscriptionCode })
      .maybeSingle();
    original = (data as OriginalPaymentRow | null) ?? null;
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
  const reversalAmount = original
    ? toNumber(original.net) !== 0
      ? toNumber(original.net)
      : toNumber(original.amount)
    : 0;
  if (reversalAmount > 0) {
    const financeTenantId = await resolveTenantIdForFinanceLedger(supabase, {
      tenant_id: subscription?.tenant_id ?? null,
      provider_id: resolvedProviderId,
    });

    // Component split (Part C1): how much of the original deferred amount has
    // the recognize-period-revenue cron already moved to revenue? The shadow GL
    // (migration 870) reverses the deferred part against 2810 and the
    // recognized part against Subscription revenue 3100, falling back to
    // all-deferred when these fields are absent (pre-870 rows).
    const originalId = typeof original?.id === "string" ? original.id : "";
    const recognizedSoFar = originalId
      ? await sumRecognizedForSubscriptionPayment(supabase, originalId)
      : 0;
    const split = splitSubscriptionRefundComponents(reversalAmount, recognizedSoFar);

    await supabase.from("finance_transactions").insert({
      booking_id: null,
      provider_id: resolvedProviderId,
      tenant_id: financeTenantId,
      transaction_type: "provider_subscription_refund",
      amount: -reversalAmount,
      fees: 0,
      commission: 0,
      net: -reversalAmount,
      currency: original?.currency ?? null,
      description: `Provider subscription payment reversed (${reason})`,
      metadata: {
        kind: "provider_subscription_refund",
        reference,
        provider_subscription_order_id: orderId,
        subscription_code: subscriptionCode,
        source_payment_id: originalId || null,
        deferred_reversed: split.deferred_reversed,
        recognized_reversed: split.recognized_reversed,
        reason,
      },
      created_at: nowIso,
    });
    ledgerReversed = true;

    // Reverse the VAT output-tax leg posted at payment time (if any).
    const originalVat = toNumber(
      (original?.metadata as { vat_amount?: number | string | null } | null | undefined)?.vat_amount,
    );
    const originalVatRate = toNumber(
      (original?.metadata as { vat_rate_percent?: number | string | null } | null | undefined)
        ?.vat_rate_percent,
    );
    if (originalId && originalVat > 0) {
      await postSubscriptionVatLeg(supabase, {
        providerId: resolvedProviderId,
        tenantId: financeTenantId,
        currency: original?.currency ?? null,
        amount: originalVat,
        ratePercent: originalVatRate,
        sourcePaymentId: originalId,
        reference,
        vatSource: "provider_subscription_refund",
        createdAtIso: nowIso,
      });
    }
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

  if (subscription?.id) {
    void import("@/lib/integrations/slack/ops-triggers")
      .then(({ slackNotifySubscriptionChurned }) =>
        slackNotifySubscriptionChurned({
          tenantId: subscription.tenant_id,
          subscriptionId: subscription.id,
          providerId: resolvedProviderId,
          reason: "chargeback",
        }),
      )
      .catch(() => undefined);
  }

  return { reversed: true, alreadyReversed: false, ledgerReversed, providerId: resolvedProviderId };
}

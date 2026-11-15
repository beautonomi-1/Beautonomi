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
import { clearAppleMerchantOnFree, computePaidPeriodExpiresAt, paystackChargeAlreadyReturned, paystackCodeAfterStop, stopPaystackSubscriptionBeforeClear } from "@/lib/subscriptions/provider-billing-merchant";
import { createRefund } from "@/lib/payments/paystack-complete";
import { buildProviderSubscriptionReceiptUrl } from "@/lib/receipts/receipt-download-token";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { getPlatformDefaultTaxRate } from "@/lib/platform-tax-settings";
import { computeVatInclusiveBreakdown } from "@/lib/receipts/vat-inclusive-breakdown";
import { resolvePaystackFeeMajor } from "@/lib/payments/resolve-paystack-fee";
import { addMoney, roundCurrency, subtractMoney } from "@beautonomi/utils";

export type RecordProviderSubscriptionPaymentResult = {
  recorded: boolean;
  alreadyRecorded: boolean;
  netAmount: number;
  reference: string;
  /** finance_transactions.id of the recognized payment (null when not recorded). */
  financeTransactionId: string | null;
  /** The Paystack charge was already returned. Do not open a period for it. */
  chargeReturned?: boolean;
  /** Recognition end. The plan uses this when the store date is no longer ahead. */
  termEnd: string | null;
};

/** The access end replaced the recognized term. Keep the payment term on that date. */
export async function alignRecognizedSubscriptionTerm(
  supabase: SupabaseClient,
  input: {
    financeTransactionId?: string | null;
    providerId?: string | null;
    reference?: string | null;
    recognizedEnd: string | null;
    accessEnd: string;
  },
): Promise<void> {
  if (input.recognizedEnd === input.accessEnd) return;
  let financeId = input.financeTransactionId ?? null;
  if (!financeId && input.providerId && input.reference) {
    const { data: found, error: lookupError } = await supabase
      .from("finance_transactions")
      .select("id")
      .eq("provider_id", input.providerId)
      .eq("transaction_type", "provider_subscription_payment")
      .contains("metadata", { reference: input.reference })
      .maybeSingle();
    if (lookupError) {
      console.error("[provider_subscription] recognized term was not found:", lookupError);
      return;
    }
    financeId = (found as { id?: string } | null)?.id ?? null;
  }
  if (!financeId) return;
  const { data: financeRow, error: readError } = await supabase
    .from("finance_transactions")
    .select("metadata")
    .eq("id", financeId)
    .maybeSingle();
  if (readError) {
    console.error("[provider_subscription] recognized term was not read:", readError);
    return;
  }
  const stored = (financeRow as { metadata?: unknown } | null)?.metadata;
  const metadata =
    stored && typeof stored === "object" && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : {};
  const { error: termError } = await supabase
    .from("finance_transactions")
    .update({ metadata: { ...metadata, term_end: input.accessEnd } })
    .eq("id", financeId);
  if (termError) {
    console.error("[provider_subscription] recognized term was not aligned:", termError);
  }
}

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
  const absAmount = roundCurrency(Math.abs(Number(params.amount) || 0));
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
    const total = rows.reduce((s, r) => addMoney(s, toNumber(r.amount)), 0);
    return roundCurrency(Math.max(0, total));
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
  const total = roundCurrency(Math.max(0, toNumber(reversalAmount)));
  // Round the recognized part first so the two components always sum to total.
  const recognized = Math.min(total, roundCurrency(Math.max(0, toNumber(recognizedSoFar))));
  return { deferred_reversed: subtractMoney(total, recognized), recognized_reversed: recognized };
}

/**
 * Post the subscription finance row once. A payment that was already saved
 * still gets this row, and the VAT line, when they were missing.
 */
async function ensureProviderSubscriptionFinance(
  supabase: SupabaseClient,
  input: {
    providerId: string;
    planId: string | null;
    orderId: string | null;
    reference: string;
    amountMajor: number;
    feesMajor: number;
    kind: string;
    description: string;
    paymentProvider: "paystack" | "apple" | "stripe" | "flutterwave";
    paymentMetadata: Record<string, unknown>;
    subscriptionCode: string | null;
    invoiceCode: string | null;
    tenantIdHint: string | null;
    currencyHint: string | null;
    billingPeriod: "monthly" | "yearly";
    termEndsAt: string | null;
    paidAt: Date;
  },
): Promise<{ id: string | null; inserted: boolean; termStart: string; termEnd: string }> {
  const termStart = input.paidAt.toISOString();
  const explicitEnd = input.termEndsAt ? new Date(input.termEndsAt) : null;
  const termEnd =
    explicitEnd && Number.isFinite(explicitEnd.getTime())
      ? explicitEnd.toISOString()
      : computePaidPeriodExpiresAt(input.billingPeriod, input.paidAt);

  const financeTenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: input.tenantIdHint,
    provider_id: input.providerId,
  });

  let resolvedCurrency: string | null = input.currencyHint;
  try {
    if (!resolvedCurrency && input.planId) {
      const { data: planRow } = await supabase
        .from("subscription_plans")
        .select("currency")
        .eq("id", input.planId)
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
  const vatBreakdown = computeVatInclusiveBreakdown(input.amountMajor, vatRate);
  const vatMetadata =
    vatBreakdown.ratePercent > 0
      ? {
          vat_rate_percent: vatBreakdown.ratePercent,
          vat_amount: vatBreakdown.vatAmount,
          subtotal_excl_vat: vatBreakdown.subtotalExclVat,
        }
      : {};

  const { data: existingFinance, error: lookupError } = await supabase
    .from("finance_transactions")
    .select("id")
    .eq("provider_id", input.providerId)
    .eq("transaction_type", "provider_subscription_payment")
    .contains("metadata", { reference: input.reference })
    .maybeSingle();
  if (lookupError) {
    console.error("[provider_subscription] finance lookup failed:", lookupError);
    return { id: null, inserted: false, termStart, termEnd };
  }
  let financeId = (existingFinance as { id?: string } | null)?.id ?? null;
  let inserted = false;
  if (!financeId) {
    const { data: financeRow, error: financeError } = await supabase
      .from("finance_transactions")
      .insert({
        booking_id: null,
        provider_id: input.providerId,
        tenant_id: financeTenantId,
        transaction_type: "provider_subscription_payment",
        amount: input.amountMajor,
        fees: input.feesMajor,
        commission: 0,
        net: 0,
        currency: resolvedCurrency,
        description: input.description,
        metadata: {
          kind: input.kind,
          reference: input.reference,
          provider_subscription_order_id: input.orderId,
          plan_id: input.planId,
          subscription_code: input.subscriptionCode,
          invoice_code: input.invoiceCode,
          fee_source:
            input.paymentProvider === "paystack"
              ? "paystack"
              : input.paymentProvider === "stripe"
                ? "stripe"
                : input.paymentProvider === "flutterwave"
                  ? "flutterwave"
                  : "apple_commission",
          payment_provider: input.paymentProvider,
          recognition_basis: "term",
          term_start: termStart,
          term_end: termEnd,
          billing_period: input.billingPeriod,
          ...vatMetadata,
          ...input.paymentMetadata,
        },
        created_at: termStart,
      })
      .select("id")
      .single();
    if (financeError) {
      console.error("[provider_subscription] finance insert failed:", financeError);
      return { id: null, inserted: false, termStart, termEnd };
    }
    financeId = (financeRow as { id?: string } | null)?.id ?? null;
    inserted = Boolean(financeId);
  }

  if (financeId && vatBreakdown.ratePercent > 0 && vatBreakdown.vatAmount > 0) {
    await postSubscriptionVatLeg(supabase, {
      providerId: input.providerId,
      tenantId: financeTenantId,
      currency: resolvedCurrency,
      amount: vatBreakdown.vatAmount,
      ratePercent: vatBreakdown.ratePercent,
      sourcePaymentId: financeId,
      reference: input.reference,
      vatSource: "provider_subscription_payment",
      createdAtIso: termStart,
    });
  }

  if (inserted && financeId && input.paymentProvider !== "apple") {
    await sendSubscriptionReceiptEmailSafe({
      supabase,
      providerId: input.providerId,
      planId: input.planId,
      amountMajor: input.amountMajor,
      financeTransactionId: financeId,
      reference: input.reference,
      tenantIdHint: financeTenantId,
      paidAtIso: termStart,
      isRenewal: input.kind === "subscription_renewal",
    });
  }

  if (inserted && financeId && input.amountMajor > 0 && input.planId) {
    const { data: planRow } = await supabase
      .from("subscription_plans")
      .select("is_free")
      .eq("id", input.planId)
      .maybeSingle();
    if (planRow && (planRow as { is_free?: boolean }).is_free !== true) {
      let reactTenantId = financeTenantId ?? input.tenantIdHint ?? null;
      if (!reactTenantId) {
        const { data: provRow } = await supabase
          .from("providers")
          .select("tenant_id")
          .eq("id", input.providerId)
          .maybeSingle();
        reactTenantId = (provRow as { tenant_id?: string | null } | null)?.tenant_id ?? null;
      }
      if (reactTenantId) {
        void import("@/lib/provider-ops/ops-case")
          .then(({ reactivateChurnedCase }) =>
            reactivateChurnedCase(supabase, {
              tenantId: reactTenantId as string,
              providerId: input.providerId,
              source: "payment",
            }),
          )
          .catch(() => undefined);
      }
    }
  }

  return { id: financeId, inserted, termStart, termEnd };
}

/**
 * Idempotently record one recognized subscription payment. A payment row that
 * already exists is not posted again. A missing finance row for that payment
 * is posted on the next delivery.
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
  paymentProvider?: "paystack" | "apple" | "stripe" | "flutterwave";
  paymentMetadata?: Record<string, unknown>;
  /** Billing term for recognition (defaults to monthly from paid-at). */
  billingPeriod?: "monthly" | "yearly" | null;
  /** Access end already granted by the store. Recognition uses this instead of a new month from now. */
  termEndsAt?: string | null;
  currency?: string | null;
  /**
   * A period that is already on the subscription must keep its recognition window.
   * The payment row is still stored.
   */
  updateBillingPeriod?: boolean;
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
    termEndsAt = null,
    currency: currencyHint = null,
    updateBillingPeriod = true,
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
  const netAmount = subtractMoney(amountMajor, resolvedFeesMajor);

  if (!reference || !providerId) {
    console.error("[provider_subscription] recordProviderSubscriptionPayment: missing reference/providerId", {
      reference,
      providerId,
    });
    return { recorded: false, alreadyRecorded: false, netAmount, reference, financeTransactionId: null, termEnd: null };
  }

  // Idempotency: one recognized payment per Paystack reference.
  // A prior failed row (charge.failed / invoice.payment_failed) must not block
  // a later successful recognition of the same reference — clear it and proceed.
  const { data: existingTx } = await supabase
    .from("payment_transactions")
    .select("id, status, created_at")
    .eq("provider", paymentProvider)
    .eq("reference", reference)
    .maybeSingle();
  if (existingTx) {
    const existingStatus = String(
      (existingTx as { status?: string }).status ?? "",
    ).toLowerCase();
    if (existingStatus === "refunded" || existingStatus === "partially_refunded") {
      return {
        recorded: false,
        alreadyRecorded: true,
        chargeReturned: true,
        netAmount,
        reference,
        financeTransactionId: null,
        termEnd: null,
      };
    }
    if (existingStatus === "success") {
      const paidAtRaw = (existingTx as { created_at?: string }).created_at;
      const finance = await ensureProviderSubscriptionFinance(supabase, {
        providerId,
        planId,
        orderId,
        reference,
        amountMajor,
        feesMajor: resolvedFeesMajor,
        kind,
        description,
        paymentProvider,
        paymentMetadata,
        subscriptionCode,
        invoiceCode,
        tenantIdHint,
        currencyHint,
        billingPeriod: billingPeriod === "yearly" ? "yearly" : "monthly",
        termEndsAt,
        paidAt: paidAtRaw ? new Date(paidAtRaw) : new Date(),
      });
      return {
        recorded: false,
        alreadyRecorded: true,
        netAmount,
        reference,
        financeTransactionId: finance.id,
        termEnd: finance.termEnd,
      };
    }
    if (existingStatus === "failed") {
      await supabase
        .from("payment_transactions")
        .delete()
        .eq("id", (existingTx as { id: string }).id);
    } else {
      return { recorded: false, alreadyRecorded: true, netAmount, reference, financeTransactionId: null, termEnd: null };
    }
  }

  const nowIso = new Date().toISOString();

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
    // already inserted this payment. Post the finance row only when it is missing.
    if ((ptError as { code?: string }).code === "23505") {
      const { data: racedTx } = await supabase
        .from("payment_transactions")
        .select("status, created_at")
        .eq("provider", paymentProvider)
        .eq("reference", reference)
        .maybeSingle();
      const racedStatus = String(
        (racedTx as { status?: string } | null)?.status ?? "",
      ).toLowerCase();
      if (racedStatus === "refunded" || racedStatus === "partially_refunded") {
        return {
          recorded: false,
          alreadyRecorded: true,
          chargeReturned: true,
          netAmount,
          reference,
          financeTransactionId: null,
          termEnd: null,
        };
      }
      const racedAt = (racedTx as { created_at?: string } | null)?.created_at;
      const finance = await ensureProviderSubscriptionFinance(supabase, {
        providerId,
        planId,
        orderId,
        reference,
        amountMajor,
        feesMajor: resolvedFeesMajor,
        kind,
        description,
        paymentProvider,
        paymentMetadata,
        subscriptionCode,
        invoiceCode,
        tenantIdHint,
        currencyHint,
        billingPeriod: billingPeriod === "yearly" ? "yearly" : "monthly",
        termEndsAt,
        paidAt: racedAt ? new Date(racedAt) : new Date(),
      });
      return {
        recorded: false,
        alreadyRecorded: true,
        netAmount,
        reference,
        financeTransactionId: finance.id,
        termEnd: finance.termEnd,
      };
    }
    console.error("[provider_subscription] payment_transactions insert failed:", ptError);
    return { recorded: false, alreadyRecorded: false, netAmount, reference, financeTransactionId: null, termEnd: null };
  }

  const finance = await ensureProviderSubscriptionFinance(supabase, {
    providerId,
    planId,
    orderId,
    reference,
    amountMajor,
    feesMajor: resolvedFeesMajor,
    kind,
    description,
    paymentProvider,
    paymentMetadata,
    subscriptionCode,
    invoiceCode,
    tenantIdHint,
    currencyHint,
    billingPeriod: billingPeriod === "yearly" ? "yearly" : "monthly",
    termEndsAt,
    paidAt: new Date(nowIso),
  });

  if (updateBillingPeriod) {
    await supabase
      .from("provider_subscriptions")
      .update({
        billing_period_start: finance.termStart,
        billing_period_end: finance.termEnd,
        last_payment_date: nowIso,
        updated_at: nowIso,
      })
      .eq("provider_id", providerId);
  }

  return {
    recorded: true,
    alreadyRecorded: false,
    netAmount,
    reference,
    financeTransactionId: finance.id,
    termEnd: finance.termEnd,
  };
}

/**
 * The provider (or an admin) has moved this account onto the free plan.
 * Stamp open payments so the repair job does not put the paid plan back.
 */
export async function markProviderSubscriptionPaymentsRelinquished(
  supabase: SupabaseClient,
  providerId: string,
  atIso: string = new Date().toISOString(),
): Promise<void> {
  const id = providerId.trim();
  if (!id) return;
  const { data, error } = await supabase
    .from("finance_transactions")
    .select("id, metadata")
    .eq("provider_id", id)
    .eq("transaction_type", "provider_subscription_payment");
  if (error) {
    console.error("[provider_subscription] could not load payments to relinquish:", error);
    return;
  }
  for (const row of (data ?? []) as Array<{ id?: string; metadata?: Record<string, unknown> | null }>) {
    if (!row.id) continue;
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    if (typeof meta.reversed_at === "string" && meta.reversed_at.trim()) continue;
    if (typeof meta.access_relinquished_at === "string" && meta.access_relinquished_at.trim()) continue;
    const { error: updateError } = await supabase
      .from("finance_transactions")
      .update({ metadata: { ...meta, access_relinquished_at: atIso } })
      .eq("id", row.id);
    if (updateError) {
      console.error("[provider_subscription] could not mark payment relinquished:", updateError);
    }
  }
}

/**
 * The Paystack charge was returned and the plan was left with its current owner.
 * Post the recognition offset. Do not change the subscription row.
 */
export async function rememberReturnedProviderSubscriptionCharge(params: {
  supabase: SupabaseClient;
  providerId: string;
  reference: string;
  financeTransactionId?: string | null;
  tenantId?: string | null;
  reason: string;
}): Promise<void> {
  const providerId = params.providerId.trim();
  const reference = params.reference.trim();
  if (!providerId || !reference) return;

  const { data: existingReversal } = await params.supabase
    .from("finance_transactions")
    .select("id")
    .eq("provider_id", providerId)
    .eq("transaction_type", "provider_subscription_refund")
    .contains("metadata", { reference })
    .maybeSingle();
  if (existingReversal) return;

  const columns = "id, amount, net, currency, metadata";
  let original: {
    id?: string;
    amount?: number | null;
    net?: number | null;
    currency?: string | null;
    metadata?: Record<string, unknown> | null;
  } | null = null;
  if (params.financeTransactionId) {
    const { data } = await params.supabase
      .from("finance_transactions")
      .select(columns)
      .eq("id", params.financeTransactionId)
      .maybeSingle();
    original = data as typeof original;
  }
  if (!original?.id) {
    const { data } = await params.supabase
      .from("finance_transactions")
      .select(columns)
      .eq("provider_id", providerId)
      .eq("transaction_type", "provider_subscription_payment")
      .contains("metadata", { reference })
      .maybeSingle();
    original = data as typeof original;
  }
  const originalId = typeof original?.id === "string" ? original.id : "";
  if (!originalId) return;

  const reversalAmount =
    toNumber(original?.net) !== 0 ? toNumber(original?.net) : toNumber(original?.amount);
  if (reversalAmount <= 0) return;

  const financeTenantId = await resolveTenantIdForFinanceLedger(params.supabase, {
    tenant_id: params.tenantId ?? null,
    provider_id: providerId,
  });
  const recognizedSoFar = await sumRecognizedForSubscriptionPayment(params.supabase, originalId);
  const split = splitSubscriptionRefundComponents(reversalAmount, recognizedSoFar);
  const nowIso = new Date().toISOString();
  const { error: refundInsertError } = await params.supabase.from("finance_transactions").insert({
    booking_id: null,
    provider_id: providerId,
    tenant_id: financeTenantId,
    transaction_type: "provider_subscription_refund",
    amount: -reversalAmount,
    fees: 0,
    commission: 0,
    net: -reversalAmount,
    currency: original?.currency ?? null,
    description: `Provider subscription payment reversed (${params.reason})`,
    metadata: {
      kind: "provider_subscription_refund",
      reference,
      source_payment_id: originalId,
      deferred_reversed: split.deferred_reversed,
      recognized_reversed: split.recognized_reversed,
      reason: params.reason,
    },
    created_at: nowIso,
  });
  if (refundInsertError) throw refundInsertError;

  const originalVat = toNumber(original?.metadata?.vat_amount as number | string | null | undefined);
  const originalVatRate = toNumber(
    original?.metadata?.vat_rate_percent as number | string | null | undefined,
  );
  if (originalVat > 0) {
    await postSubscriptionVatLeg(params.supabase, {
      providerId,
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

const OTHER_OWNER_RETURN_NOTE =
  "Another billing account owns this subscription. This Paystack charge was returned.";

/**
 * Return a Paystack saved-card charge when another account owns the plan.
 * A payment already on the ledger is offset. The subscription row is left as it is.
 */
export async function returnRecordedPaystackSubscriptionCharge(params: {
  supabase: SupabaseClient;
  reference: string;
  providerId: string;
  tenantId?: string | null;
  amountMajor?: number;
  financeTransactionId?: string | null;
}): Promise<void> {
  const reference = params.reference.trim();
  const providerId = params.providerId.trim();
  if (!reference || !providerId) return;

  const { data: existingPayment } = await params.supabase
    .from("payment_transactions")
    .select("status")
    .eq("provider", "paystack")
    .eq("reference", reference)
    .maybeSingle();
  const status = String(
    (existingPayment as { status?: string } | null)?.status ?? "",
  ).toLowerCase();
  if (status === "refunded" || status === "partially_refunded") return;

  try {
    await createRefund(
      { transaction: reference, merchant_note: OTHER_OWNER_RETURN_NOTE },
      { tenantId: params.tenantId },
    );
  } catch (error) {
    if (!paystackChargeAlreadyReturned(error)) throw error;
  }

  const refundedAt = new Date().toISOString();
  const refundPatch = {
    status: "refunded",
    refund_amount: params.amountMajor ?? null,
    refund_reason: OTHER_OWNER_RETURN_NOTE,
    refunded_at: refundedAt,
  };
  if (status === "success") {
    await rememberReturnedProviderSubscriptionCharge({
      supabase: params.supabase,
      providerId,
      reference,
      financeTransactionId: params.financeTransactionId,
      tenantId: params.tenantId,
      reason: "Another billing account owns this subscription",
    });
    const { error: markError } = await params.supabase
      .from("payment_transactions")
      .update(refundPatch)
      .eq("provider", "paystack")
      .eq("reference", reference)
      .eq("status", "success");
    if (markError) throw markError;
    return;
  }

  if (status) {
    const { error: markError } = await params.supabase
      .from("payment_transactions")
      .update(refundPatch)
      .eq("provider", "paystack")
      .eq("reference", reference)
      .neq("status", "refunded");
    if (markError) throw markError;
    return;
  }

  const amount = Number(params.amountMajor ?? 0);
  const { error } = await params.supabase.from("payment_transactions").insert({
    booking_id: null,
    reference,
    amount,
    fees: 0,
    net_amount: amount,
    status: "refunded",
    provider: "paystack",
    transaction_type: "provider_subscription_payment",
    refund_amount: amount,
    refund_reason: OTHER_OWNER_RETURN_NOTE,
    refunded_at: new Date().toISOString(),
    metadata: {
      kind: "paystack_charge_returned_other_merchant",
      provider_id: providerId,
    },
    created_at: new Date().toISOString(),
  });
  if (error && (error as { code?: string }).code !== "23505") {
    throw new Error(`could not remember returned Paystack charge ${reference}`);
  }
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

  // 4) Load the current subscription (for Paystack code + tenant).
  const { data: subRow } = await supabase
    .from("provider_subscriptions")
    .select("id, tenant_id, paystack_subscription_code")
    .eq("provider_id", resolvedProviderId)
    .maybeSingle();
  const subscription = subRow as
    | { id: string; tenant_id: string | null; paystack_subscription_code: string | null }
    | null;

  const revokeReversedAccess = async () => {
    if (!subscription) return;
    const freePlanId = await resolveCatalogPlanIdForProviderSubscription(supabase);
    const paystackStop = await stopPaystackSubscriptionBeforeClear({
      supabase,
      code: subscription.paystack_subscription_code ?? subscriptionCode,
      tenantId: subscription.tenant_id,
      providerId: resolvedProviderId,
    });
    const update: Record<string, unknown> = {
      status: "active",
      expires_at: null,
      cancelled_at: nowIso,
      auto_renew: false,
      past_due_since: null,
      paystack_authorization_code: null,
      billing_period_start: null,
      billing_period_end: null,
      next_payment_date: null,
      ...paystackCodeAfterStop(paystackStop),
      ...clearAppleMerchantOnFree(),
    };
    if (freePlanId) update.plan_id = freePlanId;
    await supabase.from("provider_subscriptions").update(update).eq("id", subscription.id);
  };

  if (existingReversal) {
    await revokeReversedAccess();
    if (orderRow && orderRow.status !== "refunded") {
      await supabase
        .from("provider_subscription_orders")
        .update({ status: "refunded", updated_at: nowIso })
        .eq("id", orderRow.id);
    }
    return { reversed: false, alreadyReversed: true, ledgerReversed: false, providerId: resolvedProviderId };
  }

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

  // 6) The paid term is closed. Stamp the original payment so a later repair
  // does not treat it as an open term, then drop access to the free plan.
  if (typeof original?.id === "string" && original.id) {
    const priorMeta = (original.metadata ?? {}) as Record<string, unknown>;
    await supabase
      .from("finance_transactions")
      .update({
        metadata: { ...priorMeta, reversed_at: nowIso, reversal_reason: reason },
      })
      .eq("id", original.id);
  }
  await revokeReversedAccess();

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
    void import("@/lib/provider-ops/ops-case")
      .then(({ markCaseChurned }) =>
        markCaseChurned(supabase, subscription.tenant_id, resolvedProviderId, "chargeback"),
      )
      .catch(() => undefined);
  }

  return { reversed: true, alreadyReversed: false, ledgerReversed, providerId: resolvedProviderId };
}

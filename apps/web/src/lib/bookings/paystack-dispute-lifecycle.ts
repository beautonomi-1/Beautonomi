import type { SupabaseClient } from "@supabase/supabase-js";
import { convertFromSmallestUnit } from "@/lib/payments/paystack";
import {
  isPlatformBillingPaymentKind,
  processBookingChargeback,
  shouldProcessPaystackDisputeChargeback,
} from "@/lib/bookings/process-booking-chargeback";

export type PaystackDisputePhase =
  | "open_hold"
  | "customer_won"
  | "merchant_won"
  | "awaiting_bank"
  | "remind_only"
  | "ignored";

/** Map Paystack `charge.dispute.*` to legacy `dispute.*` suffix. */
export function normalizePaystackDisputeEventType(eventType: string): string {
  if (eventType.startsWith("charge.dispute.")) {
    return `dispute.${eventType.slice("charge.dispute.".length)}`;
  }
  return eventType;
}

export function classifyPaystackDisputePhase(
  eventType: string,
  disputeData: Record<string, unknown> | null | undefined,
): PaystackDisputePhase {
  const normalized = normalizePaystackDisputeEventType(eventType);
  if (normalized === "dispute.create") return "open_hold";
  if (normalized === "dispute.remind") return "remind_only";
  if (normalized === "dispute.resolve") {
    const resolution = String(disputeData?.resolution ?? "").toLowerCase();
    const status = String(disputeData?.status ?? "").toLowerCase();
    if (resolution.includes("merchant") && resolution.includes("accepted")) {
      return "customer_won";
    }
    if (resolution === "declined" && status.includes("resolved")) {
      return "merchant_won";
    }
    if (resolution === "declined" && status.includes("awaiting")) {
      return "awaiting_bank";
    }
    return "awaiting_bank";
  }
  return "ignored";
}

/**
 * Paystack dispute payloads (`refund_amount`, `amount`, `transaction.amount`)
 * are ALWAYS in the currency's smallest unit (kobo / cents), per the Paystack
 * webhook docs. Convert unconditionally — never guess from magnitude.
 */
export function paystackDisputeAmountMajor(
  disputeData: Record<string, unknown>,
  disputeTx: Record<string, unknown> | null,
): number {
  const raw = (disputeData.refund_amount ??
    disputeData.amount ??
    disputeTx?.amount) as number | undefined;
  if (raw == null || !Number.isFinite(Number(raw))) return 0;
  const n = Number(raw);
  if (n <= 0) return 0;
  return convertFromSmallestUnit(
    n,
    String(disputeData.currency ?? disputeTx?.currency ?? "ZAR").toUpperCase(),
  );
}

const disputeAmountMajor = paystackDisputeAmountMajor;

/**
 * Resolve booking / provider / tenant for a disputed charge from the
 * `payment_transactions` → `bookings` chain. Shared by every gateway's
 * dispute handler so `payment_disputes.provider_id` is always populated
 * (the payout reserve is keyed on it).
 */
export async function resolveDisputeBookingSubjects(
  supabase: SupabaseClient,
  params: { reference: string; paymentProvider: "paystack" | "stripe" | "flutterwave" },
): Promise<{
  bookingId: string | null;
  providerId: string | null;
  tenantId: string | null;
  bookingNumber: string | null;
}> {
  const { data: txn } = await supabase
    .from("payment_transactions")
    .select("booking_id")
    .eq("reference", params.reference)
    .eq("provider", params.paymentProvider)
    .in("status", ["success", "partially_refunded", "refunded"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const bookingId = (txn as { booking_id?: string | null } | null)?.booking_id ?? null;
  if (!bookingId) return { bookingId: null, providerId: null, tenantId: null, bookingNumber: null };
  const { data: booking } = await supabase
    .from("bookings")
    .select("provider_id, tenant_id, booking_number")
    .eq("id", bookingId)
    .maybeSingle();
  const b = booking as
    | { provider_id?: string | null; tenant_id?: string | null; booking_number?: string | null }
    | null;
  return {
    bookingId,
    providerId: b?.provider_id ?? null,
    tenantId: b?.tenant_id ?? null,
    bookingNumber: b?.booking_number ?? null,
  };
}

/**
 * F2-28: tell the provider a dispute was opened against one of their bookings
 * (same push + in-app pattern as payout notifications). Never throws.
 */
async function notifyProviderDisputeOpened(
  supabase: SupabaseClient,
  params: {
    providerId: string;
    bookingId: string | null;
    disputeId: string;
    amountMajor: number;
    currency: string;
    paymentProvider: string;
  },
): Promise<void> {
  try {
    const { data: provider } = await supabase
      .from("providers")
      .select("user_id")
      .eq("id", params.providerId)
      .maybeSingle();
    const providerUserId = (provider as { user_id?: string | null } | null)?.user_id;
    if (!providerUserId) return;

    const amountLabel = `${params.currency.toUpperCase()} ${params.amountMajor.toFixed(2)}`;
    const title = "Payment dispute opened";
    const message = `A customer disputed a ${amountLabel} payment${
      params.bookingId ? " on one of your bookings" : ""
    }. The disputed amount is on hold until the dispute is resolved.`;
    const actionUrl = params.bookingId
      ? `/provider/bookings/${params.bookingId}`
      : "/provider/finance";
    const data = {
      type: "dispute_opened",
      dispute_id: params.disputeId,
      booking_id: params.bookingId,
      payment_provider: params.paymentProvider,
      amount: params.amountMajor,
      currency: params.currency.toUpperCase(),
    };

    const { sendToUser } = await import("@/lib/notifications/onesignal");
    await sendToUser(
      providerUserId,
      { title, message, type: "dispute_opened", data },
      ["push"],
      { appType: "provider" },
    );
    const { insertNotification } = await import("@/lib/notifications/insert-notification");
    await insertNotification({
      user_id: providerUserId,
      type: "dispute_opened",
      title,
      message,
      data,
      action_url: actionUrl,
    });
  } catch (err) {
    console.error("[payment-dispute] provider dispute notification failed:", err);
  }
}

export async function upsertOpenPaymentDispute(params: {
  supabase: SupabaseClient;
  paymentProvider: "paystack" | "stripe" | "flutterwave";
  disputeId: string;
  reference: string;
  amountMajor: number;
  currency: string;
  status: "open" | "awaiting_bank" | "merchant_won" | "customer_won";
  resolution?: string | null;
  rawPayload: Record<string, unknown>;
  bookingId?: string | null;
  providerId?: string | null;
  tenantId?: string | null;
}): Promise<void> {
  const now = new Date().toISOString();

  // F2-27: never persist a dispute without its booking subjects when they can
  // be resolved. Callers that already know them pass them through; otherwise
  // (Flutterwave, Stripe closed / funds_withdrawn) resolve from the charge,
  // and never clobber values already stored on the row with nulls.
  const { data: existing } = await params.supabase
    .from("payment_disputes")
    .select("id, booking_id, provider_id, tenant_id, status")
    .eq("payment_provider", params.paymentProvider)
    .eq("dispute_id", params.disputeId)
    .maybeSingle();
  const existingRow = existing as
    | { id?: string; booking_id?: string | null; provider_id?: string | null; tenant_id?: string | null }
    | null;

  let bookingId = params.bookingId ?? existingRow?.booking_id ?? null;
  let providerId = params.providerId ?? existingRow?.provider_id ?? null;
  let tenantId = params.tenantId ?? existingRow?.tenant_id ?? null;
  if (!providerId || !bookingId || !tenantId) {
    try {
      const resolved = await resolveDisputeBookingSubjects(params.supabase, {
        reference: params.reference,
        paymentProvider: params.paymentProvider,
      });
      bookingId = bookingId ?? resolved.bookingId;
      providerId = providerId ?? resolved.providerId;
      tenantId = tenantId ?? resolved.tenantId;
    } catch (resolveErr) {
      console.error("[payment-dispute] booking subject resolution failed:", resolveErr);
    }
  }

  const row = {
    payment_provider: params.paymentProvider,
    dispute_id: params.disputeId,
    payment_reference: params.reference,
    amount: Math.max(0, params.amountMajor),
    currency: params.currency.toUpperCase(),
    status: params.status,
    resolution: params.resolution ?? null,
    raw_payload: params.rawPayload,
    booking_id: bookingId,
    provider_id: providerId,
    tenant_id: tenantId,
    updated_at: now,
    ...(params.status === "merchant_won" || params.status === "customer_won"
      ? { resolved_at: now }
      : {}),
  };

  const { error } = await params.supabase.from("payment_disputes").upsert(row, {
    onConflict: "payment_provider,dispute_id",
  });
  if (error) {
    throw error;
  }

  // F2-28: notify the provider the first time a dispute is recorded as open.
  if (params.status === "open" && !existingRow && providerId) {
    await notifyProviderDisputeOpened(params.supabase, {
      providerId,
      bookingId,
      disputeId: params.disputeId,
      amountMajor: Math.max(0, params.amountMajor),
      currency: params.currency,
      paymentProvider: params.paymentProvider,
    });
  }
}

async function resolveBookingContext(
  supabase: SupabaseClient,
  reference: string,
): Promise<{
  bookingId: string | null;
  providerId: string | null;
  tenantId: string | null;
  kind: string | null;
  txnAmount: number;
}> {
  const { data: txn } = await supabase
    .from("payment_transactions")
    .select("booking_id, amount, metadata")
    .eq("reference", reference)
    .eq("provider", "paystack")
    .in("status", ["success", "partially_refunded"])
    .maybeSingle();
  const meta = ((txn as { metadata?: Record<string, unknown> } | null)?.metadata ??
    {}) as Record<string, unknown>;
  const bookingId = (txn as { booking_id?: string | null } | null)?.booking_id ?? null;
  let providerId: string | null = null;
  let tenantId: string | null = null;
  if (bookingId) {
    const { data: booking } = await supabase
      .from("bookings")
      .select("provider_id, tenant_id, currency")
      .eq("id", bookingId)
      .maybeSingle();
    providerId = (booking as { provider_id?: string } | null)?.provider_id ?? null;
    tenantId = (booking as { tenant_id?: string } | null)?.tenant_id ?? null;
  }
  return {
    bookingId,
    providerId,
    tenantId,
    kind: typeof meta.kind === "string" ? meta.kind : null,
    txnAmount: Number((txn as { amount?: number } | null)?.amount ?? 0),
  };
}

export async function handlePaystackDisputeLifecycle(params: {
  supabase: SupabaseClient;
  eventType: string;
  eventId?: string;
  disputeData: Record<string, unknown> | null | undefined;
}): Promise<void> {
  const disputeData = params.disputeData ?? {};
  const disputeTx =
    typeof disputeData.transaction === "object" && disputeData.transaction
      ? (disputeData.transaction as Record<string, unknown>)
      : null;
  const disputeRef = String(disputeTx?.reference ?? disputeData.reference ?? "").trim();
  if (!disputeRef) return;

  const phase = classifyPaystackDisputePhase(params.eventType, disputeData);
  const disputeId = String(
    disputeData.id ?? disputeData.dispute_id ?? `${disputeRef}:${normalizePaystackDisputeEventType(params.eventType)}`,
  );
  const amountMajor = disputeAmountMajor(disputeData, disputeTx);
  const currency = String(
    disputeData.currency ?? disputeTx?.currency ?? "ZAR",
  ).toUpperCase();

  const ctx = await resolveBookingContext(params.supabase, disputeRef);

  if (phase === "open_hold" || phase === "awaiting_bank") {
    await upsertOpenPaymentDispute({
      supabase: params.supabase,
      paymentProvider: "paystack",
      disputeId,
      reference: disputeRef,
      amountMajor: amountMajor > 0 ? amountMajor : ctx.txnAmount,
      currency,
      status: phase === "awaiting_bank" ? "awaiting_bank" : "open",
      resolution: String(disputeData.resolution ?? ""),
      rawPayload: disputeData,
      bookingId: ctx.bookingId,
      providerId: ctx.providerId,
      tenantId: ctx.tenantId,
    });
  }

  if (phase === "merchant_won") {
    await upsertOpenPaymentDispute({
      supabase: params.supabase,
      paymentProvider: "paystack",
      disputeId,
      reference: disputeRef,
      amountMajor: amountMajor > 0 ? amountMajor : ctx.txnAmount,
      currency,
      status: "merchant_won",
      resolution: String(disputeData.resolution ?? ""),
      rawPayload: disputeData,
      bookingId: ctx.bookingId,
      providerId: ctx.providerId,
      tenantId: ctx.tenantId,
    });
    return;
  }

  if (phase === "remind_only") {
    return;
  }

  // Platform billing reversals only on customer win (not on open).
  const { data: disputedTxn } = await params.supabase
    .from("payment_transactions")
    .select("amount, metadata")
    .eq("reference", disputeRef)
    .eq("status", "success")
    .maybeSingle();
  const disputedMeta = (disputedTxn?.metadata ?? {}) as Record<string, unknown>;

  if (phase === "customer_won") {
    if (disputedMeta?.kind === "marketing_credit_topup") {
      const { reverseMarketingCreditTopupPayment } = await import(
        "@/lib/marketing/marketing-credit-topup-payment"
      );
      await reverseMarketingCreditTopupPayment({
        supabase: params.supabase as never,
        providerId: String(disputedMeta.provider_id ?? ""),
        reference: disputeRef,
        amountMajor: Number((disputedTxn as { amount?: number } | null)?.amount ?? 0),
        reason: `chargeback:${params.eventType}`,
      });
    } else if (disputedMeta?.kind === "ads_budget_order" && disputedMeta?.ads_budget_order_id) {
      const { reverseAdsBudgetOrderPayment } = await import("@/lib/ads/ads-budget-order-payment");
      await reverseAdsBudgetOrderPayment({
        supabase: params.supabase as never,
        orderId: String(disputedMeta.ads_budget_order_id),
        finalOrderStatus: "refunded",
        reason: `chargeback:${params.eventType}`,
        reference: disputeRef,
      });
    } else if (
      disputedMeta?.kind === "provider_subscription_order" ||
      disputedMeta?.kind === "subscription_authorization" ||
      disputedMeta?.kind === "subscription_renewal"
    ) {
      const { reverseProviderSubscriptionPayment } = await import(
        "@/lib/subscriptions/provider-subscription-payment"
      );
      await reverseProviderSubscriptionPayment({
        supabase: params.supabase as never,
        reason: `chargeback:${params.eventType}`,
        reference: disputeRef,
        orderId: (disputedMeta.provider_subscription_order_id as string) ?? null,
        subscriptionCode: (disputedMeta.subscription_code as string) ?? null,
        providerIdHint: (disputedMeta.provider_id as string) ?? null,
      });
    } else if (!isPlatformBillingPaymentKind(disputedMeta?.kind) && ctx.bookingId) {
      if (shouldProcessPaystackDisputeChargeback(params.eventType, disputeData)) {
        await processBookingChargeback({
          supabase: params.supabase,
          paymentProvider: "paystack",
          reference: disputeRef,
          disputeId,
          eventType: params.eventType,
          amountMajor: amountMajor > 0 ? amountMajor : undefined,
        });
      }
    }

    await upsertOpenPaymentDispute({
      supabase: params.supabase,
      paymentProvider: "paystack",
      disputeId,
      reference: disputeRef,
      amountMajor: amountMajor > 0 ? amountMajor : ctx.txnAmount,
      currency,
      status: "customer_won",
      resolution: String(disputeData.resolution ?? ""),
      rawPayload: disputeData,
      bookingId: ctx.bookingId,
      providerId: ctx.providerId,
      tenantId: ctx.tenantId,
    });
  }

  if (phase === "awaiting_bank" && ctx.tenantId && ctx.bookingId) {
    const { slackNotifyDisputeOpened } = await import("@/lib/integrations/slack/ops-triggers");
    slackNotifyDisputeOpened({
      tenantId: ctx.tenantId,
      disputeId,
      bookingId: ctx.bookingId,
      reason: `Paystack dispute awaiting bank (${disputeRef})`,
    });
  }

  if (phase === "open_hold" || phase === "customer_won" || phase === "awaiting_bank") {
    try {
      const { openFraudCaseFromPaystackDispute } = await import(
        "@/lib/fraud/open-fraud-from-paystack-dispute"
      );
      await openFraudCaseFromPaystackDispute({
        eventType: params.eventType,
        eventId: params.eventId,
        reference: disputeRef,
        disputeData,
        supabase: params.supabase as never,
      });
    } catch (fraudCaseErr) {
      console.error("[paystack-dispute] fraud case open failed:", fraudCaseErr);
    }
  }
}

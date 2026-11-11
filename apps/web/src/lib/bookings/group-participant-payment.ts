import type { SupabaseClient } from "@supabase/supabase-js";
import { sumMoney, roundCurrency, subtractMoney } from "@beautonomi/utils";
import { recordBookingPaystackPayment } from "@/lib/bookings/record-booking-paystack-payment";
import { recordBookingStripePayment } from "@/lib/bookings/record-booking-stripe-payment";
import { recordBookingFlutterwavePayment } from "@/lib/bookings/record-booking-flutterwave-payment";
import { recordPaystackBookingSettlement } from "@/lib/bookings/record-paystack-booking-settlement";
import { recordStripeBookingSettlement } from "@/lib/bookings/record-stripe-booking-settlement";
import { recordFlutterwaveBookingSettlement } from "@/lib/bookings/record-flutterwave-booking-settlement";
import { convertFromSmallestUnit } from "@/lib/payments/paystack-complete";
import { convertToSmallestUnit } from "@/lib/payments/paystack";
import { GROUP_GUEST_PAYMENT_SOURCE } from "@/lib/bookings/group-guest-refunds";
import { computeBookingOutstandingDisplay } from "@/lib/bookings/display-invariants";
import { sumPendingWalletGiftBookingPayments } from "@/lib/bookings/ensure-wallet-gift-booking-payments";

const STALE_SOURCE_TYPE = "group_participant";

type GuestShareGateway = "paystack" | "stripe" | "flutterwave";

function normalizeGuestShareGateway(raw?: string | null): GuestShareGateway {
  const p = (raw ?? "paystack").toLowerCase();
  if (p === "stripe" || p === "flutterwave") return p;
  return "paystack";
}

/** Pure: how much of a guest charge can be applied, the rest is refunded. */
export function computeGroupShareApplication(input: {
  chargeMajor: number;
  shareDue: number;
  sharePaid: number;
  bookingOutstanding: number;
}): { applied: number; excess: number } {
  const charge = roundCurrency(Math.max(0, input.chargeMajor));
  const shareRemaining =
    input.shareDue > 0 ? Math.max(0, subtractMoney(input.shareDue, input.sharePaid)) : charge;
  const applied = roundCurrency(
    Math.max(0, Math.min(charge, shareRemaining, Math.max(0, input.bookingOutstanding))),
  );
  return { applied, excess: Math.max(0, subtractMoney(charge, applied)) };
}

async function recordGuestShareSettlement(
  admin: SupabaseClient,
  input: {
    gateway: GuestShareGateway;
    bookingId: string;
    reference: string;
    applied: number;
    feesMinor: number;
    tenantId: string | null;
    participantId: string;
    providerData: Record<string, unknown>;
    stripePaymentIntentId?: string | null;
    flutterwaveTransactionId?: string | null;
  },
): Promise<
  | { ok: true; paymentInserted: boolean; bookingPaymentId: string }
  | { ok: false; reason: string; error?: unknown }
> {
  const notes = `Group participant ${input.participantId}`;
  const descriptions = { payment: `Guest share for booking ${input.bookingId}` };
  let paymentInserted = false;
  let bookingPaymentId: string;

  if (input.gateway === "stripe") {
    const pi = input.stripePaymentIntentId?.trim() || input.reference;
    const recorded = await recordBookingStripePayment(admin, {
      bookingId: input.bookingId,
      tenantId: input.tenantId,
      paymentIntentId: pi,
      reference: input.reference,
      amountMajor: input.applied,
      source: GROUP_GUEST_PAYMENT_SOURCE,
      notes,
      providerData: input.providerData,
    });
    if (recorded.ok === false) return { ok: false, reason: recorded.reason, error: recorded.error };
    paymentInserted = recorded.inserted;
    bookingPaymentId = recorded.bookingPaymentId;
    const settlement = await recordStripeBookingSettlement(admin, {
      bookingId: input.bookingId,
      reference: input.reference,
      paymentIntentId: pi,
      amountMajor: input.applied,
      feesSmallestOrMajor: input.feesMinor,
      bookingPaymentId,
      isDeposit: false,
      descriptions,
    });
    if (settlement.ok === false) return { ok: false, reason: settlement.reason, error: settlement.error };
    return { ok: true, paymentInserted, bookingPaymentId };
  }

  if (input.gateway === "flutterwave") {
    const txId = input.flutterwaveTransactionId?.trim() || input.reference;
    const recorded = await recordBookingFlutterwavePayment(admin, {
      bookingId: input.bookingId,
      tenantId: input.tenantId,
      transactionId: txId,
      reference: input.reference,
      amountMajor: input.applied,
      source: GROUP_GUEST_PAYMENT_SOURCE,
      notes,
      providerData: input.providerData,
    });
    if (recorded.ok === false) return { ok: false, reason: recorded.reason, error: recorded.error };
    paymentInserted = recorded.inserted;
    bookingPaymentId = recorded.bookingPaymentId;
    const settlement = await recordFlutterwaveBookingSettlement(admin, {
      bookingId: input.bookingId,
      reference: input.reference,
      transactionId: txId,
      amountMajor: input.applied,
      feesSmallestOrMajor: input.feesMinor,
      bookingPaymentId,
      isDeposit: false,
    });
    if (settlement.ok === false) return { ok: false, reason: settlement.reason, error: settlement.error };
    return { ok: true, paymentInserted, bookingPaymentId };
  }

  const recorded = await recordBookingPaystackPayment(admin, {
    bookingId: input.bookingId,
    tenantId: input.tenantId,
    reference: input.reference,
    amountMajor: input.applied,
    source: GROUP_GUEST_PAYMENT_SOURCE,
    notes,
    providerData: input.providerData,
  });
  if (recorded.ok === false) return { ok: false, reason: recorded.reason, error: recorded.error };
  paymentInserted = recorded.inserted;
  bookingPaymentId = recorded.bookingPaymentId;
  const settlement = await recordPaystackBookingSettlement(admin, {
    bookingId: input.bookingId,
    reference: input.reference,
    amountMajor: input.applied,
    feesSmallestOrMajor: input.feesMinor,
    bookingPaymentId,
    isDeposit: false,
    descriptions,
  });
  if (settlement.ok === false) return { ok: false, reason: settlement.reason, error: settlement.error };
  return { ok: true, paymentInserted, bookingPaymentId };
}

export async function applyGroupParticipantPaystackSuccess(
  admin: SupabaseClient,
  input: {
    bookingParticipantId: string;
    bookingId: string;
    reference: string;
    amountMinor: number;
    currency: string;
    feesMinor?: number;
    customerId?: string | null;
    paymentProvider?: string | null;
    stripePaymentIntentId?: string | null;
    flutterwaveTransactionId?: string | null;
  },
): Promise<void> {
  const amountMajor = convertFromSmallestUnit(input.amountMinor, input.currency);

  const { data: participant, error: partErr } = await admin
    .from("booking_participants")
    .select("id, amount_due, amount_paid, participant_payment_status, group_booking_id, participant_name")
    .eq("id", input.bookingParticipantId)
    .maybeSingle();
  if (partErr || !participant) {
    throw partErr ?? new Error("Participant not found");
  }

  const { data: booking, error: bookingErr } = await admin
    .from("bookings")
    .select("id, status, payment_status, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, tenant_id, customer_id, provider_id, booking_number")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (bookingErr || !booking) {
    throw bookingErr ?? new Error(`Booking ${input.bookingId} not found for guest share`);
  }

  const b = booking as {
    status?: string | null;
    payment_status?: string | null;
    wallet_amount?: number | string | null;
    gift_card_amount?: number | string | null;
    total_amount?: number | string | null;
    total_paid?: number | string | null;
    total_refunded?: number | string | null;
    tenant_id?: string | null;
    customer_id?: string | null;
    provider_id?: string | null;
    booking_number?: string | null;
  };
  const p = participant as {
    amount_due?: number | string | null;
    amount_paid?: number | string | null;
    participant_payment_status?: string | null;
    participant_name?: string | null;
    group_booking_id?: string | null;
  };

  const stale = {
    participantId: input.bookingParticipantId,
    reference: input.reference,
    currency: input.currency,
    tenantId: b.tenant_id ?? null,
  };

  if (b.status === "cancelled" || p.participant_payment_status === "cancelled") {
    await refundStaleGroupGuestCharge(admin, {
      ...stale,
      amountMajor,
      reason: b.status === "cancelled" ? "booking_cancelled" : "guest_cancelled",
    });
    return;
  }

  const prevPaid = Number(p.amount_paid ?? 0);
  const due = Number(p.amount_due ?? 0);
  const pendingWalletGift = await sumPendingWalletGiftBookingPayments(admin, input.bookingId);
  const bookingOutstanding = computeBookingOutstandingDisplay({
    totalAmount: Number(b.total_amount ?? 0),
    totalPaid: Number(b.total_paid ?? 0),
    totalRefunded: Number(b.total_refunded ?? 0),
    walletAmount: Number(b.wallet_amount ?? 0),
    giftCardAmount: Number(b.gift_card_amount ?? 0),
    unpaidAdditionalCharges: 0,
    paymentStatus: b.payment_status ?? null,
    pendingWalletGiftAmount: pendingWalletGift,
  });
  const { applied, excess } = computeGroupShareApplication({
    chargeMajor: amountMajor,
    shareDue: due,
    sharePaid: prevPaid,
    bookingOutstanding,
  });

  if (applied <= 0) {
    await refundStaleGroupGuestCharge(admin, { ...stale, amountMajor, reason: "share_already_covered" });
    return;
  }

  const gateway = normalizeGuestShareGateway(input.paymentProvider);
  const providerData = {
    group_participant_id: input.bookingParticipantId,
    payer_customer_id: input.customerId ?? null,
    gateway,
  };
  const settlement = await recordGuestShareSettlement(admin, {
    gateway,
    bookingId: input.bookingId,
    reference: input.reference,
    applied,
    feesMinor: input.feesMinor ?? 0,
    tenantId: b.tenant_id ?? null,
    participantId: input.bookingParticipantId,
    providerData,
    stripePaymentIntentId: input.stripePaymentIntentId ?? null,
    flutterwaveTransactionId: input.flutterwaveTransactionId ?? null,
  });
  if (settlement.ok === false) {
    const err = new Error(
      `group participant settlement failed (${settlement.reason}) ref=${input.reference}`,
    );
    (err as Error & { cause?: unknown }).cause = settlement.error ?? null;
    throw err;
  }

  if (!settlement.paymentInserted) {
    if (excess > 0) {
      await refundStaleGroupGuestCharge(admin, { ...stale, amountMajor: excess, reason: "overpayment" });
    } else {
      await refundStaleGroupGuestCharge(admin, { ...stale, amountMajor: null, reason: "overpayment" });
    }
    const shareAlreadyApplied = due > 0 ? prevPaid + 0.01 >= due : prevPaid + 0.01 >= applied;
    if (shareAlreadyApplied) return;
  }

  if (!settlement.paymentInserted) {
    return;
  }

  const nextPaid = sumMoney(prevPaid, applied);
  const paidStatus = due > 0 && nextPaid + 0.01 >= due ? "paid" : "pending";
  await admin
    .from("booking_participants")
    .update({
      amount_paid: nextPaid,
      participant_payment_status: paidStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.bookingParticipantId);

  if (excess > 0) {
    await refundStaleGroupGuestCharge(admin, { ...stale, amountMajor: excess, reason: "overpayment" });
  }

  await notifyGroupSharePaid(admin, {
    bookingId: input.bookingId,
    bookingNumber: b.booking_number ?? null,
    leadCustomerId: b.customer_id ?? null,
    providerId: b.provider_id ?? null,
    payerCustomerId: input.customerId ?? null,
    guestName: p.participant_name ?? null,
    amountMajor: applied,
    currency: input.currency,
    groupBookingId: p.group_booking_id ?? null,
    tenantId: b.tenant_id ?? null,
  });
}

/**
 * Idempotently refund (part of) a guest charge that cannot be applied to the booking.
 * With `amountMajor: null` only an existing unfinished refund for the reference is retried.
 */
export async function refundStaleGroupGuestCharge(
  admin: SupabaseClient,
  input: {
    participantId: string;
    reference: string;
    amountMajor: number | null;
    currency: string;
    tenantId: string | null;
    reason: string;
  },
): Promise<{ refunded: boolean; skipped?: string }> {
  const { data: existing } = await admin
    .from("stale_payment_refunds")
    .select("id, refund_status, amount_minor")
    .eq("source_type", STALE_SOURCE_TYPE)
    .eq("source_id", input.participantId)
    .eq("payment_reference", input.reference)
    .maybeSingle();

  const row = existing as { refund_status?: string; amount_minor?: number | null } | null;
  if (row?.refund_status === "completed") return { refunded: false, skipped: "already_refunded" };

  let amountMinor: number | null = null;
  if (row) {
    amountMinor = typeof row.amount_minor === "number" ? row.amount_minor : null;
  } else {
    if (input.amountMajor == null || input.amountMajor <= 0) {
      return { refunded: false, skipped: "nothing_to_refund" };
    }
    amountMinor = convertToSmallestUnit(input.amountMajor, input.currency);
    const { error: insertErr } = await admin.from("stale_payment_refunds").insert({
      source_type: STALE_SOURCE_TYPE,
      source_id: input.participantId,
      payment_reference: input.reference,
      amount_minor: amountMinor,
      currency: input.currency,
      reason: input.reason,
      refund_status: "pending",
      tenant_id: input.tenantId,
    });
    if (insertErr) {
      console.error("[group participant payment] stale refund insert failed:", insertErr);
      return { refunded: false, skipped: "insert_failed" };
    }
  }
  if (!amountMinor || amountMinor <= 0) return { refunded: false, skipped: "missing_amount" };

  const scope = (q: any) =>
    q
      .eq("source_type", STALE_SOURCE_TYPE)
      .eq("source_id", input.participantId)
      .eq("payment_reference", input.reference);

  try {
    const { refundGatewayCharge } = await import("@/lib/payments/refund-gateway-charge");
    const result = await refundGatewayCharge({
      reference: input.reference,
      amountMajor: convertFromSmallestUnit(amountMinor, input.currency),
      currency: input.currency,
      tenantId: input.tenantId,
      reason: `Group guest charge not applied (${input.reason})`,
      idempotencyKey: `group-guest-stale:${input.participantId}:${input.reference}`,
    });
    await scope(
      admin.from("stale_payment_refunds").update({
        refund_status: "completed",
        paystack_refund_reference: result.refundId ?? input.reference,
        updated_at: new Date().toISOString(),
      }),
    );
    return { refunded: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await scope(
      admin.from("stale_payment_refunds").update({
        refund_status: "failed",
        failure_reason: msg.slice(0, 500),
        updated_at: new Date().toISOString(),
      }),
    );
    console.error("[group participant payment] stale refund failed:", err);
    return { refunded: false, skipped: "refund_failed" };
  }
}

async function notifyGroupSharePaid(
  admin: SupabaseClient,
  input: {
    bookingId: string;
    bookingNumber: string | null;
    leadCustomerId: string | null;
    providerId: string | null;
    payerCustomerId: string | null;
    guestName: string | null;
    amountMajor: number;
    currency: string;
    groupBookingId: string | null;
    tenantId: string | null;
  },
): Promise<void> {
  try {
    const { insertNotification } = await import("@/lib/notifications/insert-notification");
    const {
      dispatchTemplateNotification,
      withTenantVariable,
    } = await import("@/lib/notifications/dispatch-template-notification");
    const who = input.guestName?.trim() || "A guest";
    const ref = input.bookingNumber || input.bookingId;
    const amount = String(input.amountMajor);
    const data = { booking_id: input.bookingId, group_booking: true, subtype: "group_share_paid" };

    let providerName = "";
    let providerUserId: string | null = null;
    if (input.providerId) {
      const { data: provider } = await admin
        .from("providers")
        .select("user_id, business_name")
        .eq("id", input.providerId)
        .maybeSingle();
      providerUserId = (provider as { user_id?: string | null } | null)?.user_id ?? null;
      providerName = (provider as { business_name?: string | null } | null)?.business_name?.trim() || "";
    }

    const templateVars = withTenantVariable(input.tenantId, {
      guest_name: who,
      amount,
      currency: input.currency,
      provider_name: providerName || "Beautonomi Partner",
      booking_id: input.bookingId,
      group_booking_id: input.groupBookingId ?? "",
    });

    if (input.leadCustomerId && input.leadCustomerId !== input.payerCustomerId) {
      await insertNotification({
        user_id: input.leadCustomerId,
        type: "group_share_paid",
        title: "Guest share paid",
        message: `${who} paid their share for group booking ${ref}.`,
        data,
        action_url: `/booking-detail?id=${input.bookingId}`,
      });
      await dispatchTemplateNotification(
        "group_share_paid",
        [input.leadCustomerId],
        templateVars,
        ["push", "email"],
        { appType: "customer", tenantId: input.tenantId ?? undefined },
      );
    }
    if (providerUserId) {
      await insertNotification({
        user_id: providerUserId,
        type: "group_share_paid",
        title: "Guest share paid",
        message: `${who} paid their share for group booking ${ref}.`,
        data,
        action_url: `/provider/bookings/${input.bookingId}`,
      });
      await dispatchTemplateNotification(
        "group_share_paid",
        [providerUserId],
        templateVars,
        ["push", "email"],
        { appType: "provider", tenantId: input.tenantId ?? undefined },
      );
    }
  } catch (err) {
    console.warn("[group participant payment] share-paid notification failed:", err);
  }
}

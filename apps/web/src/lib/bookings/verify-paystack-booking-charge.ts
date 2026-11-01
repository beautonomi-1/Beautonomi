import type { SupabaseClient } from "@supabase/supabase-js";
import { convertFromSmallestUnit } from "@/lib/payments/paystack";
import { recordReconciliationException } from "@/lib/finance/record-reconciliation-exception";
import { storedPlatformFeeAmount } from "@/lib/bookings/provider-booking-platform-fee";

type PendingPaymentRow = {
  amount: number;
  currency: string;
  metadata?: Record<string, unknown> | null;
  payment_provider_transaction_id?: string | null;
};

export type VerifyBookingChargeResult =
  | { ok: true; amountMajor: number; currency: string; pendingPayment: PendingPaymentRow }
  | { ok: false; reason: string };

/** @deprecated alias */
export type VerifyPaystackBookingChargeResult = VerifyBookingChargeResult;

/**
 * Ensures an online card charge matches a server-issued pending payment for the booking.
 */
export async function verifyBookingCharge(params: {
  supabase: SupabaseClient;
  bookingId: string;
  reference: string;
  amountSmallest: number;
  chargeCurrency?: string | null;
  tenantId: string;
  bookingPaymentReference?: string | null;
  bookingCurrency?: string | null;
  psp?: string;
}): Promise<VerifyBookingChargeResult> {
  const psp = params.psp ?? "paystack";
  const currency = (params.chargeCurrency || params.bookingCurrency || "ZAR").toUpperCase();
  const amountMajor = convertFromSmallestUnit(params.amountSmallest || 0, currency);

  const { data: pendingRows } = await params.supabase
    .from("payments")
    .select("amount, currency, metadata, payment_provider_transaction_id, status")
    .eq("booking_id", params.bookingId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(20);

  const ref = params.reference.trim();
  const pendingList = (pendingRows ?? []) as PendingPaymentRow[];

  let pending = pendingList.find(
    (r) => String(r.payment_provider_transaction_id ?? "").trim() === ref,
  );

  if (!pending && params.bookingPaymentReference && params.bookingPaymentReference.trim() === ref) {
    if (pendingList.length === 1) {
      pending = pendingList[0];
    } else if (pendingList.length > 1) {
      const matches = pendingList.filter((r) => {
        const rowCurrency = String(r.currency || params.bookingCurrency || "ZAR").toUpperCase();
        return (
          rowCurrency === currency &&
          Math.abs(Number(r.amount ?? 0) - amountMajor) <= 0.01
        );
      });
      if (matches.length === 1) {
        pending = matches[0];
      }
    }
  }

  if (!pending) {
    await recordReconciliationException({
      supabase: params.supabase,
      tenantId: params.tenantId,
      currency,
      psp,
      mismatchReason: `${psp}_webhook:no_pending_payment_for_reference`,
      externalId: ref,
      internalId: params.bookingId,
      amount: amountMajor,
    });
    return { ok: false, reason: "no_pending_payment" };
  }

  const expected = Number(pending.amount ?? 0);
  const expectedCurrency = String(pending.currency || params.bookingCurrency || "ZAR").toUpperCase();

  if (Math.abs(amountMajor - expected) > 0.01) {
    await recordReconciliationException({
      supabase: params.supabase,
      tenantId: params.tenantId,
      currency,
      psp,
      mismatchReason: `${psp}_webhook:amount_mismatch`,
      externalId: ref,
      internalId: params.bookingId,
      amount: amountMajor,
      metadata: { expected, paid: amountMajor },
    });
    return { ok: false, reason: "amount_mismatch" };
  }

  if (currency !== expectedCurrency) {
    await recordReconciliationException({
      supabase: params.supabase,
      tenantId: params.tenantId,
      currency,
      psp,
      mismatchReason: `${psp}_webhook:currency_mismatch`,
      externalId: ref,
      internalId: params.bookingId,
      amount: amountMajor,
      metadata: { expectedCurrency, paidCurrency: currency },
    });
    return { ok: false, reason: "currency_mismatch" };
  }

  return { ok: true, amountMajor, currency, pendingPayment: pending };
}

export async function verifyPaystackBookingCharge(params: {
  supabase: SupabaseClient;
  bookingId: string;
  reference: string;
  paystackAmountSmallest: number;
  paystackCurrency?: string | null;
  tenantId: string;
  bookingPaymentReference?: string | null;
  bookingCurrency?: string | null;
}): Promise<VerifyBookingChargeResult> {
  return verifyBookingCharge({
    ...params,
    amountSmallest: params.paystackAmountSmallest,
    chargeCurrency: params.paystackCurrency,
    psp: "paystack",
  });
}

export function bookingFinancialsFromDb(booking: Record<string, unknown>, pending?: PendingPaymentRow) {
  const meta = (pending?.metadata ?? {}) as Record<string, unknown>;
  return {
    tipAmount: Number(booking.tip_amount ?? 0),
    taxAmount: Number(booking.tax_amount ?? 0),
    travelFee: Number(booking.travel_fee ?? 0),
    serviceFeeAmount: storedPlatformFeeAmount({
      platform_fee_amount: booking.platform_fee_amount as number | null | undefined,
      service_fee_amount:
        (booking.service_fee_amount as number | null | undefined) ??
        (booking.platform_service_fee as number | null | undefined),
    }),
    walletAmountFromMeta: Number(meta.wallet_amount_applied ?? booking.wallet_amount ?? 0),
    giftCardAmountFromMeta: Number(meta.gift_card_amount_applied ?? booking.gift_card_amount ?? 0),
  };
}

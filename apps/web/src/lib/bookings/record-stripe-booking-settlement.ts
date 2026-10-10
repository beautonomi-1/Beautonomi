/**
 * In-process Stripe booking settlement (parity with recordPaystackBookingSettlement).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordBookingStripePayment } from "./record-booking-stripe-payment";
import {
  recordBookingOnlineChargeLedger,
  type CommissionMode,
} from "./record-booking-online-charge-ledger";
import { resolveStripeGatewayFees } from "@/lib/payments/resolve-gateway-fees";

export type RecordStripeBookingSettlementInput = {
  bookingId: string;
  reference: string;
  paymentIntentId?: string | null;
  amountMajor: number;
  /** Stripe fee in minor units (cents) unless feesAlreadyMajor. */
  feesSmallestOrMajor?: number;
  feesAlreadyMajor?: boolean;
  feeSource?: string;
  bookingPaymentId?: string | null;
  isDeposit?: boolean;
  walletAmountApplied?: number;
  giftCardAmountApplied?: number;
  customerEmail?: string | null;
  commissionMode?: CommissionMode;
  metadata?: Record<string, unknown>;
  recordPayment?: {
    tenantId?: string | null;
    source: string;
    notes?: string | null;
    currency?: string | null;
  };
  auditLegStyle?: "shared" | "paystack_pay_remaining";
  descriptions?: { payment?: string; providerEarnings?: string };
};

export type RecordStripeBookingSettlementResult =
  | {
      ok: true;
      bookingPaymentId: string;
      ledger: { skipped: boolean; isSecondCharge: boolean };
      feesMajor: number;
      feeSource: string;
    }
  | {
      ok: false;
      stage: "booking_payment" | "ledger";
      reason: string;
      error?: unknown;
    };

export async function recordStripeBookingSettlement(
  supabase: SupabaseClient,
  input: RecordStripeBookingSettlementInput,
): Promise<RecordStripeBookingSettlementResult> {
  try {
    let bookingPaymentId = input.bookingPaymentId?.trim() || null;

    if (!bookingPaymentId && input.recordPayment) {
      const recorded = await recordBookingStripePayment(supabase, {
        bookingId: input.bookingId,
        tenantId: input.recordPayment.tenantId ?? null,
        paymentIntentId: input.paymentIntentId ?? input.reference,
        reference: input.reference,
        amountMajor: input.amountMajor,
        source: input.recordPayment.source,
        notes: input.recordPayment.notes ?? null,
        currency: input.recordPayment.currency ?? null,
      });
      if (recorded.ok === false) {
        return {
          ok: false,
          stage: "booking_payment",
          reason: recorded.reason,
          error: "error" in recorded ? recorded.error : undefined,
        };
      }
      bookingPaymentId = recorded.bookingPaymentId;
    }

    if (!bookingPaymentId) {
      const pi = input.paymentIntentId ?? input.reference;
      const { data: existingBp } = await supabase
        .from("booking_payments")
        .select("id")
        .eq("booking_id", input.bookingId)
        .eq("payment_provider", "stripe")
        .eq("payment_provider_id", pi)
        .maybeSingle();
      bookingPaymentId = existingBp?.id ? String(existingBp.id) : null;
    }

    if (!bookingPaymentId) {
      return { ok: false, stage: "booking_payment", reason: "missing_booking_payment_id" };
    }

    const feeMinor = input.feesAlreadyMajor
      ? Math.round(Number(input.feesSmallestOrMajor ?? 0) * 100)
      : Number(input.feesSmallestOrMajor ?? 0);
    const resolved = resolveStripeGatewayFees({ feeMinor, currency: "ZAR" });
    const feesMajor = input.feesAlreadyMajor
      ? Math.round(Number(input.feesSmallestOrMajor ?? 0) * 100) / 100
      : resolved.feesMajor;
    const feeSource = input.feeSource ?? resolved.feeSource;

    const ledgerResult = await recordBookingOnlineChargeLedger(supabase, {
      bookingId: input.bookingId,
      reference: input.reference,
      provider: "stripe",
      amountMajor: input.amountMajor,
      feesMajor,
      walletAmountApplied: input.walletAmountApplied,
      giftCardAmountApplied: input.giftCardAmountApplied,
      customerEmail: input.customerEmail ?? null,
      feeSource,
      metadata: input.metadata,
      isDeposit: input.isDeposit,
      sourcePaymentId: bookingPaymentId,
      commissionMode: input.commissionMode ?? "platform_settings",
      auditLegStyle: input.auditLegStyle,
      descriptions: input.descriptions,
    });

    if (ledgerResult.ok === false) {
      return {
        ok: false,
        stage: "ledger",
        reason: ledgerResult.reason,
        error: "error" in ledgerResult ? ledgerResult.error : undefined,
      };
    }

    return {
      ok: true,
      bookingPaymentId,
      ledger: {
        skipped: ledgerResult.skipped,
        isSecondCharge: ledgerResult.isSecondCharge,
      },
      feesMajor,
      feeSource,
    };
  } catch (error) {
    console.error("[recordStripeBookingSettlement] unexpected error:", error);
    return { ok: false, stage: "ledger", reason: "unexpected_error", error };
  }
}

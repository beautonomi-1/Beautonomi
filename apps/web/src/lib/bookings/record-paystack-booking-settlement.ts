/**
 * Single entry point for in-process Paystack booking settlement:
 * booking_payments (if needed) -> fee resolution -> finance_transactions ledger.
 * Never throws — money is already captured; callers log the result.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordBookingPaystackPayment } from "./record-booking-paystack-payment";
import {
  recordBookingOnlineChargeLedger,
  type CommissionMode,
} from "./record-booking-online-charge-ledger";
import { resolvePaystackFeeMajor } from "@/lib/payments/resolve-paystack-fee";

export type RecordPaystackBookingSettlementInput = {
  bookingId: string;
  reference: string;
  amountMajor: number;
  /** Paystack fees in smallest unit (cents) unless feesAlreadyMajor. */
  feesSmallestOrMajor?: number;
  feesAlreadyMajor?: boolean;
  feeSource?: string;
  /** When BP was already inserted, pass its id for ledger attribution. */
  bookingPaymentId?: string | null;
  isDeposit?: boolean;
  walletAmountApplied?: number;
  giftCardAmountApplied?: number;
  customerEmail?: string | null;
  commissionMode?: CommissionMode;
  metadata?: Record<string, unknown>;
  /** When bookingPaymentId is absent, insert booking_payments with these fields. */
  recordPayment?: {
    tenantId?: string | null;
    transactionId?: string | number | null;
    source: string;
    paymentOption?: string | null;
    requiresDeposit?: boolean | null;
    saveCard?: boolean | null;
    paymentMethodId?: string | null;
    notes?: string | null;
  };
  auditLegStyle?: "shared" | "paystack_pay_remaining";
  descriptions?: { payment?: string; providerEarnings?: string };
};

export type RecordPaystackBookingSettlementResult =
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

export async function recordPaystackBookingSettlement(
  supabase: SupabaseClient,
  input: RecordPaystackBookingSettlementInput,
): Promise<RecordPaystackBookingSettlementResult> {
  try {
    let bookingPaymentId = input.bookingPaymentId?.trim() || null;

    if (!bookingPaymentId && input.recordPayment) {
      const recorded = await recordBookingPaystackPayment(supabase, {
        bookingId: input.bookingId,
        tenantId: input.recordPayment.tenantId ?? null,
        reference: input.reference,
        transactionId: input.recordPayment.transactionId ?? null,
        amountMajor: input.amountMajor,
        source: input.recordPayment.source,
        paymentOption: input.recordPayment.paymentOption ?? null,
        requiresDeposit: input.recordPayment.requiresDeposit ?? null,
        saveCard: input.recordPayment.saveCard ?? null,
        paymentMethodId: input.recordPayment.paymentMethodId ?? null,
        notes: input.recordPayment.notes ?? null,
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
      const { data: existingBp } = await supabase
        .from("booking_payments")
        .select("id")
        .eq("booking_id", input.bookingId)
        .eq("payment_provider", "paystack")
        .eq("payment_provider_id", input.reference)
        .maybeSingle();
      bookingPaymentId = existingBp?.id ? String(existingBp.id) : null;
    }

    if (!bookingPaymentId) {
      return {
        ok: false,
        stage: "booking_payment",
        reason: "missing_booking_payment_id",
      };
    }

    const { feesMajor, feeSource: resolvedFeeSource } = await resolvePaystackFeeMajor(supabase, {
      feesSmallestOrMajor: input.feesSmallestOrMajor ?? 0,
      amountMajor: input.amountMajor,
      alreadyMajor: input.feesAlreadyMajor ?? false,
      gateway: "paystack",
    });

    const feeSource =
      input.feeSource ??
      (resolvedFeeSource === "estimated" ? "estimated" : "paystack");

    const ledgerResult = await recordBookingOnlineChargeLedger(supabase, {
      bookingId: input.bookingId,
      reference: input.reference,
      provider: "paystack",
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
    console.error("[recordPaystackBookingSettlement] unexpected error:", error);
    return {
      ok: false,
      stage: "ledger",
      reason: "unexpected_error",
      error,
    };
  }
}

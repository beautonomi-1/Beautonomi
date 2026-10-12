import type { SupabaseClient } from "@supabase/supabase-js";
import { recordBookingFlutterwavePayment } from "./record-booking-flutterwave-payment";
import {
  recordBookingOnlineChargeLedger,
  type CommissionMode,
} from "./record-booking-online-charge-ledger";
import { resolveFlutterwaveGatewayFees } from "@/lib/payments/resolve-gateway-fees";
import { toMinorUnits } from "@beautonomi/utils";

export type RecordFlutterwaveBookingSettlementInput = {
  bookingId: string;
  reference: string;
  transactionId?: string | null;
  amountMajor: number;
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
    currency?: string | null;
    paymentOption?: string | null;
    requiresDeposit?: boolean | null;
    notes?: string | null;
  };
};

export type RecordFlutterwaveBookingSettlementResult =
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

export async function recordFlutterwaveBookingSettlement(
  supabase: SupabaseClient,
  input: RecordFlutterwaveBookingSettlementInput,
): Promise<RecordFlutterwaveBookingSettlementResult> {
  try {
    let bookingPaymentId = input.bookingPaymentId?.trim() || null;
    const currency = input.recordPayment?.currency?.toUpperCase() ?? "ZAR";

    if (!bookingPaymentId && input.recordPayment) {
      const recorded = await recordBookingFlutterwavePayment(supabase, {
        bookingId: input.bookingId,
        tenantId: input.recordPayment.tenantId ?? null,
        transactionId: input.transactionId ?? input.reference,
        reference: input.reference,
        amountMajor: input.amountMajor,
        currency: input.recordPayment.currency ?? null,
        source: input.recordPayment.source,
        paymentOption: input.recordPayment.paymentOption ?? null,
        requiresDeposit: input.recordPayment.requiresDeposit ?? undefined,
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
      const txId = (input.transactionId ?? input.reference).trim();
      const { data: existingBp } = await supabase
        .from("booking_payments")
        .select("id")
        .eq("booking_id", input.bookingId)
        .eq("payment_provider", "flutterwave")
        .eq("payment_provider_id", txId)
        .maybeSingle();
      bookingPaymentId = existingBp?.id ? String(existingBp.id) : null;
    }

    if (!bookingPaymentId) {
      return { ok: false, stage: "booking_payment", reason: "missing_booking_payment_id" };
    }

    const feeMinor = input.feesAlreadyMajor
      ? toMinorUnits(Number(input.feesSmallestOrMajor ?? 0), currency)
      : Number(input.feesSmallestOrMajor ?? 0);
    const resolved = resolveFlutterwaveGatewayFees({ feeMinor, currency });
    const feesMajor = input.feesAlreadyMajor
      ? Math.round(Number(input.feesSmallestOrMajor ?? 0) * 100) / 100
      : resolved.feesMajor;
    const feeSource = input.feeSource ?? resolved.feeSource;

    const ledgerResult = await recordBookingOnlineChargeLedger(supabase, {
      bookingId: input.bookingId,
      reference: input.reference,
      provider: "flutterwave",
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
    console.error("[recordFlutterwaveBookingSettlement] unexpected error:", error);
    return { ok: false, stage: "ledger", reason: "unexpected_error", error };
  }
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recordBookingFlutterwavePayment } from "@/lib/bookings/record-booking-flutterwave-payment";
import { recordBookingOnlineChargeLedger } from "@/lib/bookings/record-booking-online-charge-ledger";
import { syncBookingAfterPaystackSuccess } from "@/lib/bookings/sync-booking-after-paystack-success";
import { ensureWalletGiftBookingPayments } from "@/lib/bookings/ensure-wallet-gift-booking-payments";

type FlutterwaveChargeData = {
  id?: string | number;
  tx_ref?: string;
  flw_ref?: string;
  amount?: number;
  currency?: string;
  status?: string;
  meta?: Record<string, unknown> & {
    booking_id?: string;
    reference?: string;
    wallet_amount_applied?: string | number;
    gift_card_amount_applied?: string | number;
    payment_option?: string;
    requires_deposit?: string | boolean;
  };
};

function parseMetaNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function resolveBookingTenantId(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("bookings")
    .select("tenant_id")
    .eq("id", bookingId)
    .maybeSingle();
  return (data as { tenant_id?: string | null } | null)?.tenant_id ?? null;
}

/**
 * Handle Flutterwave `charge.completed` for booking payments.
 */
export async function handleFlutterwaveChargeCompleted(data: FlutterwaveChargeData): Promise<void> {
  const status = String(data.status ?? "").toLowerCase();
  if (status && status !== "successful" && status !== "success") {
    return;
  }

  const meta = data.meta ?? {};
  const bookingId = typeof meta.booking_id === "string" ? meta.booking_id.trim() : "";
  if (!bookingId) {
    return;
  }

  const supabase: SupabaseClient = getSupabaseAdmin();
  const currency = (data.currency || "ZAR").toUpperCase();
  const amountMajor = Math.round(Number(data.amount || 0) * 100) / 100;
  if (amountMajor <= 0) {
    return;
  }

  const tenantId = await resolveBookingTenantId(supabase, bookingId);
  const transactionId =
    data.id != null ? String(data.id) : data.flw_ref != null ? String(data.flw_ref) : null;
  const reference =
    typeof meta.reference === "string" && meta.reference.trim()
      ? meta.reference.trim()
      : typeof data.tx_ref === "string"
        ? data.tx_ref
        : transactionId;

  const walletAmount = parseMetaNumber(meta.wallet_amount_applied);
  const giftCardAmount = parseMetaNumber(meta.gift_card_amount_applied);
  const paymentOption = String(meta.payment_option || "full");
  const requiresDeposit =
    meta.requires_deposit === true || meta.requires_deposit === "true";
  const isDeposit = requiresDeposit && paymentOption === "deposit";

  const recorded = await recordBookingFlutterwavePayment(supabase, {
    bookingId,
    tenantId,
    transactionId,
    reference,
    amountMajor,
    currency,
    source: "flutterwave_webhook",
    paymentOption,
    requiresDeposit,
  });

  if (!recorded.ok) {
    const reason = "reason" in recorded ? recorded.reason : "unknown";
    throw new Error(`Failed to record Flutterwave booking payment for ${bookingId}: ${reason}`);
  }

  const ledgerReference = reference ?? transactionId ?? "";

  const ledger = await recordBookingOnlineChargeLedger(supabase, {
    bookingId,
    reference: ledgerReference,
    provider: "flutterwave",
    amountMajor,
    feesMajor: 0,
    walletAmountApplied: walletAmount,
    giftCardAmountApplied: giftCardAmount,
    isDeposit,
    sourcePaymentId: recorded.bookingPaymentId,
    metadata: {
      flutterwave_transaction_id: transactionId,
      source: "flutterwave_webhook",
    },
  });
  if (ledger.ok === false) {
    throw new Error(`Failed to record Flutterwave finance ledger for ${bookingId}: ${ledger.reason}`);
  }

  if (walletAmount > 0 || giftCardAmount > 0) {
    await ensureWalletGiftBookingPayments(supabase, {
      bookingId,
      tenantId,
      walletAmount,
      giftCardAmount,
      initialStatus: "completed",
    });
  }

  await syncBookingAfterPaystackSuccess(supabase, bookingId, {
    paymentReference: reference ?? undefined,
    paymentProvider: "flutterwave",
  });
}

/**
 * Refund Processing Logic
 * Handles refunds for cancelled bookings based on cancellation policy.
 * Refunds always credit the customer's wallet (platform policy).
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTenantRegionConfig } from "@/lib/regions/config";
import type { CancellationPolicy } from "./cancellation-policy";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";

export interface RefundResult {
  success: boolean;
  refundId?: string;
  amount?: number;
  error?: string;
}

export function roundCurrency2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Wallet refund amount for a booking total, before persistence.
 * Early window / grace: full booking total.
 * Late window: refund_percentage (or late_cancellation_type), with fee_amount/fee_type fallback when refund would otherwise be 0.
 */
export function computeCancellationRefundAmount(
  bookingTotal: number,
  policy: CancellationPolicy,
  isLateCancellation: boolean
): number {
  const total = Math.max(0, Number(bookingTotal) || 0);
  if (total <= 0) return 0;

  if (!isLateCancellation) {
    return roundCurrency2(total);
  }

  let pct: number | null =
    policy.refund_percentage !== undefined && policy.refund_percentage !== null
      ? Number(policy.refund_percentage)
      : null;

  if (pct === null || Number.isNaN(pct)) {
    switch (policy.late_cancellation_type) {
      case "full_refund":
        pct = 100;
        break;
      case "partial_refund":
        pct = 50;
        break;
      default:
        pct = 0;
    }
  }

  pct = Math.min(100, Math.max(0, pct));
  let refund = total * (pct / 100);

  const feeRaw = Number(policy.fee_amount ?? 0);
  if (refund <= 0 && feeRaw > 0) {
    const feeType = policy.fee_type === "percentage" ? "percentage" : "fixed";
    if (feeType === "percentage") {
      refund = total * (1 - Math.min(100, Math.max(0, feeRaw)) / 100);
    } else {
      refund = Math.max(0, total - feeRaw);
    }
  }

  refund = Math.min(total, Math.max(0, refund));
  return roundCurrency2(refund);
}

export function describeCancellationRefund(
  policy: CancellationPolicy,
  isLateCancellation: boolean,
  refundAmount: number,
  bookingTotal: number,
  currency: string
): string {
  if (refundAmount <= 0) {
    return "No refund will be credited for this cancellation per the provider's policy.";
  }
  if (!isLateCancellation) {
    return `A full refund of ${currency} ${refundAmount.toFixed(2)} will be credited to your wallet.`;
  }
  if (
    policy.refund_percentage !== undefined &&
    policy.refund_percentage !== null &&
    !Number.isNaN(Number(policy.refund_percentage))
  ) {
    return `Approximately ${policy.refund_percentage}% (${currency} ${refundAmount.toFixed(2)}) will be credited to your wallet for this late cancellation.`;
  }
  if (policy.late_cancellation_type === "full_refund") {
    return `A full refund of ${currency} ${refundAmount.toFixed(2)} will be credited to your wallet.`;
  }
  if (policy.late_cancellation_type === "partial_refund") {
    return `A partial refund of ${currency} ${refundAmount.toFixed(2)} will be credited to your wallet.`;
  }
  return `A refund of ${currency} ${refundAmount.toFixed(2)} will be credited to your wallet.`;
}

export interface ProcessBookingRefundOptions {
  isLateCancellation: boolean;
  /** When set, wallet credit will not exceed this (e.g. amount actually paid on the booking). */
  maxWalletCredit?: number;
}

/**
 * Process refund for a cancelled booking.
 * Credits the customer's wallet and creates a booking_refund record (store_credit).
 */
export async function processBookingRefund(
  bookingId: string,
  bookingTotal: number,
  currency: string,
  policy: CancellationPolicy,
  options: ProcessBookingRefundOptions,
  _paymentReference?: string
): Promise<RefundResult> {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    let refundAmount = computeCancellationRefundAmount(
      bookingTotal,
      policy,
      options.isLateCancellation
    );

    if (options.maxWalletCredit !== undefined) {
      const cap = Math.max(0, Number(options.maxWalletCredit) || 0);
      refundAmount = roundCurrency2(Math.min(refundAmount, cap));
    }

    if (refundAmount <= 0) {
      return { success: true, amount: 0 };
    }

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select("customer_id, booking_number, tenant_id, provider_id")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking?.customer_id) {
      console.error("Booking not found for refund:", bookingId, bookingError);
      return { success: false, error: "Booking or customer not found" };
    }

    const bookingTenantId = (booking as { tenant_id?: string | null }).tenant_id;
    const tenantRegion = bookingTenantId ? await getTenantRegionConfig(bookingTenantId) : null;
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const walletTenantId = await resolveTenantIdForFinanceLedger(supabaseAdmin, {
      tenant_id: (booking as { tenant_id?: string | null }).tenant_id,
      provider_id: (booking as { provider_id?: string | null }).provider_id ?? null,
    });

    const bookingRef = (booking as { booking_number?: string }).booking_number || bookingId.slice(0, 8);
    const lateLabel = options.isLateCancellation ? "late cancellation" : "cancellation";
    const description = `Refund for booking ${bookingRef}: ${lateLabel} — ${policy.late_cancellation_type}`;

    const { error: walletError } = await (supabaseAdmin.rpc as any)("wallet_credit_admin", {
      p_user_id: (booking as { customer_id: string }).customer_id,
      p_amount: refundAmount,
      p_currency: currency || lastResortCurrency,
      p_description: description,
      p_reference_id: bookingId,
      p_reference_type: "booking_refund",
      p_tenant_id: walletTenantId,
    });

    if (walletError) {
      console.error("Wallet credit failed for cancellation refund:", walletError);
      return { success: false, error: "Failed to credit customer wallet" };
    }

    const { data: refundRecord, error: refundError } = await supabaseAdmin
      .from("booking_refunds")
      .insert({
        booking_id: bookingId,
        amount: refundAmount,
        reason: `Cancellation refund (${lateLabel}) — ${policy.late_cancellation_type}`,
        refund_method: "store_credit",
        status: "completed",
        notes: "Cancellation policy refund – credited to customer wallet",
      })
      .select("id")
      .single();

    if (refundError) {
      console.error("Error creating refund record:", refundError);
      return { success: false, error: "Failed to create refund record" };
    }

    const { error: financeErr } = await supabaseAdmin.from("finance_transactions").insert({
      tenant_id: walletTenantId,
      booking_id: bookingId,
      provider_id: (booking as { provider_id?: string | null }).provider_id ?? null,
      transaction_type: "refund",
      amount: -refundAmount,
      fees: 0,
      commission: 0,
      net: -refundAmount,
      description,
      created_at: new Date().toISOString(),
    });
    if (financeErr) {
      console.error(
        "processBookingRefund: finance ledger insert failed after wallet credit:",
        financeErr,
      );
    }

    return {
      success: true,
      refundId: (refundRecord as { id: string })?.id,
      amount: refundAmount,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to process refund";
    console.error("Error processing refund:", error);
    return { success: false, error: message };
  }
}

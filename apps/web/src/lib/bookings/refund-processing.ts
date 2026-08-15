/**
 * Refund Processing Logic
 * Handles refunds for cancelled bookings based on cancellation policy.
 * Refunds always credit the customer's wallet (platform policy).
 */

import * as Sentry from "@sentry/nextjs";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTenantRegionConfig } from "@/lib/regions/config";
import type { CancellationPolicy } from "./cancellation-policy";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { logger } from "@/lib/utils/logger";
import { sumCompletedStoreCreditRefunds } from "@/lib/admin/booking-refund-context";
import { syncPaymentTransactionRefundState } from "@/lib/finance/sync-payment-transaction-refund";

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
  return Sentry.startSpan(
    {
      name: "finance.processBookingRefund",
      op: "finance.refund.write",
      attributes: {
        "finance.booking_id": bookingId,
        "finance.is_late_cancellation": options.isLateCancellation,
        "finance.booking_total": bookingTotal,
      },
    },
    () =>
      processBookingRefundInner(
        bookingId,
        bookingTotal,
        currency,
        policy,
        options,
      ),
  );
}

async function processBookingRefundInner(
  bookingId: string,
  bookingTotal: number,
  currency: string,
  policy: CancellationPolicy,
  options: ProcessBookingRefundOptions,
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
      logger.error(
        "processBookingRefund.booking_lookup_failed",
        bookingError ?? undefined,
        { bookingId },
      );
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

    // §Refund-idempotency (audit 2026-06): previously this always INSERTed a new
    // pending refund row and credited the wallet. If the wallet credit succeeded
    // but the finalize update failed, the caller would retry and create a SECOND
    // refund + a SECOND wallet credit (double refund). We now reuse an existing
    // pending store-credit refund row for this booking when present, and key the
    // wallet credit to that refund row's id so a retried credit is a no-op at the
    // DB level (migration 649).
    const { data: existingPending } = await supabaseAdmin
      .from("booking_refunds")
      .select("id, amount")
      .eq("booking_id", bookingId)
      .eq("refund_method", "store_credit")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let refundRecord: { id: string } | null = (existingPending as { id: string } | null) ?? null;

    if (!refundRecord) {
      // Insert refund record as pending — ledger clawback runs only after wallet credit succeeds (F6).
      const { data: inserted, error: refundError } = await supabaseAdmin
        .from("booking_refunds")
        .insert({
          booking_id: bookingId,
          amount: refundAmount,
          reason: `Cancellation refund (${lateLabel}) — ${policy.late_cancellation_type}`,
          refund_method: "store_credit",
          status: "pending",
          notes: "Cancellation policy refund – crediting customer wallet",
        })
        .select("id")
        .single();

      if (refundError) {
        logger.error("processBookingRefund.refund_insert_failed", refundError, {
          bookingId,
          refundAmount,
        });
        return { success: false, error: "Failed to create refund record" };
      }
      refundRecord = inserted as { id: string };
    }

    // Credit wallet AFTER refund row exists (ensures audit trail on retry).
    // Keyed by the refund row id so a retry credits at most once.
    const { error: walletError } = await (supabaseAdmin.rpc as any)("wallet_credit_admin", {
      p_user_id: (booking as { customer_id: string }).customer_id,
      p_amount: refundAmount,
      p_currency: currency || lastResortCurrency,
      p_description: description,
      p_reference_id: bookingId,
      p_reference_type: "booking_refund",
      p_tenant_id: walletTenantId,
      p_idempotency_key: `booking_refund:${(refundRecord as { id: string }).id}`,
    });

    if (walletError) {
      logger.error(
        "processBookingRefund.wallet_credit_failed",
        walletError,
        {
          bookingId,
          refundId: (refundRecord as { id: string }).id,
          refundAmount,
        },
      );
      await supabaseAdmin
        .from("booking_refunds")
        .update({ status: "failed", notes: `Wallet credit failed: ${walletError.message}` })
        .eq("id", (refundRecord as { id: string }).id);
      return { success: false, error: "Failed to credit customer wallet. Refund recorded for retry." };
    }

    const { error: finalizeErr } = await supabaseAdmin
      .from("booking_refunds")
      .update({
        status: "completed",
        notes: "Cancellation policy refund – credited to customer wallet",
      })
      .eq("id", (refundRecord as { id: string }).id);

    if (finalizeErr) {
      logger.error("processBookingRefund.refund_finalize_failed", finalizeErr, {
        bookingId,
        refundId: (refundRecord as { id: string }).id,
      });
      return { success: false, error: "Failed to finalize refund record" };
    }

    try {
      const { data: allRefunds } = await supabaseAdmin
        .from("booking_refunds")
        .select("amount, refund_method, status")
        .eq("booking_id", bookingId);
      const cumulative = sumCompletedStoreCreditRefunds(
        (allRefunds ?? []) as Array<{
          amount?: number | string | null;
          refund_method?: string | null;
          status?: string | null;
        }>,
      );
      await syncPaymentTransactionRefundState({
        supabase: supabaseAdmin,
        bookingId,
        cumulativeRefundAmount: cumulative,
        reason: `Cancellation refund (${lateLabel}) — ${policy.late_cancellation_type}`,
      });
    } catch (syncErr) {
      logger.warn("processBookingRefund.payment_transaction_sync_failed", {
        bookingId,
        error: syncErr instanceof Error ? syncErr.message : String(syncErr),
      });
    }

    // Record booking event for audit trail
    try {
      await supabaseAdmin.from("booking_events").insert({
        booking_id: bookingId,
        event_type: "refund_issued",
        event_data: {
          refund_id: (refundRecord as { id: string }).id,
          amount: refundAmount,
          refund_method: "store_credit",
          reason: `Cancellation refund (${lateLabel})`,
          is_late_cancellation: options.isLateCancellation,
        },
      });
    } catch (eventErr) {
      logger.warn("processBookingRefund.event_insert_failed", {
        bookingId,
        error:
          eventErr instanceof Error
            ? eventErr.message
            : String(eventErr),
      });
    }

    // NOTE: finance_transactions ledger row is written by the AFTER INSERT/UPDATE
    // trigger `create_finance_ledger_from_booking_refund` (migration 490) keyed by
    // `source_refund_id`. Do NOT write a second row here — that was the B1
    // double-count bug. If the trigger ever fails, the refund row itself will be
    // missing the paired ledger entry, which is detectable via
    // `v_ledger_reconciliation`.

    return {
      success: true,
      refundId: (refundRecord as { id: string })?.id,
      amount: refundAmount,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to process refund";
    logger.error("processBookingRefund.unhandled", error, {
      bookingId,
      bookingTotal,
    });
    return { success: false, error: message };
  }
}

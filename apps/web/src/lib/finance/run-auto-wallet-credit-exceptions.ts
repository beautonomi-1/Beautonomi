import type { SupabaseClient } from "@supabase/supabase-js";
import { buildNeedsActionRefundQueueRows } from "@/lib/admin/refund-needs-action-pipeline";
import type { RefundQueueRow } from "@/lib/admin/refund-queue-rows";
import {
  parseRefundAmount,
  sumCompletedStoreCreditRefunds,
} from "@/lib/admin/booking-refund-context";
import { getEffectiveAutoWalletCreditSettings } from "@/lib/finance/auto-wallet-credit-settings";
import { checkPeriodLock } from "@/lib/finance/period-lock";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { syncPaymentTransactionRefundState } from "@/lib/finance/sync-payment-transaction-refund";
import { processBookingRefund } from "@/lib/bookings/refund-processing";
import { notifyFinanceStaff } from "@/lib/notifications/notify-finance-staff";
import { slackNotifyWalletCreditFailed } from "@/lib/integrations/slack/ops-triggers";

const STUCK_PENDING_MS = 15 * 60 * 1000;

export type AutoWalletCreditRunSummary = {
  tenants_processed: number;
  credits_attempted: number;
  credits_succeeded: number;
  notifications_sent: number;
};

function tenderBlocksAutoCredit(tenderLabel: string): boolean {
  const l = tenderLabel.toLowerCase();
  return (
    l.includes("cash") ||
    l.includes("paycloud") ||
    l.includes("yoco") ||
    l.includes("card machine") ||
    l.includes("mixed")
  );
}

/** Exported for regression tests (skip rules for cron auto-credit). */
export function queueRowSkipsAutoCredit(row: RefundQueueRow): boolean {
  const skipReasons = new Set([
    "awaiting_cash_confirmation",
    "kept_per_policy",
    "gift_card_voided",
    "no_refund_due",
    "open_dispute",
    "refund_support_ticket",
    "not_applicable",
  ]);
  if (skipReasons.has(row.queue_reason)) return true;
  if (!row.is_processable || !row.needs_action) return true;
  if (tenderBlocksAutoCredit(row.tender_label)) return true;
  const booking = row.booking as { gift_card_amount?: unknown } | null;
  if (parseRefundAmount(booking?.gift_card_amount) > 0) return true;
  return false;
}

async function finalizeRefundAfterWalletCredit(
  supabase: SupabaseClient,
  bookingId: string,
  refundId: string,
  reason: string,
): Promise<void> {
  await supabase.from("booking_refunds").update({ status: "completed" }).eq("id", refundId);

  const { data: allRefunds } = await supabase
    .from("booking_refunds")
    .select("amount, refund_method, status")
    .eq("booking_id", bookingId);
  const cumulative = sumCompletedStoreCreditRefunds(
    (allRefunds ?? []) as Array<{ amount?: number | string | null; refund_method?: string | null; status?: string | null }>,
  );
  await syncPaymentTransactionRefundState({
    supabase,
    bookingId,
    cumulativeRefundAmount: cumulative,
    reason,
  });
}

/** @internal Regression tests for idempotent wallet replay. */
export async function replayFailedOrPendingStoreCreditForTests(
  supabase: SupabaseClient,
  tenantId: string,
  refundId: string,
  bookingId: string,
): Promise<boolean> {
  return replayFailedOrPendingStoreCredit(supabase, tenantId, refundId, bookingId);
}

async function replayFailedOrPendingStoreCredit(
  supabase: SupabaseClient,
  tenantId: string,
  refundId: string,
  bookingId: string,
): Promise<boolean> {
  const { data: refundRow } = await supabase
    .from("booking_refunds")
    .select("id, amount, status, refund_method, created_at, reason")
    .eq("id", refundId)
    .single();
  if (!refundRow) return false;
  const status = String((refundRow as { status?: string }).status ?? "");
  if (status !== "failed" && status !== "pending") return false;
  if (String((refundRow as { refund_method?: string }).refund_method ?? "") !== "store_credit") {
    return false;
  }
  if (status === "pending") {
    const created = (refundRow as { created_at?: string }).created_at;
    if (!created || Date.now() - new Date(created).getTime() < STUCK_PENDING_MS) return false;
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("customer_id, booking_number, currency, tenant_id, provider_id")
    .eq("id", bookingId)
    .single();
  if (!booking?.customer_id) return false;

  const amount = parseRefundAmount((refundRow as { amount?: unknown }).amount);
  if (amount <= 0) return false;

  const financeTenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: (booking as { tenant_id?: string | null }).tenant_id ?? tenantId,
    provider_id: (booking as { provider_id?: string | null }).provider_id ?? null,
  });

  const { error: walletError } = await (supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: unknown }>)(
    "wallet_credit_admin",
    {
      p_user_id: (booking as { customer_id: string }).customer_id,
      p_amount: amount,
      p_currency: (booking as { currency?: string }).currency || "ZAR",
      p_description: `Replay wallet credit for booking ${(booking as { booking_number?: string }).booking_number || bookingId}`,
      p_reference_id: bookingId,
      p_reference_type: "booking_refund",
      p_tenant_id: financeTenantId,
      p_idempotency_key: `booking_refund:${refundId}`,
    },
  );

  if (walletError) return false;

  const reason = String((refundRow as { reason?: string }).reason ?? "Auto wallet credit retry");
  await finalizeRefundAfterWalletCredit(supabase, bookingId, refundId, reason);
  return true;
}

async function autoCreditCancelledUnrefunded(
  supabase: SupabaseClient,
  tenantId: string,
  row: RefundQueueRow,
): Promise<boolean> {
  const bookingId = row.booking_id;
  if (!bookingId) return false;

  const displayRemaining = row.remaining_refundable;
  if (displayRemaining <= 0) return false;

  const refunds = row.enriched?.booking_refunds ?? [];
  const completed = sumCompletedStoreCreditRefunds(refunds);
  if (completed + 0.01 >= displayRemaining) return false;
  if (completed > 0.01) return false;

  const hasFailedOrPending = (refunds as Array<{ status?: string; refund_method?: string }>).some(
    (r) =>
      (String(r.status) === "failed" || String(r.status) === "pending") &&
      String(r.refund_method ?? "") === "store_credit",
  );
  if (hasFailedOrPending) return false;

  const policy = {
    id: "auto_wallet_credit_exception",
    provider_id: null,
    location_type: null,
    hours_before_cutoff: 0,
    grace_window_minutes: 0,
    policy_text: "Auto wallet credit exception",
    late_cancellation_type: "full_refund" as const,
    is_active: true,
    refund_percentage: 100,
    fee_amount: 0,
    fee_type: "fixed" as const,
  };

  const booking = row.booking as { currency?: string | null } | null;
  const result = await processBookingRefund(
    bookingId,
    displayRemaining,
    booking?.currency || "ZAR",
    policy as never,
    { isLateCancellation: false, maxWalletCredit: displayRemaining },
  );
  return result.success === true && (result.amount ?? 0) > 0;
}

async function alertStillUncredited(
  supabase: SupabaseClient,
  tenantId: string,
  row: RefundQueueRow,
): Promise<void> {
  if (!row.needs_action || row.queue_reason !== "cancelled_unrefunded") return;
  const bookingId = row.booking_id;
  if (!bookingId) return;
  const booking = row.booking as { booking_number?: string } | null;
  await notifyFinanceStaff({
    tenantId,
    title: "Cancelled booking not credited",
    message: `${booking?.booking_number ? `Booking ${booking.booking_number}` : bookingId}: amount not yet in customer wallet.`,
    link: "/admin/refunds?status=needs_action",
    dedupeKey: `cancelled_unrefunded:${bookingId}`,
    data: { booking_id: bookingId },
  });
}

async function alertFailedRefundAfterRetry(
  supabase: SupabaseClient,
  tenantId: string,
  refundId: string,
  bookingId: string,
  amount: number,
  currency: string,
  bookingNumber?: string | null,
): Promise<void> {
  await notifyFinanceStaff({
    tenantId,
    title: "Wallet credit failed",
    message: `Booking ${bookingNumber || bookingId.slice(0, 8)}: wallet credit still failing (${currency} ${amount.toFixed(2)}).`,
    link: "/admin/refunds?status=needs_action",
    dedupeKey: `booking_refund:${refundId}:wallet_credit_failed`,
    data: { booking_id: bookingId, refund_id: refundId },
  });
  slackNotifyWalletCreditFailed({
    tenantId,
    refundId,
    bookingId,
    bookingNumber,
    amount,
    currency,
  });
}

export async function runAutoWalletCreditExceptions(
  supabase: SupabaseClient,
  now = new Date(),
): Promise<AutoWalletCreditRunSummary> {
  const { data: tenants } = await supabase.from("tenants").select("id").eq("is_active", true);
  const summary: AutoWalletCreditRunSummary = {
    tenants_processed: 0,
    credits_attempted: 0,
    credits_succeeded: 0,
    notifications_sent: 0,
  };

  for (const t of tenants ?? []) {
    const tenantId = String((t as { id: string }).id);
    summary.tenants_processed += 1;

    const settings = await getEffectiveAutoWalletCreditSettings(supabase, tenantId);
    const { queueRows } = await buildNeedsActionRefundQueueRows(supabase, tenantId);
    const actionable = queueRows.filter((r) => r.needs_action);

    let periodLocked = false;
    if (settings.enabled) {
      const lock = await checkPeriodLock(supabase, tenantId, now.toISOString());
      periodLocked = lock.locked;
    }

    for (const row of actionable) {
      if (queueRowSkipsAutoCredit(row)) continue;

      if (row.queue_reason === "wallet_credit_failed" || row.queue_reason === "refund_stuck_pending") {
        const failed = (row.enriched?.booking_refunds ?? []).find(
          (r) =>
            (String(r.status) === "failed" ||
              (String(r.status) === "pending" &&
                r.created_at &&
                now.getTime() - new Date(String(r.created_at)).getTime() > STUCK_PENDING_MS)) &&
            String(r.refund_method ?? "") === "store_credit",
        );
        if (!failed?.id || !row.booking_id) continue;

        if (settings.enabled && !periodLocked) {
          summary.credits_attempted += 1;
          const ok = await replayFailedOrPendingStoreCredit(
            supabase,
            tenantId,
            String(failed.id),
            row.booking_id,
          );
          if (ok) summary.credits_succeeded += 1;
          else if (settings.enabled) {
            summary.notifications_sent += 1;
            await alertFailedRefundAfterRetry(
              supabase,
              tenantId,
              String(failed.id),
              row.booking_id,
              parseRefundAmount(failed.amount),
              (row.booking as { currency?: string })?.currency || "ZAR",
              (row.booking as { booking_number?: string })?.booking_number,
            );
          }
        } else if (!settings.enabled) {
          /* immediate alert already sent from processBookingRefund */
        }
        continue;
      }

      if (row.queue_reason === "cancelled_unrefunded") {
        if (settings.enabled && !periodLocked) {
          summary.credits_attempted += 1;
          const ok = await autoCreditCancelledUnrefunded(supabase, tenantId, row);
          if (ok) summary.credits_succeeded += 1;
        }
        const { queueRows: refreshed } = await buildNeedsActionRefundQueueRows(supabase, tenantId);
        const still = refreshed.find(
          (r) => r.booking_id === row.booking_id && r.needs_action && r.queue_reason === "cancelled_unrefunded",
        );
        if (still) {
          summary.notifications_sent += 1;
          await alertStillUncredited(supabase, tenantId, still);
        }
      }
    }
  }

  return summary;
}

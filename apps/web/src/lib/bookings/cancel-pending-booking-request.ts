import type { SupabaseClient } from "@supabase/supabase-js";
import { settleBookingFinanceById } from "@/lib/bookings/settle-booking-cancellation";
import { sendCancellationNotification } from "@/lib/bookings/notifications";
import { matchWaitlistOnCancellation } from "@/lib/waitlist/matching";
import { syncGroupBookingStatusFromChildren } from "@/lib/bookings/group-booking";
import { pendingExpiryCancellationReason } from "@/lib/bookings/lifecycle-deadlines";
import { pendingExpiryRefundNotice } from "@/lib/bookings/pending-expiry-refund-notice";
import { trackServer } from "@/lib/analytics/amplitude/server";
import { EVENT_PENDING_REQUEST_EXPIRED } from "@/lib/analytics/amplitude/types";
import { restoreBookingRetailStock } from "@/lib/bookings/deduct-booking-retail-stock";
import { returnPackageSessionAfterCancel } from "@/lib/bookings/return-package-session-after-cancel";

const STOCK_STILL_OUT_SUFFIX = " — products still out";

export type PendingCancelReason = "sla" | "pre_slot" | "janitor";

export interface CancelPendingBookingOptions {
  reason: PendingCancelReason;
  paymentStatus?: string | null;
  /** When false, settle/waitlist still run but no customer/provider expiry email. */
  notify?: boolean;
}

export interface CancelPendingBookingOutcome {
  ok: boolean;
  reason?: string;
  walletRefundAmount?: number;
  refundInfo?: string;
  currency?: string | null;
}

export async function cancelPendingBookingRequest(
  admin: SupabaseClient,
  bookingId: string,
  options: CancelPendingBookingOptions,
): Promise<CancelPendingBookingOutcome> {
  const cancellationReason = pendingExpiryCancellationReason(options.reason);
  const now = new Date().toISOString();

  const { data: updatedRows, error: updateError } = await admin
    .from("bookings")
    .update({
      status: "cancelled",
      cancelled_at: now,
      cancelled_by: null,
      cancellation_reason: cancellationReason,
      cancellation_fee: 0,
      updated_at: now,
    })
    .eq("id", bookingId)
    .eq("status", "pending")
    .select(
      "id, currency, customer_id, customer_package_entitlement_id, group_booking_id, payment_status",
    )
    .limit(1);

  if (updateError) {
    console.error("[cancel-pending-booking] update failed", bookingId, updateError);
    return { ok: false, reason: updateError.message };
  }

  const updated = updatedRows?.[0] as
    | {
        id: string;
        currency?: string | null;
        customer_id?: string | null;
        customer_package_entitlement_id?: string | null;
        group_booking_id?: string | null;
        payment_status?: string | null;
      }
    | undefined;

  if (!updated) {
    return { ok: false, reason: "already_resolved" };
  }

  try {
    await restoreBookingRetailStock(admin, bookingId);
  } catch (stockErr) {
    console.error("[cancel-pending-booking] stock restore failed", bookingId, stockErr);
    await admin
      .from("bookings")
      .update({
        cancellation_reason: `${cancellationReason}${STOCK_STILL_OUT_SUFFIX}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bookingId)
      .eq("status", "cancelled");
  }

  const paymentStatus = options.paymentStatus ?? updated.payment_status;
  let notice = pendingExpiryRefundNotice({
    paymentStatus,
    currency: updated.currency,
    settlementFailed: true,
  });
  try {
    const settlement = await settleBookingFinanceById(admin, bookingId, "admin");
    notice = pendingExpiryRefundNotice({
      paymentStatus,
      currency: updated.currency,
      settlement,
    });
  } catch (err) {
    console.error("[cancel-pending-booking] settlement failed", bookingId, err);
  }

  if (updated.customer_package_entitlement_id && updated.customer_id) {
    await returnPackageSessionAfterCancel(admin, bookingId);
  }

  try {
    await matchWaitlistOnCancellation(admin, bookingId);
  } catch (err) {
    console.error("[cancel-pending-booking] waitlist match failed", bookingId, err);
  }

  if (options.notify !== false) {
    await sendCancellationNotification(bookingId, {
      cancelledBy: "system",
      cancellationReason,
      refundInfo: notice.refundInfo,
      feeRetained: 0,
      walletRefund: notice.walletRefund,
      currency: updated.currency ?? undefined,
    });
  }

  if (updated.group_booking_id) {
    try {
      await syncGroupBookingStatusFromChildren(admin, updated.group_booking_id);
    } catch (syncErr) {
      console.error(
        "[cancel-pending-booking] group status sync failed",
        updated.group_booking_id,
        syncErr,
      );
    }
  }

  try {
    await trackServer(
      EVENT_PENDING_REQUEST_EXPIRED,
      {
        booking_id: bookingId,
        reason: options.reason,
      },
      updated.customer_id ?? undefined,
      { insertId: `pending_request_expired:${bookingId}:${options.reason}` },
    );
  } catch {
    // analytics must not block cancellation
  }

  return {
    ok: true,
    walletRefundAmount: notice.walletRefund,
    refundInfo: notice.refundInfo,
    currency: updated.currency ?? null,
  };
}

/** Finish product returns for pending requests that were cancelled while stock was still out. */
export async function retryPendingCancelProductStock(admin: SupabaseClient): Promise<number> {
  const { data, error } = await admin
    .from("bookings")
    .select("id, cancellation_reason")
    .eq("status", "cancelled")
    .like("cancellation_reason", `%${STOCK_STILL_OUT_SUFFIX}`)
    .limit(200);
  if (error) {
    console.error("[cancel-pending-booking] stock retry query failed", error);
    return 0;
  }

  let finished = 0;
  for (const row of (data ?? []) as Array<{ id: string; cancellation_reason?: string | null }>) {
    const reason = String(row.cancellation_reason ?? "");
    if (!reason.endsWith(STOCK_STILL_OUT_SUFFIX)) continue;
    try {
      await restoreBookingRetailStock(admin, row.id);
      const { data: marked } = await admin
        .from("bookings")
        .update({
          cancellation_reason: reason.slice(0, -STOCK_STILL_OUT_SUFFIX.length),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("cancellation_reason", reason)
        .select("id");
      if ((marked?.length ?? 0) > 0) finished += 1;
    } catch (err) {
      console.error("[cancel-pending-booking] stock retry failed", row.id, err);
    }
  }
  return finished;
}

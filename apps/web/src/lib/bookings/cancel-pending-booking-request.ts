import type { SupabaseClient } from "@supabase/supabase-js";
import { settleBookingFinanceById } from "@/lib/bookings/settle-booking-cancellation";
import { sendCancellationNotification } from "@/lib/bookings/notifications";
import { matchWaitlistOnCancellation } from "@/lib/waitlist/matching";
import { syncGroupBookingStatusFromChildren } from "@/lib/bookings/group-booking";
import {
  buildPendingExpiryRefundCopy,
  pendingExpiryCancellationReason,
} from "@/lib/bookings/lifecycle-deadlines";
import { trackServer } from "@/lib/analytics/amplitude/server";
import { EVENT_PENDING_REQUEST_EXPIRED } from "@/lib/analytics/amplitude/types";

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

  let walletRefundAmount: number | undefined;
  try {
    const settlement = await settleBookingFinanceById(admin, bookingId, "admin");
    walletRefundAmount = settlement?.walletRefundAmount;
  } catch (err) {
    console.error("[cancel-pending-booking] settlement failed", bookingId, err);
  }

  if (updated.customer_package_entitlement_id && updated.customer_id) {
    try {
      await admin.rpc("restore_customer_package_entitlement", {
        p_entitlement_id: updated.customer_package_entitlement_id,
        p_customer_id: updated.customer_id,
      });
    } catch (err) {
      console.error("[cancel-pending-booking] entitlement restore failed", bookingId, err);
    }
  }

  try {
    await matchWaitlistOnCancellation(admin, bookingId);
  } catch (err) {
    console.error("[cancel-pending-booking] waitlist match failed", bookingId, err);
  }

  const paymentStatus = options.paymentStatus ?? updated.payment_status;
  if (options.notify !== false) {
    await sendCancellationNotification(bookingId, {
      cancelledBy: "system",
      cancellationReason,
      refundInfo: buildPendingExpiryRefundCopy(paymentStatus),
      feeRetained: 0,
      walletRefund: walletRefundAmount,
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

  return { ok: true, walletRefundAmount, currency: updated.currency ?? null };
}

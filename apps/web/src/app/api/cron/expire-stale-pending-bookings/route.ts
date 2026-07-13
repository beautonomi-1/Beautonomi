/**
 * GET /api/cron/expire-stale-pending-bookings
 *
 * §receipt-downloads 2026-07 — Stale pending bookings dead end.
 *
 * `status = 'pending'` bookings (and pending `group_bookings`) are shown to
 * the provider as booking requests awaiting confirmation. The Day-view date
 * strip is hard-capped at ±30 days ({@link PROVIDER_BOOKINGS_STRIP_HALF_DAYS}
 * in `packages/utils/src/booking/scheduleDisplay.ts}), but nothing previously
 * expired `pending` bookings whose appointment time had already passed — so
 * once a request scrolled outside that window it became a permanent,
 * un-actionable entry inflating the "pending" badge forever.
 *
 * This sweep cancels `pending` bookings (and pending group bookings) whose
 * `scheduled_at` is more than `STALE_PENDING_TTL_HOURS` (default 24h) in the
 * past — the provider never confirmed before the appointment time. Since the
 * provider never accepted the request, the customer is made whole: full
 * refund, zero cancellation fee, via the same shared settlement used by every
 * other cancellation path. Both the customer and the provider are notified.
 *
 * Meant to run hourly.
 */

import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyCronRequest } from "@/lib/cron-auth";
import { settleBookingFinanceById } from "@/lib/bookings/settle-booking-cancellation";
import { sendCancellationNotification } from "@/lib/bookings/notifications";
import { matchWaitlistOnCancellation } from "@/lib/waitlist/matching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hours a booking request may sit unconfirmed past its appointment time before it auto-expires. */
const DEFAULT_TTL_HOURS = 24;
const BOOKING_BATCH_LIMIT = 200;
const GROUP_BATCH_LIMIT = 100;
const CANCELLATION_REASON =
  "Expired — the provider did not confirm this request before the appointment time";

interface CancelOutcome {
  ok: boolean;
  reason?: string;
}

/**
 * Cancel a single stale `pending` booking: status flip (race-guarded),
 * full-refund/zero-fee finance settlement, package entitlement restore,
 * waitlist match, and customer+provider notification. Best-effort past the
 * status update — one bad row must not halt the sweep.
 */
async function cancelStalePendingBooking(
  admin: SupabaseClient,
  bookingId: string,
): Promise<CancelOutcome> {
  const now = new Date().toISOString();
  const { data: updatedRows, error: updateError } = await admin
    .from("bookings")
    .update({
      status: "cancelled",
      cancelled_at: now,
      cancelled_by: null,
      cancellation_reason: CANCELLATION_REASON,
      cancellation_fee: 0,
      updated_at: now,
    })
    .eq("id", bookingId)
    .eq("status", "pending")
    .select("id, currency, customer_id, customer_package_entitlement_id")
    .limit(1);

  if (updateError) {
    console.error("[expire-stale-pending-bookings] update failed", bookingId, updateError);
    return { ok: false, reason: updateError.message };
  }
  const updated = updatedRows?.[0] as
    | {
        id: string;
        currency?: string | null;
        customer_id?: string | null;
        customer_package_entitlement_id?: string | null;
      }
    | undefined;
  if (!updated) {
    // Already confirmed/cancelled by the provider or customer in the meantime — skip silently.
    return { ok: false, reason: "already_resolved" };
  }

  let walletRefundAmount: number | undefined;
  try {
    const settlement = await settleBookingFinanceById(admin, bookingId, "admin");
    walletRefundAmount = settlement?.walletRefundAmount;
  } catch (err) {
    console.error("[expire-stale-pending-bookings] settlement failed", bookingId, err);
  }

  if (updated.customer_package_entitlement_id && updated.customer_id) {
    try {
      await admin.rpc("restore_customer_package_entitlement", {
        p_entitlement_id: updated.customer_package_entitlement_id,
        p_customer_id: updated.customer_id,
      });
    } catch (err) {
      console.error("[expire-stale-pending-bookings] entitlement restore failed", bookingId, err);
    }
  }

  try {
    await matchWaitlistOnCancellation(admin, bookingId);
  } catch (err) {
    console.error("[expire-stale-pending-bookings] waitlist match failed", bookingId, err);
  }

  await sendCancellationNotification(bookingId, {
    cancelledBy: "system",
    cancellationReason: CANCELLATION_REASON,
    refundInfo: "You have been fully refunded — no cancellation fee applies.",
    feeRetained: 0,
    walletRefund: walletRefundAmount,
    currency: updated.currency ?? undefined,
  });

  return { ok: true };
}

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json(
      { ok: false, error: auth.error ?? "unauthorized" },
      { status: 401 },
    );
  }

  const ttlHours = (() => {
    const raw = Number(process.env.STALE_PENDING_TTL_HOURS);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_HOURS;
  })();

  const admin = getSupabaseAdmin();
  const cutoffIso = new Date(Date.now() - ttlHours * 60 * 60 * 1000).toISOString();

  let expiredBookings = 0;
  let skippedBookings = 0;

  // Standalone bookings (not part of a group) — the common case.
  const { data: staleBookings, error: bookingsError } = await admin
    .from("bookings")
    .select("id")
    .eq("status", "pending")
    .is("group_booking_id", null)
    .lt("scheduled_at", cutoffIso)
    .order("scheduled_at", { ascending: true })
    .limit(BOOKING_BATCH_LIMIT);

  if (bookingsError) {
    console.error("[expire-stale-pending-bookings] bookings query failed", bookingsError);
    return NextResponse.json({ ok: false, error: bookingsError.message }, { status: 500 });
  }

  for (const row of staleBookings ?? []) {
    const outcome = await cancelStalePendingBooking(admin, (row as { id: string }).id);
    if (outcome.ok) expiredBookings += 1;
    else skippedBookings += 1;
  }

  // Group bookings: cancel every still-pending participant booking, then the group itself.
  let expiredGroups = 0;
  let expiredGroupParticipantBookings = 0;

  const { data: staleGroups, error: groupsError } = await admin
    .from("group_bookings")
    .select("id")
    .eq("status", "pending")
    .lt("scheduled_at", cutoffIso)
    .order("scheduled_at", { ascending: true })
    .limit(GROUP_BATCH_LIMIT);

  if (groupsError) {
    console.error("[expire-stale-pending-bookings] group_bookings query failed", groupsError);
  }

  for (const group of staleGroups ?? []) {
    const groupId = (group as { id: string }).id;
    try {
      const { data: participantBookings, error: participantsError } = await admin
        .from("bookings")
        .select("id")
        .eq("group_booking_id", groupId)
        .eq("status", "pending");
      if (participantsError) throw participantsError;

      for (const pb of participantBookings ?? []) {
        const outcome = await cancelStalePendingBooking(admin, (pb as { id: string }).id);
        if (outcome.ok) expiredGroupParticipantBookings += 1;
      }

      const { error: groupUpdateError } = await admin
        .from("group_bookings")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", groupId)
        .eq("status", "pending");
      if (groupUpdateError) throw groupUpdateError;
      expiredGroups += 1;
    } catch (err) {
      console.error("[expire-stale-pending-bookings] group cancel failed", groupId, err);
    }
  }

  return NextResponse.json({
    ok: true,
    ttl_hours: ttlHours,
    bookings: {
      candidates: (staleBookings ?? []).length,
      expired: expiredBookings,
      skipped: skippedBookings,
    },
    group_bookings: {
      candidates: (staleGroups ?? []).length,
      expired: expiredGroups,
      participant_bookings_expired: expiredGroupParticipantBookings,
    },
  });
}

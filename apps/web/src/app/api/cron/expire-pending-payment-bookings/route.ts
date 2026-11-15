/**
 * GET /api/cron/expire-pending-payment-bookings
 *
 * §Payment-truth 2026-06 — Self-healing for abandoned/declined card checkouts.
 *
 * The customer online booking flow is "create-then-pay": the booking row is
 * created and the customer is redirected to Paystack. If the card is declined or
 * the customer abandons the hosted page, Paystack often emits no `charge.failed`
 * webhook, so the booking is left at:
 *
 *     status = 'pending_payment'  AND  payment_status = 'pending'
 *
 * That row keeps holding the staff slot and shows on the provider side as
 * "Awaiting payment" forever. This sweep cancels such rows once they are older
 * than `PENDING_PAYMENT_TTL_MINUTES`, releasing the slot and reversing any
 * wallet/gift coverage via `releaseBookingSlotAfterPaymentFailure`.
 *
 * `status = 'pending_payment'` is unambiguous (only the card-redirect path sets
 * it), so we never touch legitimately confirmed or cash bookings.
 *
 * Meant to run every ~10 minutes.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyCronRequest } from "@/lib/cron-auth";
import { releaseBookingSlotAfterPaymentFailure, PAYMENT_FAILURE_REFUND_STILL_DUE } from "@/app/api/public/bookings/_helpers/release-booking-slot-after-payment-failure";
import {
  finishFailedBookingTender,
  PAYMENT_FAILED_REFUND_STILL_DUE,
} from "@/app/api/payments/webhook/_handlers/charge-success";
import { returnBorrowedSessionIfReleased } from "@/lib/bookings/reschedule-carry-over";
import { retryUnfinishedCollectibleRollbacks } from "@/lib/bookings/rollback-collectible-split-leg";
import { notifyCustomerCheckoutNotCompleted } from "@/lib/notifications/notification-service";

import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const JOB_NAME = "expire-pending-payment-bookings";
/** Minutes a card booking may sit unpaid before the slot is released. */
const DEFAULT_TTL_MINUTES = 30;
const BATCH_LIMIT = 200;

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json(
      { ok: false, error: auth.error ?? "unauthorized" },
      { status: 401 },
    );
  }
  return runLockedCronRoute(JOB_NAME, () => runJob(request));
}

async function runJob(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json(
      { ok: false, error: auth.error ?? "unauthorized" },
      { status: 401 },
    );
  }

  const ttlMinutes = (() => {
    const raw = Number(process.env.PENDING_PAYMENT_TTL_MINUTES);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_MINUTES;
  })();

  const admin = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - ttlMinutes * 60 * 1000).toISOString();

  // Only the card-redirect path sets `status = 'pending_payment'`. Requiring
  // `payment_status = 'pending'` guarantees no completed payment exists.
  const { data: stale, error } = await admin
    .from("bookings")
    .select(
      "id, customer_id, created_at, updated_at, customer_package_entitlement_id, rescheduled_from_booking_id",
    )
    .eq("status", "pending_payment")
    .eq("payment_status", "pending")
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    console.error("[expire-pending-payment-bookings] query failed", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const candidates =
    (stale as Array<{
      id: string;
      customer_id: string | null;
      customer_package_entitlement_id?: string | null;
      rescheduled_from_booking_id?: string | null;
    }> | null) ?? [];

  let expired = 0;
  for (const booking of candidates) {
    if (!booking.customer_id) continue;
    let released = false;
    try {
      await releaseBookingSlotAfterPaymentFailure(admin, booking.id, booking.customer_id);
      released = true;
    } catch (err) {
      console.warn("[expire-pending-payment-bookings] release failed", booking.id, err);
    }
    try {
      await returnBorrowedSessionIfReleased(admin, booking);
    } catch (sessionErr) {
      console.warn("[expire-pending-payment-bookings] borrowed session restore failed", booking.id, sessionErr);
    }
    if (!released) continue;
    const { data: saved } = await admin
      .from("bookings")
      .select("status")
      .eq("id", booking.id)
      .maybeSingle();
    if (String((saved as { status?: string | null } | null)?.status ?? "") !== "cancelled") {
      continue;
    }
    expired += 1;
    // Lifecycle §A: tell the customer their checkout did not complete and the
    // time is free again. No provider notification — they never saw it as real.
    // Push + email (the customer may have closed the app mid-checkout).
    try {
      await notifyCustomerCheckoutNotCompleted(booking.id, ["push", "email"]);
    } catch (notifyErr) {
      console.warn("[expire-pending-payment-bookings] customer notify failed", booking.id, notifyErr);
    }
  }

  const refundRetried = await retryUnfinishedPaymentFailureRefunds(admin);
  const chargeRetried = await retryFailedChargeTender(admin);
  const rollbacksRetried = await retryUnfinishedCollectibleRollbacks(admin);

  return NextResponse.json({
    ok: true,
    ttl_minutes: ttlMinutes,
    candidates: candidates.length,
    expired,
    refund_retried: refundRetried,
    charge_retried: chargeRetried,
    rollbacks_retried: rollbacksRetried,
  });
}

async function retryUnfinishedPaymentFailureRefunds(
  admin: ReturnType<typeof getSupabaseAdmin>,
): Promise<number> {
  const { data, error } = await admin
    .from("bookings")
    .select("id, customer_id, cancellation_reason")
    .eq("status", "cancelled")
    .like("cancellation_reason", `%${PAYMENT_FAILURE_REFUND_STILL_DUE}`)
    .not("cancellation_reason", "like", "Payment failed%")
    .limit(BATCH_LIMIT);
  if (error) {
    console.warn("[expire-pending-payment-bookings] refund retry query failed", error);
    return 0;
  }

  let finished = 0;
  for (const booking of (data ?? []) as Array<{
    id: string;
    customer_id: string | null;
    cancellation_reason?: string | null;
  }>) {
    if (!booking.customer_id) continue;
    const stored = String(booking.cancellation_reason ?? "");
    const baseReason = stored.endsWith(PAYMENT_FAILURE_REFUND_STILL_DUE)
      ? stored.slice(0, -PAYMENT_FAILURE_REFUND_STILL_DUE.length)
      : stored;
    try {
      const refunded = await releaseBookingSlotAfterPaymentFailure(
        admin,
        booking.id,
        booking.customer_id,
        baseReason,
      );
      if (refunded) finished += 1;
    } catch (err) {
      console.warn("[expire-pending-payment-bookings] refund retry failed", booking.id, err);
    }
  }
  return finished;
}

async function retryFailedChargeTender(
  admin: ReturnType<typeof getSupabaseAdmin>,
): Promise<number> {
  const { data, error } = await admin
    .from("bookings")
    .select(
      "id, customer_id, booking_number, tenant_id, provider_id, wallet_amount, currency, cancellation_reason",
    )
    .eq("status", "cancelled")
    .eq("payment_status", "failed")
    .eq("cancellation_reason", PAYMENT_FAILED_REFUND_STILL_DUE)
    .limit(BATCH_LIMIT);
  if (error) {
    console.warn("[expire-pending-payment-bookings] card refund retry query failed", error);
    return 0;
  }

  let finished = 0;
  for (const booking of (data ?? []) as Array<{
    id: string;
    customer_id: string | null;
    booking_number?: string | null;
    tenant_id?: string | null;
    provider_id?: string | null;
    wallet_amount?: number | null;
    currency?: string | null;
  }>) {
    if (!booking.customer_id) continue;
    try {
      const tender = await finishFailedBookingTender(
        admin,
        {
          booking_id: booking.id,
          wallet_amount_applied: Number(booking.wallet_amount ?? 0),
          currency: booking.currency ?? undefined,
        },
        {
          id: booking.id,
          customer_id: booking.customer_id,
          booking_number: booking.booking_number,
          tenant_id: booking.tenant_id,
          provider_id: booking.provider_id,
        },
      );
      if (!tender.walletDone || !tender.giftDone) continue;
      const { data: cleared } = await admin
        .from("bookings")
        .update({ cancellation_reason: "Payment failed" })
        .eq("id", booking.id)
        .eq("cancellation_reason", PAYMENT_FAILED_REFUND_STILL_DUE)
        .select("id");
      if ((cleared?.length ?? 0) > 0) finished += 1;
    } catch (err) {
      console.warn("[expire-pending-payment-bookings] card refund retry failed", booking.id, err);
    }
  }
  return finished;
}

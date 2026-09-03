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
import { releaseBookingSlotAfterPaymentFailure } from "@/app/api/public/bookings/_helpers/release-booking-slot-after-payment-failure";

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
    .select("id, customer_id, created_at, updated_at")
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
    (stale as Array<{ id: string; customer_id: string | null }> | null) ?? [];
  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, ttl_minutes: ttlMinutes, candidates: 0, expired: 0 });
  }

  let expired = 0;
  for (const booking of candidates) {
    if (!booking.customer_id) continue;
    try {
      await releaseBookingSlotAfterPaymentFailure(admin, booking.id, booking.customer_id);
      expired += 1;
    } catch (err) {
      // Best-effort: one bad row must not halt the sweep.
      console.warn("[expire-pending-payment-bookings] release failed", booking.id, err);
    }
  }

  return NextResponse.json({
    ok: true,
    ttl_minutes: ttlMinutes,
    candidates: candidates.length,
    expired,
  });
}

/**
 * GET /api/cron/expire-stale-pending-bookings
 *
 * Two paths:
 * 1. Pre-slot: customer-initiated online `pending` requests expire before the slot
 *    (confirmation SLA + hours-before-slot), with full refund. Recurring series
 *    visits (`recurring_series_id`) are excluded — they are confirmed on materialise.
 * 2. Janitor: leftover non-recurring pending bookings whose slot started >1h ago.
 *
 * Runs every 15 minutes.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyCronRequest } from "@/lib/cron-auth";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";
import { cancelPendingBookingRequest } from "@/lib/bookings/cancel-pending-booking-request";
import {
  filterDuePreSlotPendingBookings,
  groupHasConfirmedChild,
  cancelGroupPendingParticipants,
  type PendingBookingRow,
} from "@/lib/bookings/lifecycle-pending-expiry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const JOB_NAME = "expire-stale-pending-bookings";

/** Janitor fires once the slot started more than 1h ago (plan: post-slot safety net). */
const DEFAULT_TTL_HOURS = 1;
const BOOKING_BATCH_LIMIT = 200;
const GROUP_BATCH_LIMIT = 100;
const PRE_SLOT_LOOKBACK_MS = 60 * 60 * 1000;

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

  const ttlHours = (() => {
    const raw = Number(process.env.STALE_PENDING_TTL_HOURS);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_HOURS;
  })();

  const admin = getSupabaseAdmin();
  const now = new Date();
  const preSlotCutoffIso = new Date(now.getTime() - PRE_SLOT_LOOKBACK_MS).toISOString();
  const janitorCutoffIso = new Date(now.getTime() - ttlHours * 60 * 60 * 1000).toISOString();

  let preSlotExpired = 0;
  let preSlotSkipped = 0;
  let janitorExpired = 0;
  let janitorSkipped = 0;

  const { data: preSlotCandidates, error: preSlotError } = await admin
    .from("bookings")
    .select(
      "id, created_at, scheduled_at, booking_source, recurring_series_id, status, provider_id, location_id, group_booking_id, payment_status",
    )
    .eq("status", "pending")
    .eq("booking_source", "online")
    .is("recurring_series_id", null)
    .gt("scheduled_at", preSlotCutoffIso)
    .order("scheduled_at", { ascending: true })
    .limit(BOOKING_BATCH_LIMIT);

  if (preSlotError) {
    console.error("[expire-stale-pending-bookings] pre-slot query failed", preSlotError);
    return NextResponse.json({ ok: false, error: preSlotError.message }, { status: 500 });
  }

  const duePreSlot = await filterDuePreSlotPendingBookings(
    admin,
    (preSlotCandidates ?? []) as PendingBookingRow[],
    now,
  );

  const seenGroups = new Set<string>();
  for (const row of duePreSlot) {
    if (row.group_booking_id) {
      if (seenGroups.has(row.group_booking_id)) {
        preSlotSkipped += 1;
        continue;
      }
      seenGroups.add(row.group_booking_id);

      try {
        const hasConfirmed = await groupHasConfirmedChild(admin, row.group_booking_id);

        const { data: siblings } = await admin
          .from("bookings")
          .select("id, payment_status, recurring_series_id")
          .eq("group_booking_id", row.group_booking_id)
          .eq("status", "pending");

        const groupOutcome = await cancelGroupPendingParticipants(
          admin,
          row.group_booking_id,
          (siblings ?? []) as Array<{
            id: string;
            payment_status?: string | null;
            recurring_series_id?: string | null;
          }>,
          row.expireReason,
        );
        preSlotExpired += groupOutcome.expired;
        preSlotSkipped += groupOutcome.skipped;

        if (!hasConfirmed && groupOutcome.expired > 0) {
          await admin
            .from("group_bookings")
            .update({ status: "cancelled", updated_at: new Date().toISOString() })
            .eq("id", row.group_booking_id)
            .eq("status", "pending");
        }
      } catch (err) {
        console.error(
          "[expire-stale-pending-bookings] group pre-slot expiry failed",
          row.group_booking_id,
          err,
        );
        preSlotSkipped += 1;
      }
      continue;
    }

    const outcome = await cancelPendingBookingRequest(admin, row.id, {
      reason: row.expireReason,
      paymentStatus: row.payment_status,
    });
    if (outcome.ok) preSlotExpired += 1;
    else preSlotSkipped += 1;
  }

  const { data: janitorBookings, error: janitorBookingsError } = await admin
    .from("bookings")
    .select("id, payment_status, recurring_series_id")
    .eq("status", "pending")
    .is("group_booking_id", null)
    .is("recurring_series_id", null)
    .lt("scheduled_at", janitorCutoffIso)
    .order("scheduled_at", { ascending: true })
    .limit(BOOKING_BATCH_LIMIT);

  if (janitorBookingsError) {
    console.error("[expire-stale-pending-bookings] janitor query failed", janitorBookingsError);
    return NextResponse.json({ ok: false, error: janitorBookingsError.message }, { status: 500 });
  }

  for (const row of janitorBookings ?? []) {
    const booking = row as {
      id: string;
      payment_status?: string | null;
      recurring_series_id?: string | null;
    };
    if (booking.recurring_series_id) {
      janitorSkipped += 1;
      continue;
    }
    const outcome = await cancelPendingBookingRequest(admin, booking.id, {
      reason: "janitor",
      paymentStatus: booking.payment_status,
    });
    if (outcome.ok) janitorExpired += 1;
    else janitorSkipped += 1;
  }

  let janitorGroups = 0;
  let janitorGroupParticipantBookings = 0;

  const { data: janitorGroupsRows, error: janitorGroupsError } = await admin
    .from("group_bookings")
    .select("id")
    .eq("status", "pending")
    .lt("scheduled_at", janitorCutoffIso)
    .order("scheduled_at", { ascending: true })
    .limit(GROUP_BATCH_LIMIT);

  if (janitorGroupsError) {
    console.error("[expire-stale-pending-bookings] group query failed", janitorGroupsError);
  }

  for (const group of janitorGroupsRows ?? []) {
    const groupId = (group as { id: string }).id;
    try {
      const hasConfirmed = await groupHasConfirmedChild(admin, groupId);

      const { data: participantBookings, error: participantsError } = await admin
        .from("bookings")
        .select("id, payment_status, recurring_series_id")
        .eq("group_booking_id", groupId)
        .eq("status", "pending");
      if (participantsError) throw participantsError;

      const groupOutcome = await cancelGroupPendingParticipants(
        admin,
        groupId,
        (participantBookings ?? []) as Array<{
          id: string;
          payment_status?: string | null;
          recurring_series_id?: string | null;
        }>,
        "janitor",
      );
      janitorGroupParticipantBookings += groupOutcome.expired;

      if (!hasConfirmed && groupOutcome.expired > 0) {
        const { error: groupUpdateError } = await admin
          .from("group_bookings")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", groupId)
          .eq("status", "pending");
        if (groupUpdateError) throw groupUpdateError;
        janitorGroups += 1;
      }
    } catch (err) {
      console.error("[expire-stale-pending-bookings] group cancel failed", groupId, err);
    }
  }

  return NextResponse.json({
    ok: true,
    ttl_hours: ttlHours,
    pre_slot: {
      candidates: (preSlotCandidates ?? []).length,
      due: duePreSlot.length,
      expired: preSlotExpired,
      skipped: preSlotSkipped,
    },
    janitor: {
      booking_candidates: (janitorBookings ?? []).length,
      bookings_expired: janitorExpired,
      bookings_skipped: janitorSkipped,
      group_candidates: (janitorGroupsRows ?? []).length,
      groups_expired: janitorGroups,
      participant_bookings_expired: janitorGroupParticipantBookings,
    },
  });
}

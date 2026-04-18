/**
 * Wave 1.3 (audit 2026-04 final 100/100): shared reschedule engine.
 *
 * Before this module, three routes re-implemented the same 200-line
 * reschedule flow with small divergences that caused real production
 * incidents:
 *
 *   - apps/web/src/app/api/me/bookings/[id]/reschedule/route.ts   (customer)
 *   - apps/web/src/app/api/provider/bookings/[id]/reschedule/route.ts (provider)
 *   - apps/web/src/app/api/portal/booking/reschedule/route.ts     (portal)
 *
 * The portal path silently swallowed `check_reschedule_slot_conflict`
 * RPC errors (fail-open) while the customer path failed closed. It also
 * omitted the `timezone` option when calling `calculateAvailableSlots`,
 * causing SAST-tz providers to see "Slot unavailable" for perfectly
 * valid slots.
 *
 * This module centralises the whole flow so all three paths share one
 * implementation. Divergence is now impossible: there is only one place
 * to change.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import { getCancellationPolicy, canCancelBooking } from "@/lib/bookings/cancellation-policy";
import { loadAvailabilityConstraints } from "@/lib/availability/load-constraints";
import { calculateAvailableSlots } from "@/lib/availability/calculate-slots";
import { HOUSE_CALL_CONFIG } from "@/lib/config/house-call-config";
import { DEFAULT_BOOKING_DISPLAY_TIMEZONE } from "@/lib/bookings/display-invariants";

export type RescheduleActor = "customer" | "provider" | "portal";

export interface RescheduleCoreInput {
  supabase: SupabaseClient;
  adminSupabase: SupabaseClient;
  bookingId: string;
  newDatetime: Date;
  actor: RescheduleActor;
  /** UUID of the acting user, or null for portal token-based calls. */
  actorUserId: string | null;
}

export type RescheduleCoreError =
  | { kind: "NOT_FOUND"; message: string }
  | { kind: "INVALID_STATUS"; message: string }
  | { kind: "RESCHEDULE_BLOCKED"; message: string }
  | { kind: "VALIDATION_ERROR"; message: string }
  | { kind: "SLOT_UNAVAILABLE"; message: string }
  | { kind: "SLOT_CHECK_UNAVAILABLE"; message: string }
  | { kind: "SLOT_CONTENDED"; message: string }
  | { kind: "CONFLICT"; message: string }
  | { kind: "INTERNAL"; message: string; cause?: unknown };

export interface RescheduleCoreSuccess {
  booking: Record<string, unknown>;
  oldScheduledAt: string;
  newScheduledAt: string;
  providerId: string;
  providerTimezone: string;
}

export type RescheduleCoreResult =
  | ({ ok: true } & RescheduleCoreSuccess)
  | { ok: false; error: RescheduleCoreError };

type BookingRow = {
  id: string;
  provider_id: string;
  location_type: "at_salon" | "at_home";
  scheduled_at: string;
  created_at: string;
  status: string;
  customer_id?: string;
  booking_services: Array<{
    id: string;
    offering_id: string;
    staff_id: string | null;
    scheduled_start_at: string;
    scheduled_end_at: string;
    duration_minutes?: number;
    offerings: {
      buffer_minutes?: number;
      duration_minutes?: number;
    };
  }>;
};

const NON_RESCHEDULABLE_STATUSES = new Set(["completed", "cancelled", "no_show"]);

/**
 * Canonical reschedule flow. Returns a tagged result so callers can map
 * errors to their surface's preferred response shape (RESTful JSON,
 * portal error page, etc.) without ever diverging on the business logic.
 */
export async function executeReschedule(
  input: RescheduleCoreInput,
): Promise<RescheduleCoreResult> {
  const { supabase, adminSupabase, bookingId, newDatetime, actor, actorUserId } = input;

  // ── 1. Load booking with services and offering metadata.
  const { data: bookingRaw, error: bookingError } = await supabase
    .from("bookings")
    .select(
      `
        id,
        provider_id,
        location_type,
        scheduled_at,
        created_at,
        status,
        customer_id,
        booking_services (
          id,
          offering_id,
          staff_id,
          scheduled_start_at,
          scheduled_end_at,
          duration_minutes,
          offerings:offerings!booking_services_offering_id_fkey!inner(buffer_minutes, duration_minutes)
        )
      `,
    )
    .eq("id", bookingId)
    .single();

  if (bookingError || !bookingRaw) {
    return { ok: false, error: { kind: "NOT_FOUND", message: "Booking not found" } };
  }
  const booking = bookingRaw as unknown as BookingRow;

  if (NON_RESCHEDULABLE_STATUSES.has(booking.status)) {
    return {
      ok: false,
      error: {
        kind: "INVALID_STATUS",
        message: `Cannot reschedule a ${booking.status} booking`,
      },
    };
  }

  // ── 2. Cancellation / reschedule policy gate.
  const policy = await getCancellationPolicy(supabase, booking.provider_id, booking.location_type);
  if (policy) {
    const check = canCancelBooking(
      {
        id: booking.id,
        created_at: booking.created_at,
        scheduled_at: booking.scheduled_at,
        location_type: booking.location_type,
      },
      policy,
    );
    if (!check.allowed) {
      return {
        ok: false,
        error: {
          kind: "RESCHEDULE_BLOCKED",
          message: check.reason || "Rescheduling not allowed",
        },
      };
    }
  }

  const bookingServices = booking.booking_services ?? [];
  if (bookingServices.length === 0) {
    return {
      ok: false,
      error: { kind: "VALIDATION_ERROR", message: "Booking has no services" },
    };
  }

  const allStaffIds = Array.from(
    new Set(
      bookingServices
        .map((bs) => bs.staff_id)
        .filter((sid): sid is string => Boolean(sid)),
    ),
  );
  const staffId = allStaffIds[0];
  if (!staffId) {
    return {
      ok: false,
      error: { kind: "VALIDATION_ERROR", message: "Booking has no assigned staff" },
    };
  }

  let totalDuration = 0;
  bookingServices.forEach((bs) => {
    const dur = bs.duration_minutes ?? bs.offerings?.duration_minutes ?? 60;
    const buf = bs.offerings?.buffer_minutes ?? 15;
    totalDuration += dur + buf;
  });

  // ── 3. Resolve provider timezone and project wall-clock date+time.
  const { data: providerRow } = await supabase
    .from("providers")
    .select("timezone")
    .eq("id", booking.provider_id)
    .maybeSingle();
  const providerTz =
    ((providerRow as { timezone?: string | null } | null)?.timezone?.trim() ||
      DEFAULT_BOOKING_DISPLAY_TIMEZONE);

  const newDate = formatInTimeZone(newDatetime, providerTz, "yyyy-MM-dd");
  const requestedTime = formatInTimeZone(newDatetime, providerTz, "HH:mm");

  // ── 4. Availability check in provider tz.
  const constraints = await loadAvailabilityConstraints(
    supabase,
    staffId,
    newDate,
    booking.provider_id,
    {
      excludeBookingId: bookingId,
      publicCalendarParity: {
        providerId: booking.provider_id,
        date: newDate,
        locationId: undefined,
        slotStaffId: staffId,
        staffIdsForTimeOff: allStaffIds,
      },
    },
  );

  const slots = calculateAvailableSlots(constraints, totalDuration, newDate, {
    slotInterval: 15,
    travelBuffer:
      booking.location_type === "at_home"
        ? HOUSE_CALL_CONFIG.DEFAULT_TRAVEL_BUFFER_MINUTES
        : 0,
    timezone: providerTz,
  });

  const isAvailable = slots.some((slot) => slot.time === requestedTime && slot.available);
  if (!isAvailable) {
    return {
      ok: false,
      error: {
        kind: "SLOT_UNAVAILABLE",
        message: "Selected time slot is not available. Please choose another time.",
      },
    };
  }

  // ── 5. Strict conflict gate (fail-closed for ALL surfaces).
  let conflictCheck: { conflict?: boolean } | null = null;
  let conflictErrorOccurred: unknown = null;
  try {
    const { data: conflictRow, error: conflictErr } = await (
      adminSupabase.rpc as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>
    )("check_reschedule_slot_conflict", {
      p_booking_id: bookingId,
      p_staff_id: staffId,
      p_provider_id: booking.provider_id,
      p_new_start: newDatetime.toISOString(),
      p_total_minutes: totalDuration,
    });
    if (conflictErr) {
      conflictErrorOccurred = conflictErr;
    } else {
      conflictCheck = Array.isArray(conflictRow)
        ? ((conflictRow[0] as { conflict?: boolean } | null) ?? null)
        : ((conflictRow as { conflict?: boolean } | null) ?? null);
    }
  } catch (err) {
    conflictErrorOccurred = err;
  }

  if (conflictErrorOccurred) {
    // Wave 1.3: fail closed on all three surfaces (was fail-open on portal).
    // If the conflict RPC is unreachable we cannot safely guarantee the slot
    // is free, so we refuse the reschedule with a retryable 5xx.
    // eslint-disable-next-line no-console
    console.error(
      `[reschedule-core] check_reschedule_slot_conflict unavailable (actor=${actor}) — FAILING CLOSED`,
      conflictErrorOccurred,
    );
    return {
      ok: false,
      error: {
        kind: "SLOT_CHECK_UNAVAILABLE",
        message: "We could not confirm that slot is free right now. Please try again in a moment.",
      },
    };
  }

  if (conflictCheck?.conflict) {
    return {
      ok: false,
      error: {
        kind: "SLOT_CONTENDED",
        message: "That time just became unavailable. Please pick another slot.",
      },
    };
  }

  // ── 6. Optimistic row lock + booking update.
  const { data: currentRow } = await adminSupabase
    .from("bookings")
    .select("version")
    .eq("id", bookingId)
    .single();
  const currentVersion = (currentRow as { version?: number } | null)?.version ?? 0;

  const { data: updatedBooking, error: updateError } = await adminSupabase
    .from("bookings")
    .update({
      scheduled_at: newDatetime.toISOString(),
      version: currentVersion + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookingId)
    .eq("version", currentVersion)
    .select()
    .single();

  if (updateError) {
    return {
      ok: false,
      error: { kind: "INTERNAL", message: updateError.message, cause: updateError },
    };
  }

  if (!updatedBooking) {
    return {
      ok: false,
      error: {
        kind: "CONFLICT",
        message: "This booking was updated by someone else. Please try again.",
      },
    };
  }

  // ── 7. Cascade new times to booking_services.
  let cursor = newDatetime;
  for (const bs of bookingServices) {
    const start = new Date(cursor);
    const duration = bs.duration_minutes ?? bs.offerings?.duration_minutes ?? 60;
    const end = new Date(start.getTime() + duration * 60000);
    const buffer = bs.offerings?.buffer_minutes ?? 15;

    const { error } = await adminSupabase
      .from("booking_services")
      .update({
        scheduled_start_at: start.toISOString(),
        scheduled_end_at: end.toISOString(),
      })
      .eq("id", bs.id);

    if (error) {
      return {
        ok: false,
        error: { kind: "INTERNAL", message: error.message, cause: error },
      };
    }

    cursor = new Date(end.getTime() + buffer * 60000);
  }

  // ── 8. Audit event.
  try {
    await adminSupabase.from("booking_events").insert({
      booking_id: bookingId,
      event_type: "rescheduled",
      event_data: {
        old_datetime: booking.scheduled_at,
        new_datetime: newDatetime.toISOString(),
        rescheduled_via: actor,
        rescheduled_by: actorUserId,
      },
      ...(actorUserId ? { created_by: actorUserId } : {}),
    });
  } catch (eventErr) {
    // Audit event is best-effort; do not fail the reschedule.
    // eslint-disable-next-line no-console
    console.warn("[reschedule-core] booking_event insert failed:", eventErr);
  }

  return {
    ok: true,
    booking: updatedBooking as Record<string, unknown>,
    oldScheduledAt: booking.scheduled_at,
    newScheduledAt: newDatetime.toISOString(),
    providerId: booking.provider_id,
    providerTimezone: providerTz,
  };
}

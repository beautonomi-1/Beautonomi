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
 *
 * SAST / ZA tenants: when a client sends a local calendar date without an
 * explicit IANA zone (e.g. some mobile flows), treat device-local wall time
 * as equivalent to `Africa/Johannesburg` for South Africa–based tenants only
 * after `normalizeProviderTimezone` has pinned the provider row. Any UTC
 * conversion must still go through explicit provider tz + `toIsoUtcTimestamp`
 * on the server; do not assume device tz matches the salon.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import {
  getCancellationPolicy,
  canCancelBooking,
  type CancellationPolicy,
} from "@/lib/bookings/cancellation-policy";
import {
  mergeEffectiveCancellationPolicy,
  snapshotFromJson,
} from "@/lib/bookings/effective-cancellation-policy";
import {
  BLOCKED_STAGES,
  SELF_CANCEL_BLOCKED_STATUSES,
} from "@/lib/bookings/resolve-cancellation-outcome";
import { resolveEffectiveBookingLifecycleStatus } from "@beautonomi/utils";
import { loadAvailabilityConstraints } from "@/lib/availability/load-constraints";
import { calculateAvailableSlots } from "@/lib/availability/calculate-slots";
import { HOUSE_CALL_CONFIG } from "@/lib/config/house-call-config";
import { DEFAULT_BOOKING_DISPLAY_TIMEZONE } from "@/lib/bookings/display-invariants";
import { normalizeProviderTimezone } from "@/lib/availability/time-utils";

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

export type CustomerRescheduleCode =
  | "CUSTOMER_RESCHEDULE_STATUS"
  | "CUSTOMER_RESCHEDULE_UNPAID"
  | "CUSTOMER_RESCHEDULE_JOURNEY"
  | "CUSTOMER_RESCHEDULE_STARTED"
  | "CUSTOMER_RESCHEDULE_CUTOFF";

export type CustomerReschedulePayload = {
  allowed: boolean;
  code?: CustomerRescheduleCode;
  hours_before?: number;
  /** Server message for cutoff denials (from `canCancelBooking`). */
  block_message?: string;
};

export type EvaluateCustomerRescheduleInput = {
  status: string;
  payment_status?: string | null;
  current_stage?: string | null;
  created_at: string;
  scheduled_at: string;
  location_type: "at_salon" | "at_home";
  cancellation_policy_snapshot?: unknown;
  id?: string;
};

export type RescheduleCoreError =
  | { kind: "NOT_FOUND"; message: string }
  | { kind: "INVALID_STATUS"; message: string }
  | {
      kind: "RESCHEDULE_BLOCKED";
      message: string;
      code?: CustomerRescheduleCode;
    }
  | { kind: "VALIDATION_ERROR"; message: string }
  | { kind: "SLOT_UNAVAILABLE"; message: string }
  | { kind: "SLOT_CHECK_UNAVAILABLE"; message: string }
  | { kind: "SLOT_CONTENDED"; message: string }
  | { kind: "CONFLICT"; message: string }
  | { kind: "INTERNAL"; message: string; cause?: unknown };

export interface RescheduleCoreSuccess {
  ok: true;
  booking: Record<string, unknown>;
  oldScheduledAt: string;
  newScheduledAt: string;
  providerId: string;
  providerTimezone: string;
}

export interface RescheduleCoreFailure {
  ok: false;
  error: RescheduleCoreError;
}

export type RescheduleCoreResult = RescheduleCoreSuccess | RescheduleCoreFailure;

/**
 * §Cross-app audit 2026-04 (reschedule unification): canonical HTTP mapping
 * for every failure kind `executeReschedule` can return. Route handlers can
 * call this to keep status codes + error codes consistent across the
 * customer, provider, and portal surfaces without re-inventing the table.
 */
export function httpStatusForRescheduleError(err: RescheduleCoreError): {
  status: number;
  code: string;
} {
  switch (err.kind) {
    case "NOT_FOUND":
      return { status: 404, code: "NOT_FOUND" };
    case "INVALID_STATUS":
      return { status: 400, code: "INVALID_STATUS" };
    case "RESCHEDULE_BLOCKED":
      return { status: 403, code: "RESCHEDULE_BLOCKED" };
    case "VALIDATION_ERROR":
      return { status: 400, code: "VALIDATION_ERROR" };
    case "SLOT_UNAVAILABLE":
      return { status: 409, code: "SLOT_UNAVAILABLE" };
    case "SLOT_CHECK_UNAVAILABLE":
      return { status: 503, code: "SLOT_CHECK_UNAVAILABLE" };
    case "SLOT_CONTENDED":
      return { status: 409, code: "SLOT_CONTENDED" };
    case "CONFLICT":
      return { status: 409, code: "CONFLICT" };
    case "INTERNAL":
      return { status: 500, code: "INTERNAL" };
  }
}

type BookingRow = {
  id: string;
  provider_id: string;
  location_type: "at_salon" | "at_home";
  scheduled_at: string;
  created_at: string;
  status: string;
  payment_status?: string | null;
  current_stage?: string | null;
  cancellation_policy_snapshot?: unknown;
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

/** Provider PATCH reschedule guard — includes in_progress (service already started). */
export const PROVIDER_PATCH_NON_RESCHEDULABLE_STATUSES = new Set([
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
]);

/** Terminal/closed statuses where service line edits are blocked. */
export const BOOKING_SERVICE_EDIT_LOCKED_STATUSES = new Set(["completed", "cancelled", "no_show"]);

export function messageForCustomerRescheduleBlock(
  result: Exclude<CustomerReschedulePayload, { allowed: true }> & { allowed: false },
): string {
  switch (result.code) {
    case "CUSTOMER_RESCHEDULE_STATUS":
      return "Your appointment can no longer be rescheduled online — contact the provider or support.";
    case "CUSTOMER_RESCHEDULE_UNPAID":
      return "Complete payment for this booking before rescheduling.";
    case "CUSTOMER_RESCHEDULE_JOURNEY":
      return "Your provider is already on the way or the service has started — contact them to change the time.";
    case "CUSTOMER_RESCHEDULE_STARTED":
      return "Your appointment has started or passed — contact the provider or support.";
    case "CUSTOMER_RESCHEDULE_CUTOFF":
      return (
        result.block_message ??
        `Changes must be made at least ${result.hours_before ?? 24} hours before the appointment. Please contact the provider.`
      );
    default:
      return "Rescheduling not allowed. Please contact the provider.";
  }
}

/** Shared customer / portal reschedule eligibility (same statuses, stages, and policy merge as cancel). */
export function evaluateCustomerReschedule(
  booking: EvaluateCustomerRescheduleInput,
  livePolicy: CancellationPolicy | null,
  now: Date = new Date(),
): CustomerReschedulePayload {
  const rawStatus = String(booking.status ?? "").toLowerCase();
  const status = rawStatus === "started" ? "in_progress" : rawStatus;

  if (SELF_CANCEL_BLOCKED_STATUSES.has(status)) {
    return { allowed: false, code: "CUSTOMER_RESCHEDULE_STATUS" };
  }

  const effectiveStatus = resolveEffectiveBookingLifecycleStatus({
    status: booking.status,
    paymentStatus: booking.payment_status,
  });
  if (effectiveStatus === "pending_payment") {
    return { allowed: false, code: "CUSTOMER_RESCHEDULE_UNPAID" };
  }

  const stage = (booking.current_stage ?? "").toLowerCase();
  if (stage && BLOCKED_STAGES.has(stage)) {
    return { allowed: false, code: "CUSTOMER_RESCHEDULE_JOURNEY" };
  }

  const scheduledAt = new Date(booking.scheduled_at);
  if (now >= scheduledAt) {
    return { allowed: false, code: "CUSTOMER_RESCHEDULE_STARTED" };
  }

  const snapshot = snapshotFromJson(booking.cancellation_policy_snapshot);
  const hasPolicySource = livePolicy != null || snapshot != null;
  if (!hasPolicySource) {
    return { allowed: true };
  }

  const merged = mergeEffectiveCancellationPolicy(snapshot, livePolicy);
  const check = canCancelBooking(
    {
      id: booking.id ?? "",
      created_at: booking.created_at,
      scheduled_at: booking.scheduled_at,
      location_type: booking.location_type,
    },
    merged,
    now,
  );
  if (!check.allowed) {
    return {
      allowed: false,
      code: "CUSTOMER_RESCHEDULE_CUTOFF",
      hours_before: merged.hours_before_cutoff,
      block_message: check.reason,
    };
  }

  return { allowed: true, hours_before: merged.hours_before_cutoff };
}

export async function evaluateCustomerRescheduleWithLivePolicy(
  supabase: SupabaseClient,
  providerId: string,
  booking: EvaluateCustomerRescheduleInput,
  now?: Date,
): Promise<CustomerReschedulePayload> {
  const live = await getCancellationPolicy(supabase, providerId, booking.location_type);
  return evaluateCustomerReschedule(booking, live, now);
}

export function toCustomerRescheduleApiField(result: CustomerReschedulePayload): {
  allowed: boolean;
  code?: CustomerRescheduleCode;
  hours_before?: number;
} {
  return {
    allowed: result.allowed,
    ...(result.code ? { code: result.code } : {}),
    ...(result.hours_before != null ? { hours_before: result.hours_before } : {}),
  };
}

type GroupChildForReschedule = EvaluateCustomerRescheduleInput & {
  provider_id: string;
  status: string;
};

export async function evaluateGroupCustomerReschedule(
  supabase: SupabaseClient,
  groupStatus: string,
  children: GroupChildForReschedule[],
  now?: Date,
): Promise<CustomerReschedulePayload> {
  const gs = String(groupStatus ?? "").toLowerCase();
  if (gs === "cancelled" || gs === "completed") {
    return { allowed: false, code: "CUSTOMER_RESCHEDULE_STATUS" };
  }

  const policyCache = new Map<string, CancellationPolicy | null>();
  for (const child of children) {
    const childStatus = String(child.status ?? "").toLowerCase();
    if (childStatus === "cancelled") continue;

    const cacheKey = `${child.provider_id}:${child.location_type}`;
    let live = policyCache.get(cacheKey);
    if (live === undefined) {
      live = await getCancellationPolicy(supabase, child.provider_id, child.location_type);
      policyCache.set(cacheKey, live);
    }

    const result = evaluateCustomerReschedule(child, live, now);
    if (!result.allowed) return result;
  }

  return { allowed: true };
}

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
        payment_status,
        current_stage,
        cancellation_policy_snapshot,
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

  if (actor === "customer" || actor === "portal") {
    const livePolicy = await getCancellationPolicy(
      supabase,
      booking.provider_id,
      booking.location_type,
    );
    const eligibility = evaluateCustomerReschedule(
      {
        id: booking.id,
        status: booking.status,
        payment_status: booking.payment_status,
        current_stage: booking.current_stage,
        created_at: booking.created_at,
        scheduled_at: booking.scheduled_at,
        location_type: booking.location_type,
        cancellation_policy_snapshot: booking.cancellation_policy_snapshot,
      },
      livePolicy,
    );
    if (!eligibility.allowed) {
      const blocked = eligibility as CustomerReschedulePayload & { allowed: false };
      return {
        ok: false,
        error: {
          kind: "RESCHEDULE_BLOCKED",
          message: messageForCustomerRescheduleBlock(blocked),
          code: blocked.code,
        },
      };
    }
  } else {
    if (NON_RESCHEDULABLE_STATUSES.has(booking.status)) {
      return {
        ok: false,
        error: {
          kind: "INVALID_STATUS",
          message: `Cannot reschedule a ${booking.status} booking`,
        },
      };
    }

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
    const buf = bs.offerings?.buffer_minutes ?? 0;
    totalDuration += dur + buf;
  });

  // ── 3. Resolve provider timezone and project wall-clock date+time.
  const { data: providerRow } = await supabase
    .from("providers")
    .select("timezone")
    .eq("id", booking.provider_id)
    .maybeSingle();
  // §Launch-audit 2026-04-18: normalise the stored tz before handing it
  // to `formatInTimeZone`, which would otherwise throw on legacy
  // offset-style values like "GMT+2" (see supabase migration 511).
  const rawProviderTz =
    (providerRow as { timezone?: string | null } | null)?.timezone ?? null;
  const providerTz =
    normalizeProviderTimezone(rawProviderTz) ?? DEFAULT_BOOKING_DISPLAY_TIMEZONE;
  if (rawProviderTz && !normalizeProviderTimezone(rawProviderTz)) {
    // eslint-disable-next-line no-console
    console.warn(
      `[reschedule-core] provider ${booking.provider_id} has unparseable timezone "${rawProviderTz}" — falling back to ${DEFAULT_BOOKING_DISPLAY_TIMEZONE}`,
    );
  }

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
        providerTimeZone: providerTz,
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
    // §Launch-audit 2026-04: fail-closed was turning "migration 503 not yet
    // applied" (or any transient PostgREST hiccup) into a global
    // reschedule outage on provider + portal. Detect "function does not
    // exist" specifically and degrade to an in-query overlap check instead
    // of locking up real customers. Any *other* RPC error still fails
    // closed, keeping the double-book guard intact.
    const errAsRecord = conflictErrorOccurred as { code?: string; message?: string };
    const code = errAsRecord?.code ?? "";
    const msg = (errAsRecord?.message ?? "").toLowerCase();
    const missingFn =
      code === "42883" ||
      code === "PGRST202" ||
      msg.includes("does not exist") ||
      msg.includes("could not find the function");

    if (missingFn) {
      // eslint-disable-next-line no-console
      console.warn(
        `[reschedule-core] check_reschedule_slot_conflict RPC missing (actor=${actor}) — ` +
          "falling back to overlap check. Apply migration 503 to restore advisory-lock protection.",
        conflictErrorOccurred,
      );

      const windowEnd = new Date(
        newDatetime.getTime() + totalDuration * 60_000,
      ).toISOString();

      const { data: overlapRows, error: overlapErr } = await adminSupabase
        .from("booking_services")
        .select("id, booking_id, booking:bookings!inner(id, status)")
        .eq("staff_id", staffId)
        .neq("booking_id", bookingId)
        .lt("scheduled_start_at", windowEnd)
        .gt("scheduled_end_at", newDatetime.toISOString());

      if (overlapErr) {
        // eslint-disable-next-line no-console
        console.error(
          `[reschedule-core] fallback overlap check failed (actor=${actor}) — FAILING CLOSED`,
          overlapErr,
        );
        return {
          ok: false,
          error: {
            kind: "SLOT_CHECK_UNAVAILABLE",
            message:
              "We could not confirm that slot is free right now. Please try again in a moment.",
          },
        };
      }

      type OverlapRow = {
        booking?: { status?: string | null } | { status?: string | null }[] | null;
      };
      const liveOverlap = ((overlapRows ?? []) as OverlapRow[]).some((row) => {
        const b = Array.isArray(row.booking) ? row.booking[0] : row.booking;
        const status = b?.status ?? null;
        return status !== "cancelled" && status !== "no_show" && status !== "completed";
      });

      if (liveOverlap) {
        return {
          ok: false,
          error: {
            kind: "SLOT_CONTENDED",
            message: "That time just became unavailable. Please pick another slot.",
          },
        };
      }
      // overlap check clean → fall through to optimistic update below.
    } else {
      // eslint-disable-next-line no-console
      console.error(
        `[reschedule-core] check_reschedule_slot_conflict unavailable (actor=${actor}) — FAILING CLOSED`,
        conflictErrorOccurred,
      );
      return {
        ok: false,
        error: {
          kind: "SLOT_CHECK_UNAVAILABLE",
          message:
            "We could not confirm that slot is free right now. Please try again in a moment.",
        },
      };
    }
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

  const bookingUpdate: Record<string, unknown> = {
    scheduled_at: newDatetime.toISOString(),
    version: currentVersion + 1,
    updated_at: new Date().toISOString(),
  };
  if (actor === "provider") {
    bookingUpdate.provider_rescheduled_at = new Date().toISOString();
  }

  const { data: updatedBooking, error: updateError } = await adminSupabase
    .from("bookings")
    .update(bookingUpdate)
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
    const buffer = bs.offerings?.buffer_minutes ?? 0;

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

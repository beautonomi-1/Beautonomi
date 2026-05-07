import type { SupabaseClient } from "@supabase/supabase-js";
import { checkBookingConflict, checkBookingConflictForProvider, checkActiveHoldOverlap } from "@/lib/bookings/conflict-check";
import { isProviderCalendarWindowBlocked } from "@/lib/public-booking/provider-calendar-block-overlap";

/**
 * Re-check staff calendar conflicts, active holds, AND calendar blocks (time
 * blocks, availability blocks, PTO) before charging. Returns
 * SLOT_NO_LONGER_AVAILABLE when another booking/hold now blocks the window or a
 * provider calendar block has been added since the slot was originally shown.
 *
 * This is the last gate before payment — any unhandled error fails safe
 * (returns SLOT_NO_LONGER_AVAILABLE) because there is no downstream RPC lock
 * to catch missed conflicts.
 */
export async function revalidateBookingSlotBeforePayment(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<{ ok: true } | { ok: false; message: string; code: "SLOT_NO_LONGER_AVAILABLE" }> {
  try {
    return await _revalidateBookingSlotBeforePaymentInner(supabase, bookingId);
  } catch (err) {
    console.error("[revalidateBookingSlotBeforePayment] unexpected error — failing safe:", err);
    return {
      ok: false,
      code: "SLOT_NO_LONGER_AVAILABLE",
      message: "Unable to verify slot availability. Please try again.",
    };
  }
}

async function _revalidateBookingSlotBeforePaymentInner(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<{ ok: true } | { ok: false; message: string; code: "SLOT_NO_LONGER_AVAILABLE" }> {
  const [servicesResult, bookingResult] = await Promise.all([
    supabase
      .from("booking_services")
      .select("staff_id, scheduled_start_at, scheduled_end_at")
      .eq("booking_id", bookingId)
      .order("scheduled_start_at", { ascending: true }),
    supabase
      .from("bookings")
      .select("provider_id, location_id, hold_id")
      .eq("id", bookingId)
      .maybeSingle(),
  ]);

  const { data: rows, error } = servicesResult;
  const { data: booking } = bookingResult;

  if (error || !rows?.length) {
    return {
      ok: false,
      code: "SLOT_NO_LONGER_AVAILABLE",
      message: "This booking is no longer valid. Please start again.",
    };
  }

  type Row = { staff_id: string | null; scheduled_start_at: string; scheduled_end_at: string };
  const typedRows = rows as Row[];
  const first = typedRows[0];
  const last = typedRows[typedRows.length - 1];

  const overallStart = new Date(first.scheduled_start_at);
  const overallEnd = new Date(last.scheduled_end_at);
  const bookingRow = booking as { provider_id?: string; location_id?: string | null; hold_id?: string | null } | null;
  const providerId = bookingRow?.provider_id as string | undefined;
  /** Exclude the hold tied to this booking so pre-payment checks never false-positive on the customer's own lease. */
  let excludeHoldId: string | undefined =
    typeof bookingRow?.hold_id === "string" && bookingRow.hold_id.length > 0 ? bookingRow.hold_id : undefined;
  if (!excludeHoldId && providerId) {
    const { data: holdRows } = await supabase
      .from("booking_holds")
      .select("id, metadata")
      .eq("provider_id", providerId)
      .in("hold_status", ["active", "consuming"])
      .limit(25);
    const linked = (holdRows ?? []).find((h: { id?: string; metadata?: unknown }) => {
      const m = h?.metadata;
      return (
        m &&
        typeof m === "object" &&
        !Array.isArray(m) &&
        (m as { booking_id?: string }).booking_id === bookingId
      );
    });
    const hid = linked?.id;
    if (typeof hid === "string" && hid.length > 0) excludeHoldId = hid;
  }

  // Check other customers' active holds against the full booking window
  if (providerId) {
    const uniqueStaffIds = [...new Set(typedRows.map((r) => r.staff_id).filter(Boolean))] as string[];
    for (const sid of uniqueStaffIds.length > 0 ? uniqueStaffIds : [undefined]) {
      const holdOverlap = await checkActiveHoldOverlap(
        supabase,
        providerId,
        overallStart,
        overallEnd,
        { dbStaffId: sid ?? null, excludeHoldId },
      );
      if (holdOverlap) {
        console.warn(
          "[revalidateBookingSlotBeforePayment] Hold overlap detected before charge",
          { bookingId, staffId: sid, startAt: overallStart.toISOString(), endAt: overallEnd.toISOString() },
        );
        return {
          ok: false,
          code: "SLOT_NO_LONGER_AVAILABLE",
          message: "This time slot is no longer available. Please choose another time.",
        };
      }
    }
  }

  // Per-segment conflict checks: each service line is validated against its
  // own staff member's calendar, supporting multi-staff bookings correctly.
  for (const row of typedRows) {
    const segStart = new Date(row.scheduled_start_at);
    const segEnd = new Date(row.scheduled_end_at);

    if (row.staff_id) {
      const { hasConflict } = await checkBookingConflict(
        supabase,
        row.staff_id,
        segStart,
        segEnd,
        0,
        bookingId,
      );
      if (hasConflict) {
        return {
          ok: false,
          code: "SLOT_NO_LONGER_AVAILABLE",
          message: "This time slot is no longer available. Please choose another time.",
        };
      }
    } else if (providerId) {
      const { hasConflict } = await checkBookingConflictForProvider(
        supabase,
        providerId,
        segStart,
        segEnd,
        0,
        bookingId,
      );
      if (hasConflict) {
        return {
          ok: false,
          code: "SLOT_NO_LONGER_AVAILABLE",
          message: "This time slot is no longer available. Please choose another time.",
        };
      }
    }
  }

  // Per-segment calendar block checks
  if (providerId) {
    const checkedStaffIds = new Set<string | undefined>();
    for (const row of typedRows) {
      const staffKey = row.staff_id ?? undefined;
      if (checkedStaffIds.has(staffKey)) continue;
      checkedStaffIds.add(staffKey);

      const segStart = new Date(row.scheduled_start_at);
      const segEnd = new Date(row.scheduled_end_at);
      const { blocked, reason } = await isProviderCalendarWindowBlocked(supabase, {
        providerId,
        locationId: bookingRow?.location_id ?? undefined,
        staffId: staffKey,
        startAt: segStart,
        endAt: segEnd,
      });

      if (blocked) {
        console.warn(
          "[revalidateBookingSlotBeforePayment] Calendar block detected",
          { bookingId, staffId: staffKey, reason, startAt: segStart.toISOString(), endAt: segEnd.toISOString() },
        );
        return {
          ok: false,
          code: "SLOT_NO_LONGER_AVAILABLE",
          message: "This time slot is no longer available. Please choose another time.",
        };
      }
    }
  }

  return { ok: true };
}

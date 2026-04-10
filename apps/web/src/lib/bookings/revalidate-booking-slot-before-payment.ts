import type { SupabaseClient } from "@supabase/supabase-js";
import { checkBookingConflict } from "@/lib/bookings/conflict-check";
import { isProviderCalendarWindowBlocked } from "@/lib/public-booking/provider-calendar-block-overlap";

/**
 * Re-check staff calendar conflicts AND calendar blocks (time blocks, availability
 * blocks, PTO) before charging. Returns SLOT_NO_LONGER_AVAILABLE when another
 * booking/hold now blocks the window or a provider calendar block has been added
 * since the slot was originally shown.
 */
export async function revalidateBookingSlotBeforePayment(
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
      .select("provider_id, location_id")
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
  const first = rows[0] as Row;
  const last = rows[rows.length - 1] as Row;

  if (!first.staff_id) {
    return { ok: true };
  }

  const startAt = new Date(first.scheduled_start_at);
  const endAt = new Date(last.scheduled_end_at);

  const { hasConflict } = await checkBookingConflict(
    supabase,
    first.staff_id,
    startAt,
    endAt,
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

  if (booking?.provider_id) {
    const { blocked, reason } = await isProviderCalendarWindowBlocked(supabase, {
      providerId: booking.provider_id,
      locationId: booking.location_id ?? undefined,
      staffId: first.staff_id,
      startAt,
      endAt,
    });

    if (blocked) {
      console.warn(
        "[revalidateBookingSlotBeforePayment] Calendar block detected",
        { bookingId, reason, startAt: startAt.toISOString(), endAt: endAt.toISOString() },
      );
      return {
        ok: false,
        code: "SLOT_NO_LONGER_AVAILABLE",
        message: "This time slot is no longer available. Please choose another time.",
      };
    }
  }

  return { ok: true };
}

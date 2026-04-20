/**
 * Keep `booking_services.scheduled_*` aligned with `bookings.scheduled_at` when
 * providers PATCH a new start time (calendar drag, reschedule dialog, etc.).
 * Chains multiple services back-to-back from a single anchor instant.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type RescheduleSequentialOptions = {
  /** When provided, set `staff_id` on every row (use `null` to unassign all). When omitted, leave each row's staff unchanged. */
  staffId?: string | null;
};

/**
 * Total wall-clock span from anchor through all service durations (minutes).
 */
export function computeSequentialServiceWindow(
  anchorStartIso: string,
  durationMinutesList: number[],
): { start: Date; end: Date; totalMinutes: number } {
  const start = new Date(anchorStartIso);
  if (!Number.isFinite(start.getTime())) {
    throw new Error("Invalid anchorStartIso for computeSequentialServiceWindow");
  }
  const totalMinutes = durationMinutesList.reduce(
    (sum, d) => sum + Math.max(1, Number(d) || 60),
    0,
  );
  const end = new Date(start.getTime() + totalMinutes * 60 * 1000);
  return { start, end, totalMinutes };
}

/**
 * Recompute `scheduled_start_at` / `scheduled_end_at` for each `booking_services` row
 * in `scheduled_start_at` order: first row starts at `anchorStartIso`, each next row
 * starts when the previous ends (duration from `duration_minutes`).
 *
 * Optionally applies one `staff_id` to every row (calendar drag to another staff).
 */
export async function rescheduleBookingServicesSequential(
  supabase: SupabaseClient,
  bookingId: string,
  anchorStartIso: string,
  options?: RescheduleSequentialOptions,
): Promise<void> {
  const { data: rows, error: fetchErr } = await supabase
    .from("booking_services")
    .select("id, duration_minutes")
    .eq("booking_id", bookingId)
    .order("scheduled_start_at", { ascending: true });

  if (fetchErr) throw fetchErr;
  if (!rows?.length) return;

  let cursor = new Date(anchorStartIso).getTime();
  if (!Number.isFinite(cursor)) {
    throw new Error("Invalid anchorStartIso for rescheduleBookingServicesSequential");
  }

  const applyStaffToAllRows =
    options !== undefined && Object.prototype.hasOwnProperty.call(options, "staffId");

  for (const row of rows) {
    const dur = Math.max(1, Number(row.duration_minutes) || 60);
    const startIso = new Date(cursor).toISOString();
    const endIso = new Date(cursor + dur * 60 * 1000).toISOString();
    const patch: Record<string, unknown> = {
      scheduled_start_at: startIso,
      scheduled_end_at: endIso,
    };
    if (applyStaffToAllRows) {
      patch.staff_id = options!.staffId ?? null;
    }
    const { error: upErr } = await supabase.from("booking_services").update(patch).eq("id", row.id);
    if (upErr) throw upErr;
    cursor += dur * 60 * 1000;
  }
}

/**
 * Set the same `staff_id` on every `booking_services` row for a booking (no time change).
 */
export async function updateAllBookingServicesStaff(
  supabase: SupabaseClient,
  bookingId: string,
  staffId: string | null,
): Promise<void> {
  const { error } = await supabase.from("booking_services").update({ staff_id: staffId }).eq("booking_id", bookingId);
  if (error) throw error;
}

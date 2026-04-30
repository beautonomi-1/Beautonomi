import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Get tips allocated to each staff for a date range.
 * Uses booking_tip_allocations joined with bookings (scheduled_at in range).
 */
export async function getTipsByStaff(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  periodStart: Date,
  periodEnd: Date,
  locationId?: string | null
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  type BookingRow = { id: string };
  let bookingsQuery = supabaseAdmin
    .from("bookings")
    .select("id")
    .eq("provider_id", providerId)
    .gte("scheduled_at", periodStart.toISOString())
    .lte("scheduled_at", periodEnd.toISOString());
  if (locationId) {
    bookingsQuery = bookingsQuery.eq("location_id", locationId);
  }
  const { data: bookingsInRange } = await bookingsQuery;

  const bookingIds = ((bookingsInRange ?? []) as BookingRow[]).map((b) => b.id).filter(Boolean);
  if (bookingIds.length === 0) return result;

  const chunkSize = 200;
  type AllocationRow = { booking_id: string; staff_id: string; amount?: number };

  for (let i = 0; i < bookingIds.length; i += chunkSize) {
    const chunk = bookingIds.slice(i, i + chunkSize);
    const { data: allocations } = await supabaseAdmin
      .from("booking_tip_allocations")
      .select("booking_id, staff_id, amount")
      .in("booking_id", chunk);

    for (const a of (allocations ?? []) as AllocationRow[]) {
      const amt = Number(a.amount ?? 0);
      if (amt > 0 && a.staff_id) {
        result.set(a.staff_id, (result.get(a.staff_id) || 0) + amt);
      }
    }
  }

  return result;
}

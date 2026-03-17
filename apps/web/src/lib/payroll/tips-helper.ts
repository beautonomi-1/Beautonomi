import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Get tips allocated to each staff for a date range.
 * Uses booking_tip_allocations joined with bookings (scheduled_at in range).
 */
export async function getTipsByStaff(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  const { data: allAllocations } = await supabaseAdmin
    .from("booking_tip_allocations")
    .select("booking_id, staff_id, amount");

  type AllocationRow = { booking_id: string; staff_id: string; amount?: number };
  type BookingRow = { id: string };
  if (!allAllocations?.length) return result;

  const allocationRows = allAllocations as AllocationRow[];
  const bookingIds = [...new Set(allocationRows.map((a) => a.booking_id))];
  const { data: bookings } = await supabaseAdmin
    .from("bookings")
    .select("id, scheduled_at, provider_id")
    .eq("provider_id", providerId)
    .in("id", bookingIds)
    .gte("scheduled_at", periodStart.toISOString())
    .lte("scheduled_at", periodEnd.toISOString());

  const bookingIdSet = new Set(((bookings ?? []) as BookingRow[]).map((b) => b.id));

  for (const a of allocationRows) {
    if (!bookingIdSet.has(a.booking_id)) continue;
    const amt = Number(a.amount ?? 0);
    if (amt > 0) {
      result.set(a.staff_id, (result.get(a.staff_id) || 0) + amt);
    }
  }

  return result;
}

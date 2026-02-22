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

  if (!allAllocations?.length) return result;

  const bookingIds = [...new Set(allAllocations.map((a: any) => a.booking_id))];
  const { data: bookings } = await supabaseAdmin
    .from("bookings")
    .select("id, scheduled_at, provider_id")
    .eq("provider_id", providerId)
    .in("id", bookingIds)
    .gte("scheduled_at", periodStart.toISOString())
    .lte("scheduled_at", periodEnd.toISOString());

  const bookingIdSet = new Set((bookings || []).map((b: any) => b.id));

  for (const a of allAllocations as any[]) {
    if (!bookingIdSet.has(a.booking_id)) continue;
    const amt = Number(a.amount || 0);
    if (amt > 0) {
      result.set(a.staff_id, (result.get(a.staff_id) || 0) + amt);
    }
  }

  return result;
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingRefundSummary } from "./booking-refund-context";

export async function fetchBookingRefundsForBookingIds(
  supabase: SupabaseClient,
  bookingIds: string[],
): Promise<Map<string, BookingRefundSummary[]>> {
  const map = new Map<string, BookingRefundSummary[]>();
  if (bookingIds.length === 0) return map;

  const uniqueIds = [...new Set(bookingIds.filter(Boolean))];
  const chunkSize = 100;

  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("booking_refunds")
      .select(
        "id, booking_id, amount, reason, refund_method, status, notes, created_at, created_by",
      )
      .in("booking_id", chunk)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    for (const row of (data ?? []) as BookingRefundSummary[]) {
      const id = String(row.booking_id);
      const list = map.get(id) ?? [];
      list.push(row);
      map.set(id, list);
    }
  }

  return map;
}

export function extractBookingIdsFromRefundRows(
  rows: Array<{ booking_id?: string | null; booking?: unknown }>,
): string[] {
  const ids: string[] = [];
  for (const row of rows) {
    if (row.booking_id) {
      ids.push(String(row.booking_id));
      continue;
    }
    const booking = row.booking;
    if (booking && typeof booking === "object" && "id" in booking) {
      const id = (booking as { id?: string }).id;
      if (id) ids.push(String(id));
    }
  }
  return ids;
}

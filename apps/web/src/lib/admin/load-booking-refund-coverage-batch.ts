import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadBookingRefundCoverage,
  type BookingRefundCoverage,
} from "@/lib/admin/booking-refund-coverage";

export async function loadBookingRefundCoverageBatch(
  supabase: SupabaseClient,
  bookingIds: string[],
): Promise<Map<string, BookingRefundCoverage>> {
  const map = new Map<string, BookingRefundCoverage>();
  const unique = [...new Set(bookingIds.filter(Boolean))];
  await Promise.all(
    unique.map(async (bookingId) => {
      const coverage = await loadBookingRefundCoverage(supabase, bookingId);
      map.set(bookingId, coverage);
    }),
  );
  return map;
}

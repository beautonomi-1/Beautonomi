import type { SupabaseClient } from "@supabase/supabase-js";
import { tillPaymentKindForBooking, type TillPaymentKind, type TillPaymentRow } from "@beautonomi/utils";

export async function fetchTillPaymentKindsByBookingId(
  supabase: SupabaseClient,
  bookingIds: string[],
): Promise<Map<string, TillPaymentKind>> {
  const out = new Map<string, TillPaymentKind>();
  const ids = [...new Set(bookingIds.filter(Boolean))];
  if (ids.length === 0) return out;

  const { data: rows, error } = await supabase
    .from("booking_payments")
    .select("booking_id, payment_method, payment_provider, status, payment_provider_data, created_at")
    .in("booking_id", ids);

  if (error || !rows?.length) return out;

  const byBooking = new Map<string, TillPaymentRow[]>();
  for (const row of rows as Array<TillPaymentRow & { booking_id?: string }>) {
    const bid = String(row.booking_id ?? "");
    if (!bid) continue;
    const list = byBooking.get(bid) ?? [];
    list.push(row);
    byBooking.set(bid, list);
  }

  for (const [bid, list] of byBooking) {
    const kind = tillPaymentKindForBooking(list);
    if (kind) out.set(bid, kind);
  }

  return out;
}

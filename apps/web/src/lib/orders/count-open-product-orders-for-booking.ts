import { countOpenAppointmentProductOrders } from "@beautonomi/utils";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Open appointment product orders for a booking after completion (non-blocking warning). */
export async function countOpenProductOrdersForBooking(
  admin: SupabaseClient,
  bookingId: string,
  providerId: string,
): Promise<number> {
  const { data, error } = await admin
    .from("product_orders")
    .select("status")
    .eq("booking_id", bookingId)
    .eq("provider_id", providerId);
  if (error) return 0;
  return countOpenAppointmentProductOrders(data ?? []);
}

export async function countOpenProductOrdersForBookings(
  admin: SupabaseClient,
  bookingIds: string[],
  providerId: string,
): Promise<number> {
  if (bookingIds.length === 0) return 0;
  const { data, error } = await admin
    .from("product_orders")
    .select("status")
    .eq("provider_id", providerId)
    .in("booking_id", bookingIds);
  if (error) return 0;
  return countOpenAppointmentProductOrders(data ?? []);
}
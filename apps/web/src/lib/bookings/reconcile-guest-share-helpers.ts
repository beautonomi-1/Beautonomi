import type { SupabaseClient } from "@supabase/supabase-js";

type BookingPaymentRow = {
  id: string;
  booking_id: string;
  payment_provider_data?: Record<string, unknown> | null;
  bookings?: { status?: string | null } | null;
};

export async function bookingNeedsReviewForPayment(
  supabase: SupabaseClient,
  bookingId: string,
  bookingPaymentId: string,
  bookingStatus: string | null | undefined,
  paymentProviderData: Record<string, unknown> | null | undefined,
  bookingNeedsReview: (
    client: SupabaseClient,
    id: string,
    status?: string | null,
  ) => Promise<{ needsReview: boolean; reason?: string }>,
): Promise<{ needsReview: boolean; reason?: string }> {
  if (bookingStatus && ["cancelled", "no_show"].includes(bookingStatus)) {
    return { needsReview: true, reason: "booking_status" };
  }
  if (paymentProviderData?.source === "group_participant_paystack") {
    const { count } = await supabase
      .from("booking_refunds")
      .select("id", { count: "exact", head: true })
      .eq("payment_id", bookingPaymentId);
    if ((count ?? 0) > 0) {
      return { needsReview: true, reason: "payment_has_refunds" };
    }
    return { needsReview: false };
  }
  return bookingNeedsReview(supabase, bookingId, bookingStatus);
}

export function isGroupGuestSharePayment(row: BookingPaymentRow): boolean {
  return row.payment_provider_data?.source === "group_participant_paystack";
}

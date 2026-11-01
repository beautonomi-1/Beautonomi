import type { SupabaseClient } from "@supabase/supabase-js";

export const PROVIDER_PORTAL_BOOKING_SOURCES = new Set(["provider", "walk_in"]);

export function isProviderPortalBookingSource(source: string | null | undefined): boolean {
  return PROVIDER_PORTAL_BOOKING_SOURCES.has(String(source ?? "").trim().toLowerCase());
}

export function storedPlatformFeeAmount(row: {
  platform_fee_amount?: number | string | null;
  service_fee_amount?: number | string | null;
}): number {
  const platform = Number(row.platform_fee_amount ?? 0);
  if (platform > 0) return platform;
  return Math.max(0, Number(row.service_fee_amount ?? 0));
}

/** Drop only the stored platform fee from total_amount; other line items stay as saved. */
export function bookingTotalAfterRemovingPlatformFee(
  totalAmount: number,
  feeAmount: number,
): number {
  return Math.round(Math.max(0, Number(totalAmount) - Math.max(0, feeAmount)) * 100) / 100;
}

export type BookingFeeClearRow = {
  id: string;
  booking_source?: string | null;
  total_amount?: number | null;
  total_paid?: number | null;
  payment_status?: string | null;
  payment_reference?: string | null;
  platform_fee_amount?: number | null;
  service_fee_amount?: number | null;
  platform_fee_paid_by?: string | null;
  service_fee_paid_by?: string | null;
  deposit_amount?: number | null;
  subtotal?: number | null;
  discount_amount?: number | null;
  promotion_discount_amount?: number | null;
  membership_discount_amount?: number | null;
  loyalty_discount_amount?: number | null;
  tax_amount?: number | null;
  travel_fee?: number | null;
  tip_amount?: number | null;
  cancellation_fee?: number | null;
  tax_rate?: number | null;
};

export function canClearUncollectedPlatformFee(
  booking: BookingFeeClearRow,
  opts: { hasCompletedPayment: boolean; hasPendingPaystackReference: boolean },
): boolean {
  if (!isProviderPortalBookingSource(booking.booking_source)) return false;
  if (storedPlatformFeeAmount(booking) <= 0.001) return false;
  const totalPaid = Math.max(0, Number(booking.total_paid ?? 0));
  if (totalPaid > 0.001) return false;
  if (opts.hasCompletedPayment) return false;
  if (opts.hasPendingPaystackReference) return false;
  const ps = String(booking.payment_status ?? "").toLowerCase();
  // Align with plan: gate on money movement, not status alone (partially_paid + total_paid=0 can still clear).
  if (ps === "paid" || ps === "refunded") {
    return false;
  }
  return true;
}

export async function bookingHasCompletedOrPendingGatewayPayment(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<{ hasCompletedPayment: boolean; hasPendingPaystackReference: boolean }> {
  const { data: payments } = await supabase
    .from("booking_payments")
    .select("status, payment_provider")
    .eq("booking_id", bookingId);

  const rows = payments ?? [];
  const hasCompletedPayment = rows.some(
    (p) => p.status === "completed" || p.status === "partially_refunded",
  );
  const hasPendingPaystackPayment = rows.some(
    (p) =>
      String(p.payment_provider ?? "").toLowerCase() === "paystack" &&
      String(p.status ?? "").toLowerCase() === "pending",
  );

  const { data: booking } = await supabase
    .from("bookings")
    .select("payment_reference")
    .eq("id", bookingId)
    .maybeSingle();

  const ref = String((booking as { payment_reference?: string } | null)?.payment_reference ?? "").trim();
  const hasPendingPaystackReference = ref.length > 0 || hasPendingPaystackPayment;

  return { hasCompletedPayment, hasPendingPaystackReference };
}

/**
 * Remove a mistaken platform fee from an unpaid provider-portal booking before
 * till collection or a new Paystack charge. No-op when clearing is not allowed.
 */
export async function clearUncollectedProviderPortalPlatformFeeIfNeeded(
  supabase: SupabaseClient,
  booking: BookingFeeClearRow,
): Promise<{ cleared: boolean; booking: BookingFeeClearRow }> {
  const gate = await bookingHasCompletedOrPendingGatewayPayment(supabase, booking.id);
  if (!canClearUncollectedPlatformFee(booking, gate)) {
    return { cleared: false, booking };
  }

  const fee = storedPlatformFeeAmount(booking);
  const nextTotal = bookingTotalAfterRemovingPlatformFee(
    Number(booking.total_amount ?? 0),
    fee,
  );
  const deposit = Math.max(0, Number(booking.deposit_amount ?? 0));
  const cappedDeposit = deposit > 0 ? Math.min(deposit, nextTotal) : null;

  const patch: Record<string, unknown> = {
    platform_fee_amount: 0,
    service_fee_amount: 0,
    platform_fee_percentage: 0,
    service_fee_percentage: 0,
    platform_fee_paid_by: null,
    service_fee_paid_by: null,
    total_amount: nextTotal,
    ...(cappedDeposit != null ? { deposit_amount: cappedDeposit } : {}),
  };

  const { data: updated, error } = await supabase
    .from("bookings")
    .update(patch)
    .eq("id", booking.id)
    .select("*")
    .maybeSingle();

  if (error || !updated) {
    console.warn("[provider-booking-platform-fee] clear failed:", error);
    return { cleared: false, booking };
  }

  return { cleared: true, booking: updated as BookingFeeClearRow };
}

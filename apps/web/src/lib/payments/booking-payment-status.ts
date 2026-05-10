export const PAID_BOOKING_PAYMENT_STATUSES = ["completed", "partially_refunded"] as const;

export function isPaidBookingPaymentStatus(status: unknown): boolean {
  return PAID_BOOKING_PAYMENT_STATUSES.includes(
    String(status ?? "").toLowerCase() as (typeof PAID_BOOKING_PAYMENT_STATUSES)[number],
  );
}

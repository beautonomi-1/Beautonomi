import type { SupabaseClient } from "@supabase/supabase-js";

export type BookingPaymentForRefundCap = {
  amount?: number | string | null;
  payment_method?: string | null;
  payment_provider?: string | null;
  status?: string | null;
};

function isInPersonCollected(
  payment: Pick<BookingPaymentForRefundCap, "payment_method" | "payment_provider">,
): boolean {
  const method = (payment.payment_method ?? "").toLowerCase();
  const provider = (payment.payment_provider ?? "").toLowerCase();
  if (method === "cash" || provider === "cash") return true;
  if (provider === "paycloud" || provider === "yoco") return true;
  if (method === "card" && provider !== "paystack") return true;
  return false;
}

export function computeInPersonRefundableCap(
  payments: BookingPaymentForRefundCap[],
  completedRefundsCashTotal = 0,
): number {
  const inPersonCollected = payments
    .filter((p) => (p.status === "completed" || p.status === "partially_refunded") && isInPersonCollected(p))
    .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  return Math.max(0, inPersonCollected - completedRefundsCashTotal);
}

export async function fetchBookingPaymentsForRefundCap(
  supabase: SupabaseClient,
  bookingId: string,
  tenantId?: string | null,
): Promise<BookingPaymentForRefundCap[]> {
  let query = supabase
    .from("booking_payments")
    .select("amount, payment_method, payment_provider, status")
    .eq("booking_id", bookingId);
  if (tenantId) query = query.eq("tenant_id", tenantId);
  const { data } = await query;
  return (data ?? []) as BookingPaymentForRefundCap[];
}

export async function fetchCompletedCashRefundsTotal(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<number> {
  const { data } = await supabase
    .from("booking_refunds")
    .select("amount, refund_method, status")
    .eq("booking_id", bookingId)
    .in("status", ["completed", "pending"]);
  return (data ?? [])
    .filter((r) => (r.refund_method ?? "").toLowerCase() === "cash")
    .reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
}

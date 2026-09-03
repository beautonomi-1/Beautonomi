import type { SupabaseClient } from "@supabase/supabase-js";
import { convertToSmallestUnit } from "@/lib/payments/paystack";

export type ResolvePaystackAmountResult =
  | { ok: true; amountSmallestUnit: number }
  | { ok: false; status: number; code: string; message: string };

export async function resolveProductOrderPaystackAmount(
  supabase: SupabaseClient,
  productOrderId: string,
  userId: string,
): Promise<ResolvePaystackAmountResult> {
  const { data: po, error } = await (supabase.from("product_orders") as any)
    .select("id, customer_id, payment_status, payment_method, total_amount, wallet_amount, gift_card_amount")
    .eq("id", productOrderId)
    .maybeSingle();

  if (error || !po) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Order not found" };
  }
  if (po.customer_id !== userId) {
    return { ok: false, status: 403, code: "FORBIDDEN", message: "You do not have permission to pay for this order" };
  }
  if (po.payment_status !== "pending") {
    return {
      ok: false,
      status: 400,
      code: "ORDER_NOT_PAYABLE",
      message: "This order does not require online payment",
    };
  }

  const total = Number(po.total_amount ?? 0);
  const wallet = Number(po.wallet_amount ?? 0);
  // Gift card reserved at checkout (879) reduces the card amount like wallet does.
  const giftCard = Number(po.gift_card_amount ?? 0);
  const dueMajor = Math.max(0, total - wallet - giftCard);
  const amountSmallestUnit = convertToSmallestUnit(dueMajor);

  if (dueMajor > 0 && amountSmallestUnit < 100) {
    return {
      ok: false,
      status: 400,
      code: "AMOUNT_TOO_SMALL",
      message: "Amount due is below the minimum allowed for card payment",
    };
  }

  if (dueMajor <= 0) {
    return {
      ok: false,
      status: 400,
      code: "NOTHING_TO_PAY",
      message: "Nothing left to pay on this order",
    };
  }

  return { ok: true, amountSmallestUnit };
}

export async function resolveBookingPaystackAmount(
  supabase: SupabaseClient,
  bookingId: string,
  userId: string,
): Promise<ResolvePaystackAmountResult> {
  const { data: booking, error: bErr } = await supabase
    .from("bookings")
    .select("id, customer_id, payment_status")
    .eq("id", bookingId)
    .maybeSingle();

  if (bErr || !booking) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Booking not found" };
  }
  const b = booking as { customer_id?: string; payment_status?: string };
  if (b.customer_id !== userId) {
    return { ok: false, status: 403, code: "FORBIDDEN", message: "You do not have permission to pay for this booking" };
  }
  if (b.payment_status === "paid") {
    return {
      ok: false,
      status: 400,
      code: "ALREADY_PAID",
      message: "This booking is already paid",
    };
  }

  const { data: payRow } = await (supabase.from("payments") as any)
    .select("amount, status, payment_provider")
    .eq("booking_id", bookingId)
    .eq("user_id", userId)
    .eq("payment_provider", "paystack")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const dueMajor = Number((payRow as { amount?: number } | null)?.amount ?? 0);
  if (!payRow || !(dueMajor > 0)) {
    return {
      ok: false,
      status: 400,
      code: "NO_PENDING_PAYMENT",
      message: "No pending card payment found for this booking",
    };
  }

  const amountSmallestUnit = convertToSmallestUnit(dueMajor);
  if (amountSmallestUnit < 100) {
    return {
      ok: false,
      status: 400,
      code: "AMOUNT_TOO_SMALL",
      message: "Amount due is below the minimum allowed for card payment",
    };
  }

  return { ok: true, amountSmallestUnit };
}

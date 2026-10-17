import type { BookingPaymentForRefundCap } from "@/lib/bookings/booking-refund-limits";

const PLATFORM_PROVIDERS = new Set(["paystack", "flutterwave", "stripe"]);

/**
 * In-person / off-platform collected payments (never subject to cancellation fees).
 */
export function isInPersonCollected(
  payment: Pick<BookingPaymentForRefundCap, "payment_method" | "payment_provider">,
): boolean {
  const method = (payment.payment_method ?? "").toLowerCase();
  const provider = (payment.payment_provider ?? "").toLowerCase();
  if (method === "paystack_terminal") return true;
  if (method === "cash" || provider === "cash") return true;
  if (provider === "paycloud" || provider === "yoco") return true;
  if (
    method === "bank_transfer" ||
    method === "other" ||
    method === "eft" ||
    method === "manual"
  ) {
    return true;
  }
  if (PLATFORM_PROVIDERS.has(provider) && method !== "paystack_terminal") {
    return false;
  }
  if (method === "wallet" || method === "gift_card") return false;
  if (method === "card" && !PLATFORM_PROVIDERS.has(provider)) return true;
  return false;
}

/** Platform-collected money (fees may be retained from this pool only). */
export function isPlatformCollected(
  payment: Pick<BookingPaymentForRefundCap, "payment_method" | "payment_provider" | "status">,
): boolean {
  if (payment.status !== "completed" && payment.status !== "partially_refunded") {
    return false;
  }
  const method = (payment.payment_method ?? "").toLowerCase();
  const provider = (payment.payment_provider ?? "").toLowerCase();
  if (method === "wallet" || method === "gift_card") return true;
  if (method === "paystack_terminal") return false;
  if (PLATFORM_PROVIDERS.has(provider)) return true;
  return false;
}

export function splitCollectedByRail(
  payments: BookingPaymentForRefundCap[],
  platformRefunded = 0,
  inPersonRefunded = 0,
): { platformCollected: number; inPersonCollected: number } {
  let platform = 0;
  let inPerson = 0;
  for (const p of payments) {
    const amt = Number(p.amount ?? 0);
    if (amt <= 0) continue;
    if (isPlatformCollected(p)) platform += amt;
    else if (
      (p.status === "completed" || p.status === "partially_refunded") &&
      isInPersonCollected(p)
    ) {
      inPerson += amt;
    }
  }
  return {
    platformCollected: Math.max(0, platform - platformRefunded),
    inPersonCollected: Math.max(0, inPerson - inPersonRefunded),
  };
}

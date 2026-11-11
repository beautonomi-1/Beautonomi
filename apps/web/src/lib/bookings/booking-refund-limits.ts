import type { SupabaseClient } from "@supabase/supabase-js";
import { addMoney, roundCurrency, subtractMoney } from "@beautonomi/utils";

export type BookingPaymentForRefundCap = {
  id?: string;
  amount?: number | string | null;
  payment_method?: string | null;
  payment_provider?: string | null;
  payment_provider_id?: string | null;
  status?: string | null;
};

export { isInPersonCollected, isPlatformCollected } from "@/lib/bookings/payment-collected-classifier";
import {
  isInPersonCollected,
  isPlatformCollected,
} from "@/lib/bookings/payment-collected-classifier";

export type RefundCaps = {
  maxRefundable: number;
  onlineCap: number;
  cashCap: number;
  terminalCap: number;
  hasCustomerAccount: boolean;
  suggestedMethod: "store_credit" | "cash" | "original";
};

export function computeInPersonRefundableCap(
  payments: BookingPaymentForRefundCap[],
  completedRefundsCashTotal = 0,
): number {
  const inPersonCollected = payments
    .filter((p) => (p.status === "completed" || p.status === "partially_refunded") && isInPersonCollected(p))
    .reduce((sum, p) => addMoney(sum, Number(p.amount ?? 0)), 0);
  return Math.max(0, subtractMoney(inPersonCollected, completedRefundsCashTotal));
}

export async function fetchBookingPaymentsForRefundCap(
  supabase: SupabaseClient,
  bookingId: string,
  tenantId?: string | null,
): Promise<BookingPaymentForRefundCap[]> {
  let query = supabase
    .from("booking_payments")
    .select("id, amount, payment_method, payment_provider, payment_provider_id, status")
    .eq("booking_id", bookingId);
  if (tenantId) query = query.eq("tenant_id", tenantId);
  const { data } = await query;
  return (data ?? []) as BookingPaymentForRefundCap[];
}

export async function fetchCompletedInPersonRefundsTotal(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<number> {
  const { data } = await supabase
    .from("booking_refunds")
    .select("amount, refund_method, status")
    .eq("booking_id", bookingId)
    .in("status", ["completed", "pending"]);
  return (data ?? [])
    .filter((r) => {
      const method = (r.refund_method ?? "").toLowerCase();
      return method === "cash" || method === "original";
    })
    .reduce((sum, r) => addMoney(sum, Number(r.amount ?? 0)), 0);
}

/** @deprecated Use fetchCompletedInPersonRefundsTotal — subtracts cash and terminal reversals. */
export async function fetchCompletedCashRefundsTotal(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<number> {
  return fetchCompletedInPersonRefundsTotal(supabase, bookingId);
}

export async function fetchCompletedStoreCreditRefundsTotal(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<number> {
  const { data } = await supabase
    .from("booking_refunds")
    .select("amount, refund_method, status")
    .eq("booking_id", bookingId)
    .in("status", ["completed", "pending"]);
  return (data ?? [])
    .filter((r) => {
      const method = (r.refund_method ?? "").toLowerCase();
      return method === "store_credit" || method === "wallet";
    })
    .reduce((sum, r) => addMoney(sum, Number(r.amount ?? 0)), 0);
}

function roundMoney(n: number): number {
  return roundCurrency(Math.max(0, n));
}

/**
 * Refund caps by rail for provider-initiated refunds.
 * In-person money cannot be refunded to the wallet (onlineCap).
 */
export async function computeRefundCaps(
  supabase: SupabaseClient,
  bookingId: string,
  bookingMeta?: {
    customer_id?: string | null;
    total_paid?: number | null;
    total_refunded?: number | null;
    wallet_amount?: number | null;
    gift_card_amount?: number | null;
    tenant_id?: string | null;
  },
): Promise<RefundCaps> {
  const payments = await fetchBookingPaymentsForRefundCap(
    supabase,
    bookingId,
    bookingMeta?.tenant_id,
  );
  const { data: refundRows } = await supabase
    .from("booking_refunds")
    .select("amount, refund_method, status, payment_id")
    .eq("booking_id", bookingId)
    .in("status", ["completed", "pending"]);

  const paymentById = new Map(payments.map((p) => [String(p.id ?? ""), p]));
  let onlineRefunded = 0;
  let inPersonRefunded = 0;
  for (const r of refundRows ?? []) {
    const method = String(r.refund_method ?? "").toLowerCase();
    const amt = Number(r.amount ?? 0);
    if (method === "store_credit" || method === "wallet") {
      onlineRefunded = addMoney(onlineRefunded, amt);
    } else if (method === "original") {
      const linked = r.payment_id ? paymentById.get(String(r.payment_id)) : undefined;
      if (linked && isPlatformCollected(linked)) onlineRefunded = addMoney(onlineRefunded, amt);
      else inPersonRefunded = addMoney(inPersonRefunded, amt);
    } else if (method === "cash") {
      inPersonRefunded = addMoney(inPersonRefunded, amt);
    }
  }

  // Rows that match neither rail are legacy online captures; mark-paid always writes in-person rails.
  let onlineCollected = 0;
  for (const p of payments) {
    if (p.status !== "completed" && p.status !== "partially_refunded") continue;
    const amt = Number(p.amount ?? 0);
    if (amt <= 0) continue;
    if (isPlatformCollected(p) || !isInPersonCollected(p)) onlineCollected = addMoney(onlineCollected, amt);
  }
  const walletGift = addMoney(Number(bookingMeta?.wallet_amount ?? 0), Number(bookingMeta?.gift_card_amount ?? 0));
  onlineCollected = Math.max(onlineCollected, walletGift);
  let onlineCap = Math.max(0, subtractMoney(onlineCollected, onlineRefunded));

  const terminalCap = roundMoney(
    computeInPersonRefundableCap(
      payments.filter(
        (p) =>
          (p.status === "completed" || p.status === "partially_refunded") &&
          (String(p.payment_provider ?? "").toLowerCase() === "paycloud" ||
            String(p.payment_provider ?? "").toLowerCase() === "yoco"),
      ),
      inPersonRefunded,
    ),
  );
  const cashCap = roundMoney(computeInPersonRefundableCap(payments, inPersonRefunded));

  const totalPaid = Number(bookingMeta?.total_paid ?? 0);
  const walletPaid = Number(bookingMeta?.wallet_amount ?? 0);
  const giftPaid = Number(bookingMeta?.gift_card_amount ?? 0);
  const totalRefunded = Number(bookingMeta?.total_refunded ?? 0);
  const maxRefundable = Math.max(
    0,
    Math.max(0, subtractMoney(Math.max(totalPaid, addMoney(walletPaid, giftPaid)), totalRefunded)),
  );
  onlineCap = Math.max(0, Math.min(onlineCap, maxRefundable));

  const hasCustomerAccount = Boolean(bookingMeta?.customer_id);
  let suggestedMethod: RefundCaps["suggestedMethod"] = "cash";
  if (onlineCap > 0.01 && hasCustomerAccount) {
    suggestedMethod = "store_credit";
  } else if (terminalCap > 0.01) {
    suggestedMethod = "original";
  }

  return {
    maxRefundable,
    onlineCap,
    cashCap: Math.min(cashCap, maxRefundable),
    terminalCap: Math.min(terminalCap, cashCap, maxRefundable),
    hasCustomerAccount,
    suggestedMethod,
  };
}

/** When refund_method is omitted, pick the only rail that can cover the amount. */
export function deriveRefundMethodFromCaps(
  amount: number,
  caps: RefundCaps,
): "store_credit" | "cash" | "original" | null {
  const fits = (cap: number) => cap + 0.01 >= amount;
  const canWallet = caps.hasCustomerAccount && fits(caps.onlineCap);
  const canCash = fits(caps.cashCap);
  const canTerminal = fits(caps.terminalCap);
  const options: Array<"store_credit" | "cash" | "original"> = [];
  if (canWallet) options.push("store_credit");
  if (canCash) options.push("cash");
  if (canTerminal) options.push("original");
  if (options.length === 1) return options[0]!;
  return null;
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { isPayoutRefundComponent } from "@/lib/ledger/refund-components";

export type GetAvailablePayoutBalanceOptions = {
  /** Earnings created before (now - holdDays) are available. Default 0 = all available. */
  holdDays?: number;
  /** When set, restricts booking_payments lookup to this tenant (multi-tenant defense in depth). */
  tenantId?: string | null;
};

/**
 * Compute available balance for payout (ledger-based):
 * - Sum provider_earnings (net) excluding any booking the platform never held funds
 *   for — i.e. settled entirely by provider-collected tenders (cash, in-person card,
 *   the provider's own Yoco terminal, bank transfer, etc.). Only paystack/stripe/
 *   flutterwave/wallet/gift_card are platform-held and therefore payoutable.
 * - Add refund rows (net is negative), with the same exclusion when tied to a booking.
 * - Optionally exclude earnings newer than holdDays (payout hold period) for **provider_earnings, tip, and travel_fee**
 *   (F15: hold applies consistently to platform-held booking take). Refunds always apply (clawback).
 * - Subtract completed payouts (finance_transactions type 'payout').
 * - Subtract pending/processing payout requests (payouts table).
 *
 * Note: the exclusion keys off the booking's *completed payment tenders*, not
 * booking_source. A provider-created (booking_source='provider') or online booking
 * paid in cash/Yoco must still be excluded — the platform holds nothing to pay out.
 */
const PLATFORM_HELD_PAYMENT_PROVIDERS = new Set([
  "paystack",
  "stripe",
  "flutterwave",
  "wallet",
  "gift_card",
]);
export async function getAvailablePayoutBalance(
  supabase: SupabaseClient,
  providerId: string,
  options?: GetAvailablePayoutBalanceOptions
): Promise<{
  availableBalance: number;
  pendingPayoutsSum: number;
  rawBalance: number;
  hasNegativeBalance: boolean;
}> {
  const allTime = "1970-01-01T00:00:00.000Z";
  const now = new Date();
  const nowIso = now.toISOString();
  const holdDays = options?.holdDays ?? 0;
  const availableFrom = holdDays > 0 ? new Date(now.getTime() - holdDays * 24 * 60 * 60 * 1000).toISOString() : allTime;

  // Include all platform-held provider-payoutable revenue types:
  // - provider_earnings: core service income
  // - tip, travel_fee: pass-through amounts held by platform and owed to provider
  // - service_fee: legacy booking name for platform fee, selected only so old rows are
  //   explicitly excluded from payout calculations
  // - cancellation_fee: provider-retained income when a customer cancels late
  // - payout: completed payouts (subtracted)
  // - refund: refund clawbacks (negative amounts)
  const { data: ledgerRows, error: ledgerError } = await supabase
    .from("finance_transactions")
    .select("id, transaction_type, amount, net, created_at, booking_id, refund_component")
    .eq("provider_id", providerId)
    .in("transaction_type", ["provider_earnings", "payout", "refund", "cancellation_fee", "tip", "travel_fee", "service_fee"])
    .gte("created_at", allTime)
    .lte("created_at", nowIso)
    .order("created_at", { ascending: false });

  if (ledgerError) throw ledgerError;
  const rows = ledgerRows || [];

  const bookingIds = [...new Set(rows.filter((r: any) => r.booking_id).map((r: any) => r.booking_id))];
  let bookingMap: Record<string, { hasPlatformHeldPayment: boolean; hasAnyCompletedPayment: boolean }> = {};

  if (bookingIds.length > 0) {
    let bookingPaymentsQuery = supabase
      .from("booking_payments")
      .select("booking_id, payment_provider")
      .in("booking_id", bookingIds)
      .eq("status", "completed")
      .order("created_at", { ascending: false });
    const tid = options?.tenantId;
    if (typeof tid === "string" && tid.trim()) {
      bookingPaymentsQuery = bookingPaymentsQuery.eq("tenant_id", tid.trim());
    }
    const { data: bookingPayments } = await bookingPaymentsQuery;

    bookingMap = bookingIds.reduce((acc: Record<string, { hasPlatformHeldPayment: boolean; hasAnyCompletedPayment: boolean }>, bid: string) => {
      const payments = (bookingPayments ?? []).filter((p: any) => p.booking_id === bid);
      acc[bid] = {
        hasAnyCompletedPayment: payments.length > 0,
        hasPlatformHeldPayment: payments.some((p: any) =>
          PLATFORM_HELD_PAYMENT_PROVIDERS.has(String(p.payment_provider || "").toLowerCase()),
        ),
      };
      return acc;
    }, {});
  }

  let onlineEarnings = 0;
  let completedPayouts = 0;

  // Exclude only when we positively know the booking was settled entirely by
  // provider-collected tenders (at least one completed payment, none platform-held).
  // If we have no payment info, do not hide earnings.
  const excludeProviderCollected = (bookingId: string | null | undefined): boolean => {
    if (!bookingId) return false;
    const meta = bookingMap[bookingId];
    if (!meta) return false;
    if (!meta.hasAnyCompletedPayment) return false;
    return !meta.hasPlatformHeldPayment;
  };

  for (const r of rows) {
    const row = r as any;
    if (row.transaction_type === "payout") {
      completedPayouts += Number(row.amount || 0);
      continue;
    }
    if (row.transaction_type === "provider_subscription_payment" || row.transaction_type === "provider_ads_payment") {
      // F16: subscription/ads are platform-billed charges against the provider's platform-held balance.
      onlineEarnings -= Math.abs(Number(row.net ?? row.amount ?? 0));
      continue;
    }
    if (row.transaction_type === "refund") {
      // The refund trigger splits a refund into per-component rows. Only the
      // provider-payoutable components (provider_earnings/tip/travel/cancellation,
      // plus legacy/manual whole-refund rows) claw back the payout balance. Platform
      // fee/commission, tax, discount contras, wallet/gift tender legs and provider-
      // collected (walk-in) add-ons were never platform-held provider money.
      if (!isPayoutRefundComponent(row.refund_component)) continue;
      if (excludeProviderCollected(row.booking_id)) continue;
      onlineEarnings += Number(row.net ?? row.amount ?? 0);
      continue;
    }
    if (row.transaction_type === "cancellation_fee") {
      // Cancellation fees are retained by the provider (compensation for late cancellations).
      // They are always platform-processed (never walk-in cash), so no exclusion needed.
      onlineEarnings += Number(row.net ?? row.amount ?? 0);
      continue;
    }
    if (row.transaction_type === "service_fee") {
      // Historical ledger rows used this name for customer-paid platform fees.
      // They are platform revenue, not provider payoutable balance.
      continue;
    }
    // Tips and travel fees are platform-held pass-throughs owed to the provider.
    if (row.transaction_type === "tip" || row.transaction_type === "travel_fee") {
      if (excludeProviderCollected(row.booking_id)) continue;
      if (holdDays > 0 && row.created_at && row.created_at > availableFrom) continue;
      onlineEarnings += Number(row.net ?? row.amount ?? 0);
      continue;
    }
    if (row.transaction_type !== "provider_earnings") continue;
    if (holdDays > 0 && row.created_at && row.created_at > availableFrom) continue;
    if (excludeProviderCollected(row.booking_id)) continue;
    onlineEarnings += Number(row.net ?? row.amount ?? 0);
  }

  const { data: pendingRows } = await supabase
    .from("payouts")
    .select("amount")
    .eq("provider_id", providerId)
    .in("status", ["pending", "processing"]);

  const pendingPayoutsSum = (pendingRows || []).reduce((s, p: any) => s + Number(p.amount || 0), 0);
  const rawAvailable = onlineEarnings - completedPayouts - pendingPayoutsSum;
  /** 2dp so UI and POST /api/provider/payouts validation never disagree on fractional cents */
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const rawBalance = round2(rawAvailable);
  const availableBalance = Math.max(0, rawBalance);
  const hasNegativeBalance = rawBalance < -0.01;

  return { availableBalance, pendingPayoutsSum: round2(pendingPayoutsSum), rawBalance, hasNegativeBalance };
}

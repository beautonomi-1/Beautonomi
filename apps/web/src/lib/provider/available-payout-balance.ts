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
 * - Sum provider_earnings (net) excluding provider-collected tenders (cash, PayCloud
 *   card machines, the provider's own Yoco terminal, bank transfer, manual card, etc.).
 *   Only paystack/stripe/flutterwave/wallet/gift_card are platform-held and payoutable.
 *   When a finance row carries source_payment_id, exclusion is per payment tender
 *   (mixed Paystack deposit + PayCloud balance only the Paystack-sourced rows count).
 * - Add refund rows (net is negative), with the same exclusion when tied to a booking.
 * - Optionally exclude earnings newer than holdDays (payout hold period) for **provider_earnings, tip,
 *   travel_fee, and cancellation_fee** (F15 / Part C2: hold applies consistently to every platform-held
 *   provider take). Refunds always apply (clawback).
 * - Subtract completed payouts (finance_transactions type 'payout').
 * - Subtract pending/processing payout requests (payouts table).
 *
 * Note: the exclusion keys off the booking's *completed payment tenders*, not
 * booking_source. A provider-created (booking_source='provider') or online booking
 * paid in cash/Yoco must still be excluded — the platform holds nothing to pay out.
 *
 * Subscription & ads charges are deliberately NOT netted here. They are billed to the
 * provider's own card via Paystack (subscription-events.ts / charge-success.ts write the
 * `provider_subscription_payment` / `provider_ads_payment` rows only after a successful
 * card charge). Netting them against the payout balance would double-charge the provider
 * (once on the card, again out of their booking earnings), so those rows are ignored.
 *
 * Also returns a `breakdown` that reconciles recognized payoutable earnings to the final
 * available figure (recognized − onHold − completedPayouts − pending = available), plus the
 * provider-collected cash that was excluded (informational — never platform-held), so the UI
 * can explain why "available to withdraw" differs from headline recognized-revenue reports.
 */
export type PayoutBalanceBreakdown = {
  /** Released + on-hold platform-held earnings net of refunds (before hold/payout deductions). */
  recognizedPayoutableEarnings: number;
  /** provider_earnings/tip/travel/cancellation_fee still inside the payout hold window (will release later). */
  onHold: number;
  /** provider_earnings/tip/travel excluded because the booking was settled in provider-collected cash. */
  excludedProviderCollected: number;
  /** Completed payouts already transferred (finance_transactions type 'payout'). */
  completedPayouts: number;
  /** Pending + processing payout requests reserved against the balance. */
  pendingPayouts: number;
  /** Final withdrawable amount (floored at 0). */
  availableBalance: number;
};
export const PLATFORM_HELD_PAYMENT_PROVIDERS = new Set([
  "paystack",
  "stripe",
  "flutterwave",
  "wallet",
  "gift_card",
]);

function isPlatformHeldPaymentProvider(provider: string | null | undefined): boolean {
  return PLATFORM_HELD_PAYMENT_PROVIDERS.has(String(provider || "").toLowerCase());
}
export async function getAvailablePayoutBalance(
  supabase: SupabaseClient,
  providerId: string,
  options?: GetAvailablePayoutBalanceOptions
): Promise<{
  availableBalance: number;
  pendingPayoutsSum: number;
  rawBalance: number;
  hasNegativeBalance: boolean;
  breakdown: PayoutBalanceBreakdown;
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
  //
  // provider_subscription_payment / provider_ads_payment are intentionally NOT queried:
  // they are charged to the provider's card (Paystack) and must not also be netted out of
  // the payout balance (see the function doc — that would double-charge the provider).
  const { data: ledgerRows, error: ledgerError } = await supabase
    .from("finance_transactions")
    .select("id, transaction_type, amount, net, created_at, booking_id, refund_component, source_payment_id, metadata")
    .eq("provider_id", providerId)
    .in("transaction_type", [
      "provider_earnings",
      "membership_provider_earnings",
      "payout",
      "refund",
      "cancellation_fee",
      "tip",
      "travel_fee",
      "service_fee",
    ])
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
          isPlatformHeldPaymentProvider(p.payment_provider),
        ),
      };
      return acc;
    }, {});
  }

  let onlineEarnings = 0;
  let completedPayouts = 0;
  // Reconciliation buckets (do not affect the balance math; exposed in `breakdown`):
  let onHoldAmount = 0; // provider_earnings/tip/travel skipped only because of the hold window
  let excludedProviderCollectedAmount = 0; // earnings/tip/travel kept by the provider in cash

  // Exclude only when we positively know the booking was settled entirely by
  // provider-collected tenders (at least one completed payment, none platform-held).
  //
  // FAIL-OPEN: if a booking has no completed booking_payments rows we do NOT hide
  // its earnings. This is intentional and safe:
  //   - Walk-in cash/Yoco/EFT bookings post their provider take as
  //     walk_in_additional_charge (net of commission) which is NOT in this query at
  //     all, and migrations 659/660 ensure walk-in add-ons never write
  //     provider_earnings — so there is no provider_earnings row to over-include.
  //   - A provider_earnings/tip/travel_fee row only exists when the platform
  //     actually processed money (Paystack/Stripe/Flutterwave/wallet/gift card),
  //     all of which write a completed booking_payments row. The "no payment info"
  //     case therefore covers legacy/manual rows where excluding would wrongly
  //     withhold money the platform is holding.
  const excludeProviderCollectedBooking = (bookingId: string | null | undefined): boolean => {
    if (!bookingId) return false;
    const meta = bookingMap[bookingId];
    if (!meta) return false;
    if (!meta.hasAnyCompletedPayment) return false;
    return !meta.hasPlatformHeldPayment;
  };

  const sourcePaymentIds = [
    ...new Set(
      rows
        .filter((r: any) => r.source_payment_id)
        .map((r: any) => r.source_payment_id as string),
    ),
  ];
  let sourcePaymentProviderMap: Record<string, string> = {};
  if (sourcePaymentIds.length > 0) {
    let sourcePaymentsQuery = supabase
      .from("booking_payments")
      .select("id, payment_provider")
      .in("id", sourcePaymentIds);
    const tid = options?.tenantId;
    if (typeof tid === "string" && tid.trim()) {
      sourcePaymentsQuery = sourcePaymentsQuery.eq("tenant_id", tid.trim());
    }
    const { data: sourcePayments } = await sourcePaymentsQuery;
    sourcePaymentProviderMap = (sourcePayments ?? []).reduce(
      (acc: Record<string, string>, p: any) => {
        acc[p.id] = String(p.payment_provider || "").toLowerCase();
        return acc;
      },
      {},
    );
  }

  const shouldExcludeProviderCollectedRow = (row: {
    booking_id?: string | null;
    source_payment_id?: string | null;
  }): boolean => {
    const sourceId = row.source_payment_id;
    if (sourceId && sourcePaymentProviderMap[sourceId] !== undefined) {
      return !isPlatformHeldPaymentProvider(sourcePaymentProviderMap[sourceId]);
    }
    return excludeProviderCollectedBooking(row.booking_id);
  };

  for (const r of rows) {
    const row = r as any;
    if (row.transaction_type === "payout") {
      // A payout whose transfer later failed/reversed keeps its ledger row for the
      // audit trail but is marked metadata.reversed_at (transfer-events.ts). The
      // money never left, so it must not reduce the withdrawable balance.
      const reversedAt = row.metadata?.reversed_at;
      if (typeof reversedAt === "string" && reversedAt.length > 0) continue;
      // recordPayoutLedger writes amount === net === net_amount, so these agree
      // today. Prefer `net` (falling back to amount) for consistency with every
      // other branch and to stay correct if a payout ledger row ever carries fees
      // (net < amount) — we must subtract the net amount actually paid out.
      completedPayouts += Number(row.net ?? row.amount ?? 0);
      continue;
    }
    if (row.transaction_type === "refund") {
      // The refund trigger splits a refund into per-component rows. Only the
      // provider-payoutable components (provider_earnings/tip/travel/cancellation,
      // plus legacy/manual whole-refund rows) claw back the payout balance. Platform
      // fee/commission, tax, discount contras, wallet/gift tender legs and provider-
      // collected (walk-in) add-ons were never platform-held provider money.
      if (!isPayoutRefundComponent(row.refund_component)) continue;
      if (shouldExcludeProviderCollectedRow(row)) continue;
      onlineEarnings += Number(row.net ?? row.amount ?? 0);
      continue;
    }
    if (row.transaction_type === "cancellation_fee") {
      // Cancellation fees are retained by the provider (compensation for late cancellations).
      // They are always platform-processed (never walk-in cash), so no tender exclusion is
      // needed — but they ARE platform-held provider take, so the same payout hold applies
      // as for earnings/tips/travel (a chargeback on the cancelled booking claws them back).
      const fee = Number(row.net ?? row.amount ?? 0);
      if (holdDays > 0 && row.created_at && row.created_at > availableFrom) {
        onHoldAmount += fee;
        continue;
      }
      onlineEarnings += fee;
      continue;
    }
    if (row.transaction_type === "service_fee") {
      // Historical ledger rows used this name for customer-paid platform fees.
      // They are platform revenue, not provider payoutable balance.
      continue;
    }
    // Tips and travel fees are platform-held pass-throughs owed to the provider.
    if (row.transaction_type === "tip" || row.transaction_type === "travel_fee") {
      const value = Number(row.net ?? row.amount ?? 0);
      if (shouldExcludeProviderCollectedRow(row)) {
        excludedProviderCollectedAmount += value;
        continue;
      }
      if (holdDays > 0 && row.created_at && row.created_at > availableFrom) {
        onHoldAmount += value;
        continue;
      }
      onlineEarnings += value;
      continue;
    }
    if (
      row.transaction_type !== "provider_earnings" &&
      row.transaction_type !== "membership_provider_earnings"
    ) {
      continue;
    }
    const earnings = Number(row.net ?? row.amount ?? 0);
    if (shouldExcludeProviderCollectedRow(row)) {
      excludedProviderCollectedAmount += earnings;
      continue;
    }
    if (holdDays > 0 && row.created_at && row.created_at > availableFrom) {
      onHoldAmount += earnings;
      continue;
    }
    onlineEarnings += earnings;
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
  const roundedPending = round2(pendingPayoutsSum);

  const breakdown: PayoutBalanceBreakdown = {
    recognizedPayoutableEarnings: round2(onlineEarnings + onHoldAmount),
    onHold: round2(onHoldAmount),
    excludedProviderCollected: round2(excludedProviderCollectedAmount),
    completedPayouts: round2(completedPayouts),
    pendingPayouts: roundedPending,
    availableBalance,
  };

  return { availableBalance, pendingPayoutsSum: roundedPending, rawBalance, hasNegativeBalance, breakdown };
}

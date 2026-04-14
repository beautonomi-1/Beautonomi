import type { SupabaseClient } from "@supabase/supabase-js";

export type GetAvailablePayoutBalanceOptions = {
  /** Earnings created before (now - holdDays) are available. Default 0 = all available. */
  holdDays?: number;
  /** When set, restricts booking_payments lookup to this tenant (multi-tenant defense in depth). */
  tenantId?: string | null;
};

/**
 * Compute available balance for payout (ledger-based):
 * - Sum provider_earnings (net) excluding direct walk-in (cash/Yoco) — platform doesn't hold that money.
 * - Add refund rows (net is negative), with the same walk-in exclusion when tied to a booking.
 * - Optionally exclude earnings newer than holdDays (payout hold period). Refunds always apply (clawback).
 * - Subtract completed payouts (finance_transactions type 'payout').
 * - Subtract pending/processing payout requests (payouts table).
 */
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

  // Include all platform-held provider revenue types:
  // - provider_earnings: core service income
  // - tip, travel_fee, service_fee: pass-through amounts held by platform
  // - cancellation_fee: provider-retained income when a customer cancels late
  // - payout: completed payouts (subtracted)
  // - refund: refund clawbacks (negative amounts)
  const { data: ledgerRows, error: ledgerError } = await supabase
    .from("finance_transactions")
    .select("id, transaction_type, amount, net, created_at, booking_id")
    .eq("provider_id", providerId)
    .in("transaction_type", ["provider_earnings", "payout", "refund", "cancellation_fee", "tip", "travel_fee", "service_fee"])
    .gte("created_at", allTime)
    .lte("created_at", nowIso)
    .order("created_at", { ascending: false });

  if (ledgerError) throw ledgerError;
  const rows = ledgerRows || [];

  const bookingIds = [...new Set(rows.filter((r: any) => r.booking_id).map((r: any) => r.booking_id))];
  let bookingMap: Record<string, { booking_source: string | null; payment_provider: string | null }> = {};

  if (bookingIds.length > 0) {
    const { data: bookings } = await supabase
      .from("bookings")
      .select("id, booking_source")
      .in("id", bookingIds);
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

    if (bookings) {
      bookingMap = bookings.reduce((acc: any, b: any) => {
        const payment = bookingPayments?.find((p: any) => p.booking_id === b.id);
        acc[b.id] = {
          booking_source: b.booking_source || null,
          payment_provider: payment?.payment_provider || null,
        };
        return acc;
      }, {});
    }
  }

  let onlineEarnings = 0;
  let completedPayouts = 0;

  const excludeWalkInNotOnPlatform = (bookingId: string | null | undefined): boolean => {
    if (!bookingId) return false;
    const meta = bookingMap[bookingId];
    if (!meta) return false;
    return meta.booking_source === "walk_in" && meta.payment_provider !== "paystack";
  };

  for (const r of rows) {
    const row = r as any;
    if (row.transaction_type === "payout") {
      completedPayouts += Number(row.amount || 0);
      continue;
    }
    if (row.transaction_type === "refund") {
      if (excludeWalkInNotOnPlatform(row.booking_id)) continue;
      onlineEarnings += Number(row.net ?? row.amount ?? 0);
      continue;
    }
    if (row.transaction_type === "cancellation_fee") {
      // Cancellation fees are retained by the provider (compensation for late cancellations).
      // They are always platform-processed (never walk-in cash), so no exclusion needed.
      onlineEarnings += Number(row.net ?? row.amount ?? 0);
      continue;
    }
    // Tips, travel fees, and service fees are platform-held pass-throughs owed to the provider.
    if (row.transaction_type === "tip" || row.transaction_type === "travel_fee" || row.transaction_type === "service_fee") {
      if (excludeWalkInNotOnPlatform(row.booking_id)) continue;
      onlineEarnings += Number(row.net ?? row.amount ?? 0);
      continue;
    }
    if (row.transaction_type !== "provider_earnings") continue;
    if (holdDays > 0 && row.created_at && row.created_at > availableFrom) continue;
    if (excludeWalkInNotOnPlatform(row.booking_id)) continue;
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

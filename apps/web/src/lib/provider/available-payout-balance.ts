import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Compute available balance for payout (ledger-based):
 * - Sum provider_earnings (net) excluding direct walk-in (cash/Yoco) — platform doesn't hold that money.
 * - Subtract completed payouts (finance_transactions type 'payout').
 * - Subtract pending/processing payout requests (payouts table).
 */
export async function getAvailablePayoutBalance(
  supabase: SupabaseClient,
  providerId: string
): Promise<{ availableBalance: number; pendingPayoutsSum: number }> {
  const allTime = "1970-01-01T00:00:00.000Z";
  const nowIso = new Date().toISOString();

  const { data: ledgerRows, error: ledgerError } = await supabase
    .from("finance_transactions")
    .select("id, transaction_type, amount, net, created_at, booking_id")
    .eq("provider_id", providerId)
    .in("transaction_type", ["provider_earnings", "payout"])
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
    const { data: bookingPayments } = await supabase
      .from("booking_payments")
      .select("booking_id, payment_provider")
      .in("booking_id", bookingIds)
      .eq("status", "completed")
      .order("created_at", { ascending: false });

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

  for (const r of rows) {
    const row = r as any;
    if (row.transaction_type === "payout") {
      completedPayouts += Number(row.amount || 0);
      continue;
    }
    if (row.transaction_type !== "provider_earnings") continue;
    // Exclude direct walk-in (platform doesn't hold the money)
    if (row.booking_id && bookingMap[row.booking_id]?.booking_source === "walk_in") {
      if (bookingMap[row.booking_id]?.payment_provider !== "paystack") continue;
    }
    onlineEarnings += Number(row.net ?? row.amount ?? 0);
  }

  const { data: pendingRows } = await supabase
    .from("payouts")
    .select("amount")
    .eq("provider_id", providerId)
    .in("status", ["pending", "processing"]);

  const pendingPayoutsSum = (pendingRows || []).reduce((s, p: any) => s + Number(p.amount || 0), 0);
  const availableBalance = Math.max(0, onlineEarnings - completedPayouts - pendingPayoutsSum);

  return { availableBalance, pendingPayoutsSum };
}

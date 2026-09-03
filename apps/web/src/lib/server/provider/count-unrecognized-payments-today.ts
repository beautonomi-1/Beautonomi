import type { SupabaseClient } from "@supabase/supabase-js";
import { dateRangeBoundsUtc, formatDateYmd, nowInTz } from "@/lib/dates/provider-tz";

const ONLINE_PROVIDERS = new Set(["paystack", "stripe", "flutterwave"]);
const PROVIDER_COLLECTED_METHODS = new Set([
  "cash",
  "yoco",
  "terminal",
  "paycloud",
  "card_machine",
  "eft",
]);

/**
 * Completed online-gateway booking_payments today with no matching finance_transactions.payment row.
 */
export async function countUnrecognizedPaymentsToday(
  supabase: SupabaseClient,
  providerId: string,
  timezone: string,
): Promise<number> {
  const todayYmd = formatDateYmd(nowInTz(timezone), timezone);
  const bounds = dateRangeBoundsUtc(todayYmd, todayYmd, timezone);

  const { data: bookingIds } = await supabase
    .from("bookings")
    .select("id")
    .eq("provider_id", providerId);

  const ids = (bookingIds ?? []).map((r) => (r as { id: string }).id).filter(Boolean);
  if (ids.length === 0) return 0;

  const { data: payments } = await supabase
    .from("booking_payments")
    .select("id, booking_id, payment_method, payment_provider, status, created_at")
    .in("booking_id", ids)
    .eq("status", "completed")
    .gte("created_at", bounds.fromIso)
    .lte("created_at", bounds.toIso);

  const onlinePayments = (payments ?? []).filter((row) => {
    const r = row as {
      payment_method?: string | null;
      payment_provider?: string | null;
    };
    const method = String(r.payment_method ?? "").toLowerCase();
    if (PROVIDER_COLLECTED_METHODS.has(method)) return false;
    const provider = String(r.payment_provider ?? "").toLowerCase();
    return ONLINE_PROVIDERS.has(provider) || method === "card" || method === "online";
  }) as Array<{ id: string; booking_id: string }>;

  if (onlinePayments.length === 0) return 0;

  const paymentIds = onlinePayments.map((p) => p.id);
  const bookingIdSet = [...new Set(onlinePayments.map((p) => p.booking_id))];

  const { data: ledgerRows } = await supabase
    .from("finance_transactions")
    .select("booking_id, source_payment_id, transaction_type")
    .in("booking_id", bookingIdSet)
    .eq("transaction_type", "payment");

  const recognizedPaymentIds = new Set(
    (ledgerRows ?? [])
      .map((r) => (r as { source_payment_id?: string | null }).source_payment_id)
      .filter(Boolean)
      .map(String),
  );

  const bookingsWithLegacyPayment = new Set(
    (ledgerRows ?? [])
      .filter((r) => !(r as { source_payment_id?: string | null }).source_payment_id)
      .map((r) => (r as { booking_id?: string }).booking_id)
      .filter(Boolean),
  );

  let unrecognized = 0;
  for (const p of onlinePayments) {
    if (recognizedPaymentIds.has(p.id)) continue;
    if (bookingsWithLegacyPayment.has(p.booking_id)) continue;
    unrecognized += 1;
  }

  return unrecognized;
}

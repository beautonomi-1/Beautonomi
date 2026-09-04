import type { SupabaseClient } from "@supabase/supabase-js";
import { dateRangeBoundsUtc, formatDateYmd, nowInTz } from "@/lib/dates/provider-tz";
import { chunkIds, fetchAllPaged } from "@/lib/provider-ops/postgrest-unbounded";

const LEDGER_IN_CHUNK = 150;
const TODAY_PAYMENTS_MAX = 5_000;

const ONLINE_PROVIDERS = new Set(["paystack", "stripe", "flutterwave"]);
const PROVIDER_COLLECTED_METHODS = new Set([
  "cash",
  "yoco",
  "terminal",
  "paycloud",
  "card_machine",
  "eft",
]);

type PaymentRow = {
  id: string;
  booking_id: string;
  payment_method?: string | null;
  payment_provider?: string | null;
};

function isOnlineGatewayPayment(row: PaymentRow): boolean {
  const method = String(row.payment_method ?? "").toLowerCase();
  if (PROVIDER_COLLECTED_METHODS.has(method)) return false;
  const provider = String(row.payment_provider ?? "").toLowerCase();
  return ONLINE_PROVIDERS.has(provider) || method === "card" || method === "online";
}

/**
 * Completed online-gateway booking_payments today with no matching finance_transactions.payment row.
 *
 * Must not load every booking id for the provider — a large `.in(booking_id, …)`
 * exceeds PostgREST URL limits and 500s GET /api/provider/dashboard.
 */
export async function countUnrecognizedPaymentsToday(
  supabase: SupabaseClient,
  providerId: string,
  timezone: string,
): Promise<number> {
  try {
    const todayYmd = formatDateYmd(nowInTz(timezone), timezone);
    const bounds = dateRangeBoundsUtc(todayYmd, todayYmd, timezone);

    const paymentRows = await fetchAllPaged(async (from, to) => {
      const { data, error } = await supabase
        .from("booking_payments")
        .select(
          "id, booking_id, payment_method, payment_provider, status, created_at, bookings!inner(provider_id)",
        )
        .eq("bookings.provider_id", providerId)
        .eq("status", "completed")
        .gte("created_at", bounds.fromIso)
        .lte("created_at", bounds.toIso)
        .range(from, to);
      return { data, error };
    }, TODAY_PAYMENTS_MAX);

    const onlinePayments = (paymentRows as PaymentRow[]).filter(isOnlineGatewayPayment);
    if (onlinePayments.length === 0) return 0;

    const bookingIdSet = [...new Set(onlinePayments.map((p) => p.booking_id).filter(Boolean))];

    const ledgerRows: Array<{ booking_id?: string; source_payment_id?: string | null; transaction_type?: string }> = [];
    for (const slice of chunkIds(bookingIdSet, LEDGER_IN_CHUNK)) {
      const { data, error: ledgerError } = await supabase
        .from("finance_transactions")
        .select("booking_id, source_payment_id, transaction_type")
        .in("booking_id", slice)
        .eq("transaction_type", "payment");

      if (ledgerError) {
        console.warn("[dashboard] unrecognized payments ledger lookup failed:", ledgerError);
        return 0;
      }
      ledgerRows.push(...(data ?? []));
    }

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
  } catch (err) {
    console.warn("[dashboard] unrecognized payments count failed:", err);
    return 0;
  }
}

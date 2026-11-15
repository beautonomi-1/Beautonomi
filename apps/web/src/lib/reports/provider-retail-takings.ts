import { addMoney, subtractMoney } from "@beautonomi/utils";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dateRangeBoundsUtc } from "@/lib/dates/provider-tz";
import { filterProductOrdersForLocation } from "@/lib/reports/provider-report-utils";
import { providerCollectedRetailOrdersOrFilter } from "@/lib/reports/provider-retail-order-scope";
import { productOrderTenderSplit, productOrderTillRefundAmount } from "@/lib/orders/product-order-tender";

export type ProviderRetailTakingsPeriod = {
  amount: number;
  count: number;
};

export type ProviderRetailTakingsSummary = {
  today: ProviderRetailTakingsPeriod;
  this_week: ProviderRetailTakingsPeriod;
  this_month: ProviderRetailTakingsPeriod;
  lifetime: ProviderRetailTakingsPeriod;
};

type RetailOrderRow = {
  id: string;
  total_amount?: number | string | null;
  wallet_amount?: number | string | null;
  gift_card_amount?: number | string | null;
  paid_at?: string | null;
  fulfillment_type?: string | null;
  collection_location_id?: string | null;
  order_source?: string | null;
  payment_method?: string | null;
  refunded_amount?: number | string | null;
  refund_method?: string | null;
};

const PLATFORM_HELD_RETAIL_METHODS = new Set([
  "paystack",
  "stripe",
  "flutterwave",
  "wallet",
  "gift_card",
]);

/**
 * Till money only. Paystack, Stripe, Flutterwave, wallet, and gift card are
 * already in product-order earnings. A mixed till sale counts the cash/card
 * remainder, not the wallet or gift card share.
 */
export function providerRetailTakingsAmount(row: {
  total_amount?: number | string | null;
  wallet_amount?: number | string | null;
  gift_card_amount?: number | string | null;
  payment_method?: string | null;
  refunded_amount?: number | string | null;
  refund_method?: string | null;
}): number {
  const method = String(row.payment_method ?? "").trim().toLowerCase();
  if (PLATFORM_HELD_RETAIL_METHODS.has(method)) return 0;
  const remainder = productOrderTenderSplit(row).remainder;
  return Math.max(0, subtractMoney(remainder, productOrderTillRefundAmount(row)));
}

async function fetchPaidProviderCollectedRetailOrders(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  providerTenantId: string | null,
): Promise<RetailOrderRow[]> {
  let q = supabaseAdmin
    .from("product_orders")
    .select(
      "id, total_amount, wallet_amount, gift_card_amount, paid_at, fulfillment_type, collection_location_id, order_source, payment_method, refunded_amount, refund_method",
    )
    .eq("provider_id", providerId)
    .in("payment_status", ["paid", "partially_refunded", "refunded"])
    .not("paid_at", "is", null)
    .or(providerCollectedRetailOrdersOrFilter());

  if (providerTenantId) {
    q = q.eq("tenant_id", providerTenantId);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as RetailOrderRow[];
}

function sumTakings(orders: RetailOrderRow[]): ProviderRetailTakingsPeriod {
  let amount = 0;
  let count = 0;
  for (const row of orders) {
    const taken = providerRetailTakingsAmount(row);
    if (taken <= 0) continue;
    amount = addMoney(amount, taken);
    count += 1;
  }
  return { amount, count };
}

function sumInRange(
  orders: RetailOrderRow[],
  fromIso: string,
  toIso: string,
): ProviderRetailTakingsPeriod {
  let amount = 0;
  let count = 0;
  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();
  for (const row of orders) {
    const paidAt = row.paid_at ? new Date(row.paid_at).getTime() : NaN;
    if (!Number.isFinite(paidAt) || paidAt < fromMs || paidAt > toMs) continue;
    const taken = providerRetailTakingsAmount(row);
    if (taken <= 0) continue;
    amount = addMoney(amount, taken);
    count += 1;
  }
  return { amount, count };
}

/**
 * Provider-collected retail takings by `paid_at` in provider business timezone
 * (walk-in POS plus online cash/COD/Yoco collection). Excludes platform-held
 * Paystack/wallet checkout revenue (shown in ledger earnings).
 */
export async function getProviderRetailTakingsSummary(
  supabaseAdmin: SupabaseClient,
  params: {
    providerId: string;
    timezone: string;
    todayYmd: string;
    weekStartYmd: string;
    monthStartYmd: string;
    locationId?: string | null;
  },
): Promise<ProviderRetailTakingsSummary> {
  const { providerId, timezone, todayYmd, weekStartYmd, monthStartYmd, locationId } = params;

  const { data: providerRow } = await supabaseAdmin
    .from("providers")
    .select("tenant_id")
    .eq("id", providerId)
    .maybeSingle();
  const providerTenantId = (providerRow as { tenant_id?: string | null } | null)?.tenant_id ?? null;

  let orders = await fetchPaidProviderCollectedRetailOrders(supabaseAdmin, providerId, providerTenantId);
  if (locationId) {
    orders = await filterProductOrdersForLocation(supabaseAdmin, providerId, orders, locationId);
  }

  const todayBounds = dateRangeBoundsUtc(todayYmd, todayYmd, timezone);
  const weekBounds = dateRangeBoundsUtc(weekStartYmd, todayYmd, timezone);
  const monthBounds = dateRangeBoundsUtc(monthStartYmd, todayYmd, timezone);

  const lifetime = sumTakings(orders);

  return {
    today: sumInRange(orders, todayBounds.fromIso, todayBounds.toIso),
    this_week: sumInRange(orders, weekBounds.fromIso, weekBounds.toIso),
    this_month: sumInRange(orders, monthBounds.fromIso, monthBounds.toIso),
    lifetime,
  };
}

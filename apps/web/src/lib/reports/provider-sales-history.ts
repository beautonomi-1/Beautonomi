import type { SupabaseClient } from "@supabase/supabase-js";
import { subMonths } from "date-fns";
import { toZonedTime } from "date-fns-tz";

import { dateRangeBoundsUtc, formatDateYmd } from "@/lib/dates/provider-tz";
import {
  getProviderPrimaryReportLocationId,
  productOrderReportLocationId,
} from "@/lib/reports/provider-report-utils";

export type SalesHistorySource = "booking" | "product_order" | "pos";

export type SalesHistorySubtype = "normal" | "custom" | "group";

export type SalesHistoryRow = {
  id: string;
  source: SalesHistorySource;
  subtype: SalesHistorySubtype;
  ref_number: string;
  sort_date: string;
  customer_name: string | null;
  gross_total: number;
  platform_fee: number;
  commission: number;
  provider_net: number;
  tip: number;
  tax: number;
  travel_fee: number;
  cancellation_fee: number;
  refunds: number;
  payment_status: string | null;
  currency: string;
  location_id: string | null;
};

type LedgerAgg = {
  provider_earnings_net: number;
  platform_fee: number;
  commission: number;
  tip: number;
  tax: number;
  travel_fee: number;
  cancellation_fee: number;
  refunds: number;
  last_at: string;
};

const LEDGER_TYPES = [
  "provider_earnings",
  "platform_fee",
  "service_fee",
  "payment",
  "tip",
  "tax",
  "travel_fee",
  "cancellation_fee",
  "refund",
] as const;

const PAGE = 1000;
export const SALES_HISTORY_MAX_LEDGER_ROWS = 40_000;
const MAX_POS_ROWS = 8_000;

function emptyAgg(): LedgerAgg {
  return {
    provider_earnings_net: 0,
    platform_fee: 0,
    commission: 0,
    tip: 0,
    tax: 0,
    travel_fee: 0,
    cancellation_fee: 0,
    refunds: 0,
    last_at: "",
  };
}

function bumpAgg(
  agg: LedgerAgg,
  row: { transaction_type: string; amount?: unknown; net?: unknown; commission?: unknown; created_at: string },
) {
  const net = Number(row.net ?? 0);
  const comm = Number(row.commission ?? 0);
  const tt = row.transaction_type;
  if (tt === "provider_earnings") agg.provider_earnings_net += net;
  else if (tt === "platform_fee" || tt === "service_fee") agg.platform_fee += Math.abs(net);
  else if (tt === "payment") agg.commission += Math.abs(comm) > 0 ? Math.abs(comm) : Math.abs(net);
  else if (tt === "tip") agg.tip += Math.abs(net);
  else if (tt === "tax") agg.tax += Math.abs(Number(row.amount ?? 0));
  else if (tt === "travel_fee") agg.travel_fee += Math.abs(net);
  else if (tt === "cancellation_fee") agg.cancellation_fee += Math.abs(net);
  else if (tt === "refund") agg.refunds += Math.abs(net);
  if (!agg.last_at || row.created_at > agg.last_at) agg.last_at = row.created_at;
}

async function fetchLedgerAggregates(
  db: SupabaseClient,
  providerId: string,
  fromIso: string,
  toIso: string,
): Promise<{ booking: Map<string, LedgerAgg>; order: Map<string, LedgerAgg>; hit_cap: boolean }> {
  const booking = new Map<string, LedgerAgg>();
  const order = new Map<string, LedgerAgg>();
  let offset = 0;
  let hit_cap = false;

  for (;;) {
    const { data, error } = await db
      .from("finance_transactions")
      .select("booking_id, product_order_id, transaction_type, amount, net, commission, created_at")
      .eq("provider_id", providerId)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .in("transaction_type", [...LEDGER_TYPES])
      .or("booking_id.not.is.null,product_order_id.not.is.null")
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE - 1);

    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) break;

    for (const r of rows as any[]) {
      const bid = r.booking_id as string | null;
      const oid = r.product_order_id as string | null;
      if (bid) {
        let a = booking.get(bid);
        if (!a) {
          a = emptyAgg();
          booking.set(bid, a);
        }
        bumpAgg(a, r);
      }
      if (oid) {
        let a = order.get(oid);
        if (!a) {
          a = emptyAgg();
          order.set(oid, a);
        }
        bumpAgg(a, r);
      }
    }

    offset += PAGE;
    if (rows.length < PAGE) break;
    if (offset >= SALES_HISTORY_MAX_LEDGER_ROWS) {
      hit_cap = true;
      break;
    }
  }

  return { booking, order, hit_cap };
}

function bookingSubtype(b: {
  custom_offer_id?: string | null;
  is_group_booking?: boolean | null;
  group_booking_id?: string | null;
}): SalesHistorySubtype {
  if (b.custom_offer_id) return "custom";
  if (b.is_group_booking || b.group_booking_id) return "group";
  return "normal";
}

export type BuildSalesHistoryParams = {
  db: SupabaseClient;
  providerId: string;
  timezone: string;
  dateFromYmd?: string | null;
  dateToYmd?: string | null;
  locationId?: string | null;
  searchTerm?: string;
  source: SalesHistorySource | "all";
};

export async function buildProviderSalesHistoryRows(
  params: BuildSalesHistoryParams,
): Promise<{ rows: SalesHistoryRow[]; truncated_ledger: boolean }> {
  const { db, providerId, timezone, dateFromYmd, dateToYmd, locationId, searchTerm, source } = params;

  const ymdParam = /^\d{4}-\d{2}-\d{2}$/;
  const todayYmd = new Date().toISOString().slice(0, 10);
  const d0 = dateFromYmd && ymdParam.test(dateFromYmd.slice(0, 10)) ? dateFromYmd.slice(0, 10) : null;
  const d1 = dateToYmd && ymdParam.test(dateToYmd.slice(0, 10)) ? dateToYmd.slice(0, 10) : null;

  let fromIso: string;
  let toIso: string;
  if (d0 != null && d1 != null) {
    fromIso = dateRangeBoundsUtc(d0, d1, timezone).fromIso;
    toIso = dateRangeBoundsUtc(d0, d1, timezone).toIso;
  } else if (d0 != null) {
    fromIso = dateRangeBoundsUtc(d0, d0, timezone).fromIso;
    toIso = dateRangeBoundsUtc(todayYmd, todayYmd, timezone).toIso;
  } else if (d1 != null) {
    fromIso = dateRangeBoundsUtc("1970-01-01", d1, timezone).fromIso;
    toIso = dateRangeBoundsUtc(d1, d1, timezone).toIso;
  } else {
    const zNow = toZonedTime(new Date(), timezone);
    const fromYmd = formatDateYmd(subMonths(zNow, 24), timezone);
    fromIso = dateRangeBoundsUtc(fromYmd, fromYmd, timezone).fromIso;
    toIso = dateRangeBoundsUtc(todayYmd, todayYmd, timezone).toIso;
  }

  const { booking: bookingAggs, order: orderAggs, hit_cap } =
    source === "pos"
      ? { booking: new Map<string, LedgerAgg>(), order: new Map<string, LedgerAgg>(), hit_cap: false }
      : await fetchLedgerAggregates(db, providerId, fromIso, toIso);

  const primaryLocationId = await getProviderPrimaryReportLocationId(db, providerId);

  const rows: SalesHistoryRow[] = [];
  const q = (searchTerm || "").trim().toLowerCase();

  if (source === "all" || source === "booking") {
    const bookingIds = [...bookingAggs.keys()];
    if (bookingIds.length > 0) {
      const { data: bookings, error: bErr } = await db
        .from("bookings")
        .select(
          "id, booking_number, customer_id, guest_name, total_amount, currency, payment_status, location_id, custom_offer_id, is_group_booking, group_booking_id, created_at, updated_at",
        )
        .eq("provider_id", providerId)
        .in("id", bookingIds);
      if (bErr) throw bErr;

      const customerIds = [...new Set((bookings ?? []).map((b: any) => b.customer_id).filter(Boolean))] as string[];
      const customerMap = new Map<string, string>();
      if (customerIds.length > 0) {
        const { data: users } = await db.from("users").select("id, full_name").in("id", customerIds);
        for (const u of users ?? []) customerMap.set((u as any).id, String((u as any).full_name || ""));
      }

      for (const b of bookings ?? []) {
        const row = b as any;
        if (locationId && row.location_id !== locationId) continue;
        const agg = bookingAggs.get(row.id);
        if (!agg) continue;
        const customerName =
          (row.customer_id && customerMap.get(row.customer_id)) || row.guest_name || null;
        const ref = row.booking_number || row.id;
        if (
          q &&
          !String(ref).toLowerCase().includes(q) &&
          !(customerName && customerName.toLowerCase().includes(q))
        ) {
          continue;
        }
        rows.push({
          id: row.id,
          source: "booking",
          subtype: bookingSubtype(row),
          ref_number: String(ref),
          sort_date: agg.last_at || row.updated_at || row.created_at,
          customer_name: customerName,
          gross_total: Number(row.total_amount ?? 0),
          platform_fee: agg.platform_fee,
          commission: agg.commission,
          provider_net:
            agg.provider_earnings_net + agg.tip + agg.travel_fee + agg.cancellation_fee - agg.refunds,
          tip: agg.tip,
          tax: agg.tax,
          travel_fee: agg.travel_fee,
          cancellation_fee: agg.cancellation_fee,
          refunds: agg.refunds,
          payment_status: row.payment_status ?? null,
          currency: row.currency || "ZAR",
          location_id: row.location_id ?? null,
        });
      }
    }
  }

  if (source === "all" || source === "product_order") {
    const orderIds = [...orderAggs.keys()];
    if (orderIds.length > 0) {
      const { data: orders, error: oErr } = await db
        .from("product_orders")
        .select(
          "id, order_number, customer_id, total_amount, currency, payment_status, fulfillment_type, collection_location_id, created_at, updated_at",
        )
        .eq("provider_id", providerId)
        .in("id", orderIds);
      if (oErr) throw oErr;

      const customerIds = [...new Set((orders ?? []).map((o: any) => o.customer_id).filter(Boolean))] as string[];
      const customerMap = new Map<string, string>();
      if (customerIds.length > 0) {
        const { data: users } = await db.from("users").select("id, full_name").in("id", customerIds);
        for (const u of users ?? []) customerMap.set((u as any).id, String((u as any).full_name || ""));
      }

      for (const o of orders ?? []) {
        const row = o as any;
        const reportLoc = productOrderReportLocationId(row, primaryLocationId);
        if (locationId && reportLoc !== locationId) continue;
        const agg = orderAggs.get(row.id);
        if (!agg) continue;
        const customerName = row.customer_id ? customerMap.get(row.customer_id) ?? null : null;
        const ref = row.order_number || row.id;
        if (
          q &&
          !String(ref).toLowerCase().includes(q) &&
          !(customerName && customerName.toLowerCase().includes(q))
        ) {
          continue;
        }
        rows.push({
          id: row.id,
          source: "product_order",
          subtype: "normal",
          ref_number: String(ref),
          sort_date: agg.last_at || row.updated_at || row.created_at,
          customer_name: customerName,
          gross_total: Number(row.total_amount ?? 0),
          platform_fee: agg.platform_fee,
          commission: agg.commission,
          provider_net:
            agg.provider_earnings_net + agg.tip + agg.travel_fee + agg.cancellation_fee - agg.refunds,
          tip: agg.tip,
          tax: agg.tax,
          travel_fee: agg.travel_fee,
          cancellation_fee: agg.cancellation_fee,
          refunds: agg.refunds,
          payment_status: row.payment_status ?? null,
          currency: row.currency || "ZAR",
          location_id: reportLoc,
        });
      }
    }
  }

  if (source === "all" || source === "pos") {
    let posQuery = db
      .from("sales")
      .select(
        "id, sale_number, ref_number, sale_date, total_amount, subtotal, tax_amount, payment_status, customer_id, location_id, currency",
      )
      .eq("provider_id", providerId)
      .gte("sale_date", fromIso)
      .lte("sale_date", toIso)
      .order("sale_date", { ascending: false });

    if (locationId) posQuery = posQuery.eq("location_id", locationId);
    posQuery = posQuery.limit(MAX_POS_ROWS);

    const { data: sales, error: sErr } = await posQuery;
    if (sErr) throw sErr;

    const customerIds = [...new Set((sales ?? []).map((s: any) => s.customer_id).filter(Boolean))] as string[];
    const customerMap = new Map<string, string>();
    if (customerIds.length > 0) {
      const { data: users } = await db.from("users").select("id, full_name").in("id", customerIds);
      for (const u of users ?? []) customerMap.set((u as any).id, String((u as any).full_name || ""));
    }

    for (const s of sales ?? []) {
      const row = s as any;
      const customerName = row.customer_id ? customerMap.get(row.customer_id) ?? null : null;
      const ref = row.ref_number || row.sale_number || row.id;
      if (
        q &&
        !String(ref).toLowerCase().includes(q) &&
        !(customerName && customerName.toLowerCase().includes(q))
      ) {
        continue;
      }
      const gross = Number(row.total_amount ?? 0);
      rows.push({
        id: row.id,
        source: "pos",
        subtype: "normal",
        ref_number: String(ref),
        sort_date: row.sale_date,
        customer_name: customerName,
        gross_total: gross,
        platform_fee: 0,
        commission: 0,
        provider_net: gross,
        tip: 0,
        tax: Number(row.tax_amount ?? 0),
        travel_fee: 0,
        cancellation_fee: 0,
        refunds: 0,
        payment_status: row.payment_status ?? null,
        currency: row.currency || "ZAR",
        location_id: row.location_id ?? null,
      });
    }
  }

  rows.sort((a, b) => (a.sort_date < b.sort_date ? 1 : a.sort_date > b.sort_date ? -1 : 0));

  return { rows, truncated_ledger: hit_cap };
}

export function salesHistoryTotals(rows: SalesHistoryRow[]) {
  return rows.reduce(
    (acc, r) => {
      acc.total_gross += r.gross_total;
      acc.total_provider_net += r.provider_net;
      acc.total_platform_fee += r.platform_fee;
      acc.total_commission += r.commission;
      return acc;
    },
    { total_gross: 0, total_provider_net: 0, total_platform_fee: 0, total_commission: 0 },
  );
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { subMonths } from "date-fns";
import { toZonedTime } from "date-fns-tz";

import { dateRangeBoundsUtc, formatDateYmd } from "@/lib/dates/provider-tz";
import {
  filterProductOrdersForLocation,
  getProviderPrimaryReportLocationId,
  productOrderReportLocationId,
} from "@/lib/reports/provider-report-utils";
import { bookingMatchesDashboardLocation } from "@/lib/server/provider/dashboard-booking-location-filter";
import { providerCollectedRetailOrdersOrFilter } from "@/lib/reports/provider-retail-order-scope";
import { isProviderEarningsRefundComponent } from "@/lib/ledger/refund-components";
import { fetchAllPaged, fetchInIdChunks } from "@/lib/provider-ops/postgrest-unbounded";

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
  /** Contra-revenue discounts (absolute); explains gross_total vs provider_net when total_amount is pre-discount. */
  discount_contra: number;
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
  // Provider-collected (walk-in / in-person) additional charges. The settlement
  // RPC bumps bookings.total_amount (gross) but posts no provider_earnings, so we
  // must count it here or gross_total and provider_net diverge.
  walk_in_additional_charge: number;
  /** Absolute sum of discount contra rows (promotion/membership/loyalty); reconciles gross vs net. */
  discount_contra: number;
  refunds: number;
  last_at: string;
};

const DISCOUNT_CONTRA_TYPES = [
  "promotion_discount",
  "membership_discount",
  "loyalty_discount",
  "loyalty_redemption",
] as const;

const LEDGER_TYPES = [
  "provider_earnings",
  "platform_fee",
  "service_fee",
  "payment",
  "tip",
  "tax",
  "travel_fee",
  "cancellation_fee",
  // Additional charges: walk_in_additional_charge is provider-collected revenue;
  // additional_charge_payment carries the platform commission on an online add-on
  // (its sibling provider_earnings row is already counted above).
  "walk_in_additional_charge",
  "additional_charge_payment",
  ...DISCOUNT_CONTRA_TYPES,
  "refund",
] as const;

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
    walk_in_additional_charge: 0,
    discount_contra: 0,
    refunds: 0,
    last_at: "",
  };
}

function isDiscountContraType(tt: string): boolean {
  return (DISCOUNT_CONTRA_TYPES as readonly string[]).includes(tt);
}

function bumpAgg(
  agg: LedgerAgg,
  row: {
    transaction_type: string;
    amount?: unknown;
    net?: unknown;
    commission?: unknown;
    created_at: string;
    refund_component?: unknown;
  },
) {
  const net = Number(row.net ?? 0);
  const comm = Number(row.commission ?? 0);
  const tt = row.transaction_type;
  if (tt === "provider_earnings") agg.provider_earnings_net += net;
  else if (tt === "platform_fee" || tt === "service_fee") agg.platform_fee += Math.abs(net);
  else if (tt === "payment") agg.commission += Math.abs(comm) > 0 ? Math.abs(comm) : Math.abs(net);
  else if (tt === "additional_charge_payment") agg.commission += Math.abs(comm) > 0 ? Math.abs(comm) : Math.abs(net);
  else if (tt === "walk_in_additional_charge") agg.walk_in_additional_charge += net;
  else if (tt === "tip") agg.tip += Math.abs(net);
  else if (tt === "tax") agg.tax += Math.abs(Number(row.amount ?? 0));
  else if (tt === "travel_fee") agg.travel_fee += Math.abs(net);
  else if (tt === "cancellation_fee") agg.cancellation_fee += Math.abs(net);
  else if (isDiscountContraType(tt)) agg.discount_contra += Math.abs(net);
  // Refunds are split into per-component rows by the trigger. provider_net only
  // deducts components that were the provider's money (earnings/tip/travel/
  // cancellation/walk-in add-on + legacy/manual whole refunds). Platform fee/
  // commission, tax, discount contras and wallet/gift tender legs are not the
  // provider's loss and must not reduce provider_net.
  else if (tt === "refund") {
    if (isProviderEarningsRefundComponent(row.refund_component as string | null | undefined)) {
      agg.refunds += Math.abs(net);
    }
  }
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

  const rows = await fetchAllPaged(async (from, to) => {
    const { data, error } = await db
      .from("finance_transactions")
      .select("id, booking_id, product_order_id, transaction_type, amount, net, commission, created_at, refund_component")
      .eq("provider_id", providerId)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .in("transaction_type", [...LEDGER_TYPES])
      .or("booking_id.not.is.null,product_order_id.not.is.null")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);
    return { data, error };
  }, SALES_HISTORY_MAX_LEDGER_ROWS);

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

  return { booking, order, hit_cap: rows.length >= SALES_HISTORY_MAX_LEDGER_ROWS };
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

export type SalesHistoryQueryParams = BuildSalesHistoryParams & {
  page: number;
  limit: number;
};

export type ResolvedSalesHistoryRange = {
  fromIso: string;
  toIso: string;
  /** True when the server applied the 24-month default (no explicit from/to in request). */
  usesDefaultRange: boolean;
};

const ymdParam = /^\d{4}-\d{2}-\d{2}$/;

export function resolveSalesHistoryIsoRange(
  timezone: string,
  dateFromYmd?: string | null,
  dateToYmd?: string | null,
): ResolvedSalesHistoryRange {
  const todayYmd = new Date().toISOString().slice(0, 10);
  const d0 = dateFromYmd && ymdParam.test(dateFromYmd.slice(0, 10)) ? dateFromYmd.slice(0, 10) : null;
  const d1 = dateToYmd && ymdParam.test(dateToYmd.slice(0, 10)) ? dateToYmd.slice(0, 10) : null;

  if (d0 != null && d1 != null) {
    const bounds = dateRangeBoundsUtc(d0, d1, timezone);
    return { fromIso: bounds.fromIso, toIso: bounds.toIso, usesDefaultRange: false };
  }
  if (d0 != null) {
    const fromBounds = dateRangeBoundsUtc(d0, d0, timezone);
    const toBounds = dateRangeBoundsUtc(todayYmd, todayYmd, timezone);
    return { fromIso: fromBounds.fromIso, toIso: toBounds.toIso, usesDefaultRange: false };
  }
  if (d1 != null) {
    const fromBounds = dateRangeBoundsUtc("1970-01-01", d1, timezone);
    const toBounds = dateRangeBoundsUtc(d1, d1, timezone);
    return { fromIso: fromBounds.fromIso, toIso: toBounds.toIso, usesDefaultRange: false };
  }

  const zNow = toZonedTime(new Date(), timezone);
  const fromYmd = formatDateYmd(subMonths(zNow, 24), timezone);
  const fromBounds = dateRangeBoundsUtc(fromYmd, fromYmd, timezone);
  const toBounds = dateRangeBoundsUtc(todayYmd, todayYmd, timezone);
  return { fromIso: fromBounds.fromIso, toIso: toBounds.toIso, usesDefaultRange: true };
}

type SalesHistoryIndexEntry = {
  id: string;
  source: SalesHistorySource;
  sort_date: string;
};

function providerNetFromAgg(agg: LedgerAgg): number {
  return (
    agg.provider_earnings_net +
    agg.tip +
    agg.travel_fee +
    agg.cancellation_fee +
    agg.walk_in_additional_charge -
    agg.refunds
  );
}

/**
 * Totals for rows that passed location/search filters.
 * `bookingGrossById` / `orderGrossById` keys are the included sale IDs only —
 * do not iterate raw ledger aggs (those may include excluded branches).
 */
export function computeSalesHistoryTotalsFromAggs(
  bookingAggs: Map<string, LedgerAgg>,
  orderAggs: Map<string, LedgerAgg>,
  bookingGrossById: Map<string, number>,
  orderGrossById: Map<string, number>,
  extraRows: Array<{ gross_total: number; provider_net: number; platform_fee: number; commission: number }>,
) {
  let total_gross = 0;
  let total_provider_net = 0;
  let total_platform_fee = 0;
  let total_commission = 0;

  for (const [id, gross] of bookingGrossById) {
    const agg = bookingAggs.get(id);
    if (!agg) continue;
    total_gross += gross;
    total_provider_net += providerNetFromAgg(agg);
    total_platform_fee += agg.platform_fee;
    total_commission += agg.commission;
  }
  for (const [id, gross] of orderGrossById) {
    const agg = orderAggs.get(id);
    if (!agg) continue;
    total_gross += gross;
    total_provider_net += providerNetFromAgg(agg);
    total_platform_fee += agg.platform_fee;
    total_commission += agg.commission;
  }
  for (const row of extraRows) {
    total_gross += row.gross_total;
    total_provider_net += row.provider_net;
    total_platform_fee += row.platform_fee;
    total_commission += row.commission;
  }

  return { total_gross, total_provider_net, total_platform_fee, total_commission };
}

export async function queryProviderSalesHistory(
  params: SalesHistoryQueryParams,
): Promise<{
  data: SalesHistoryRow[];
  total: number;
  totals: ReturnType<typeof computeSalesHistoryTotalsFromAggs>;
  truncated_ledger: boolean;
  usesDefaultRange: boolean;
}> {
  const { db, providerId, timezone, dateFromYmd, dateToYmd, locationId, searchTerm, source, page, limit } =
    params;
  const { fromIso, toIso, usesDefaultRange } = resolveSalesHistoryIsoRange(timezone, dateFromYmd, dateToYmd);
  const q = (searchTerm || "").trim().toLowerCase();

  const { booking: bookingAggs, order: orderAggs, hit_cap } =
    source === "pos"
      ? { booking: new Map<string, LedgerAgg>(), order: new Map<string, LedgerAgg>(), hit_cap: false }
      : await fetchLedgerAggregates(db, providerId, fromIso, toIso);

  const primaryLocationId = await getProviderPrimaryReportLocationId(db, providerId);
  const index: SalesHistoryIndexEntry[] = [];
  const bookingGrossById = new Map<string, number>();
  const orderGrossById = new Map<string, number>();
  const extraTotalsRows: Array<{
    gross_total: number;
    provider_net: number;
    platform_fee: number;
    commission: number;
  }> = [];

  if (source === "all" || source === "booking") {
    const bookingIds = [...bookingAggs.keys()];
    if (bookingIds.length > 0) {
      const bookings = await fetchInIdChunks<Record<string, unknown>>(bookingIds, (slice) =>
        db
          .from("bookings")
          .select(
            "id, booking_number, customer_id, guest_name, total_amount, location_id, location_type, booking_source, custom_offer_id, is_group_booking, group_booking_id, created_at, updated_at",
          )
          .eq("provider_id", providerId)
          .in("id", slice),
        { throwOnError: true },
      );

      const customerIds = [...new Set(bookings.map((b: any) => b.customer_id).filter(Boolean))] as string[];
      const customerMap = new Map<string, string>();
      if (customerIds.length > 0) {
        const users = await fetchInIdChunks<{ id: string; full_name?: string | null }>(customerIds, (slice) =>
          db.from("users").select("id, full_name").in("id", slice),
        );
        for (const u of users) customerMap.set(u.id, String(u.full_name || ""));
      }

      for (const b of bookings) {
        const row = b as any;
        if (
          locationId &&
          !bookingMatchesDashboardLocation(locationId, {
            location_id: row.location_id,
            location_type: row.location_type,
            booking_source: row.booking_source,
          })
        ) {
          continue;
        }
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
        bookingGrossById.set(row.id, Number(row.total_amount ?? 0));
        index.push({
          id: row.id,
          source: "booking",
          sort_date: agg.last_at || row.updated_at || row.created_at,
        });
      }
    }
  }

  if (source === "all" || source === "product_order") {
    const orderIds = [...orderAggs.keys()];
    if (orderIds.length > 0) {
      const orders = await fetchInIdChunks<Record<string, unknown>>(orderIds, (slice) =>
        db
          .from("product_orders")
          .select(
            "id, order_number, customer_id, total_amount, fulfillment_type, collection_location_id, created_at, updated_at",
          )
          .eq("provider_id", providerId)
          .in("id", slice),
        { throwOnError: true },
      );

      const customerIds = [...new Set(orders.map((o: any) => o.customer_id).filter(Boolean))] as string[];
      const customerMap = new Map<string, string>();
      if (customerIds.length > 0) {
        const users = await fetchInIdChunks<{ id: string; full_name?: string | null }>(customerIds, (slice) =>
          db.from("users").select("id, full_name").in("id", slice),
        );
        for (const u of users) customerMap.set(u.id, String(u.full_name || ""));
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
        orderGrossById.set(row.id, Number(row.total_amount ?? 0));
        index.push({
          id: row.id,
          source: "product_order",
          sort_date: agg.last_at || row.updated_at || row.created_at,
        });
      }
    }

    let walkInQuery = db
      .from("product_orders")
      .select(
        "id, order_number, customer_id, customer_name, total_amount, fulfillment_type, collection_location_id, paid_at, updated_at, created_at",
      )
      .eq("provider_id", providerId)
      .eq("payment_status", "paid")
      .gte("paid_at", fromIso)
      .lte("paid_at", toIso)
      .or(providerCollectedRetailOrdersOrFilter());

    const { data: walkInOrders, error: walkInErr } = await walkInQuery;
    if (walkInErr) throw walkInErr;

    let walkInList = (walkInOrders ?? []) as Array<{
      id: string;
      order_number?: string | null;
      customer_id?: string | null;
      customer_name?: string | null;
      total_amount?: number | string | null;
      paid_at?: string | null;
      updated_at?: string | null;
      created_at?: string | null;
    }>;

    if (locationId) {
      walkInList = await filterProductOrdersForLocation(db, providerId, walkInList, locationId);
    }

    for (const row of walkInList) {
      if (orderAggs.has(row.id)) continue;
      const customerName =
        row.customer_name || "Walk-in";
      const ref = row.order_number || row.id;
      if (
        q &&
        !String(ref).toLowerCase().includes(q) &&
        !customerName.toLowerCase().includes(q)
      ) {
        continue;
      }
      const gross = Number(row.total_amount ?? 0);
      extraTotalsRows.push({ gross_total: gross, provider_net: gross, platform_fee: 0, commission: 0 });
      index.push({
        id: row.id,
        source: "product_order",
        sort_date: row.paid_at || row.updated_at || row.created_at || fromIso,
      });
    }
  }

  if (source === "all" || source === "pos") {
    let posQuery = db
      .from("sales")
      .select("id, sale_number, ref_number, sale_date, total_amount, customer_id, location_id")
      .eq("provider_id", providerId)
      .gte("sale_date", fromIso)
      .lte("sale_date", toIso)
      .order("sale_date", { ascending: false })
      .limit(MAX_POS_ROWS);

    const { data: sales, error: sErr } = await posQuery;
    if (sErr) throw sErr;

    const customerIds = [...new Set((sales ?? []).map((s: any) => s.customer_id).filter(Boolean))] as string[];
    const customerMap = new Map<string, string>();
    if (customerIds.length > 0) {
      const users = await fetchInIdChunks<{ id: string; full_name?: string | null }>(customerIds, (slice) =>
        db.from("users").select("id, full_name").in("id", slice),
      );
      for (const u of users) customerMap.set(u.id, String(u.full_name || ""));
    }

    for (const s of sales ?? []) {
      const row = s as any;
      const reportLoc = row.location_id ?? (locationId ? primaryLocationId : null);
      if (locationId && reportLoc !== locationId) continue;
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
      extraTotalsRows.push({ gross_total: gross, provider_net: gross, platform_fee: 0, commission: 0 });
      index.push({
        id: row.id,
        source: "pos",
        sort_date: row.sale_date,
      });
    }
  }

  index.sort((a, b) => (a.sort_date < b.sort_date ? 1 : a.sort_date > b.sort_date ? -1 : 0));

  const totals = computeSalesHistoryTotalsFromAggs(
    bookingAggs,
    orderAggs,
    bookingGrossById,
    orderGrossById,
    extraTotalsRows,
  );

  const offset = (Math.max(1, page) - 1) * limit;
  const pageEntries = index.slice(offset, offset + limit);
  const data = await materializeSalesHistoryRows({
    db,
    providerId,
    primaryLocationId,
    bookingAggs,
    orderAggs,
    entries: pageEntries,
    fromIso,
  });

  return {
    data,
    total: index.length,
    totals,
    truncated_ledger: hit_cap,
    usesDefaultRange,
  };
}

async function materializeSalesHistoryRows(args: {
  db: SupabaseClient;
  providerId: string;
  primaryLocationId: string | null;
  bookingAggs: Map<string, LedgerAgg>;
  orderAggs: Map<string, LedgerAgg>;
  entries: SalesHistoryIndexEntry[];
  fromIso: string;
}): Promise<SalesHistoryRow[]> {
  const { db, providerId, primaryLocationId, bookingAggs, orderAggs, entries, fromIso } = args;
  if (entries.length === 0) return [];

  const bookingIds = entries.filter((e) => e.source === "booking").map((e) => e.id);
  const orderIds = entries.filter((e) => e.source === "product_order").map((e) => e.id);
  const posIds = entries.filter((e) => e.source === "pos").map((e) => e.id);

  const bookingMap = new Map<string, any>();
  if (bookingIds.length > 0) {
    const bookings = await fetchInIdChunks<Record<string, unknown>>(bookingIds, (slice) =>
      db
        .from("bookings")
        .select(
          "id, booking_number, customer_id, guest_name, total_amount, currency, payment_status, location_id, custom_offer_id, is_group_booking, group_booking_id, created_at, updated_at",
        )
        .eq("provider_id", providerId)
        .in("id", slice),
      { throwOnError: true },
    );
    for (const b of bookings) bookingMap.set(String(b.id), b);
  }

  const orderMap = new Map<string, any>();
  if (orderIds.length > 0) {
    const orders = await fetchInIdChunks<Record<string, unknown>>(orderIds, (slice) =>
      db
        .from("product_orders")
        .select(
          "id, order_number, customer_id, customer_name, total_amount, currency, payment_status, fulfillment_type, collection_location_id, paid_at, updated_at, created_at",
        )
        .eq("provider_id", providerId)
        .in("id", slice),
      { throwOnError: true },
    );
    for (const o of orders) orderMap.set(String(o.id), o);
  }

  const posMap = new Map<string, any>();
  if (posIds.length > 0) {
    const sales = await fetchInIdChunks<Record<string, unknown>>(posIds, (slice) =>
      db
        .from("sales")
        .select(
          "id, sale_number, ref_number, sale_date, total_amount, subtotal, tax_amount, payment_status, customer_id, location_id, currency",
        )
        .eq("provider_id", providerId)
        .in("id", slice),
      { throwOnError: true },
    );
    for (const s of sales) posMap.set(String(s.id), s);
  }

  const customerIds = new Set<string>();
  for (const b of bookingMap.values()) if (b.customer_id) customerIds.add(b.customer_id);
  for (const o of orderMap.values()) if (o.customer_id) customerIds.add(o.customer_id);
  for (const s of posMap.values()) if (s.customer_id) customerIds.add(s.customer_id);

  const customerMap = new Map<string, string>();
  if (customerIds.size > 0) {
    const users = await fetchInIdChunks<{ id: string; full_name?: string | null }>([...customerIds], (slice) =>
      db.from("users").select("id, full_name").in("id", slice),
    );
    for (const u of users) customerMap.set(u.id, String(u.full_name || ""));
  }

  const rows: SalesHistoryRow[] = [];
  for (const entry of entries) {
    if (entry.source === "booking") {
      const row = bookingMap.get(entry.id);
      const agg = bookingAggs.get(entry.id);
      if (!row || !agg) continue;
      const customerName =
        (row.customer_id && customerMap.get(row.customer_id)) || row.guest_name || null;
      const ref = row.booking_number || row.id;
      rows.push({
        id: row.id,
        source: "booking",
        subtype: bookingSubtype(row),
        ref_number: String(ref),
        sort_date: entry.sort_date,
        customer_name: customerName,
        gross_total: Number(row.total_amount ?? 0),
        platform_fee: agg.platform_fee,
        commission: agg.commission,
        provider_net: providerNetFromAgg(agg),
        tip: agg.tip,
        tax: agg.tax,
        travel_fee: agg.travel_fee,
        cancellation_fee: agg.cancellation_fee,
        discount_contra: agg.discount_contra,
        refunds: agg.refunds,
        payment_status: row.payment_status ?? null,
        currency: row.currency || "ZAR",
        location_id: row.location_id ?? null,
      });
      continue;
    }

    if (entry.source === "product_order") {
      const row = orderMap.get(entry.id);
      const agg = orderAggs.get(entry.id);
      const reportLoc = row ? productOrderReportLocationId(row, primaryLocationId) : null;
      if (row && agg) {
        const customerName = row.customer_id ? customerMap.get(row.customer_id) ?? null : row.customer_name ?? "Walk-in";
        const ref = row.order_number || row.id;
        rows.push({
          id: row.id,
          source: "product_order",
          subtype: "normal",
          ref_number: String(ref),
          sort_date: entry.sort_date,
          customer_name: customerName,
          gross_total: Number(row.total_amount ?? 0),
          platform_fee: agg.platform_fee,
          commission: agg.commission,
          provider_net: providerNetFromAgg(agg),
          tip: agg.tip,
          tax: agg.tax,
          travel_fee: agg.travel_fee,
          cancellation_fee: agg.cancellation_fee,
          discount_contra: agg.discount_contra,
          refunds: agg.refunds,
          payment_status: row.payment_status ?? null,
          currency: row.currency || "ZAR",
          location_id: reportLoc,
        });
        continue;
      }
      if (row && !agg) {
        const customerName = row.customer_id ? customerMap.get(row.customer_id) ?? null : row.customer_name ?? "Walk-in";
        const ref = row.order_number || row.id;
        const gross = Number(row.total_amount ?? 0);
        rows.push({
          id: row.id,
          source: "product_order",
          subtype: "normal",
          ref_number: String(ref),
          sort_date: entry.sort_date,
          customer_name: customerName,
          gross_total: gross,
          platform_fee: 0,
          commission: 0,
          provider_net: gross,
          tip: 0,
          tax: 0,
          travel_fee: 0,
          cancellation_fee: 0,
          discount_contra: 0,
          refunds: 0,
          payment_status: row.payment_status ?? null,
          currency: row.currency || "ZAR",
          location_id: reportLoc,
        });
      }
      continue;
    }

    if (entry.source === "pos") {
      const row = posMap.get(entry.id);
      if (!row) continue;
      const reportLoc = row.location_id ?? primaryLocationId;
      const customerName = row.customer_id ? customerMap.get(row.customer_id) ?? null : null;
      const ref = row.ref_number || row.sale_number || row.id;
      const gross = Number(row.total_amount ?? 0);
      rows.push({
        id: row.id,
        source: "pos",
        subtype: "normal",
        ref_number: String(ref),
        sort_date: entry.sort_date,
        customer_name: customerName,
        gross_total: gross,
        platform_fee: 0,
        commission: 0,
        provider_net: gross,
        tip: 0,
        tax: Number(row.tax_amount ?? 0),
        travel_fee: 0,
        cancellation_fee: 0,
        discount_contra: 0,
        refunds: 0,
        payment_status: row.payment_status ?? null,
        currency: row.currency || "ZAR",
        location_id: reportLoc,
      });
    }
  }

  return rows;
}

export async function buildProviderSalesHistoryRows(
  params: BuildSalesHistoryParams,
): Promise<{ rows: SalesHistoryRow[]; truncated_ledger: boolean }> {
  const result = await queryProviderSalesHistory({
    ...params,
    page: 1,
    limit: Number.MAX_SAFE_INTEGER,
  });
  return { rows: result.data, truncated_ledger: result.truncated_ledger };
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

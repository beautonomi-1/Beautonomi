import type { SupabaseClient } from "@supabase/supabase-js";
import { differenceInCalendarDays, subDays } from "date-fns";

import { dateRangeBoundsUtc, formatDateYmd, resolveTz } from "@/lib/dates/provider-tz";

export type ProviderReportContext = {
  providerId: string;
  timezone: string;
};

export async function getProviderReportContext(
  supabase: SupabaseClient,
  providerId: string,
): Promise<ProviderReportContext> {
  const { data } = await supabase
    .from("providers")
    .select("timezone")
    .eq("id", providerId)
    .maybeSingle();

  return {
    providerId,
    timezone: resolveTz((data as { timezone?: string | null } | null)?.timezone),
  };
}

export function reportDateRangeFromParams(
  searchParams: URLSearchParams,
  timezone: string,
  opts: { defaultDays?: number; maxDays?: number } = {},
): { fromDate: Date; toDate: Date; fromYmd: string; toYmd: string } {
  const defaultDays = opts.defaultDays ?? 30;
  const todayYmd = formatDateYmd(new Date(), timezone);
  const defaultFromYmd = formatDateYmd(subDays(new Date(), defaultDays - 1), timezone);
  const normalizeParamYmd = (value: string | null, fallback: string) => {
    if (!value) return fallback;
    const ymd = value.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : fallback;
  };
  let fromYmd = normalizeParamYmd(searchParams.get("from") || searchParams.get("start_date"), defaultFromYmd);
  const toYmd = normalizeParamYmd(searchParams.get("to") || searchParams.get("end_date"), todayYmd);

  if (opts.maxDays) {
    const start = new Date(`${fromYmd}T12:00:00.000Z`);
    const end = new Date(`${toYmd}T12:00:00.000Z`);
    if (Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())) {
      const dayCount = differenceInCalendarDays(end, start) + 1;
      if (dayCount > opts.maxDays) {
        fromYmd = formatDateYmd(subDays(end, opts.maxDays - 1), timezone);
      }
    }
  }

  const { fromIso, toIso } = dateRangeBoundsUtc(fromYmd, toYmd, timezone);
  return {
    fromDate: new Date(fromIso),
    toDate: new Date(toIso),
    fromYmd,
    toYmd,
  };
}

export function reportDateKey(date: Date | string, timezone: string): string {
  return formatDateYmd(typeof date === "string" ? new Date(date) : date, timezone);
}

export function eachReportDateKey(fromYmd: string, toYmd: string): string[] {
  const start = new Date(`${fromYmd}T12:00:00.000Z`);
  const end = new Date(`${toYmd}T12:00:00.000Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) {
    return [];
  }
  const keys: string[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    keys.push(cursor.toISOString().slice(0, 10));
  }
  return keys;
}

export type LocationLinkedLedgerRow = {
  booking_id?: string | null;
  product_order_id?: string | null;
};

export type LocationLinkedProductOrderRow = {
  id: string;
  fulfillment_type?: string | null;
  collection_location_id?: string | null;
};

export async function getProviderPrimaryReportLocationId(
  supabase: SupabaseClient,
  providerId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("provider_locations")
    .select("id")
    .eq("provider_id", providerId)
    .eq("is_active", true)
    .eq("location_type", "salon")
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (data as { id?: string } | null)?.id ?? null;
}

export function productOrderReportLocationId(
  order: LocationLinkedProductOrderRow,
  providerPrimaryLocationId?: string | null,
): string | null {
  if (order.collection_location_id) return order.collection_location_id;
  return order.fulfillment_type === "delivery" ? providerPrimaryLocationId ?? null : null;
}

export async function filterProductOrdersForLocation<T extends LocationLinkedProductOrderRow>(
  supabase: SupabaseClient,
  providerId: string,
  orders: T[],
  locationId?: string | null,
): Promise<T[]> {
  if (!locationId || orders.length === 0) return orders;
  const primaryLocationId = await getProviderPrimaryReportLocationId(supabase, providerId);
  return orders.filter((order) => productOrderReportLocationId(order, primaryLocationId) === locationId);
}

export async function filterLedgerRowsForLocation<T extends LocationLinkedLedgerRow>(
  supabase: SupabaseClient,
  providerId: string,
  rows: T[],
  locationId?: string | null,
): Promise<T[]> {
  if (!locationId || rows.length === 0) return rows;

  const bookingIds = [...new Set(rows.map((r) => r.booking_id).filter(Boolean))] as string[];
  const productOrderIds = [...new Set(rows.map((r) => r.product_order_id).filter(Boolean))] as string[];
  const allowedBookingIds = new Set<string>();
  const allowedOrderIds = new Set<string>();

  if (bookingIds.length > 0) {
    const { data } = await supabase
      .from("bookings")
      .select("id")
      .eq("provider_id", providerId)
      .eq("location_id", locationId)
      .in("id", bookingIds);
    for (const row of data ?? []) allowedBookingIds.add((row as { id: string }).id);
  }

  if (productOrderIds.length > 0) {
    const primaryLocationId = await getProviderPrimaryReportLocationId(supabase, providerId);
    const { data } = await supabase
      .from("product_orders")
      .select("id, fulfillment_type, collection_location_id")
      .eq("provider_id", providerId)
      .in("id", productOrderIds);
    for (const row of data ?? []) {
      const order = row as LocationLinkedProductOrderRow;
      if (productOrderReportLocationId(order, primaryLocationId) === locationId) {
        allowedOrderIds.add(order.id);
      }
    }
  }

  return rows.filter((row) => {
    if (row.booking_id) return allowedBookingIds.has(row.booking_id);
    if (row.product_order_id) return allowedOrderIds.has(row.product_order_id);
    return false;
  });
}

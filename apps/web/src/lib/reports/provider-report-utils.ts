import type { SupabaseClient } from "@supabase/supabase-js";
import { differenceInCalendarDays, subDays, subMonths } from "date-fns";
import { toZonedTime } from "date-fns-tz";

import {
  addDaysToYmd,
  dateRangeBoundsUtc,
  formatDateYmd,
  nowInTz,
  resolveTz,
} from "@/lib/dates/provider-tz";
import {
  filterLedgerRowsByScope,
  resolveLedgerLocationScope,
  productOrderReportLocationId as scopeProductOrderReportLocationId,
  type UnattributedLedgerRowPolicy,
} from "@/lib/reports/provider-ledger-location-scope";

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
  opts: { defaultDays?: number; maxDays?: number; defaultMonthsBack?: number } = {},
): { fromDate: Date; toDate: Date; fromYmd: string; toYmd: string } {
  const todayYmd = formatDateYmd(new Date(), timezone);
  const defaultFromYmd =
    opts.defaultMonthsBack != null
      ? formatDateYmd(subMonths(toZonedTime(new Date(), timezone), opts.defaultMonthsBack), timezone)
      : formatDateYmd(subDays(nowInTz(timezone), (opts.defaultDays ?? 30) - 1), timezone);
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
        // Civil calendar: clamp `from` so inclusive days ≤ maxDays (same Y-M-D labels as bounds).
        fromYmd = addDaysToYmd(toYmd, -(opts.maxDays - 1));
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

const YMD_PARAM = /^\d{4}-\d{2}-\d{2}$/;

/** Inclusive list of civil `YYYY-MM-DD` keys from `fromYmd` through `toYmd` (Gregorian; aligned with report bounds). */
export function eachReportDateKey(fromYmd: string, toYmd: string): string[] {
  if (!YMD_PARAM.test(fromYmd) || !YMD_PARAM.test(toYmd) || fromYmd > toYmd) {
    return [];
  }
  const keys: string[] = [];
  const maxKeys = 5000;
  for (let ymd = fromYmd; ymd <= toYmd && keys.length < maxKeys; ymd = addDaysToYmd(ymd, 1)) {
    keys.push(ymd);
  }
  return keys;
}

export type LocationLinkedLedgerRow = {
  booking_id?: string | null;
  product_order_id?: string | null;
};

export type LedgerLocationAttributionSummary = {
  scopedByLocation: boolean;
  excludedUnattributedRows: number;
  note: string;
};

export function summarizeLedgerLocationAttribution<T extends LocationLinkedLedgerRow>(
  rows: T[],
  locationId?: string | null,
): LedgerLocationAttributionSummary {
  const scopedByLocation = Boolean(locationId);
  const excludedUnattributedRows = scopedByLocation
    ? rows.filter((row) => !row.booking_id && !row.product_order_id).length
    : 0;

  return {
    scopedByLocation,
    excludedUnattributedRows,
    note: scopedByLocation
      ? "Location-filtered ledger totals include rows linked to bookings or product orders attributable to the selected location. Provider-level rows with no booking/order linkage are reported as unattributed and excluded from branch totals."
      : "Provider-level ledger rows are included because no location filter is applied.",
  };
}

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
  return scopeProductOrderReportLocationId(order, providerPrimaryLocationId);
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
  options: { unattributedRows?: UnattributedLedgerRowPolicy } = {},
): Promise<T[]> {
  if (!locationId || rows.length === 0) return rows;
  const scope = await resolveLedgerLocationScope(supabase, providerId, rows, locationId, options);
  return filterLedgerRowsByScope(rows, scope, options);
}

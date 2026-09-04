import type { SupabaseClient } from "@supabase/supabase-js";

import { chunkIds } from "@/lib/provider-ops/postgrest-unbounded";
import { dashboardBookingLocationOrFilterFallbacks } from "@/lib/server/provider/dashboard-booking-location-filter";

const LOCATION_SCOPE_IN_CHUNK = 150;

export type UnattributedLedgerRowPolicy = "include" | "exclude";

export type LocationLinkedLedgerRow = {
  booking_id?: string | null;
  product_order_id?: string | null;
};

export type LocationLinkedProductOrderRow = {
  id: string;
  fulfillment_type?: string | null;
  collection_location_id?: string | null;
};

async function getProviderPrimaryReportLocationId(
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

export type LedgerLocationScope = {
  scopedByLocation: boolean;
  locationId: string | null;
  allowedBookingIds: Set<string>;
  allowedOrderIds: Set<string>;
  primaryLocationId: string | null;
  unattributedRows: UnattributedLedgerRowPolicy;
};

export type LedgerRowMatchesLocationOptions = {
  unattributedRows?: UnattributedLedgerRowPolicy;
};

/**
 * Resolve which booking/order ids belong to the selected branch once, then filter
 * ledger rows in memory. Uses the same inclusive semantics as the dashboard
 * (at-home and walk-in bookings with null location_id match any selected branch).
 */
export async function resolveLedgerLocationScope<T extends LocationLinkedLedgerRow>(
  supabase: SupabaseClient,
  providerId: string,
  rows: T[],
  locationId?: string | null,
  options: { unattributedRows?: UnattributedLedgerRowPolicy } = {},
): Promise<LedgerLocationScope> {
  const unattributedRows = options.unattributedRows ?? "exclude";

  if (!locationId || rows.length === 0) {
    return {
      scopedByLocation: Boolean(locationId),
      locationId: locationId ?? null,
      allowedBookingIds: new Set<string>(),
      allowedOrderIds: new Set<string>(),
      primaryLocationId: null,
      unattributedRows,
    };
  }

  const bookingIds = [...new Set(rows.map((r) => r.booking_id).filter(Boolean))] as string[];
  const productOrderIds = [...new Set(rows.map((r) => r.product_order_id).filter(Boolean))] as string[];
  const allowedBookingIds = new Set<string>();
  const allowedOrderIds = new Set<string>();

  let bookingLookupFailed = false;
  if (bookingIds.length > 0) {
    bookingLookupFailed = true;
    for (const filter of dashboardBookingLocationOrFilterFallbacks(locationId)) {
      const matched = new Set<string>();
      let filterFailed = false;
      for (const slice of chunkIds(bookingIds, LOCATION_SCOPE_IN_CHUNK)) {
        const { data, error } = await supabase
          .from("bookings")
          .select("id")
          .eq("provider_id", providerId)
          .or(filter)
          .in("id", slice);
        if (error) {
          filterFailed = true;
          break;
        }
        for (const row of data ?? []) matched.add((row as { id: string }).id);
      }
      if (!filterFailed) {
        bookingLookupFailed = false;
        for (const id of matched) allowedBookingIds.add(id);
        break;
      }
    }
    // All PostgREST location filters failed — keep booking-linked rows visible
    // rather than zeroing earnings/ledger for the selected branch.
    if (bookingLookupFailed) {
      console.warn("[ledger-location-scope] booking location filters failed; leaving booking rows unscoped");
      for (const id of bookingIds) allowedBookingIds.add(id);
    }
  }

  const primaryLocationId = await getProviderPrimaryReportLocationId(supabase, providerId);

  if (productOrderIds.length > 0) {
    for (const slice of chunkIds(productOrderIds, LOCATION_SCOPE_IN_CHUNK)) {
      const { data } = await supabase
        .from("product_orders")
        .select("id, fulfillment_type, collection_location_id")
        .eq("provider_id", providerId)
        .in("id", slice);
      for (const row of data ?? []) {
        const order = row as LocationLinkedProductOrderRow;
        if (productOrderReportLocationId(order, primaryLocationId) === locationId) {
          allowedOrderIds.add(order.id);
        }
      }
    }
  }

  return {
    scopedByLocation: true,
    locationId,
    allowedBookingIds,
    allowedOrderIds,
    primaryLocationId,
    unattributedRows,
  };
}

export function ledgerRowMatchesLocation(
  row: LocationLinkedLedgerRow,
  scope: LedgerLocationScope,
  options: LedgerRowMatchesLocationOptions = {},
): boolean {
  if (!scope.scopedByLocation) return true;

  const unattributedRows = options.unattributedRows ?? scope.unattributedRows;

  if (row.booking_id) return scope.allowedBookingIds.has(row.booking_id);
  if (row.product_order_id) return scope.allowedOrderIds.has(row.product_order_id);

  return unattributedRows === "include";
}

export function filterLedgerRowsByScope<T extends LocationLinkedLedgerRow>(
  rows: T[],
  scope: LedgerLocationScope,
  options: LedgerRowMatchesLocationOptions = {},
): T[] {
  if (!scope.scopedByLocation) return rows;
  return rows.filter((row) => ledgerRowMatchesLocation(row, scope, options));
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { subDays } from "date-fns";
import { dateRangeBoundsUtc, formatDateYmd, nowInTz } from "@/lib/dates/provider-tz";
import {
  filterLedgerRowsForLocation,
  filterProductOrdersForLocation,
} from "@/lib/reports/provider-report-utils";
import { ledgerRowDisplaySign } from "@/lib/provider/provider-ledger-transaction-view";
import { dashboardBookingLocationOrFilter } from "@/lib/server/provider/dashboard-booking-location-filter";

export type ProviderActivityFeedItem = {
  id: string;
  type: string;
  description: string;
  created_at: string;
  data?: { booking_id?: string; product_order_id?: string; client_name?: string; amount?: number };
};

export type ProviderActivityFeedPayload = {
  activities: ProviderActivityFeedItem[];
  basis: Record<string, string>;
  timezone: string;
  window: { fromYmd: string; toYmd: string };
};

type LedgerFetchRow = {
  id: string;
  transaction_type: string;
  description?: string | null;
  amount?: number | null;
  net?: number | null;
  created_at: string;
  booking_id?: string | null;
  product_order_id?: string | null;
};

/**
 * Mixed activity feed: bookings created in window, ledger earnings & payouts, reviews —
 * merged by timestamp descending.
 */
export async function buildProviderActivityFeed(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  opts: {
    timezone: string;
    locationId?: string | null;
    limit?: number;
    fetchMultiplier?: number;
  },
): Promise<ProviderActivityFeedPayload> {
  const tz = opts.timezone;
  const limit = opts.limit ?? 10;
  const mult = opts.fetchMultiplier ?? 2;
  const locationId = opts.locationId ?? null;

  const zNow = nowInTz(tz);
  const fromYmd = formatDateYmd(subDays(zNow, 13), tz);
  const todayYmd = formatDateYmd(zNow, tz);
  const since = new Date(dateRangeBoundsUtc(fromYmd, todayYmd, tz).fromIso);

  let bookingsQuery = supabaseAdmin
    .from("bookings")
    .select("id, status, created_at, scheduled_at, location_id, customers(full_name)")
    .eq("provider_id", providerId)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(limit * mult);

  if (locationId) {
    bookingsQuery = bookingsQuery.or(dashboardBookingLocationOrFilter(locationId));
  }

  const ledgerQuery = supabaseAdmin
    .from("finance_transactions")
    .select("id, transaction_type, description, amount, net, created_at, booking_id, product_order_id")
    .eq("provider_id", providerId)
    .in("transaction_type", [
      "provider_earnings",
      "payout",
      "tip",
      "travel_fee",
      "cancellation_fee",
      "walk_in_additional_charge",
    ])
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(limit * mult);

  const productOrdersQuery = supabaseAdmin
    .from("product_orders")
    .select(
      "id, order_number, order_source, total_amount, paid_at, customer_name, fulfillment_type, collection_location_id",
    )
    .eq("provider_id", providerId)
    .eq("payment_status", "paid")
    .gte("paid_at", since.toISOString())
    .order("paid_at", { ascending: false })
    .limit(limit * mult);

  const [{ data: bookingRows }, { data: ledgerRaw }, { data: productOrdersRaw }] =
    await Promise.all([bookingsQuery, ledgerQuery, productOrdersQuery]);

  let productOrderRows = (productOrdersRaw ?? []) as Array<{
    id: string;
    order_number?: string | null;
    order_source?: string | null;
    total_amount?: number | string | null;
    paid_at?: string | null;
    customer_name?: string | null;
    fulfillment_type?: string | null;
    collection_location_id?: string | null;
  }>;
  if (locationId && productOrderRows.length > 0) {
    productOrderRows = await filterProductOrdersForLocation(
      supabaseAdmin,
      providerId,
      productOrderRows,
      locationId,
    );
  }

  const rawLedger = (ledgerRaw ?? []) as LedgerFetchRow[];
  let earningsRows = rawLedger.filter((r) =>
    ["provider_earnings", "tip", "travel_fee", "cancellation_fee", "walk_in_additional_charge"].includes(
      r.transaction_type,
    ),
  );
  const payoutRows = rawLedger.filter((r) => r.transaction_type === "payout");

  if (locationId && earningsRows.length > 0) {
    earningsRows = await filterLedgerRowsForLocation(supabaseAdmin, providerId, earningsRows, locationId);
  }

  const ledgerRows = [...earningsRows, ...payoutRows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const ledgerRecognizedProductOrderIds = new Set(
    earningsRows
      .filter((r) => r.transaction_type === "provider_earnings" && r.product_order_id)
      .map((r) => String(r.product_order_id)),
  );

  const { data: reviewRows } = await supabaseAdmin
    .from("reviews")
    .select("id, rating, comment, created_at, customers(full_name)")
    .eq("provider_id", providerId)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(8);

  const activities: ProviderActivityFeedItem[] = [];

  (bookingRows || []).forEach((b: Record<string, unknown>) => {
    const id = String(b.id ?? "");
    const clientName =
      (b.customers as { full_name?: string } | null)?.full_name || "Walk-in";
    const status = String(b.status ?? "");

    let type = "booking_created";
    let desc = `Booking created · ${clientName}`;

    if (status === "completed") {
      type = "booking_completed";
      desc = `Appointment completed · ${clientName}`;
    } else if (status === "cancelled") {
      type = "booking_cancelled";
      desc = `Booking cancelled · ${clientName}`;
    }

    activities.push({
      id: `booking-${id}`,
      type,
      description: desc,
      created_at: String(b.created_at ?? ""),
      data: { booking_id: id, client_name: clientName },
    });
  });

  ledgerRows.forEach((p) => {
    const rawNet = Number(p.net ?? p.amount ?? 0);
    const isPayout = p.transaction_type === "payout";
    const sign = ledgerRowDisplaySign({
      transaction_type: p.transaction_type,
      net: p.net,
      amount: p.amount,
    });
    const displayNet = sign * Math.abs(rawNet);
    const signed =
      displayNet > 0 ? `+${displayNet.toFixed(2)}` : displayNet.toFixed(2);

    let type = "ledger_earnings";
    let description = `Earnings recognized · net ${signed}`;
    if (isPayout) {
      type = "payout_sent";
      description = `Payout · net ${signed}`;
    } else if (p.transaction_type === "tip") {
      type = "tip_recognized";
      description = `Tip recognized · net ${signed}`;
    } else if (p.transaction_type === "travel_fee") {
      type = "travel_fee_recognized";
      description = `Travel fee recognized · net ${signed}`;
    } else if (p.transaction_type === "cancellation_fee") {
      type = "cancellation_fee_recognized";
      description = `Cancellation fee recognized · net ${signed}`;
    } else if (
      p.transaction_type === "walk_in_additional_charge" ||
      (p.description || "").toLowerCase().includes("additional charge")
    ) {
      type = "additional_charge_earnings";
      description = `Additional charge earnings recognized · net ${signed}`;
    } else if (p.product_order_id) {
      type = "product_order_earnings";
      description = `Product order earnings recognized · net ${signed}`;
    } else if (p.booking_id) {
      type = "booking_earnings";
      description = `Appointment earnings recognized · net ${signed}`;
    }

    activities.push({
      id: `ledger-${p.id}`,
      type,
      description,
      created_at: p.created_at,
      data: {
        booking_id: p.booking_id ?? undefined,
        product_order_id: p.product_order_id ?? undefined,
        amount: displayNet,
      },
    });
  });

  for (const po of productOrderRows) {
    if (ledgerRecognizedProductOrderIds.has(po.id)) continue;

    const orderNumber = String(po.order_number ?? po.id);
    const amount = Number(po.total_amount ?? 0);
    const isWalkIn = String(po.order_source ?? "") === "walk_in";
    const label = isWalkIn ? "Walk-in retail sale" : "Product order paid";
    activities.push({
      id: `product-order-${po.id}`,
      type: "product_sale_completed",
      description: `${label} · ${orderNumber} · ${amount.toFixed(2)}`,
      created_at: String(po.paid_at ?? ""),
      data: {
        product_order_id: po.id,
        client_name: po.customer_name ?? (isWalkIn ? "Walk-in" : undefined),
        amount,
      },
    });
  }

  (reviewRows || []).forEach((r: Record<string, unknown>) => {
    const clientName =
      (r.customers as { full_name?: string } | null)?.full_name || "Client";
    activities.push({
      id: `review-${String(r.id ?? "")}`,
      type: "new_review",
      description: `${clientName} · ${String(r.rating ?? "?")}-star review`,
      created_at: String(r.created_at ?? ""),
      data: { client_name: clientName },
    });
  });

  activities.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const basis: Record<string, string> = {
    window: `Rolling ${fromYmd}–${todayYmd} in ${tz.replace(/_/g, " ")} (bookings created, paid product orders, ledger recognition, reviews submitted).`,
    product_orders:
      "Paid provider-collected product orders (walk-in and COD/cash/Yoco) by paid_at. Platform-settled online orders appear once as ledger earnings only.",
    bookings:
      "Rows reflect bookings whose created_at falls in the window; description uses current status (e.g. completed vs new).",
    ledger:
      "Earnings rows (provider_earnings, tip, travel_fee, cancellation_fee) are branch-scoped when a location is selected. Payout rows in the window are always included (payouts are not tied to a single branch in this feed).",
    reviews:
      locationId != null
        ? "Reviews are still shown organization-wide (no reliable branch filter on this feed)."
        : "Reviews for your provider in the same date window.",
    ordering: "Newest events first after merging streams.",
  };

  return {
    activities: activities.slice(0, limit),
    basis,
    timezone: tz,
    window: { fromYmd, toYmd: todayYmd },
  };
}

/** Supports legacy API shape where `data` was a bare array of items. */
export function unwrapActivityFeedPayload(
  data: ProviderActivityFeedPayload | ProviderActivityFeedItem[] | null | undefined,
): { activities: ProviderActivityFeedItem[]; meta: Omit<ProviderActivityFeedPayload, "activities"> | null } {
  if (data == null) return { activities: [], meta: null };
  if (Array.isArray(data)) return { activities: data, meta: null };
  return {
    activities: data.activities ?? [],
    meta: {
      basis: data.basis,
      timezone: data.timezone,
      window: data.window,
    },
  };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { subDays } from "date-fns";
import { dateRangeBoundsUtc, formatDateYmd, nowInTz } from "@/lib/dates/provider-tz";
import { isProviderEarningsRefundComponent } from "@/lib/ledger/refund-components";
import {
  filterLedgerRowsForLocation,
  filterProductOrdersForLocation,
} from "@/lib/reports/provider-report-utils";
import { isProviderCollectedRetailOrder } from "@/lib/reports/provider-retail-order-scope";
import { ledgerRowDisplaySign } from "@/lib/provider/provider-ledger-transaction-view";
import {
  buildActivityFeedExcludedBasis,
  PROVIDER_ACTIVITY_FEED_BOOKING_EVENT_TYPES,
  PROVIDER_ACTIVITY_FEED_LEDGER_TYPES,
  PROVIDER_ACTIVITY_FEED_NEW_CLIENT_SOURCES,
} from "@/lib/provider/activity-feed-coverage";
import {
  bookingMatchesDashboardLocation,
  dashboardBookingLocationOrFilter,
} from "@/lib/server/provider/dashboard-booking-location-filter";
import { fetchInIdChunks } from "@/lib/provider-ops/postgrest-unbounded";

/** Default per-stream fetch cap multiplier (parallel streams merge before slice). */
export const ACTIVITY_FEED_FETCH_MULTIPLIER = 4;

const ORG_WIDE_LEDGER_TYPES = new Set(["payout", "provider_subscription_payment", "provider_ads_payment"]);
const BRANCH_SCOPED_LEDGER_TYPES = new Set([
  "provider_earnings",
  "tip",
  "travel_fee",
  "cancellation_fee",
  "walk_in_additional_charge",
  "refund",
  "gift_card_sale",
  "membership_sale",
]);

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
  refund_component?: string | null;
};

type BookingFetchRow = {
  id: string;
  status?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  updated_at?: string | null;
  booking_number?: string | null;
  booking_source?: string | null;
  location_id?: string | null;
  location_type?: string | null;
  customers?: { full_name?: string } | null;
};

type BookingEventFetchRow = {
  id: string;
  booking_id: string;
  event_type: string;
  event_data?: Record<string, unknown> | null;
  created_at: string;
  bookings: BookingFetchRow | BookingFetchRow[] | null;
};

export function bookingClientName(row: BookingFetchRow): string {
  return row.customers?.full_name?.trim() || "Walk-in";
}

export function bookingRefLabel(row: BookingFetchRow): string {
  const num = row.booking_number?.trim();
  return num ? ` · ${num}` : "";
}

export function bookingCreatedLabel(row: BookingFetchRow): string {
  const source = String(row.booking_source ?? "").toLowerCase();
  if (source === "online") return "Customer booked online";
  if (source === "walk_in") return "Walk-in appointment";
  if (source === "group_booking") return "Group booking added";
  return "New appointment";
}

export function mapBookingCreatedActivity(row: BookingFetchRow): ProviderActivityFeedItem {
  const id = String(row.id ?? "");
  const clientName = bookingClientName(row);
  return {
    id: `booking-created-${id}`,
    type: "booking_created",
    description: `${bookingCreatedLabel(row)}${bookingRefLabel(row)} · ${clientName}`,
    created_at: String(row.created_at ?? ""),
    data: { booking_id: id, client_name: clientName },
  };
}

export function mapBookingCompletedActivity(row: BookingFetchRow): ProviderActivityFeedItem {
  const id = String(row.id ?? "");
  const clientName = bookingClientName(row);
  return {
    id: `booking-completed-${id}`,
    type: "booking_completed",
    description: `Appointment completed${bookingRefLabel(row)} · ${clientName}`,
    created_at: String(row.completed_at ?? ""),
    data: { booking_id: id, client_name: clientName },
  };
}

export function mapBookingCancelledActivity(row: BookingFetchRow): ProviderActivityFeedItem {
  const id = String(row.id ?? "");
  const clientName = bookingClientName(row);
  return {
    id: `booking-cancelled-${id}`,
    type: "booking_cancelled",
    description: `Booking cancelled${bookingRefLabel(row)} · ${clientName}`,
    created_at: String(row.cancelled_at ?? ""),
    data: { booking_id: id, client_name: clientName },
  };
}

export function mapBookingNoShowActivity(row: BookingFetchRow): ProviderActivityFeedItem {
  const id = String(row.id ?? "");
  const clientName = bookingClientName(row);
  return {
    id: `booking-no-show-${id}`,
    type: "booking_no_show",
    description: `No-show${bookingRefLabel(row)} · ${clientName}`,
    created_at: String(row.updated_at ?? row.cancelled_at ?? ""),
    data: { booking_id: id, client_name: clientName },
  };
}

export function productOrderActivityLabel(row: {
  order_source?: string | null;
  payment_method?: string | null;
}): string {
  if (String(row.order_source ?? "") === "walk_in") return "Walk-in retail sale";
  if (isProviderCollectedRetailOrder(row)) return "Online product order paid (you collected)";
  if (String(row.order_source ?? "") === "online") return "Online product order paid";
  return "Product order paid";
}

export function mapBookingRescheduledActivity(
  row: BookingFetchRow,
  event: { id: string; created_at: string },
): ProviderActivityFeedItem {
  const id = String(row.id ?? "");
  const clientName = bookingClientName(row);
  return {
    id: `booking-rescheduled-${event.id}`,
    type: "booking_rescheduled",
    description: `Appointment rescheduled${bookingRefLabel(row)} · ${clientName}`,
    created_at: event.created_at,
    data: { booking_id: id, client_name: clientName },
  };
}

export function mapBookingConfirmedActivity(
  row: BookingFetchRow,
  event: { id: string; created_at: string },
): ProviderActivityFeedItem {
  const id = String(row.id ?? "");
  const clientName = bookingClientName(row);
  return {
    id: `booking-confirmed-${event.id}`,
    type: "booking_confirmed",
    description: `Appointment confirmed${bookingRefLabel(row)} · ${clientName}`,
    created_at: event.created_at,
    data: { booking_id: id, client_name: clientName },
  };
}

export function mapBookingServiceStartedActivity(
  row: BookingFetchRow,
  event: { id: string; created_at: string },
): ProviderActivityFeedItem {
  const id = String(row.id ?? "");
  const clientName = bookingClientName(row);
  return {
    id: `booking-started-${event.id}`,
    type: "booking_started",
    description: `Service started${bookingRefLabel(row)} · ${clientName}`,
    created_at: event.created_at,
    data: { booking_id: id, client_name: clientName },
  };
}

export function mapPaymentReceivedActivity(
  row: BookingFetchRow,
  payment: { id: string; amount?: number | null; created_at: string },
): ProviderActivityFeedItem {
  const id = String(row.id ?? "");
  const clientName = bookingClientName(row);
  const amount = Number(payment.amount ?? 0);
  return {
    id: `payment-received-${payment.id}`,
    type: "payment_received",
    description: `Payment received${bookingRefLabel(row)} · ${clientName}${
      Number.isFinite(amount) && amount > 0 ? ` · ${amount.toFixed(2)}` : ""
    }`,
    created_at: payment.created_at,
    data: { booking_id: id, client_name: clientName, amount },
  };
}

export function mapJourneyEventActivity(
  row: BookingFetchRow,
  event: { id: string; event_type: string; created_at: string },
): ProviderActivityFeedItem {
  const id = String(row.id ?? "");
  const clientName = bookingClientName(row);
  const label =
    event.event_type === "provider_on_way"
      ? "Provider en route"
      : event.event_type === "provider_arrived"
        ? "Provider arrived"
        : "Additional charge paid";
  const type =
    event.event_type === "additional_payment_paid"
      ? "additional_charge_paid"
      : event.event_type;
  return {
    id: `booking-event-${event.id}`,
    type,
    description: `${label}${bookingRefLabel(row)} · ${clientName}`,
    created_at: event.created_at,
    data: { booking_id: id, client_name: clientName },
  };
}

type ProviderClientFetchRow = {
  id: string;
  created_at: string;
  relationship_source?: string | null;
  created_by_user_id?: string | null;
  customer_id?: string | null;
  users?: { full_name?: string | null } | { full_name?: string | null }[] | null;
};

export function newClientActivityLabel(source: string): string {
  switch (source) {
    case "manual_new_customer":
      return "New client saved";
    case "manual_existing_platform":
      return "Platform client linked";
    case "import":
      return "Client imported";
    case "sale":
      return "Client added from sale";
    case "product_order":
      return "Client added from product order";
    case "conversation":
      return "Client from conversation";
    default:
      return "Client saved";
  }
}

export function shouldIncludeProviderClientRow(row: ProviderClientFetchRow): boolean {
  const source = String(row.relationship_source ?? "");
  if (source === "booking") return false;
  if (source === "manual" && !row.created_by_user_id) return false;
  return (PROVIDER_ACTIVITY_FEED_NEW_CLIENT_SOURCES as readonly string[]).includes(source);
}

export function mapNewClientActivity(row: ProviderClientFetchRow): ProviderActivityFeedItem | null {
  if (!shouldIncludeProviderClientRow(row)) return null;
  const u = row.users;
  const user = Array.isArray(u) ? u[0] : u;
  const clientName = user?.full_name?.trim() || "Client";
  const source = String(row.relationship_source ?? "manual");
  return {
    id: `client-${row.id}`,
    type: "new_client",
    description: `${newClientActivityLabel(source)} · ${clientName}`,
    created_at: row.created_at,
    data: { client_name: clientName },
  };
}

export function mapLedgerRowToActivity(p: LedgerFetchRow): ProviderActivityFeedItem {
  const rawNet = Number(p.net ?? p.amount ?? 0);
  const isPayout = p.transaction_type === "payout";
  const sign = ledgerRowDisplaySign({
    transaction_type: p.transaction_type,
    net: p.net,
    amount: p.amount,
  });
  const displayNet = sign * Math.abs(rawNet);
  const signed = displayNet > 0 ? `+${displayNet.toFixed(2)}` : displayNet.toFixed(2);

  let type = "ledger_earnings";
  let description = `Earnings recognized · net ${signed}`;
  if (isPayout) {
    type = "payout_sent";
    description = `Payout · net ${signed}`;
  } else if (p.transaction_type === "refund") {
    type = "refund_recognized";
    description = `Refund · net ${signed}`;
  } else if (p.transaction_type === "provider_subscription_payment") {
    type = "subscription_charge";
    description = `Subscription charge · net ${signed}`;
  } else if (p.transaction_type === "provider_ads_payment") {
    type = "ads_payment";
    description = `Ads spend · net ${signed}`;
  } else if (p.transaction_type === "gift_card_sale") {
    type = "gift_card_sale";
    description = `Gift card sold · net ${signed}`;
  } else if (p.transaction_type === "membership_sale") {
    type = "membership_sale";
    description = `Membership sold · net ${signed}`;
  } else if (p.transaction_type === "tip") {
    type = "tip_recognized";
    description = `Tip recognized · net ${signed}`;
  } else if (p.transaction_type === "travel_fee") {
    type = "travel_fee_recognized";
    description = `Travel fee recognized · net ${signed}`;
  } else if (p.transaction_type === "cancellation_fee") {
    type = "cancellation_fee_recognized";
    description = `Cancellation fee recognized · net ${signed}`;
  } else if (p.transaction_type === "provider_earnings" && displayNet < 0) {
    type = "earnings_reversal";
    description = `Earnings reversal · net ${signed}`;
  } else if (
    p.transaction_type === "walk_in_additional_charge" ||
    (p.description || "").toLowerCase().includes("additional charge")
  ) {
    type = "additional_charge_earnings";
    description = `Additional charge earnings recognized · net ${signed}`;
  } else if (p.product_order_id) {
    type = "product_order_earnings";
    description = `Online product order earnings · net ${signed}`;
  } else if (p.booking_id) {
    type = "booking_earnings";
    description = `Appointment earnings recognized · net ${signed}`;
  }

  return {
    id: `ledger-${p.id}`,
    type,
    description,
    created_at: p.created_at,
    data: {
      booking_id: p.booking_id ?? undefined,
      product_order_id: p.product_order_id ?? undefined,
      amount: displayNet,
    },
  };
}

export function mergeActivityFeedItems(
  items: ProviderActivityFeedItem[],
  limit: number,
): ProviderActivityFeedItem[] {
  const sorted = [...items]
    .filter((item) => {
      const ts = new Date(item.created_at).getTime();
      return item.created_at && Number.isFinite(ts);
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return sorted.slice(0, limit);
}

function unwrapJoinedBooking(row: BookingEventFetchRow): BookingFetchRow | null {
  const b = row.bookings;
  if (Array.isArray(b)) return b[0] ?? null;
  return b ?? null;
}

/**
 * Mixed activity feed: booking lifecycle milestones, ledger earnings & payouts, paid retail
 * orders, reviews — merged by timestamp descending.
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
  const mult = opts.fetchMultiplier ?? ACTIVITY_FEED_FETCH_MULTIPLIER;
  const locationId = opts.locationId ?? null;
  const perStreamLimit = limit * mult;

  const zNow = nowInTz(tz);
  const fromYmd = formatDateYmd(subDays(zNow, 13), tz);
  const todayYmd = formatDateYmd(zNow, tz);
  const since = new Date(dateRangeBoundsUtc(fromYmd, todayYmd, tz).fromIso);

  const bookingSelect =
    "id, status, created_at, completed_at, cancelled_at, updated_at, booking_number, booking_source, location_id, location_type, customers(full_name)";

  let createdBookingsQuery = supabaseAdmin
    .from("bookings")
    .select(bookingSelect)
    .eq("provider_id", providerId)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(perStreamLimit);

  let completedBookingsQuery = supabaseAdmin
    .from("bookings")
    .select(bookingSelect)
    .eq("provider_id", providerId)
    .not("completed_at", "is", null)
    .gte("completed_at", since.toISOString())
    .order("completed_at", { ascending: false })
    .limit(perStreamLimit);

  let cancelledBookingsQuery = supabaseAdmin
    .from("bookings")
    .select(bookingSelect)
    .eq("provider_id", providerId)
    .not("cancelled_at", "is", null)
    .gte("cancelled_at", since.toISOString())
    .order("cancelled_at", { ascending: false })
    .limit(perStreamLimit);

  let noShowBookingsQuery = supabaseAdmin
    .from("bookings")
    .select(bookingSelect)
    .eq("provider_id", providerId)
    .eq("status", "no_show")
    .gte("updated_at", since.toISOString())
    .order("updated_at", { ascending: false })
    .limit(perStreamLimit);

  const bookingEventsQuery = supabaseAdmin
    .from("booking_events")
    .select(
      `id, booking_id, event_type, event_data, created_at, bookings!inner(${bookingSelect})`,
    )
    .eq("bookings.provider_id", providerId)
    .in("event_type", [...PROVIDER_ACTIVITY_FEED_BOOKING_EVENT_TYPES])
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(perStreamLimit);

  if (locationId) {
    const locFilter = dashboardBookingLocationOrFilter(locationId);
    createdBookingsQuery = createdBookingsQuery.or(locFilter);
    completedBookingsQuery = completedBookingsQuery.or(locFilter);
    cancelledBookingsQuery = cancelledBookingsQuery.or(locFilter);
    noShowBookingsQuery = noShowBookingsQuery.or(locFilter);
  }

  const ledgerQuery = supabaseAdmin
    .from("finance_transactions")
    .select(
      "id, transaction_type, description, amount, net, created_at, booking_id, product_order_id, refund_component",
    )
    .eq("provider_id", providerId)
    .in("transaction_type", [...PROVIDER_ACTIVITY_FEED_LEDGER_TYPES])
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(perStreamLimit);

  const productOrdersQuery = supabaseAdmin
    .from("product_orders")
    .select(
      "id, order_number, order_source, payment_method, total_amount, paid_at, customer_name, fulfillment_type, collection_location_id",
    )
    .eq("provider_id", providerId)
    .eq("payment_status", "paid")
    .or("order_source.is.null,order_source.neq.appointment")
    .gte("paid_at", since.toISOString())
    .order("paid_at", { ascending: false })
    .limit(perStreamLimit);

  const newClientsQuery = supabaseAdmin
    .from("provider_clients")
    .select("id, created_at, relationship_source, created_by_user_id, customer_id, users(full_name)")
    .eq("provider_id", providerId)
    .in("relationship_source", [...PROVIDER_ACTIVITY_FEED_NEW_CLIENT_SOURCES])
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(perStreamLimit);

  const bookingPaymentsQuery = supabaseAdmin
    .from("booking_payments")
    .select(
      `id, booking_id, amount, created_at, bookings!inner(${bookingSelect})`,
    )
    .eq("bookings.provider_id", providerId)
    .eq("status", "completed")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(perStreamLimit);

  const [
    { data: createdBookingRows },
    { data: completedBookingRows },
    { data: cancelledBookingRows },
    { data: noShowBookingRows },
    { data: bookingEventRows },
    { data: ledgerRaw },
    { data: productOrdersRaw },
    { data: newClientRows },
    { data: bookingPaymentRows },
  ] = await Promise.all([
    createdBookingsQuery,
    completedBookingsQuery,
    cancelledBookingsQuery,
    noShowBookingsQuery,
    bookingEventsQuery,
    ledgerQuery,
    productOrdersQuery,
    newClientsQuery,
    bookingPaymentsQuery,
  ]);

  let productOrderRows = (productOrdersRaw ?? []) as Array<{
    id: string;
    order_number?: string | null;
    order_source?: string | null;
    payment_method?: string | null;
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
  let branchScopedRows = rawLedger.filter((r) => BRANCH_SCOPED_LEDGER_TYPES.has(r.transaction_type));
  branchScopedRows = branchScopedRows.filter(
    (r) => r.transaction_type !== "refund" || isProviderEarningsRefundComponent(r.refund_component),
  );
  const orgWideRows = rawLedger.filter((r) => ORG_WIDE_LEDGER_TYPES.has(r.transaction_type));

  if (locationId && branchScopedRows.length > 0) {
    branchScopedRows = await filterLedgerRowsForLocation(
      supabaseAdmin,
      providerId,
      branchScopedRows,
      locationId,
    );
  }

  const ledgerRows = [...branchScopedRows, ...orgWideRows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const ledgerRecognizedProductOrderIds = new Set(
    branchScopedRows
      .filter((r) => r.transaction_type === "provider_earnings" && r.product_order_id)
      .map((r) => String(r.product_order_id)),
  );

  const { data: reviewRows } = await supabaseAdmin
    .from("reviews")
    .select("id, rating, comment, created_at, customers(full_name)")
    .eq("provider_id", providerId)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(Math.max(8, perStreamLimit));

  const activities: ProviderActivityFeedItem[] = [];
  const seenNoShowIds = new Set<string>();

  for (const row of (createdBookingRows ?? []) as BookingFetchRow[]) {
    activities.push(mapBookingCreatedActivity(row));
  }
  for (const row of (completedBookingRows ?? []) as BookingFetchRow[]) {
    activities.push(mapBookingCompletedActivity(row));
  }
  for (const row of (cancelledBookingRows ?? []) as BookingFetchRow[]) {
    if (String(row.status ?? "") === "no_show") {
      seenNoShowIds.add(String(row.id));
      activities.push(mapBookingNoShowActivity(row));
      continue;
    }
    activities.push(mapBookingCancelledActivity(row));
  }
  for (const row of (noShowBookingRows ?? []) as BookingFetchRow[]) {
    const id = String(row.id ?? "");
    if (!id || seenNoShowIds.has(id)) continue;
    activities.push(mapBookingNoShowActivity(row));
  }

  for (const event of (bookingEventRows ?? []) as BookingEventFetchRow[]) {
    const booking = unwrapJoinedBooking(event);
    if (!booking || !bookingMatchesDashboardLocation(locationId, booking)) continue;
    if (event.event_type === "rescheduled") {
      activities.push(
        mapBookingRescheduledActivity(booking, { id: event.id, created_at: event.created_at }),
      );
      continue;
    }
    if (event.event_type === "confirmed") {
      activities.push(
        mapBookingConfirmedActivity(booking, { id: event.id, created_at: event.created_at }),
      );
      continue;
    }
    if (event.event_type === "service_started") {
      activities.push(
        mapBookingServiceStartedActivity(booking, { id: event.id, created_at: event.created_at }),
      );
      continue;
    }
    if (
      event.event_type === "provider_on_way" ||
      event.event_type === "provider_arrived" ||
      event.event_type === "additional_payment_paid"
    ) {
      activities.push(
        mapJourneyEventActivity(booking, {
          id: event.id,
          event_type: event.event_type,
          created_at: event.created_at,
        }),
      );
    }
  }

  for (const row of (newClientRows ?? []) as ProviderClientFetchRow[]) {
    const item = mapNewClientActivity(row);
    if (item) activities.push(item);
  }

  const paymentRows = (bookingPaymentRows ?? []) as Array<{
    id: string;
    booking_id: string;
    amount?: number | null;
    created_at: string;
    bookings: BookingFetchRow | BookingFetchRow[] | null;
  }>;
  const paymentIds = paymentRows.map((row) => row.id).filter(Boolean);
  const postedPaymentIds = new Set<string>();
  if (paymentIds.length > 0) {
    const postedPayments = await fetchInIdChunks<{ source_payment_id?: string | null }>(
      paymentIds,
      (slice) =>
        supabaseAdmin
          .from("finance_transactions")
          .select("source_payment_id")
          .eq("provider_id", providerId)
          .eq("transaction_type", "payment")
          .in("source_payment_id", slice),
    );
    for (const row of postedPayments) {
      if (row.source_payment_id) postedPaymentIds.add(String(row.source_payment_id));
    }
  }
  for (const payment of paymentRows) {
    if (postedPaymentIds.has(payment.id)) continue;
    const booking = Array.isArray(payment.bookings) ? payment.bookings[0] ?? null : payment.bookings;
    if (!booking || !bookingMatchesDashboardLocation(locationId, booking)) continue;
    activities.push(
      mapPaymentReceivedActivity(booking, {
        id: payment.id,
        amount: payment.amount,
        created_at: payment.created_at,
      }),
    );
  }

  ledgerRows.forEach((p) => {
    activities.push(mapLedgerRowToActivity(p));
  });

  for (const po of productOrderRows) {
    if (ledgerRecognizedProductOrderIds.has(po.id)) continue;

    const orderNumber = String(po.order_number ?? po.id);
    const amount = Number(po.total_amount ?? 0);
    const isWalkIn = String(po.order_source ?? "") === "walk_in";
    const label = productOrderActivityLabel(po);
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

  const basis: Record<string, string> = {
    window: `Rolling ${fromYmd}–${todayYmd} in ${tz.replace(/_/g, " ")} (appointments, clients, retail, ledger, reviews).`,
    product_orders:
      "Paid walk-in and provider-collected online orders by paid_at. Platform-checkout online orders appear once as ledger earnings (not duplicated here). Appointment add-on mirrors are excluded.",
    bookings:
      "Milestones: new appointments (created_at), completions (completed_at), cancellations (cancelled_at), no-shows (updated_at). Booking events: reschedules, confirmations, and service started (in-progress). Completed booking_payments appear as payment_received when no finance_transactions.payment row exists yet for that source_payment_id. A booking can appear more than once across milestones.",
    clients:
      "Provider-saved or imported CRM clients (manual, import, sale, product order, conversation). Auto-created booking CRM rows are excluded to avoid duplicating appointment events.",
    ledger:
      "Earnings, tips, travel, add-ons, gift cards, memberships, subscription charges, ads spend, refunds, reversals, and payouts. Branch-scoped types respect location filter; subscription, ads, and payouts are organization-wide.",
    reviews:
      locationId != null
        ? "Reviews are still shown organization-wide (no reliable branch filter on this feed)."
        : "Reviews for your provider in the same date window.",
    excluded: buildActivityFeedExcludedBasis(),
    ordering: "Newest events first after merging streams.",
  };

  return {
    activities: mergeActivityFeedItems(activities, limit),
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

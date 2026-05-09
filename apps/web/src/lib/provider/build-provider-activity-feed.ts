import type { SupabaseClient } from "@supabase/supabase-js";
import { subDays } from "date-fns";
import { dateRangeBoundsUtc, formatDateYmd, nowInTz } from "@/lib/dates/provider-tz";
import { filterLedgerRowsForLocation } from "@/lib/reports/provider-report-utils";

export type ProviderActivityFeedItem = {
  id: string;
  type: string;
  description: string;
  created_at: string;
  data?: { booking_id?: string; client_name?: string; amount?: number };
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
    bookingsQuery = bookingsQuery.eq("location_id", locationId);
  }

  const ledgerQuery = supabaseAdmin
    .from("finance_transactions")
    .select("id, transaction_type, amount, net, created_at, booking_id, product_order_id")
    .eq("provider_id", providerId)
    .in("transaction_type", ["provider_earnings", "payout"])
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(limit * mult);

  const [{ data: bookingRows }, { data: ledgerRaw }] = await Promise.all([bookingsQuery, ledgerQuery]);

  const rawLedger = (ledgerRaw ?? []) as LedgerFetchRow[];
  let earningsRows = rawLedger.filter((r) => r.transaction_type === "provider_earnings");
  const payoutRows = rawLedger.filter((r) => r.transaction_type === "payout");

  if (locationId && earningsRows.length > 0) {
    earningsRows = await filterLedgerRowsForLocation(supabaseAdmin, providerId, earningsRows, locationId);
  }

  const ledgerRows = [...earningsRows, ...payoutRows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
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
    const net = Number(p.net ?? p.amount ?? 0);
    const isPayout = p.transaction_type === "payout";
    const signed = net >= 0 ? `+${net.toFixed(2)}` : net.toFixed(2);

    activities.push({
      id: `ledger-${p.id}`,
      type: isPayout ? "payout_sent" : "ledger_earnings",
      description: isPayout ? `Payout · net ${signed}` : `Earnings recognized · net ${signed}`,
      created_at: p.created_at,
      data: { booking_id: p.booking_id ?? undefined, amount: net },
    });
  });

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
    window: `Rolling ${fromYmd}–${todayYmd} in ${tz.replace(/_/g, " ")} (bookings created, ledger recognition, reviews submitted).`,
    bookings:
      "Rows reflect bookings whose created_at falls in the window; description uses current status (e.g. completed vs new).",
    ledger:
      "Earnings rows (provider_earnings) are branch-scoped when a location is selected. Payout rows in the window are always included (payouts are not tied to a single branch in this feed).",
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

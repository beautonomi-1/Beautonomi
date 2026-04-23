import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_OVERVIEW } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { downloadAdminBlob } from "@/lib/adminCsvDownload";
import { adminSpaTo } from "@/lib/adminSpaPath";

const API_PATHS: Record<string, string> = {
  revenue: "/api/admin/reports/revenue",
  bookings: "/api/admin/reports/bookings",
  providers: "/api/admin/reports/providers",
  customers: "/api/admin/reports/customers",
  "gift-cards": "/api/admin/reports/gift-cards",
  "yoco-reconciliation": "/api/admin/reports/yoco-reconciliation",
};

const TITLES: Record<string, string> = {
  revenue: "Revenue report",
  bookings: "Booking report",
  providers: "Provider report",
  customers: "Customer report",
  "gift-cards": "Gift card report",
  "yoco-reconciliation": "Yoco reconciliation",
};

function fmt(n: unknown): string {
  if (typeof n === "number") return n.toLocaleString();
  return String(n ?? "—");
}

function fmtMoney(n: unknown, currency?: unknown): string {
  if (typeof n !== "number") return String(n ?? "—");
  const c = typeof currency === "string" ? currency : "ZAR";
  return n.toLocaleString("en-ZA", { style: "currency", currency: c, maximumFractionDigits: 2 });
}

function KpiGrid({ items }: { items: { label: string; value: string; sub?: string }[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="rounded-xl border border-gray-200 bg-white px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{it.label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{it.value}</p>
          {it.sub && <p className="mt-0.5 text-xs text-gray-400">{it.sub}</p>}
        </div>
      ))}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-gray-700">{children}</h2>;
}

// ── Revenue ───────────────────────────────────────────────────────────────────
function RevenueReport({ data }: { data: Record<string, unknown> }) {
  const pr = data.platformRevenue as Record<string, number> | undefined;
  const gcm = data.giftCardMetrics as Record<string, unknown> | undefined;
  const byDay = Array.isArray(data.revenueByDay) ? (data.revenueByDay as Record<string, unknown>[]) : [];
  const byProvider = Array.isArray(data.revenueByProvider)
    ? (data.revenueByProvider as Record<string, unknown>[])
    : [];
  const byService = Array.isArray(data.revenueByService)
    ? (data.revenueByService as Record<string, unknown>[])
    : [];

  const kpis = [
    { label: "Total revenue (GMV)", value: fmtMoney(data.totalRevenue), sub: "Booking value in period" },
    { label: "Net collected", value: fmtMoney(data.netCollected), sub: "Cash collected − refunds" },
    ...(pr
      ? [
          { label: "Platform revenue (net)", value: fmtMoney(pr.total_platform_revenue_net), sub: "Take + subs + ads + service fees" },
          { label: "Booking commission (net)", value: fmtMoney(pr.booking_commission_net), sub: "After refund contra & gateway fees" },
          { label: "Subscription net", value: fmtMoney(pr.subscription_net) },
          { label: "Ads net", value: fmtMoney(pr.ads_net) },
          { label: "Provider earnings", value: fmtMoney(pr.provider_earnings_net), sub: "Paid to providers (ledger)" },
          { label: "Refunds", value: fmtMoney(pr.refunds_abs_gross ?? pr.refunds_gross), sub: "Absolute refunds to customers" },
          { label: "Gateway fees", value: fmtMoney(pr.gateway_fees_total), sub: "Paystack/Yoco processing" },
        ]
      : []),
  ];

  const showNegativeExplainer =
    pr && typeof pr.booking_commission_net === "number" && pr.booking_commission_net < 0;

  return (
    <div className="space-y-6">
      <AdminPanel>
        <p className="text-xs leading-5 text-gray-600">
          <strong>Total revenue</strong> is booking <em>GMV</em> (what the customer was
          charged at booking time). <strong>Platform revenue</strong> is what the platform
          actually keeps after refunds, gateway fees and provider payouts are recognised on
          the finance ledger.
        </p>
        {showNegativeExplainer && (
          <p className="mt-2 text-xs leading-5 text-amber-700">
            Note: Booking commission can be <em>negative</em> in a period when gateway fees
            or refund contra lines exceed the commission recognised from new bookings in the
            same window. This is expected and reconciles with Finance / Gods&nbsp;Eye.
          </p>
        )}
      </AdminPanel>

      <KpiGrid items={kpis} />

      {gcm && (
        <AdminPanel>
          <SectionHeading>Gift card metrics</SectionHeading>
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Total sales", fmtMoney(gcm.totalSales)],
              ["Redemption value", fmtMoney(gcm.totalRedemptions)],
              ["Outstanding liability", fmtMoney(gcm.outstandingLiability)],
              ["Redemption rate", `${fmt(gcm.redemptionRate)}%`],
            ].map(([l, v]) => (
              <div key={l}>
                <dt className="text-gray-500">{l}</dt>
                <dd className="font-semibold">{v}</dd>
              </div>
            ))}
          </div>
        </AdminPanel>
      )}

      {byDay.length > 0 && (
        <AdminPanel>
          <SectionHeading>Revenue by day (last {byDay.length} entries)</SectionHeading>
          <AdminDataTable className="mt-3">
            <AdminTableHead>
              <tr>
                <AdminTh>Date</AdminTh>
                <AdminTh>Revenue</AdminTh>
                <AdminTh>Bookings</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {byDay.slice(0, 50).map((r, i) => (
                <tr key={i}>
                  <AdminTd className="text-xs">{String(r.date ?? "")}</AdminTd>
                  <AdminTd className="tabular-nums text-xs">{fmtMoney(r.revenue)}</AdminTd>
                  <AdminTd className="tabular-nums text-xs">{fmt(r.bookings)}</AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        </AdminPanel>
      )}

      {byProvider.length > 0 && (
        <AdminPanel>
          <SectionHeading>Top providers</SectionHeading>
          <AdminDataTable className="mt-3">
            <AdminTableHead>
              <tr>
                <AdminTh>Provider</AdminTh>
                <AdminTh>Revenue</AdminTh>
                <AdminTh>Bookings</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {byProvider.slice(0, 25).map((r, i) => (
                <tr key={i}>
                  <AdminTd className="text-xs">{String(r.provider_name ?? r.provider_id ?? "")}</AdminTd>
                  <AdminTd className="tabular-nums text-xs">{fmtMoney(r.revenue)}</AdminTd>
                  <AdminTd className="tabular-nums text-xs">{fmt(r.bookings)}</AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        </AdminPanel>
      )}

      {byService.length > 0 && (
        <AdminPanel>
          <SectionHeading>Top services</SectionHeading>
          <AdminDataTable className="mt-3">
            <AdminTableHead>
              <tr>
                <AdminTh>Service</AdminTh>
                <AdminTh>Revenue</AdminTh>
                <AdminTh>Bookings</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {byService.slice(0, 25).map((r, i) => (
                <tr key={i}>
                  <AdminTd className="text-xs">{String(r.service_name ?? r.service_id ?? "")}</AdminTd>
                  <AdminTd className="tabular-nums text-xs">{fmtMoney(r.revenue)}</AdminTd>
                  <AdminTd className="tabular-nums text-xs">{fmt(r.bookings)}</AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        </AdminPanel>
      )}
    </div>
  );
}

// ── Providers ─────────────────────────────────────────────────────────────────
function ProvidersReport({ data }: { data: Record<string, unknown> }) {
  const providers = Array.isArray(data.providers) ? (data.providers as Record<string, unknown>[]) : [];
  const kpis = [
    { label: "Total providers", value: fmt(data.totalProviders) },
    { label: "Active providers", value: fmt(data.activeProviders) },
    {
      label: "Activation rate",
      value:
        typeof data.totalProviders === "number" &&
        typeof data.activeProviders === "number" &&
        data.totalProviders > 0
          ? `${((data.activeProviders / data.totalProviders) * 100).toFixed(1)}%`
          : "—",
    },
  ];
  return (
    <div className="space-y-6">
      <KpiGrid items={kpis} />
      {providers.length > 0 && (
        <AdminPanel>
          <SectionHeading>Provider breakdown</SectionHeading>
          <AdminDataTable className="mt-3">
            <AdminTableHead>
              <tr>
                <AdminTh>Provider</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh>Rating</AdminTh>
                <AdminTh>Bookings</AdminTh>
                <AdminTh>Revenue</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {providers.slice(0, 100).map((r, i) => (
                <tr key={i}>
                  <AdminTd className="text-xs">{String(r.provider_name ?? r.provider_id ?? "")}</AdminTd>
                  <AdminTd>
                    <span className="rounded px-1.5 py-0.5 text-xs font-medium capitalize">
                      {String(r.status ?? "—").replace(/_/g, " ")}
                    </span>
                  </AdminTd>
                  <AdminTd className="tabular-nums text-xs">
                    {typeof r.rating_average === "number" ? r.rating_average.toFixed(1) : "—"}
                  </AdminTd>
                  <AdminTd className="tabular-nums text-xs">{fmt(r.bookings_count)}</AdminTd>
                  <AdminTd className="tabular-nums text-xs">{fmtMoney(r.revenue)}</AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        </AdminPanel>
      )}
    </div>
  );
}

// ── Customers ─────────────────────────────────────────────────────────────────
function CustomersReport({ data }: { data: Record<string, unknown> }) {
  const customersAll = Array.isArray(data.customers)
    ? (data.customers as Record<string, unknown>[])
    : [];

  // Default to "Active in period" so the table matches "Active customers" KPI
  // instead of showing 19 zero-booking rows alongside 1 active customer.
  const [filter, setFilter] = useState<"active" | "all">("active");
  const customers = useMemo(() => {
    if (filter === "all") return customersAll;
    return customersAll.filter((r) => Number(r.bookings_count ?? r.bookings ?? 0) > 0);
  }, [customersAll, filter]);
  const hiddenInactive = customersAll.length - customers.length;

  const kpis = [
    { label: "Total customers", value: fmt(data.totalCustomers ?? data.total) },
    { label: "Active customers", value: fmt(data.activeCustomers ?? data.active) },
    { label: "New this period", value: fmt(data.newCustomers ?? data.new) },
    { label: "Avg. bookings/customer", value: fmt(data.avgBookingsPerCustomer) },
  ].filter((k) => k.value !== "—");

  return (
    <div className="space-y-6">
      <AdminPanel>
        <p className="text-xs leading-5 text-gray-600">
          Scope: customers with preferred home = this tenant, plus any customer who has
          booked a provider here. “Bookings” and “Total spent” count only confirmed or
          completed bookings with <em>scheduled_at</em> in the selected period.
        </p>
      </AdminPanel>
      {kpis.length > 0 && <KpiGrid items={kpis} />}
      {customersAll.length > 0 && (
        <AdminPanel>
          <div className="flex items-center justify-between gap-3">
            <SectionHeading>Customer breakdown</SectionHeading>
            <label className="flex items-center gap-2 text-xs text-gray-600">
              Show
              <select
                className="rounded border border-gray-300 px-2 py-0.5 text-xs"
                value={filter}
                onChange={(e) => setFilter(e.target.value as "active" | "all")}
              >
                <option value="active">Active in period</option>
                <option value="all">All tenant customers</option>
              </select>
              {filter === "active" && hiddenInactive > 0 && (
                <span className="text-gray-400">({hiddenInactive} inactive hidden)</span>
              )}
            </label>
          </div>
          {customers.length > 0 ? (
            <AdminDataTable className="mt-3">
              <AdminTableHead>
                <tr>
                  <AdminTh>Customer</AdminTh>
                  <AdminTh>Bookings</AdminTh>
                  <AdminTh>Total spent</AdminTh>
                  <AdminTh>Last booking</AdminTh>
                </tr>
              </AdminTableHead>
              <AdminTableBody>
                {customers.slice(0, 100).map((r, i) => (
                  <tr key={i}>
                    <AdminTd className="text-xs">
                      {String(r.customer_name ?? r.full_name ?? r.email ?? r.customer_id ?? "")}
                    </AdminTd>
                    <AdminTd className="tabular-nums text-xs">
                      {fmt(r.bookings_count ?? r.bookings)}
                    </AdminTd>
                    <AdminTd className="tabular-nums text-xs">
                      {fmtMoney(r.total_spent ?? r.revenue)}
                    </AdminTd>
                    <AdminTd className="text-xs text-gray-500">
                      {String(r.last_booking_at ?? r.last_booking ?? "—").slice(0, 10)}
                    </AdminTd>
                  </tr>
                ))}
              </AdminTableBody>
            </AdminDataTable>
          ) : (
            <p className="mt-3 text-sm text-gray-500">
              No customers with bookings in this period.
            </p>
          )}
        </AdminPanel>
      )}
    </div>
  );
}

// ── Bookings ──────────────────────────────────────────────────────────────────
function BookingsReport({ data }: { data: Record<string, unknown> }) {
  const byStatus = Array.isArray(data.bookingsByStatus)
    ? (data.bookingsByStatus as Record<string, unknown>[])
    : [];
  const byDayAll = Array.isArray(data.bookingsByDay)
    ? (data.bookingsByDay as Record<string, unknown>[])
    : [];
  // API returns `bookingsByProvider`; keep `topProviders` as a back-compat fallback.
  const topProvidersRaw = Array.isArray(data.bookingsByProvider)
    ? (data.bookingsByProvider as Record<string, unknown>[])
    : Array.isArray(data.topProviders)
      ? (data.topProviders as Record<string, unknown>[])
      : [];
  const topProviders = [...topProvidersRaw].sort((a, b) => {
    const av = Number(a.count ?? a.bookings ?? a.bookings_count ?? 0);
    const bv = Number(b.count ?? b.bookings ?? b.bookings_count ?? 0);
    return bv - av;
  });

  const [showEmptyDays, setShowEmptyDays] = useState(false);
  const byDay = useMemo(() => {
    if (showEmptyDays) return byDayAll;
    return byDayAll.filter((r) => {
      const c = Number(r.bookings ?? r.count ?? 0);
      return c > 0;
    });
  }, [byDayAll, showEmptyDays]);
  const hiddenEmptyDays = byDayAll.length - byDay.length;

  const kpis = [
    { label: "Total bookings", value: fmt(data.totalBookings ?? data.total) },
    { label: "Completed", value: fmt(data.completedBookings ?? data.completed) },
    { label: "Cancelled", value: fmt(data.cancelledBookings ?? data.cancelled) },
    { label: "Avg. value", value: fmtMoney(data.avgBookingValue ?? data.average_value) },
  ].filter((k) => k.value !== "—");

  return (
    <div className="space-y-6">
      {kpis.length > 0 && <KpiGrid items={kpis} />}
      {byStatus.length > 0 && (
        <AdminPanel>
          <SectionHeading>Bookings by status</SectionHeading>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {byStatus.map((r, i) => (
              <div key={i} className="rounded-lg bg-gray-50 px-4 py-3">
                <p className="text-xs capitalize text-gray-500">{String(r.status ?? "").replace(/_/g, " ")}</p>
                <p className="mt-0.5 text-xl font-bold tabular-nums">{fmt(r.count)}</p>
                {r.revenue !== undefined && (
                  <p className="text-xs text-gray-400">{fmtMoney(r.revenue)}</p>
                )}
              </div>
            ))}
          </div>
        </AdminPanel>
      )}
      {byDayAll.length > 0 && (
        <AdminPanel>
          <div className="flex items-center justify-between gap-3">
            <SectionHeading>Daily bookings</SectionHeading>
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={showEmptyDays}
                onChange={(e) => setShowEmptyDays(e.target.checked)}
              />
              Show empty days
              {!showEmptyDays && hiddenEmptyDays > 0 && (
                <span className="text-gray-400">({hiddenEmptyDays} hidden)</span>
              )}
            </label>
          </div>
          {byDay.length > 0 ? (
            <AdminDataTable className="mt-3">
              <AdminTableHead>
                <tr>
                  <AdminTh>Date</AdminTh>
                  <AdminTh>Bookings</AdminTh>
                  <AdminTh>Revenue</AdminTh>
                </tr>
              </AdminTableHead>
              <AdminTableBody>
                {byDay.slice(0, 100).map((r, i) => (
                  <tr key={i}>
                    <AdminTd className="text-xs">{String(r.date ?? "")}</AdminTd>
                    <AdminTd className="tabular-nums text-xs">{fmt(r.bookings ?? r.count)}</AdminTd>
                    <AdminTd className="tabular-nums text-xs">{fmtMoney(r.revenue)}</AdminTd>
                  </tr>
                ))}
              </AdminTableBody>
            </AdminDataTable>
          ) : (
            <p className="mt-3 text-sm text-gray-500">No bookings in this period.</p>
          )}
        </AdminPanel>
      )}
      {topProviders.length > 0 && (
        <AdminPanel>
          <SectionHeading>Top providers by bookings</SectionHeading>
          <AdminDataTable className="mt-3">
            <AdminTableHead>
              <tr>
                <AdminTh>Provider</AdminTh>
                <AdminTh>Bookings</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {topProviders.slice(0, 25).map((r, i) => (
                <tr key={i}>
                  <AdminTd className="text-xs">
                    {String(r.provider_name ?? r.name ?? r.provider_id ?? "")}
                  </AdminTd>
                  <AdminTd className="tabular-nums text-xs">
                    {fmt(r.count ?? r.bookings_count ?? r.bookings)}
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        </AdminPanel>
      )}
    </div>
  );
}

// ── Gift cards ────────────────────────────────────────────────────────────────
function GiftCardsReport({ data }: { data: Record<string, unknown> }) {
  const byDay = Array.isArray(data.salesByDay)
    ? (data.salesByDay as Record<string, unknown>[])
    : [];
  const redByDay = Array.isArray(data.redemptionsByDay)
    ? (data.redemptionsByDay as Record<string, unknown>[])
    : [];

  const rate = data.redemptionRate ?? data.redemption_rate;
  const kpis = [
    { label: "Total sold", value: fmt(data.totalSold ?? data.total_sold) },
    { label: "Total sales value", value: fmtMoney(data.totalSalesValue ?? data.total_sales_value) },
    { label: "Total redeemed", value: fmt(data.totalRedeemed ?? data.total_redeemed) },
    {
      label: "Redeemed value",
      value: fmtMoney(data.totalRedemptionValue ?? data.total_redemption_value),
    },
    {
      label: "Outstanding liability",
      value: fmtMoney(data.outstandingLiability ?? data.outstanding_liability),
    },
    {
      label: "Redemption rate",
      value: typeof rate === "number" ? `${rate.toFixed(1)}%` : String(rate ?? "—"),
    },
    { label: "Active cards", value: fmt(data.activeCards ?? data.active_cards) },
  ].filter((k) => k.value !== "—" && k.value !== "—%");

  return (
    <div className="space-y-6">
      <AdminPanel>
        <p className="text-xs leading-5 text-gray-600">
          Gift card sales are a <strong>liability</strong> (cash received, service owed).
          Platform revenue is recognised as commission when the card is redeemed against a
          booking — see the Revenue report for that flow.
        </p>
      </AdminPanel>
      {kpis.length > 0 && <KpiGrid items={kpis} />}
      {byDay.length > 0 && (
        <AdminPanel>
          <SectionHeading>Gift card sales by day</SectionHeading>
          <AdminDataTable className="mt-3">
            <AdminTableHead>
              <tr>
                <AdminTh>Date</AdminTh>
                <AdminTh>Count</AdminTh>
                <AdminTh>Sales value</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {byDay.slice(0, 50).map((r, i) => (
                <tr key={i}>
                  <AdminTd className="text-xs">{String(r.date ?? "")}</AdminTd>
                  <AdminTd className="tabular-nums text-xs">{fmt(r.count)}</AdminTd>
                  <AdminTd className="tabular-nums text-xs">{fmtMoney(r.sales ?? r.value)}</AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        </AdminPanel>
      )}
      {redByDay.length > 0 && (
        <AdminPanel>
          <SectionHeading>Redemptions by day</SectionHeading>
          <AdminDataTable className="mt-3">
            <AdminTableHead>
              <tr>
                <AdminTh>Date</AdminTh>
                <AdminTh>Count</AdminTh>
                <AdminTh>Value</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {redByDay.slice(0, 50).map((r, i) => (
                <tr key={i}>
                  <AdminTd className="text-xs">{String(r.date ?? "")}</AdminTd>
                  <AdminTd className="tabular-nums text-xs">{fmt(r.count)}</AdminTd>
                  <AdminTd className="tabular-nums text-xs">
                    {fmtMoney(r.value ?? r.redemptions)}
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        </AdminPanel>
      )}
      {byDay.length === 0 && redByDay.length === 0 && (
        <AdminPanel>
          <p className="text-sm text-gray-600">
            No gift card sales or redemptions in this period for this tenant.
          </p>
        </AdminPanel>
      )}
    </div>
  );
}

// ── Yoco reconciliation ───────────────────────────────────────────────────────
function YocoReport({ data }: { data: Record<string, unknown> }) {
  // API returns { payments: [...], summary: { total, with_booking, synced, not_synced } }
  // Keep legacy fallbacks so the view is robust to other shapes.
  const rows = Array.isArray(data.payments)
    ? (data.payments as Record<string, unknown>[])
    : Array.isArray(data.transactions)
      ? (data.transactions as Record<string, unknown>[])
      : Array.isArray(data.records)
        ? (data.records as Record<string, unknown>[])
        : [];
  const summary = (data.summary && typeof data.summary === "object"
    ? (data.summary as Record<string, unknown>)
    : null) as { total?: number; with_booking?: number; synced?: number; not_synced?: number } | null;

  const totalAmount = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const currency =
    rows.length > 0 && typeof rows[0].currency === "string" ? String(rows[0].currency) : "ZAR";

  const kpis = [
    { label: "Total payments", value: fmt(summary?.total ?? rows.length) },
    { label: "Linked to booking", value: fmt(summary?.with_booking) },
    { label: "Synced to ledger", value: fmt(summary?.synced) },
    { label: "Not synced", value: fmt(summary?.not_synced) },
    { label: "Gross amount", value: fmtMoney(totalAmount, currency) },
  ].filter((k) => k.value !== "—");

  return (
    <div className="space-y-6">
      <AdminPanel>
        <p className="text-xs leading-5 text-gray-600">
          Lists Yoco payments captured by tenant providers. A payment is{" "}
          <strong>synced</strong> when it is linked to a booking and a matching row exists
          in <code>booking_payments</code>. Unsynced rows typically indicate the provider
          has not yet linked the Yoco sale to a Beautonomi booking.
        </p>
      </AdminPanel>
      {kpis.length > 0 && <KpiGrid items={kpis} />}
      {rows.length > 0 ? (
        <AdminPanel>
          <SectionHeading>Payments</SectionHeading>
          <AdminDataTable className="mt-3">
            <AdminTableHead>
              <tr>
                <AdminTh>Created</AdminTh>
                <AdminTh>Provider</AdminTh>
                <AdminTh>Yoco ID</AdminTh>
                <AdminTh>Amount</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh>Booking</AdminTh>
                <AdminTh>Synced</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {rows.slice(0, 200).map((r, i) => (
                <tr key={String(r.id ?? i)}>
                  <AdminTd className="text-xs text-gray-500">
                    {String(r.created_at ?? "").slice(0, 16).replace("T", " ")}
                  </AdminTd>
                  <AdminTd className="text-xs">
                    {String(r.provider_name ?? r.provider_id ?? "—")}
                  </AdminTd>
                  <AdminTd className="text-xs font-mono">
                    {String(r.yoco_payment_id ?? "")}
                  </AdminTd>
                  <AdminTd className="tabular-nums text-xs">
                    {fmtMoney(r.amount, r.currency)}
                  </AdminTd>
                  <AdminTd className="text-xs capitalize">{String(r.status ?? "—")}</AdminTd>
                  <AdminTd className="text-xs text-gray-500">
                    {r.appointment_id ? "yes" : "—"}
                  </AdminTd>
                  <AdminTd className="text-xs">
                    {r.booking_synced ? (
                      <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-700">synced</span>
                    ) : r.appointment_id ? (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">pending</span>
                    ) : (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">unlinked</span>
                    )}
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        </AdminPanel>
      ) : (
        <AdminPanel>
          <p className="text-sm text-gray-600">
            No Yoco payments in the last 30 days for this tenant. Providers connect Yoco
            under <em>Provider settings → Payments</em>; once they take a sale there it
            will appear here for reconciliation.
          </p>
        </AdminPanel>
      )}
    </div>
  );
}

// ── Generic fallback ──────────────────────────────────────────────────────────
function GenericReport({ data }: { data: Record<string, unknown> }) {
  const scalars = Object.entries(data).filter(
    ([, v]) => typeof v === "number" || typeof v === "string" || typeof v === "boolean"
  );
  const firstArray = Object.entries(data).find(([, v]) => Array.isArray(v) && (v as unknown[]).length > 0);
  const rows = firstArray ? (firstArray[1] as Record<string, unknown>[]) : [];
  const cols = rows.length > 0 && typeof rows[0] === "object" ? Object.keys(rows[0]) : [];

  return (
    <div className="space-y-6">
      {scalars.length > 0 && (
        <AdminPanel>
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {scalars.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-gray-500">{k}</dt>
                <dd className="font-semibold">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </AdminPanel>
      )}
      {rows.length > 0 && cols.length > 0 ? (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              {cols.map((c) => (
                <AdminTh key={c}>{c}</AdminTh>
              ))}
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.slice(0, 100).map((r, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <AdminTd key={c} className="max-w-[14rem] truncate text-xs">
                    {typeof r[c] === "object" ? JSON.stringify(r[c]) : String(r[c] ?? "")}
                  </AdminTd>
                ))}
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      ) : (
        <AdminPanel>
          <p className="text-sm text-gray-600">No tabular data detected in this payload.</p>
        </AdminPanel>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function ReportDetailPage() {
  const { reportKey = "" } = useParams<{ reportKey: string }>();
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_OVERVIEW,
    "Overview access is required for these reports."
  );
  const [sp, setSp] = useSearchParams();
  const period = sp.get("period") || "30d";
  const apiPath = API_PATHS[reportKey];

  const q = useQuery({
    queryKey: adminQueryKeys.reports.detail(reportKey, period),
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("period", period);
      return adminApi.getJson<Record<string, unknown>>(`${apiPath}?${p}`, { timeoutMs: 90_000 });
    },
    enabled: allowed && !!apiPath,
  });

  if (!apiPath) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Report" />
        <EmptyState title="Unknown report" description={reportKey} />
        <Link to={adminSpaTo("/admin/reports")} className="text-sm font-medium text-gray-900 underline">
          ← Reports hub
        </Link>
      </div>
    );
  }

  if (denied) return denied;

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title={TITLES[reportKey] ?? "Report"} />
        <AdminPanel>
          <AdminPageSkeleton rows={6} />
        </AdminPanel>
      </div>
    );
  }

  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const title = TITLES[reportKey] ?? "Report";
  const rawData = (q.data as Record<string, unknown> | null) ?? {};
  // APIs may wrap payload: { data: { ... } } — unwrap if needed
  const data: Record<string, unknown> =
    rawData.data && typeof rawData.data === "object" && !Array.isArray(rawData.data)
      ? (rawData.data as Record<string, unknown>)
      : rawData;

  return (
    <div className="space-y-6">
      <AdminPageHeader title={title} />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Link to={adminSpaTo("/admin/reports")} className="text-sm text-gray-600 hover:text-gray-900">
          ← Reports hub
        </Link>
        <label className="text-sm text-gray-600">
          Period{" "}
          <select
            className="ml-1 rounded border border-gray-300 px-2 py-1 text-sm"
            value={period}
            onChange={(e) => {
              const n = new URLSearchParams(sp);
              n.set("period", e.target.value);
              setSp(n, { replace: true });
            }}
          >
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
            <option value="90d">90 days</option>
            <option value="1y">1 year</option>
          </select>
        </label>
        <button
          type="button"
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
          onClick={() => {
            // Map each report to its dedicated export endpoint so the downloaded CSV
            // matches what is on screen. Falls back to the generic analytics export
            // for reports without a dedicated CSV endpoint yet.
            const EXPORT_ENDPOINTS: Record<string, string> = {
              revenue: "/api/admin/export/finance",
              providers: "/api/admin/export/providers",
              customers: "/api/admin/export/users",
              bookings: "/api/admin/export/bookings",
              "yoco-reconciliation": "/api/admin/export/transactions",
            };
            const endpoint = EXPORT_ENDPOINTS[reportKey] ?? "/api/admin/export/analytics";
            void downloadAdminBlob(
              `${endpoint}?period=${encodeURIComponent(period)}`,
              `${reportKey}-${period}.csv`
            ).catch(() => alert("Export failed"));
          }}
        >
          Download CSV
        </button>
      </div>

      {/* Per-report rendering */}
      {reportKey === "revenue" && <RevenueReport data={data} />}
      {reportKey === "providers" && <ProvidersReport data={data} />}
      {reportKey === "customers" && <CustomersReport data={data} />}
      {reportKey === "bookings" && <BookingsReport data={data} />}
      {reportKey === "gift-cards" && <GiftCardsReport data={data} />}
      {reportKey === "yoco-reconciliation" && <YocoReport data={data} />}
      {!["revenue", "providers", "customers", "bookings", "gift-cards", "yoco-reconciliation"].includes(
        reportKey
      ) && <GenericReport data={data} />}
    </div>
  );
}

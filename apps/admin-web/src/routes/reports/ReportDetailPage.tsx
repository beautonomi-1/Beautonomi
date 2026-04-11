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
    { label: "Total revenue", value: fmtMoney(data.totalRevenue) },
    ...(pr
      ? [
          { label: "Platform revenue", value: fmtMoney(pr.total_platform_revenue_net) },
          { label: "Booking commission", value: fmtMoney(pr.booking_commission_net) },
          { label: "Subscription net", value: fmtMoney(pr.subscription_net) },
          { label: "Ads net", value: fmtMoney(pr.ads_net) },
          { label: "Provider earnings", value: fmtMoney(pr.provider_earnings_net) },
          { label: "Refunds", value: fmtMoney(pr.refunds_gross) },
          { label: "Gateway fees", value: fmtMoney(pr.gateway_fees_total) },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <KpiGrid items={kpis} />

      {gcm && (
        <AdminPanel>
          <SectionHeading>Gift card metrics</SectionHeading>
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Total sales", fmtMoney(gcm.totalSales)],
              ["Total redemptions", fmt(gcm.totalRedemptions)],
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
  const customers = Array.isArray(data.customers) ? (data.customers as Record<string, unknown>[]) : [];
  const kpis = [
    { label: "Total customers", value: fmt(data.totalCustomers ?? data.total) },
    { label: "Active customers", value: fmt(data.activeCustomers ?? data.active) },
    { label: "New this period", value: fmt(data.newCustomers ?? data.new) },
    { label: "Avg. bookings/customer", value: fmt(data.avgBookingsPerCustomer) },
  ].filter((k) => k.value !== "—");

  return (
    <div className="space-y-6">
      {kpis.length > 0 && <KpiGrid items={kpis} />}
      {customers.length > 0 && (
        <AdminPanel>
          <SectionHeading>Customer breakdown</SectionHeading>
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
                  <AdminTd className="tabular-nums text-xs">{fmt(r.bookings_count ?? r.bookings)}</AdminTd>
                  <AdminTd className="tabular-nums text-xs">{fmtMoney(r.total_spent ?? r.revenue)}</AdminTd>
                  <AdminTd className="text-xs text-gray-500">
                    {String(r.last_booking_at ?? r.last_booking ?? "—").slice(0, 10)}
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

// ── Bookings ──────────────────────────────────────────────────────────────────
function BookingsReport({ data }: { data: Record<string, unknown> }) {
  const byStatus = Array.isArray(data.bookingsByStatus)
    ? (data.bookingsByStatus as Record<string, unknown>[])
    : [];
  const byDay = Array.isArray(data.bookingsByDay) ? (data.bookingsByDay as Record<string, unknown>[]) : [];
  const topProviders = Array.isArray(data.topProviders)
    ? (data.topProviders as Record<string, unknown>[])
    : [];

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
      {byDay.length > 0 && (
        <AdminPanel>
          <SectionHeading>Daily bookings</SectionHeading>
          <AdminDataTable className="mt-3">
            <AdminTableHead>
              <tr>
                <AdminTh>Date</AdminTh>
                <AdminTh>Bookings</AdminTh>
                <AdminTh>Revenue</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {byDay.slice(0, 50).map((r, i) => (
                <tr key={i}>
                  <AdminTd className="text-xs">{String(r.date ?? "")}</AdminTd>
                  <AdminTd className="tabular-nums text-xs">{fmt(r.bookings ?? r.count)}</AdminTd>
                  <AdminTd className="tabular-nums text-xs">{fmtMoney(r.revenue)}</AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
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
                <AdminTh>Revenue</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {topProviders.slice(0, 25).map((r, i) => (
                <tr key={i}>
                  <AdminTd className="text-xs">{String(r.provider_name ?? r.name ?? r.provider_id ?? "")}</AdminTd>
                  <AdminTd className="tabular-nums text-xs">{fmt(r.bookings_count ?? r.bookings)}</AdminTd>
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

// ── Gift cards ────────────────────────────────────────────────────────────────
function GiftCardsReport({ data }: { data: Record<string, unknown> }) {
  const byDay = Array.isArray(data.salesByDay) ? (data.salesByDay as Record<string, unknown>[]) : [];

  const kpis = [
    { label: "Total sold", value: fmt(data.totalSold ?? data.total_sold) },
    { label: "Total sales value", value: fmtMoney(data.totalSalesValue ?? data.total_sales_value) },
    { label: "Total redeemed", value: fmt(data.totalRedeemed ?? data.total_redeemed) },
    { label: "Outstanding liability", value: fmtMoney(data.outstandingLiability ?? data.outstanding_liability) },
    { label: "Redemption rate", value: `${fmt(data.redemptionRate ?? data.redemption_rate)}%` },
    { label: "Active cards", value: fmt(data.activeCards ?? data.active_cards) },
  ].filter((k) => k.value !== "—%" && k.value !== "—");

  return (
    <div className="space-y-6">
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
    </div>
  );
}

// ── Yoco reconciliation ───────────────────────────────────────────────────────
function YocoReport({ data }: { data: Record<string, unknown> }) {
  const rows = Array.isArray(data.transactions)
    ? (data.transactions as Record<string, unknown>[])
    : Array.isArray(data.records)
      ? (data.records as Record<string, unknown>[])
      : [];
  const kpis = [
    { label: "Total transactions", value: fmt(data.total ?? data.count) },
    { label: "Matched", value: fmt(data.matched) },
    { label: "Unmatched", value: fmt(data.unmatched) },
    { label: "Total amount", value: fmtMoney(data.totalAmount ?? data.total_amount) },
  ].filter((k) => k.value !== "—");

  const cols = rows.length > 0 ? Object.keys(rows[0]).slice(0, 8) : [];

  return (
    <div className="space-y-6">
      {kpis.length > 0 && <KpiGrid items={kpis} />}
      {rows.length > 0 && (
        <AdminPanel>
          <SectionHeading>Transactions</SectionHeading>
          <AdminDataTable className="mt-3">
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
                    <AdminTd key={c} className="max-w-[10rem] truncate text-xs">
                      {typeof r[c] === "object" ? JSON.stringify(r[c]) : String(r[c] ?? "")}
                    </AdminTd>
                  ))}
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
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
          onClick={() =>
            void downloadAdminBlob(
              `/api/admin/export/analytics?period=${encodeURIComponent(period)}`,
              `${reportKey}-${period}.csv`
            ).catch(() => alert("Export failed"))
          }
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

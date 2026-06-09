import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, CalendarDays, TrendingUp, Users } from "lucide-react";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminMetricCard } from "@/components/ui/AdminMetricCard";
import { AdminQueryBlock } from "@/components/admin/AdminQueryBlock";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { formatAdminCurrency, formatAdminNumber } from "@/lib/adminFormatCurrency";

type Point = { date: string; count?: number; revenue?: number };

interface AnalyticsPayload {
  period?: string;
  timeSeries?: {
    users?: Point[];
    providers?: Point[];
    bookings?: Point[];
    revenue?: Point[];
  };
  breakdowns?: {
    providerStatus?: Record<string, number>;
    bookingStatus?: Record<string, number>;
    bookingsByChannel?: Array<{ channel: string; count: number; percentage?: number }>;
  };
  bookingsByChannel?: Array<{ channel: string; count: number; percentage?: number }>;
  topProviders?: Array<{ provider_id: string; business_name: string; revenue: number }>;
}

function Sparkline({ series, valueKey }: { series: Point[]; valueKey: "count" | "revenue" }) {
  const pts = useMemo(() => {
    const tail = series.slice(-42);
    const vals = tail.map((p) => Number(p[valueKey] ?? 0));
    if (vals.length === 0) return { d: "", min: 0, max: 0, last: 0 };
    const min = Math.min(0, ...vals);
    const max = Math.max(1e-6, ...vals);
    const w = 240;
    const h = 56;
    const pad = 4;
    const innerW = w - pad * 2;
    const innerH = h - pad * 2;
    const d = vals
      .map((v, i) => {
        const x = pad + (innerW * i) / Math.max(1, vals.length - 1);
        const t = max === min ? 0.5 : (v - min) / (max - min);
        const y = pad + innerH * (1 - t);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    return { d, last: vals[vals.length - 1] ?? 0 };
  }, [series, valueKey]);

  if (!series.length) {
    return <p className="text-xs text-gray-500">No series data</p>;
  }

  return (
    <div className="flex items-end gap-4">
      <svg viewBox="0 0 240 56" className="h-14 w-full max-w-[240px] text-gray-900" aria-hidden>
        <path d={pts.d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="pb-1 text-right text-xs text-gray-500">
        Latest
        <p className="text-sm font-semibold tabular-nums text-gray-900">
          {valueKey === "revenue" ? formatAdminCurrency(pts.last) : formatAdminNumber(pts.last)}
        </p>
      </div>
    </div>
  );
}

export function AnalyticsPage() {
  useAdminDocumentTitle("Analytics");
  const { allowed, denied } = useSuperadminPage("Analytics is superadmin only.");
  const [period, setPeriod] = useState("30d");

  const q = useQuery({
    queryKey: adminQueryKeys.analytics(period),
    queryFn: () =>
      adminApi.getJson<AnalyticsPayload>(`/api/admin/analytics?period=${encodeURIComponent(period)}`),
    enabled: allowed,
  });

  if (denied) return denied;

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Analytics"
        description="Tenant-scoped time series (customers tied to this market, providers & bookings by tenant_id). Net revenue matches Gods Eye: payments + charges − refunds on ledger net."
        actions={
          <select
            className="min-h-11 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium shadow-sm ring-1 ring-gray-950/[0.04]"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="1y">Last year</option>
          </select>
        }
      />

      <AdminQueryBlock query={q}>
        {(data) => {
          const ts = data?.timeSeries ?? {};
          const prov = data?.breakdowns?.providerStatus ?? {};
          const book = data?.breakdowns?.bookingStatus ?? {};
          const top = data?.topProviders ?? [];
          const byChannel = data?.bookingsByChannel ?? data?.breakdowns?.bookingsByChannel ?? [];

          const totalNewCustomers = (ts.users ?? []).reduce((s, p) => s + (p.count ?? 0), 0);
          const totalNewBookings = (ts.bookings ?? []).reduce((s, p) => s + (p.count ?? 0), 0);
          const periodRevenue = (ts.revenue ?? []).reduce((s, p) => s + (p.revenue ?? 0), 0);

          return (
            <>
              <section>
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Period totals</h2>
                <div className="grid gap-4 sm:grid-cols-3">
                  <AdminMetricCard
                    variant="slate"
                    label="New customers"
                    value={formatAdminNumber(totalNewCustomers)}
                    hint="Customer sign-ups in range"
                  />
                  <AdminMetricCard
                    variant="violet"
                    label="New bookings"
                    value={formatAdminNumber(totalNewBookings)}
                    hint="Created in range"
                  />
                  <AdminMetricCard
                    variant="emerald"
                    label="Net revenue"
                    value={formatAdminCurrency(periodRevenue)}
                    hint="Daily net on ledger (|net| for pay, −|net| for refund)"
                  />
                </div>
              </section>

              <div className="grid gap-6 lg:grid-cols-2">
                <AdminPanel>
                  <div className="flex items-center gap-2 text-gray-900">
                    <Users className="h-5 w-5 text-violet-600" aria-hidden />
                    <h3 className="text-lg font-semibold">Customer acquisition</h3>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">Daily new customers</p>
                  <div className="mt-4">
                    <Sparkline series={ts.users ?? []} valueKey="count" />
                  </div>
                </AdminPanel>
                <AdminPanel>
                  <div className="flex items-center gap-2 text-gray-900">
                    <Building2 className="h-5 w-5 text-teal-600" aria-hidden />
                    <h3 className="text-lg font-semibold">New providers</h3>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">Daily provider registrations</p>
                  <div className="mt-4">
                    <Sparkline series={ts.providers ?? []} valueKey="count" />
                  </div>
                </AdminPanel>
                <AdminPanel>
                  <div className="flex items-center gap-2 text-gray-900">
                    <CalendarDays className="h-5 w-5 text-amber-600" aria-hidden />
                    <h3 className="text-lg font-semibold">Booking volume</h3>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">Daily bookings created</p>
                  <div className="mt-4">
                    <Sparkline series={ts.bookings ?? []} valueKey="count" />
                  </div>
                </AdminPanel>
                <AdminPanel>
                  <div className="flex items-center gap-2 text-gray-900">
                    <TrendingUp className="h-5 w-5 text-emerald-600" aria-hidden />
                    <h3 className="text-lg font-semibold">Revenue curve</h3>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">Daily net from ledger</p>
                  <div className="mt-4">
                    <Sparkline series={ts.revenue ?? []} valueKey="revenue" />
                  </div>
                </AdminPanel>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <AdminPanel>
                  <h3 className="text-lg font-semibold text-gray-900">Provider status (current)</h3>
                  <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                    {Object.entries(prov).map(([k, v]) => (
                      <li
                        key={k}
                        className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2 text-sm"
                      >
                        <span className="capitalize text-gray-600">{k.replace(/_/g, " ")}</span>
                        <span className="font-semibold tabular-nums">{formatAdminNumber(v)}</span>
                      </li>
                    ))}
                  </ul>
                </AdminPanel>
                <AdminPanel>
                  <h3 className="text-lg font-semibold text-gray-900">Bookings by channel (created in period)</h3>
                  {byChannel.length === 0 ? (
                    <p className="mt-3 text-sm text-gray-500">No channel data for this period.</p>
                  ) : (
                    <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                      {byChannel.map((row) => (
                        <li
                          key={row.channel}
                          className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2 text-sm"
                        >
                          <span className="capitalize text-gray-600">{row.channel.replace(/_/g, " ")}</span>
                          <span className="font-semibold tabular-nums">
                            {formatAdminNumber(row.count)}
                            {typeof row.percentage === "number" ? ` (${row.percentage.toFixed(0)}%)` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </AdminPanel>
                <AdminPanel>
                  <h3 className="text-lg font-semibold text-gray-900">Booking outcomes (in period)</h3>
                  <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                    {Object.entries(book).map(([k, v]) => (
                      <li
                        key={k}
                        className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2 text-sm"
                      >
                        <span className="capitalize text-gray-600">{k.replace(/_/g, " ")}</span>
                        <span className="font-semibold tabular-nums">{formatAdminNumber(v)}</span>
                      </li>
                    ))}
                  </ul>
                </AdminPanel>
              </div>

              <AdminPanel>
                <h3 className="text-lg font-semibold text-gray-900">Top providers by revenue (period)</h3>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-xs text-gray-500">
                        <th className="pb-2 pr-2 font-medium">Provider</th>
                        <th className="pb-2 font-medium">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {top.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="py-8 text-center text-gray-500">
                            No ledger revenue in this window
                          </td>
                        </tr>
                      ) : (
                        top.map((p) => (
                          <tr key={p.provider_id} className="border-b border-gray-50 last:border-0">
                            <td className="py-2 pr-2">
                              <Link
                                to={adminSpaTo(`/admin/providers/${p.provider_id}`)}
                                className="font-medium text-primary hover:underline"
                              >
                                {p.business_name}
                              </Link>
                            </td>
                            <td className="py-2 tabular-nums font-medium">{formatAdminCurrency(p.revenue)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </AdminPanel>
            </>
          );
        }}
      </AdminQueryBlock>
    </div>
  );
}

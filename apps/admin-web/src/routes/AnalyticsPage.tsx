import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
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
import { AdminTrendChart } from "@/components/admin/charts/AdminTrendChart";
import { AdminHorizontalBars } from "@/components/admin/charts/AdminHorizontalBars";
import { AdminCohortTable } from "@/components/admin/charts/AdminCohortTable";
import { AdminCompositionBar } from "@/components/admin/charts/AdminCompositionBar";
import {
  AdminMetricContractsGlossary,
  type MetricContractRow,
} from "@/components/admin/AdminMetricContractsGlossary";

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
  };
  bookingsByChannel?: Array<{ channel: string; count: number; percentage?: number }>;
  topProviders?: Array<{ provider_id: string; business_name: string; revenue: number }>;
  gateway_fees_total?: number;
  terminal_revenue?: number;
  terminal_gateway_fees?: number;
  financeNote?: string;
  channelBasisNote?: string;
  revenue_streams?: {
    booking_commission?: number;
    subscriptions?: number;
    ads?: number;
    service_fees?: number;
  };
  marketplace_health_series?: Array<{
    as_of: string;
    booking_frequency_30d?: number | null;
    repeat_rate_90d?: number | null;
    transacting_providers_30d?: number | null;
    active_providers?: number | null;
    take_rate?: number | null;
  }>;
}

function sectionLink(to: string, label: string) {
  return (
    <Link to={adminSpaTo(to)} className="text-sm font-medium text-primary underline">
      {label} →
    </Link>
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

  const healthQ = useQuery({
    queryKey: adminQueryKeys.marketplaceHealth(`${period}-cohort`),
    queryFn: () =>
      adminApi.getJson<{
        cohort?: Array<{ cohortMonth: string; cohortSize: number; m1: number | null; m3: number | null; m6: number | null }>;
        contracts?: MetricContractRow[];
      }>(`/api/admin/marketplace-health?period=${encodeURIComponent(period)}&cohort=1`),
    enabled: allowed,
  });

  if (denied) return denied;

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Analytics"
        description="Demand, supply, money, and quality for the scoped tenant. Completed bookings drive frequency and repeat metrics."
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
          const byChannel = data?.bookingsByChannel ?? [];
          const healthSeries = data?.marketplace_health_series ?? [];

          const bookingTrend = (ts.bookings ?? []).map((p) => ({ date: p.date, value: p.count ?? 0 }));
          const revenueTrend = (ts.revenue ?? []).map((p) => ({ date: p.date, value: p.revenue ?? 0 }));
          const providerTrend = (ts.providers ?? []).map((p) => ({ date: p.date, value: p.count ?? 0 }));
          const frequencyTrend = healthSeries
            .filter((r) => r.booking_frequency_30d != null)
            .map((r) => ({
              date: r.as_of,
              value: r.booking_frequency_30d ?? 0,
            }));
          const repeatTrend = healthSeries
            .filter((r) => r.repeat_rate_90d != null)
            .map((r) => ({
              date: r.as_of,
              value: r.repeat_rate_90d ?? 0,
            }));
          const transactingTrend = healthSeries.map((r) => ({
            date: r.as_of,
            value: r.transacting_providers_30d ?? 0,
          }));
          const takeRateTrend = healthSeries
            .filter((r) => r.take_rate != null)
            .map((r) => ({
              date: r.as_of,
              value: r.take_rate ?? 0,
            }));

          const totalBookings = (book.completed ?? 0) + (book.cancelled ?? 0) + (book.no_show ?? 0) + (book.confirmed ?? 0);
          const qualityNote =
            totalBookings > 0
              ? `Cancelled ${(((book.cancelled ?? 0) / totalBookings) * 100).toFixed(1)}% · No-show ${(((book.no_show ?? 0) / totalBookings) * 100).toFixed(1)}% of scheduled in period`
              : "Not enough bookings in period for quality share.";

          return (
            <>
              <section>
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Are customers coming back?
                </h2>
                <div className="grid gap-6 lg:grid-cols-2">
                  <AdminPanel>
                    <h3 className="text-lg font-semibold text-gray-900">Daily bookings created</h3>
                    <p className="mt-1 text-xs text-gray-500">scheduled_at in period</p>
                    <div className="mt-4">
                      <AdminTrendChart series={bookingTrend} emptyMessage="No bookings in this range." />
                    </div>
                  </AdminPanel>
                  <AdminPanel>
                    <h3 className="text-lg font-semibold text-gray-900">Booking frequency (30d rolling)</h3>
                    <p className="mt-1 text-xs text-gray-500">From nightly marketplace health snapshot</p>
                    <div className="mt-4">
                      <AdminTrendChart
                        series={frequencyTrend}
                        emptyMessage="Not enough completed bookings in this range."
                      />
                    </div>
                  </AdminPanel>
                  <AdminPanel>
                    <h3 className="text-lg font-semibold text-gray-900">Repeat rate (90d rolling)</h3>
                    <p className="mt-1 text-xs text-gray-500">Share with 2+ completed visits in trailing 90 days</p>
                    <div className="mt-4">
                      <AdminTrendChart
                        series={repeatTrend}
                        valueFormat="percent"
                        emptyMessage="Not enough completed bookings in this range."
                      />
                    </div>
                  </AdminPanel>
                </div>
                <AdminPanel className="mt-6">
                  <h3 className="text-lg font-semibold text-gray-900">Cohort retention</h3>
                  <p className="mt-1 text-xs text-gray-500">First completed visit month → return in M+1, M+3, M+6</p>
                  <div className="mt-4">
                    <AdminCohortTable rows={healthQ.data?.cohort ?? []} />
                  </div>
                  <p className="mt-4">{sectionLink("/reports/customers", "Customer report")}</p>
                </AdminPanel>
                <AdminPanel className="mt-6">
                  <h3 className="text-lg font-semibold text-gray-900">Bookings by channel</h3>
                  <p className="mt-1 text-xs text-gray-500">{data?.channelBasisNote ?? "Counts only — not revenue."}</p>
                  <div className="mt-4">
                    <AdminHorizontalBars
                      rows={byChannel.map((row) => ({
                        label: row.channel,
                        value: row.count,
                        hint:
                          typeof row.percentage === "number" ? `(${row.percentage.toFixed(0)}%)` : undefined,
                      }))}
                      emptyMessage="No channel data for this period."
                    />
                  </div>
                </AdminPanel>
              </section>

              <section>
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Are salons getting work?
                </h2>
                <div className="grid gap-6 lg:grid-cols-2">
                  <AdminPanel>
                    <h3 className="text-lg font-semibold text-gray-900">New providers</h3>
                    <div className="mt-4">
                      <AdminTrendChart series={providerTrend} />
                    </div>
                  </AdminPanel>
                  <AdminPanel>
                    <h3 className="text-lg font-semibold text-gray-900">Transacting salons (30d)</h3>
                    <p className="mt-1 text-xs text-gray-500">≥1 completed booking in trailing 30 days</p>
                    <div className="mt-4">
                      <AdminTrendChart series={transactingTrend} />
                    </div>
                  </AdminPanel>
                </div>
                <AdminPanel className="mt-6">
                  <h3 className="text-lg font-semibold text-gray-900">Provider status (current)</h3>
                  <div className="mt-4">
                    <AdminHorizontalBars
                      rows={Object.entries(prov).map(([label, value]) => ({ label, value: value as number }))}
                    />
                  </div>
                  <p className="mt-4">{sectionLink("/reports/providers", "Provider report")}</p>
                </AdminPanel>
              </section>

              <section>
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Where does the money come from?
                </h2>
                <div className="grid gap-6 lg:grid-cols-2">
                  <AdminPanel>
                    <h3 className="text-lg font-semibold text-gray-900">Daily platform net</h3>
                    <p className="mt-1 text-xs text-gray-500">Ledger platform recognized revenue per day</p>
                    <div className="mt-4">
                      <AdminTrendChart series={revenueTrend} valueFormat="currency" />
                    </div>
                  </AdminPanel>
                  <AdminPanel>
                    <h3 className="text-lg font-semibold text-gray-900">Take rate (daily snapshot)</h3>
                    <p className="mt-1 text-xs text-gray-500">Platform take + service fees / service GMV</p>
                    <div className="mt-4">
                      <AdminTrendChart
                        series={takeRateTrend}
                        valueFormat="percent"
                        emptyMessage="Take rate series starts after the first marketplace health snapshot."
                      />
                    </div>
                  </AdminPanel>
                </div>
                {data?.revenue_streams ? (
                  <AdminPanel className="mt-6">
                    <h3 className="text-lg font-semibold text-gray-900">Revenue mix (selected period)</h3>
                    <div className="mt-4">
                      <AdminCompositionBar
                        segments={[
                          {
                            label: "Booking take",
                            value: data.revenue_streams.booking_commission ?? 0,
                            colorClass: "bg-emerald-600",
                          },
                          {
                            label: "Subscriptions",
                            value: data.revenue_streams.subscriptions ?? 0,
                            colorClass: "bg-violet-600",
                          },
                          { label: "Ads", value: data.revenue_streams.ads ?? 0, colorClass: "bg-amber-500" },
                          {
                            label: "Platform fees",
                            value: data.revenue_streams.service_fees ?? 0,
                            colorClass: "bg-slate-600",
                          },
                        ]}
                      />
                    </div>
                  </AdminPanel>
                ) : null}
                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  <AdminMetricCard
                    variant="slate"
                    label="Gateway fees (total)"
                    value={formatAdminCurrency(data?.gateway_fees_total ?? 0)}
                  />
                  <AdminMetricCard
                    variant="emerald"
                    label="Terminal sales (gross)"
                    value={formatAdminCurrency(data?.terminal_revenue ?? 0)}
                  />
                  <AdminMetricCard
                    variant="violet"
                    label="Terminal gateway fees"
                    value={formatAdminCurrency(data?.terminal_gateway_fees ?? 0)}
                  />
                </div>
                <AdminPanel className="mt-6">
                  <h3 className="text-lg font-semibold text-gray-900">Top providers by revenue</h3>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-xs text-gray-500">
                          <th className="pb-2 pr-2 font-medium">Provider</th>
                          <th className="pb-2 font-medium">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {top.map((p) => (
                          <tr key={p.provider_id} className="border-b border-gray-50">
                            <td className="py-2">
                              <Link
                                to={adminSpaTo(`/admin/providers/${p.provider_id}`)}
                                className="font-medium text-primary hover:underline"
                              >
                                {p.business_name}
                              </Link>
                            </td>
                            <td className="py-2 tabular-nums">{formatAdminCurrency(p.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </AdminPanel>
              </section>

              <section>
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Is quality holding?
                </h2>
                <AdminPanel>
                  <h3 className="text-lg font-semibold text-gray-900">Booking outcomes</h3>
                  <p className="mt-1 text-xs text-gray-500">scheduled_at in period</p>
                  <div className="mt-4">
                    <AdminHorizontalBars
                      rows={Object.entries(book).map(([label, value]) => ({ label, value: value as number }))}
                    />
                  </div>
                  <p className="mt-3 text-sm text-gray-600">{qualityNote}</p>
                </AdminPanel>
              </section>

              {healthQ.data?.contracts?.length ? (
                <AdminMetricContractsGlossary contracts={healthQ.data.contracts} />
              ) : null}
            </>
          );
        }}
      </AdminQueryBlock>
    </div>
  );
}

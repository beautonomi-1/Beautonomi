import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminMetricCard } from "@/components/ui/AdminMetricCard";
import { AdminQueryBlock } from "@/components/admin/AdminQueryBlock";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { formatAdminCurrency, formatAdminNumber } from "@/lib/adminFormatCurrency";
import { downloadAdminBlob } from "@/lib/adminCsvDownload";
import { AdminTrendChart } from "@/components/admin/charts/AdminTrendChart";
import { AdminHorizontalBars } from "@/components/admin/charts/AdminHorizontalBars";
import { AdminCohortTable } from "@/components/admin/charts/AdminCohortTable";
import { AdminCompositionBar } from "@/components/admin/charts/AdminCompositionBar";
import {
  AdminMetricContractsGlossary,
  type MetricContractRow,
} from "@/components/admin/AdminMetricContractsGlossary";
import {
  type AnalyticsPeriod,
  bookingStatusBarRows,
  buildRevenueMixSegments,
  deltaPct,
  fmtPctRate,
  formatDeltaHint,
  periodDaysLabel,
  qualityShareSentence,
  sumTimeSeriesCount,
} from "@/routes/analytics/analyticsPageMetrics";

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
    bookingStatus?: Record<string, number> & { scheduled_total?: number; other?: number };
  };
  bookingsByChannel?: Array<{ channel: string; count: number; percentage?: number }>;
  topProviders?: Array<{ provider_id: string; business_name: string; revenue: number }>;
  provider_net_earnings_total?: number;
  platform_net_total?: number;
  take_rate?: number;
  contribution_margin?: number;
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
    marketing_credits?: number;
    gift_card_breakage?: number;
  };
  marketplace_health_series?: Array<{
    as_of: string;
    booking_frequency_30d?: number | null;
    repeat_rate_90d?: number | null;
    transacting_providers_30d?: number | null;
    active_providers?: number | null;
    supply_liquidity?: number | null;
    provider_bookings_per_week?: number | null;
    take_rate?: number | null;
  }>;
}

type HealthPayload = {
  latest?: {
    as_of?: string;
    repeat_rate_90d?: number | null;
    booking_frequency_30d?: number | null;
    transacting_providers_30d?: number | null;
    supply_liquidity?: number | null;
    provider_bookings_per_week?: number | null;
    active_providers?: number | null;
  } | null;
  prior?: {
    supply_liquidity?: number | null;
  } | null;
  deltas?: Record<string, number | null> | null;
  cohort?: Array<{ cohortMonth: string; cohortSize: number; m1: number | null; m3: number | null; m6: number | null }>;
  contracts?: MetricContractRow[];
  metrics_notes?: { snapshot_basis?: string; live_fallback?: string };
};

const PERIODS: AnalyticsPeriod[] = ["7d", "30d", "90d", "1y"];

function parsePeriod(raw: string | null): AnalyticsPeriod {
  if (raw && PERIODS.includes(raw as AnalyticsPeriod)) return raw as AnalyticsPeriod;
  return "30d";
}

function sectionLink(to: string, label: string, period: string) {
  const path = adminSpaTo(to);
  return (
    <Link to={`${path}?period=${encodeURIComponent(period)}`} className="text-sm font-medium text-primary underline">
      {label} →
    </Link>
  );
}

function metricFooter(to: string, label: string, period: string) {
  return (
    <Link
      to={`${adminSpaTo(to)}?period=${encodeURIComponent(period)}`}
      className="font-medium text-white underline decoration-white/40 underline-offset-2 transition hover:decoration-white"
    >
      {label} →
    </Link>
  );
}

export function AnalyticsPage() {
  useAdminDocumentTitle("Analytics");
  const { allowed, denied } = useSuperadminPage("Analytics is superadmin only.");
  const [searchParams, setSearchParams] = useSearchParams();
  const period = parsePeriod(searchParams.get("period"));

  const setPeriod = (next: AnalyticsPeriod) => {
    const n = new URLSearchParams(searchParams);
    n.set("period", next);
    setSearchParams(n, { replace: true });
  };

  const q = useQuery({
    queryKey: adminQueryKeys.analytics(period),
    queryFn: () =>
      adminApi.getJson<AnalyticsPayload>(`/api/admin/analytics?period=${encodeURIComponent(period)}`),
    enabled: allowed,
  });

  const healthQ = useQuery({
    queryKey: adminQueryKeys.marketplaceHealth(period),
    queryFn: () =>
      adminApi.getJson<HealthPayload>(
        `/api/admin/marketplace-health?period=${encodeURIComponent(period)}&cohort=1`,
      ),
    enabled: allowed,
  });

  if (denied) return denied;

  const headerActions = (
    <div className="flex flex-wrap items-center gap-3">
      <select
        className="min-h-11 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium shadow-sm ring-1 ring-gray-950/[0.04]"
        value={period}
        onChange={(e) => setPeriod(parsePeriod(e.target.value))}
      >
        <option value="7d">Last 7 days</option>
        <option value="30d">Last 30 days</option>
        <option value="90d">Last 90 days</option>
        <option value="1y">Last year</option>
      </select>
      <Link to={adminSpaTo("/admin/analytics/geo")} className="text-sm font-medium text-primary underline">
        Geo & Devices
      </Link>
      <Link to={adminSpaTo("/admin/finance")} className="text-sm font-medium text-primary underline">
        Finance
      </Link>
      <Link to={adminSpaTo("/admin/reports")} className="text-sm font-medium text-primary underline">
        Reports
      </Link>
      <button
        type="button"
        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
        title="Summary CSV (customers, providers, bookings created, settled GMV). Rate limited."
        onClick={() => {
          void downloadAdminBlob(
            `/api/admin/export/analytics?period=${encodeURIComponent(period)}`,
            `analytics-summary-${period}.csv`,
          ).catch(() => alert("Export failed"));
        }}
      >
        Export summary CSV
      </button>
    </div>
  );

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Analytics"
        description="Demand, supply, money, and quality for the scoped tenant. Period totals use the selected range; snapshot cards use trailing windows from marketplace health."
        actions={headerActions}
      />

      <AdminQueryBlock query={q}>
        {(data) => {
          const ts = data?.timeSeries ?? {};
          const prov = data?.breakdowns?.providerStatus ?? {};
          const book = data?.breakdowns?.bookingStatus ?? {};
          const top = data?.topProviders ?? [];
          const byChannel = data?.bookingsByChannel ?? [];
          const healthSeries = data?.marketplace_health_series ?? [];
          const latest = healthQ.data?.latest;
          const deltas = healthQ.data?.deltas ?? null;
          const supplyDelta = deltaPct(latest?.supply_liquidity ?? null, healthQ.data?.prior?.supply_liquidity ?? null);

          const newCustomers = sumTimeSeriesCount(ts.users ?? []);
          const bookingsScheduled = sumTimeSeriesCount(ts.bookings ?? []);
          const newProviders = sumTimeSeriesCount(ts.providers ?? []);
          const completedVisits = book.completed ?? 0;

          const bookingTrend = (ts.bookings ?? []).map((p) => ({ date: p.date, value: p.count ?? 0 }));
          const userTrend = (ts.users ?? []).map((p) => ({ date: p.date, value: p.count ?? 0 }));
          const revenueTrend = (ts.revenue ?? []).map((p) => ({ date: p.date, value: p.revenue ?? 0 }));
          const providerTrend = (ts.providers ?? []).map((p) => ({ date: p.date, value: p.count ?? 0 }));

          const frequencyTrend = healthSeries
            .filter((r) => r.booking_frequency_30d != null)
            .map((r) => ({ date: r.as_of, value: r.booking_frequency_30d ?? 0 }));
          const repeatTrend = healthSeries
            .filter((r) => r.repeat_rate_90d != null)
            .map((r) => ({ date: r.as_of, value: r.repeat_rate_90d ?? 0 }));
          const transactingTrend = healthSeries.map((r) => ({
            date: r.as_of,
            value: r.transacting_providers_30d ?? 0,
          }));
          const liquidityTrend = healthSeries
            .filter((r) => r.supply_liquidity != null)
            .map((r) => ({ date: r.as_of, value: r.supply_liquidity ?? 0 }));
          const bookingsPerWeekTrend = healthSeries
            .filter((r) => r.provider_bookings_per_week != null)
            .map((r) => ({ date: r.as_of, value: r.provider_bookings_per_week ?? 0 }));
          const takeRateTrend = healthSeries
            .filter((r) => r.take_rate != null)
            .map((r) => ({ date: r.as_of, value: r.take_rate ?? 0 }));

          const quality = qualityShareSentence(book);
          const earningsTotal = data?.provider_net_earnings_total ?? 0;
          const mixSegments = buildRevenueMixSegments(data?.revenue_streams);

          return (
            <>
              <section>
                <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Selected period
                </h2>
                <p className="mb-4 text-xs text-gray-500">Totals for last {periodDaysLabel(period)} · tenant scope</p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <AdminMetricCard variant="violet" label="New customers" value={formatAdminNumber(newCustomers)} />
                  <AdminMetricCard
                    variant="emerald"
                    label="Bookings scheduled"
                    value={formatAdminNumber(bookingsScheduled)}
                  />
                  <AdminMetricCard variant="slate" label="Completed visits" value={formatAdminNumber(completedVisits)} />
                  <AdminMetricCard variant="amber" label="New providers" value={formatAdminNumber(newProviders)} />
                  <AdminMetricCard
                    variant="emerald"
                    label="Platform recognized revenue"
                    value={formatAdminCurrency(data?.platform_net_total ?? 0)}
                    footer={metricFooter("/reports/revenue", "Revenue report", period)}
                  />
                </div>
              </section>

              <section>
                <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Marketplace snapshot
                </h2>
                <p className="mb-1 text-xs text-gray-500">
                  Trailing windows from nightly snapshot
                  {latest?.as_of ? ` · as of ${latest.as_of}` : ""}
                  {healthQ.data?.metrics_notes?.live_fallback ? ` · ${healthQ.data.metrics_notes.live_fallback}` : ""}
                </p>
                <p className="mb-4 text-xs text-gray-500">
                  Customer report repeat/frequency use the <strong>selected period</strong>, not these trailing windows.
                </p>
                {healthQ.isError ? (
                  <AdminPanel>
                    <AdminRetryBlock message={healthQ.error.message} onRetry={() => void healthQ.refetch()} />
                  </AdminPanel>
                ) : healthQ.isPending ? (
                  <AdminPanel>
                    <AdminPageSkeleton rows={2} />
                    <p className="mt-2 text-xs text-gray-500">Loading snapshot…</p>
                  </AdminPanel>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                    <AdminMetricCard
                      variant="violet"
                      label="Repeat rate (90d trailing)"
                      value={fmtPctRate(latest?.repeat_rate_90d ?? null)}
                      hint={formatDeltaHint(deltas?.repeat_rate_90d, period)}
                      footer={metricFooter("/reports/customers", "Customer report", period)}
                    />
                    <AdminMetricCard
                      variant="emerald"
                      label="Booking frequency (30d trailing)"
                      value={
                        latest?.booking_frequency_30d != null
                          ? latest.booking_frequency_30d.toFixed(2)
                          : "—"
                      }
                      hint={formatDeltaHint(deltas?.booking_frequency_30d, period)}
                    />
                    <AdminMetricCard
                      variant="slate"
                      label="Transacting salons (30d)"
                      value={formatAdminNumber(latest?.transacting_providers_30d ?? 0)}
                      hint={`${formatAdminNumber(latest?.active_providers ?? 0)} active · ${formatDeltaHint(deltas?.transacting_providers_30d, period)}`}
                      footer={metricFooter("/reports/providers", "Provider report", period)}
                    />
                    <AdminMetricCard
                      variant="amber"
                      label="Supply liquidity"
                      value={fmtPctRate(latest?.supply_liquidity ?? null)}
                      hint={formatDeltaHint(supplyDelta, period)}
                    />
                    <AdminMetricCard
                      variant="emerald"
                      label="Salon bookings / week"
                      value={
                        latest?.provider_bookings_per_week != null
                          ? latest.provider_bookings_per_week.toFixed(1)
                          : "—"
                      }
                      hint={formatDeltaHint(deltas?.provider_bookings_per_week, period)}
                    />
                  </div>
                )}
              </section>

              <section>
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Are customers coming back?
                </h2>
                <div className="grid gap-6 xl:grid-cols-3">
                  <AdminPanel>
                    <h3 className="text-lg font-semibold text-gray-900">New customers per day</h3>
                    <p className="mt-1 text-xs text-gray-500">Customer created_at in tenant scope</p>
                    <div className="mt-4">
                      <AdminTrendChart series={userTrend} label="New customers per day" />
                    </div>
                  </AdminPanel>
                  <AdminPanel>
                    <h3 className="text-lg font-semibold text-gray-900">Bookings by scheduled day</h3>
                    <p className="mt-1 text-xs text-gray-500">scheduled_at in period through now</p>
                    <div className="mt-4">
                      <AdminTrendChart series={bookingTrend} emptyMessage="No bookings in this range." label="Bookings by scheduled day" />
                    </div>
                  </AdminPanel>
                  <AdminPanel>
                    <h3 className="text-lg font-semibold text-gray-900">Booking frequency (30d rolling)</h3>
                    <p className="mt-1 text-xs text-gray-500">Trailing 30d on each snapshot date</p>
                    <div className="mt-4">
                      <AdminTrendChart series={frequencyTrend} label="Booking frequency trend" />
                    </div>
                  </AdminPanel>
                </div>
                <div className="mt-6 grid gap-6 lg:grid-cols-2">
                  <AdminPanel>
                    <h3 className="text-lg font-semibold text-gray-900">Repeat rate (90d rolling)</h3>
                    <p className="mt-1 text-xs text-gray-500">Trailing 90d on each snapshot date</p>
                    <div className="mt-4">
                      <AdminTrendChart
                        series={repeatTrend}
                        valueFormat="percent"
                        emptyMessage="Not enough completed bookings in this range."
                        label="Repeat rate trend"
                      />
                    </div>
                  </AdminPanel>
                </div>
                <AdminPanel className="mt-6">
                  <h3 className="text-lg font-semibold text-gray-900">Cohort retention</h3>
                  <p className="mt-1 text-xs text-gray-500">
                    First completed visit month → return in M+1, M+3, M+6 (18-month lookback, not period-filtered)
                  </p>
                  <div className="mt-4">
                    {healthQ.isPending ? (
                      <AdminPageSkeleton rows={3} />
                    ) : healthQ.isError ? (
                      <AdminRetryBlock message={healthQ.error.message} onRetry={() => void healthQ.refetch()} />
                    ) : (
                      <AdminCohortTable rows={healthQ.data?.cohort ?? []} />
                    )}
                  </div>
                  <p className="mt-4">{sectionLink("/reports/customers", "Customer report", period)}</p>
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
                  <p className="mt-4">{sectionLink("/reports/bookings", "Booking report", period)}</p>
                </AdminPanel>
              </section>

              <section>
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Are salons getting work?
                </h2>
                <div className="grid gap-6 lg:grid-cols-2">
                  <AdminPanel>
                    <h3 className="text-lg font-semibold text-gray-900">New providers</h3>
                    <p className="mt-1 text-xs text-gray-500">created_at in selected period</p>
                    <div className="mt-4">
                      <AdminTrendChart series={providerTrend} label="New providers" />
                    </div>
                  </AdminPanel>
                  <AdminPanel>
                    <h3 className="text-lg font-semibold text-gray-900">Transacting salons (30d)</h3>
                    <p className="mt-1 text-xs text-gray-500">On each snapshot date</p>
                    <div className="mt-4">
                      <AdminTrendChart series={transactingTrend} label="Transacting salons" />
                    </div>
                  </AdminPanel>
                  <AdminPanel>
                    <h3 className="text-lg font-semibold text-gray-900">Supply liquidity</h3>
                    <p className="mt-1 text-xs text-gray-500">Transacting salons ÷ active providers on snapshot</p>
                    <div className="mt-4">
                      <AdminTrendChart series={liquidityTrend} valueFormat="percent" label="Supply liquidity" />
                    </div>
                  </AdminPanel>
                  <AdminPanel>
                    <h3 className="text-lg font-semibold text-gray-900">Salon bookings per week</h3>
                    <p className="mt-1 text-xs text-gray-500">Marketplace health formula on snapshot</p>
                    <div className="mt-4">
                      <AdminTrendChart series={bookingsPerWeekTrend} label="Salon bookings per week" />
                    </div>
                  </AdminPanel>
                </div>
                <AdminPanel className="mt-6">
                  <h3 className="text-lg font-semibold text-gray-900">Provider status (current roster)</h3>
                  <p className="mt-1 text-xs text-gray-500">Not filtered by selected period</p>
                  <div className="mt-4">
                    <AdminHorizontalBars
                      rows={Object.entries(prov).map(([label, value]) => ({ label, value: value as number }))}
                    />
                  </div>
                  <p className="mt-4">{sectionLink("/reports/providers", "Provider report", period)}</p>
                </AdminPanel>
              </section>

              <section>
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Where does the money come from?
                </h2>
                <div className="mb-6 grid gap-4 sm:grid-cols-3">
                  <AdminMetricCard
                    variant="emerald"
                    label="Take rate (period ledger)"
                    value={fmtPctRate(data?.take_rate ?? null)}
                  />
                  <AdminMetricCard
                    variant="violet"
                    label="Contribution margin (period)"
                    value={formatAdminCurrency(data?.contribution_margin ?? 0)}
                  />
                  <AdminMetricCard
                    variant="rose"
                    label="Gateway fees (period)"
                    value={formatAdminCurrency(data?.gateway_fees_total ?? 0)}
                  />
                </div>
                <div className="grid gap-6 lg:grid-cols-2">
                  <AdminPanel>
                    <h3 className="text-lg font-semibold text-gray-900">Daily platform net</h3>
                    <p className="mt-1 text-xs text-gray-500">Ledger platform recognized revenue per day</p>
                    <div className="mt-4">
                      <AdminTrendChart series={revenueTrend} valueFormat="currency" label="Daily platform net" />
                    </div>
                  </AdminPanel>
                  <AdminPanel>
                    <h3 className="text-lg font-semibold text-gray-900">Take rate (daily ledger snapshot)</h3>
                    <p className="mt-1 text-xs text-gray-500">Single-day ledger on each snapshot — not period take rate</p>
                    <div className="mt-4">
                      <AdminTrendChart
                        series={takeRateTrend}
                        valueFormat="percent"
                        emptyMessage="Take rate series starts after the first marketplace health snapshot."
                        label="Daily take rate snapshot"
                      />
                    </div>
                  </AdminPanel>
                </div>
                {data?.revenue_streams ? (
                  <AdminPanel className="mt-6">
                    <h3 className="text-lg font-semibold text-gray-900">Revenue mix (selected period)</h3>
                    <p className="mt-1 text-xs text-gray-500">{data?.financeNote}</p>
                    <div className="mt-4">
                      <AdminCompositionBar segments={mixSegments} showShare />
                    </div>
                    <p className="mt-4">{sectionLink("/reports/revenue", "Revenue report", period)}</p>
                  </AdminPanel>
                ) : null}
                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  <AdminMetricCard
                    variant="slate"
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
                  <h3 className="text-lg font-semibold text-gray-900">Top providers by net earnings</h3>
                  <p className="mt-1 text-xs text-gray-500">
                    Provider net earnings (earnings, travel, tips, cancellation fees, walk-in charges). Provider report
                    table uses a narrower ledger slice.
                  </p>
                  {top.length === 0 ? (
                    <p className="mt-4 text-sm text-gray-500">No provider earnings in this period.</p>
                  ) : (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <caption className="sr-only">Top providers by net earnings</caption>
                        <thead>
                          <tr className="border-b border-gray-200 text-xs text-gray-500">
                            <th className="pb-2 pr-2 font-medium">Provider</th>
                            <th className="pb-2 pr-2 font-medium">Net earnings</th>
                            <th className="pb-2 font-medium">Share</th>
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
                              <td className="py-2 tabular-nums text-gray-600">
                                {earningsTotal > 0
                                  ? `${((p.revenue / earningsTotal) * 100).toFixed(1)}%`
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </AdminPanel>
              </section>

              <section>
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Is quality holding?
                </h2>
                <AdminPanel>
                  <h3 className="text-lg font-semibold text-gray-900">Booking outcomes</h3>
                  <p className="mt-1 text-xs text-gray-500">scheduled_at in period through now</p>
                  <div className="mt-4">
                    <AdminHorizontalBars rows={bookingStatusBarRows(book)} emptyMessage="No bookings in period." />
                  </div>
                  {quality ? (
                    <p className="mt-3 text-sm text-gray-600">
                      Cancelled {quality.cancelPct} and no-show {quality.noShowPct} of {book.scheduled_total ?? 0}{" "}
                      scheduled in period.
                    </p>
                  ) : (
                    <p className="mt-3 text-sm text-gray-600">Not enough bookings in period for quality share.</p>
                  )}
                  <p className="mt-4">{sectionLink("/reports/bookings", "Booking report", period)}</p>
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

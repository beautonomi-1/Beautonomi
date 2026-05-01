import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AdminApiError } from "@beautonomi/admin-api-client";
import { ArrowRight, Cpu, Eye, Shield, Wallet, FileText, Info, Megaphone, Activity } from "lucide-react";
import { ADMIN_SECTION_OVERVIEW } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { useAdminSession } from "@/providers/AdminSessionProvider";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdminMetricCard } from "@/components/ui/AdminMetricCard";
import { AdminQueryBlock } from "@/components/admin/AdminQueryBlock";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { formatAdminCurrency, formatAdminNumber } from "@/lib/adminFormatCurrency";
import { adminToolbarButtonClass } from "@/lib/adminUi";

interface DashboardStats {
  total_users: number;
  total_providers: number;
  total_bookings: number;
  /**
   * Platform revenue rollup aligned with GET /api/admin/finance/summary `platform_revenue.total`
   * (booking take + subs + ads + Platform Fees + paid wallet topups).
   * Ledger-backed lines use a rolling window (see `metrics_notes.ledger_window_months` when present).
   */
  total_revenue: number;
  pending_approvals: number;
  /** Bookings whose `created_at` is today (not “in progress” pipeline). */
  active_bookings_today: number;
  revenue_today: number;
  revenue_this_month: number;
  revenue_growth?: number;
  users_growth?: number;
  providers_growth?: number;
  bookings_growth?: number;
  /** Settled service GMV from ledger rows — matches finance summary. */
  gmv_total?: number;
  /** Same numeric basis as `total_revenue` when API sends both (backward compatibility). */
  platform_net_total?: number;
  subscription_net_total?: number;
  ads_net_total?: number;
  metrics_notes?: {
    ledger_window_months?: number;
    customer_count_basis?: string;
    customer_count_fallback_basis?: string;
    customer_growth_basis?: string;
    platform_net_includes?: string;
    bookings_growth_basis?: string;
    providers_growth_basis?: string;
  };
  /** ISO time when counts were assembled (tenant scope). */
  generated_at?: string;
  /** Headline customer count used DB fallback (narrower definition). */
  customer_count_uses_fallback?: boolean;
  customer_signups_this_month?: number;
  customer_signups_last_month?: number;
}

function metricFooterLink(to: string, label: string) {
  return (
    <Link
      to={adminSpaTo(to)}
      className="font-medium text-white underline decoration-white/40 underline-offset-2 transition hover:decoration-white"
    >
      {label} →
    </Link>
  );
}

type MarketingInsightsPayload = {
  signup_sources: Array<{ source: string | null; label: string; count: number }>;
  previous_booking_systems: Array<{ slug: string | null; label: string; count: number }>;
  customer_age_brackets: Array<{ label: string; count: number }>;
  customer_decade_born: Array<{ label: string; count: number }>;
  provider_years_in_business: Array<{ label: string; count: number }>;
  provider_person_age_brackets: Array<{ label: string; count: number }>;
  product_signals: {
    bookings_last_7d: number;
    bookings_prior_7d: number;
    booking_velocity_pct_vs_prior_week: number;
    users_in_tenant_scope: number;
    signup_source_attribution_rate: number;
  };
  marketing_funnel_events: {
    description: string;
    suggested_funnel: string[];
    acquisition_events: string[];
    engagement_events: string[];
  };
  metrics_notes: Record<string, string>;
};

function HorizontalDistributionBars({ rows }: { rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0) {
    return <p className="text-sm text-gray-500">No data yet.</p>;
  }
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex justify-between gap-2 text-xs text-gray-600">
            <span className="min-w-0 truncate">{r.label}</span>
            <span className="shrink-0 tabular-nums text-gray-900">{formatAdminNumber(r.count)}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-2 rounded-full bg-gray-900 transition-[width]"
              style={{ width: `${(r.count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_OVERVIEW,
    "Overview section access is required for the dashboard."
  );
  const { bootstrap } = useAdminSession();
  const isSuperadmin = bootstrap?.isSuperadmin === true;
  useAdminDocumentTitle("Dashboard");

  const q = useQuery({
    queryKey: adminQueryKeys.dashboard(),
    queryFn: () => adminApi.getJson<DashboardStats>("/api/admin/dashboard", { timeoutMs: 45_000 }),
    enabled: allowed,
  });

  const insightsQ = useQuery({
    queryKey: adminQueryKeys.dashboardMarketingInsights(),
    queryFn: () =>
      adminApi.getJson<MarketingInsightsPayload>("/api/admin/dashboard/marketing-insights", {
        timeoutMs: 45_000,
      }),
    enabled: allowed && isSuperadmin,
  });

  if (denied) return denied;

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Dashboard"
        description="Operational and commercial snapshot for the scoped tenant — metrics are comparable to Finance / ledger when noted below."
        actions={
          <>
            {q.data?.generated_at ? (
              <span className="self-center text-xs text-gray-500" title="Server-side snapshot time">
                As of{" "}
                {new Date(q.data.generated_at).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            ) : null}
            <button
              type="button"
              className={adminToolbarButtonClass(q.isFetching)}
              disabled={q.isPending}
              onClick={() => void q.refetch()}
            >
              {q.isFetching ? "Refreshing…" : "Refresh"}
            </button>
          </>
        }
      />

      {isSuperadmin ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Link
            to={adminSpaTo("/admin/gods-eye")}
            className="flex items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 px-4 py-4 shadow-sm ring-1 ring-violet-100 transition hover:border-violet-300 hover:shadow-md"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-white shadow">
                <Eye className="h-5 w-5" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-semibold text-gray-900">Gods Eye</span>
                <span className="text-xs text-gray-600">Full operations picture</span>
              </span>
            </span>
            <ArrowRight className="h-4 w-4 text-violet-600" aria-hidden />
          </Link>
          <Link
            to={adminSpaTo("/admin/control-plane/overview")}
            className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-gray-100 px-4 py-4 shadow-sm ring-1 ring-slate-200/80 transition hover:border-slate-300 hover:shadow-md"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow">
                <Cpu className="h-5 w-5" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-semibold text-gray-900">Control plane</span>
                <span className="text-xs text-gray-600">Platform tools</span>
              </span>
            </span>
            <ArrowRight className="h-4 w-4 text-slate-600" aria-hidden />
          </Link>
          <Link
            to={adminSpaTo("/admin/settings/team-permissions")}
            className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 px-4 py-4 shadow-sm ring-1 ring-emerald-100 transition hover:border-emerald-300 hover:shadow-md"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 text-white shadow">
                <Shield className="h-5 w-5" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-semibold text-gray-900">Team permissions</span>
                <span className="text-xs text-gray-600">Section access matrix</span>
              </span>
            </span>
            <ArrowRight className="h-4 w-4 text-emerald-700" aria-hidden />
          </Link>
          <Link
            to={adminSpaTo("/admin/finance")}
            className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 px-4 py-4 shadow-sm ring-1 ring-amber-100 transition hover:border-amber-300 hover:shadow-md"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-600 text-white shadow">
                <Wallet className="h-5 w-5" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-semibold text-gray-900">Finance</span>
                <span className="text-xs text-gray-600">Ledger summary</span>
              </span>
            </span>
            <ArrowRight className="h-4 w-4 text-amber-700" aria-hidden />
          </Link>
          <Link
            to={adminSpaTo("/admin/reports")}
            className="flex items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-blue-50 px-4 py-4 shadow-sm ring-1 ring-sky-100 transition hover:border-sky-300 hover:shadow-md"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-700 text-white shadow">
                <FileText className="h-5 w-5" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-semibold text-gray-900">Reports</span>
                <span className="text-xs text-gray-600">Exports & reconciliation</span>
              </span>
            </span>
            <ArrowRight className="h-4 w-4 text-sky-700" aria-hidden />
          </Link>
        </div>
      ) : null}

      {isSuperadmin ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Megaphone className="h-5 w-5 text-gray-700" aria-hidden />
            <h2 className="text-lg font-semibold text-gray-900">Acquisition &amp; migration (tenant scope)</h2>
          </div>
          {insightsQ.isLoading ? (
            <AdminPanel>
              <p className="text-sm text-gray-500">Loading marketing insights…</p>
            </AdminPanel>
          ) : insightsQ.error ? (
            <AdminPanel>
              <p className="text-sm text-amber-800">
                {insightsQ.error instanceof AdminApiError && insightsQ.error.status === 403
                  ? "Marketing insights require superadmin."
                  : insightsQ.error.message}
              </p>
            </AdminPanel>
          ) : insightsQ.data ? (
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <AdminPanel>
                  <h3 className="mb-1 text-sm font-semibold text-gray-900">Signup source (onboarding)</h3>
                  <p className="mb-3 text-xs text-gray-500">
                    {insightsQ.data.metrics_notes.signup_source_basis}
                  </p>
                  <HorizontalDistributionBars
                    rows={insightsQ.data.signup_sources.map((r) => ({ label: r.label, count: r.count }))}
                  />
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 text-xs text-gray-600">
                    <span>
                      Attribution:{" "}
                      <strong className="text-gray-900">
                        {Math.round(insightsQ.data.product_signals.signup_source_attribution_rate * 100)}%
                      </strong>{" "}
                      of tenant-scoped users specified a source
                    </span>
                    <Link
                      className="font-medium text-gray-900 underline"
                      to={adminSpaTo("/admin/users")}
                    >
                      Filter users by source →
                    </Link>
                  </div>
                </AdminPanel>
                <AdminPanel>
                  <h3 className="mb-1 text-sm font-semibold text-gray-900">Prior booking system (providers)</h3>
                  <p className="mb-3 text-xs text-gray-500">
                    {insightsQ.data.metrics_notes.previous_software_basis}
                  </p>
                  <HorizontalDistributionBars
                    rows={insightsQ.data.previous_booking_systems.map((r) => ({
                      label: r.label,
                      count: r.count,
                    }))}
                  />
                  <div className="mt-4 border-t border-gray-100 pt-3">
                    <Link
                      className="text-xs font-medium text-gray-900 underline"
                      to={adminSpaTo("/admin/providers")}
                    >
                      Open providers →
                    </Link>
                  </div>
                </AdminPanel>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-gray-900">Demographics &amp; tenure</h3>
                <span className="text-xs text-gray-500">Precision: DOB vs decade; business vs person</span>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <AdminPanel>
                  <h3 className="mb-1 text-sm font-semibold text-gray-900">Customer age (date of birth)</h3>
                  <p className="mb-3 text-xs text-gray-500">{insightsQ.data.metrics_notes.customer_age_basis}</p>
                  <HorizontalDistributionBars rows={insightsQ.data.customer_age_brackets} />
                </AdminPanel>
                <AdminPanel>
                  <h3 className="mb-1 text-sm font-semibold text-gray-900">Customer decade born (profile)</h3>
                  <p className="mb-3 text-xs text-gray-500">{insightsQ.data.metrics_notes.customer_decade_basis}</p>
                  <HorizontalDistributionBars rows={insightsQ.data.customer_decade_born} />
                </AdminPanel>
                <AdminPanel>
                  <h3 className="mb-1 text-sm font-semibold text-gray-900">Years in business (provider org)</h3>
                  <p className="mb-3 text-xs text-gray-500">
                    {insightsQ.data.metrics_notes.provider_years_in_business_basis}
                  </p>
                  <HorizontalDistributionBars rows={insightsQ.data.provider_years_in_business} />
                </AdminPanel>
                <AdminPanel>
                  <h3 className="mb-1 text-sm font-semibold text-gray-900">Provider staff &amp; owners — age (person)</h3>
                  <p className="mb-3 text-xs text-gray-500">{insightsQ.data.metrics_notes.provider_person_age_basis}</p>
                  <HorizontalDistributionBars rows={insightsQ.data.provider_person_age_brackets} />
                </AdminPanel>
              </div>

              <AdminPanel>
                <div className="flex flex-wrap items-start gap-2">
                  <Activity className="mt-0.5 h-5 w-5 shrink-0 text-gray-600" aria-hidden />
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Product signals (database)</h3>
                    <p className="mt-1 text-xs text-gray-500">{insightsQ.data.metrics_notes.booking_velocity_basis}</p>
                  </div>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg bg-gray-50 px-3 py-2">
                    <dt className="text-xs text-gray-500">Bookings (last 7d)</dt>
                    <dd className="font-semibold tabular-nums text-gray-900">
                      {formatAdminNumber(insightsQ.data.product_signals.bookings_last_7d)}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-gray-50 px-3 py-2">
                    <dt className="text-xs text-gray-500">Bookings (prior 7d)</dt>
                    <dd className="font-semibold tabular-nums text-gray-900">
                      {formatAdminNumber(insightsQ.data.product_signals.bookings_prior_7d)}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-gray-50 px-3 py-2">
                    <dt className="text-xs text-gray-500">WoW velocity</dt>
                    <dd className="font-semibold tabular-nums text-gray-900">
                      {insightsQ.data.product_signals.booking_velocity_pct_vs_prior_week >= 0 ? "+" : ""}
                      {insightsQ.data.product_signals.booking_velocity_pct_vs_prior_week}%
                    </dd>
                  </div>
                  <div className="rounded-lg bg-gray-50 px-3 py-2">
                    <dt className="text-xs text-gray-500">Users (tenant scope)</dt>
                    <dd className="font-semibold tabular-nums text-gray-900">
                      {formatAdminNumber(insightsQ.data.product_signals.users_in_tenant_scope)}
                    </dd>
                  </div>
                </dl>
              </AdminPanel>

              <AdminPanel>
                <h3 className="text-sm font-semibold text-gray-900">Event analytics (Amplitude)</h3>
                <p className="mt-1 text-sm text-gray-600">{insightsQ.data.marketing_funnel_events.description}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3 text-xs">
                  <div>
                    <p className="font-medium text-gray-800">Booking funnel</p>
                    <ul className="mt-1 list-inside list-disc text-gray-600">
                      {insightsQ.data.marketing_funnel_events.suggested_funnel.map((e) => (
                        <li key={e} className="font-mono">
                          {e}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium text-gray-800">Acquisition</p>
                    <ul className="mt-1 list-inside list-disc text-gray-600">
                      {insightsQ.data.marketing_funnel_events.acquisition_events.map((e) => (
                        <li key={e} className="font-mono">
                          {e}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium text-gray-800">Engagement</p>
                    <ul className="mt-1 list-inside list-disc text-gray-600">
                      {insightsQ.data.marketing_funnel_events.engagement_events.map((e) => (
                        <li key={e} className="font-mono">
                          {e}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <p className="mt-3 text-xs text-gray-500">
                  Event taxonomy in repo: <code className="rounded bg-gray-100 px-1">docs/analytics/EVENT_TAXONOMY.md</code>.
                  Configure keys under{" "}
                  <Link className="font-medium text-gray-800 underline" to={adminSpaTo("/admin/integrations/amplitude")}>
                    Integrations → Amplitude
                  </Link>
                  .
                </p>
              </AdminPanel>
            </div>
          ) : null}
        </div>
      ) : null}

      <AdminQueryBlock query={q}>
        {(s) => {
          if (!s) return <EmptyState title="No data" />;
          const growthHint = (pct: number | undefined) =>
            pct === undefined || Number.isNaN(pct) ? undefined : `${pct >= 0 ? "+" : ""}${pct}% vs prior month`;

          const notes = s.metrics_notes;
          const signupsThis = s.customer_signups_this_month;
          const signupsLast = s.customer_signups_last_month;
          const signupLine =
            signupsThis !== undefined && signupsLast !== undefined
              ? `New customer accounts (home market): ${formatAdminNumber(signupsThis)} this month · ${formatAdminNumber(signupsLast)} last month`
              : undefined;

          return (
            <div className="space-y-6">
              {s.customer_count_uses_fallback ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                  <span className="font-semibold">Customer count is using a fallback. </span>
                  {notes?.customer_count_fallback_basis ??
                    "Apply migration 446 (admin_dashboard_tenant_customer_count) for distinct customers including bookers without preferred home."}
                </div>
              ) : null}

              <AdminPanel>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-gray-900">
                    <Info className="h-4 w-4 shrink-0 text-gray-500" aria-hidden />
                    How to read this dashboard
                    <span className="text-xs font-normal text-gray-500">(definitions &amp; decision use)</span>
                  </summary>
                  <ul className="mt-3 space-y-2 border-t border-gray-100 pt-3 text-sm text-gray-600">
                    {notes?.customer_count_basis ? (
                      <li>
                        <span className="font-medium text-gray-800">Market customers: </span>
                        {notes.customer_count_basis}
                      </li>
                    ) : null}
                    {notes?.customer_growth_basis ? (
                      <li>
                        <span className="font-medium text-gray-800">Customer % &amp; signups: </span>
                        {notes.customer_growth_basis}
                      </li>
                    ) : null}
                    {notes?.platform_net_includes ? (
                      <li>
                        <span className="font-medium text-gray-800">Platform net: </span>
                        {notes.platform_net_includes}
                        {typeof notes.ledger_window_months === "number"
                          ? ` Rolling window: ${notes.ledger_window_months} months.`
                          : ""}
                      </li>
                    ) : null}
                    {notes?.bookings_growth_basis ? (
                      <li>
                        <span className="font-medium text-gray-800">Bookings trend: </span>
                        {notes.bookings_growth_basis}
                      </li>
                    ) : null}
                    {notes?.providers_growth_basis ? (
                      <li>
                        <span className="font-medium text-gray-800">Providers trend: </span>
                        {notes.providers_growth_basis}
                      </li>
                    ) : null}
                    <li className="text-gray-500">
                      Scope follows the admin tenant picker (superadmin) or your tenant (standard admin). Use{" "}
                      <Link className="font-medium text-gray-800 underline" to={adminSpaTo("/admin/finance")}>
                        Finance
                      </Link>
                      {isSuperadmin ? (
                        <>
                          ,{" "}
                          <Link className="font-medium text-gray-800 underline" to={adminSpaTo("/admin/analytics")}>
                            Analytics
                          </Link>
                        </>
                      ) : null}
                      , and{" "}
                      <Link className="font-medium text-gray-800 underline" to={adminSpaTo("/admin/reports")}>
                        Reports
                      </Link>{" "}
                      for deeper cuts.
                    </li>
                  </ul>
                </details>
              </AdminPanel>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <AdminMetricCard
                  variant="slate"
                  label="Market customers (distinct)"
                  value={formatAdminNumber(s.total_users)}
                  hint={[growthHint(s.users_growth), signupLine].filter(Boolean).join(" · ")}
                  footer={metricFooterLink("/admin/users?role=customer", "User directory")}
                />
                <AdminMetricCard
                  variant="violet"
                  label="Active providers"
                  value={formatAdminNumber(s.total_providers)}
                  hint={growthHint(s.providers_growth)}
                  footer={metricFooterLink("/admin/providers?status=active", "Providers")}
                />
                <AdminMetricCard
                  variant="emerald"
                  label="Bookings (all time)"
                  value={formatAdminNumber(s.total_bookings)}
                  hint={growthHint(s.bookings_growth)}
                  footer={metricFooterLink("/admin/bookings", "Bookings")}
                />
                <AdminMetricCard
                  variant="amber"
                  label="Platform net (ledger window)"
                  value={formatAdminCurrency(s.total_revenue)}
                  hint={
                    typeof notes?.ledger_window_months === "number"
                      ? `Rolling ${notes.ledger_window_months} mo — take + subs + ads`
                      : "Take + subs + ads (net)"
                  }
                  footer={metricFooterLink("/admin/finance", "Finance overview")}
                />
                <AdminMetricCard
                  variant="rose"
                  label="Pending provider approvals"
                  value={formatAdminNumber(s.pending_approvals)}
                  hint="Status pending_approval — review before go-live"
                  footer={metricFooterLink("/admin/providers?status=pending", "Review queue")}
                />
                <AdminMetricCard
                  variant="slate"
                  label="Bookings created today"
                  value={formatAdminNumber(s.active_bookings_today)}
                  hint="Rows created today (tenant timezone)"
                  footer={metricFooterLink("/admin/bookings", "Open bookings")}
                />
                <AdminMetricCard
                  variant="emerald"
                  label="Platform net today"
                  value={formatAdminCurrency(s.revenue_today)}
                  hint="Take + subs + ads"
                  footer={metricFooterLink("/admin/finance", "Finance")}
                />
                <AdminMetricCard
                  variant="violet"
                  label="Platform net (MTD)"
                  value={formatAdminCurrency(s.revenue_this_month)}
                  hint={growthHint(s.revenue_growth)}
                  footer={metricFooterLink("/admin/finance", "Finance")}
                />
              </div>
              {typeof s.gmv_total === "number" ? (
                <div>
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                    Ledger context (same rolling window as headline platform net)
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <AdminMetricCard
                      variant="emerald"
                      label="Settled service GMV"
                      value={formatAdminCurrency(s.gmv_total)}
                      hint="Ledger-backed, matches finance summary"
                      footer={metricFooterLink("/admin/finance", "Reconcile in Finance")}
                    />
                    {typeof s.subscription_net_total === "number" ? (
                      <AdminMetricCard
                        variant="slate"
                        label="Subscription net"
                        value={formatAdminCurrency(s.subscription_net_total)}
                        footer={metricFooterLink("/admin/subscription-revenue", "Subscription revenue")}
                      />
                    ) : null}
                    {typeof s.ads_net_total === "number" ? (
                      <AdminMetricCard
                        variant="slate"
                        label="Ads net"
                        value={formatAdminCurrency(s.ads_net_total)}
                        footer={metricFooterLink("/admin/finance", "Finance")}
                      />
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          );
        }}
      </AdminQueryBlock>
    </div>
  );
}

import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Cpu, Eye, Shield, Wallet, FileText } from "lucide-react";
import { ADMIN_SECTION_OVERVIEW } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminSession } from "@/providers/AdminSessionProvider";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdminMetricCard } from "@/components/ui/AdminMetricCard";
import { AdminQueryBlock } from "@/components/admin/AdminQueryBlock";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { formatAdminCurrency, formatAdminNumber } from "@/lib/adminFormatCurrency";

interface DashboardStats {
  total_users: number;
  total_providers: number;
  total_bookings: number;
  /** Platform take net (commission net − gateway fees, after refunds) — same basis as finance dashboard. */
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
  /** Gross customer payments (payment + additional_charge `amount`) for the same ledger window as `total_revenue`. */
  gmv_total?: number;
  platform_net_total?: number;
}

export function DashboardPage() {
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_OVERVIEW,
    "Overview section access is required for the dashboard."
  );
  const { bootstrap } = useAdminSession();
  const isSuperadmin = bootstrap?.isSuperadmin === true;

  const q = useQuery({
    queryKey: adminQueryKeys.dashboard(),
    queryFn: () => adminApi.getJson<DashboardStats>("/api/admin/dashboard", { timeoutMs: 45_000 }),
    enabled: allowed,
  });

  if (denied) return denied;

  return (
    <div className="space-y-8">
      <AdminPageHeader title="Dashboard" description="Key metrics for your tenant scope" />

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

      <AdminQueryBlock query={q}>
        {(s) => {
          if (!s) return <EmptyState title="No data" />;
          const growthHint = (pct: number | undefined) =>
            pct === undefined || Number.isNaN(pct) ? undefined : `${pct >= 0 ? "+" : ""}${pct}% vs prior month`;

          return (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <AdminMetricCard
                  variant="slate"
                  label="Customers"
                  value={formatAdminNumber(s.total_users)}
                  hint={growthHint(s.users_growth)}
                />
                <AdminMetricCard
                  variant="violet"
                  label="Active providers"
                  value={formatAdminNumber(s.total_providers)}
                  hint={growthHint(s.providers_growth)}
                />
                <AdminMetricCard
                  variant="emerald"
                  label="Bookings (all time)"
                  value={formatAdminNumber(s.total_bookings)}
                  hint={growthHint(s.bookings_growth)}
                />
                <AdminMetricCard
                  variant="amber"
                  label="Platform net (≈2yr)"
                  value={formatAdminCurrency(s.total_revenue)}
                  hint="After refunds & gateway fees — see Finance for full ledger"
                />
                <AdminMetricCard
                  variant="rose"
                  label="Pending approvals"
                  value={formatAdminNumber(s.pending_approvals)}
                  hint="Providers awaiting review"
                />
                <AdminMetricCard
                  variant="slate"
                  label="Bookings created today"
                  value={formatAdminNumber(s.active_bookings_today)}
                  hint="New rows today, not in-flight count"
                />
                <AdminMetricCard
                  variant="emerald"
                  label="Platform net today"
                  value={formatAdminCurrency(s.revenue_today)}
                />
                <AdminMetricCard
                  variant="violet"
                  label="Platform net (MTD)"
                  value={formatAdminCurrency(s.revenue_this_month)}
                  hint={growthHint(s.revenue_growth)}
                />
              </div>
              {typeof s.gmv_total === "number" ? (
                <div>
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                    Ledger context (same window as platform net)
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <AdminMetricCard
                      variant="emerald"
                      label="GMV — customer payments"
                      value={formatAdminCurrency(s.gmv_total)}
                      hint="payment + additional_charge amounts (gross collected)"
                    />
                    {typeof s.platform_net_total === "number" ? (
                      <AdminMetricCard
                        variant="slate"
                        label="Platform + subscriptions (net)"
                        value={formatAdminCurrency(s.platform_net_total)}
                        hint="Take-home style rollup from API"
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

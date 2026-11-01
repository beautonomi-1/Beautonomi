import { Link, useSearchParams } from "react-router";
import type { AnalyticsPeriod } from "@/routes/analytics/analyticsPageMetrics";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CreditCard,
  FileBarChart,
  Gift,
  Headphones,
  LifeBuoy,
  Store,
  Users,
} from "lucide-react";
import { ADMIN_SECTION_OVERVIEW } from "@beautonomi/admin-access";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminSession } from "@/providers/AdminSessionProvider";
import { adminSpaTo } from "@/lib/adminSpaPath";

const REPORTS: { title: string; description: string; spaTo: string; icon: LucideIcon }[] = [
  {
    title: "Revenue report",
    description: "Platform revenue analysis and trends",
    spaTo: "/reports/revenue",
    icon: CreditCard,
  },
  {
    title: "Booking report",
    description: "Booking statistics and completion rates",
    spaTo: "/reports/bookings",
    icon: FileBarChart,
  },
  {
    title: "Provider report",
    description: "Provider performance metrics",
    spaTo: "/reports/providers",
    icon: Store,
  },
  {
    title: "Customer report",
    description: "Repeat visits and platform contribution",
    spaTo: "/reports/customers",
    icon: Users,
  },
  {
    title: "Gift card report",
    description: "Gift card sales and redemptions",
    spaTo: "/reports/gift-cards",
    icon: Gift,
  },
  {
    title: "Membership report",
    description: "Salon membership sales (liability) and active subscribers",
    spaTo: "/reports/memberships",
    icon: BarChart3,
  },
  {
    title: "Yoco reconciliation",
    description: "Payments sync debugging",
    spaTo: "/reports/yoco-reconciliation",
    icon: CreditCard,
  },
  {
    title: "Support performance",
    description: "Volume, SLA, FRT/MTTR, CSAT, opened-vs-resolved trend",
    spaTo: "/reports/support-performance",
    icon: LifeBuoy,
  },
  {
    title: "Support workload & drivers",
    description: "Per-agent productivity, category drivers, aging unassigned, top requesters",
    spaTo: "/reports/support-workload",
    icon: Headphones,
  },
];

const DEFAULT_REPORT_PERIOD: AnalyticsPeriod = "30d";
const PERIODS: AnalyticsPeriod[] = ["7d", "30d", "90d", "1y"];

function parseHubPeriod(raw: string | null): AnalyticsPeriod {
  if (raw && PERIODS.includes(raw as AnalyticsPeriod)) return raw as AnalyticsPeriod;
  return DEFAULT_REPORT_PERIOD;
}

export function ReportsHubPage() {
  const { denied } = useAdminSectionPage(
    ADMIN_SECTION_OVERVIEW,
    "Overview access is required to open finance reports in the SPA (matches report API AuthZ)."
  );
  const { bootstrap } = useAdminSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const period = parseHubPeriod(searchParams.get("period"));
  const periodQuery = `?period=${encodeURIComponent(period)}`;
  if (denied) return denied;

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Reports"
        description="Finance and operations reports for your tenant scope. Period matches Analytics and report APIs (rolling window through now)."
        actions={
          <select
            className="min-h-11 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium shadow-sm ring-1 ring-gray-950/[0.04]"
            value={period}
            onChange={(e) => {
              const n = new URLSearchParams(searchParams);
              n.set("period", parseHubPeriod(e.target.value));
              setSearchParams(n, { replace: true });
            }}
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="1y">Last year</option>
          </select>
        }
      />
      {bootstrap?.isSuperadmin ? (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-gray-900">
          <p className="font-medium text-primary">Superadmin reporting</p>
          <p className="mt-1 text-gray-700">
            For interactive trends and breakdowns, use{" "}
            <Link
              to={`${adminSpaTo("/admin/analytics")}${periodQuery}`}
              className="font-semibold text-primary underline"
            >
              Analytics
            </Link>{" "}
            and{" "}
            <Link to={adminSpaTo("/admin/gods-eye")} className="font-semibold text-primary underline">
              Gods Eye
            </Link>{" "}
            (tenant scope follows your admin scope selector).
          </p>
          <Link
            to={`${adminSpaTo("/admin/analytics")}${periodQuery}`}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary/90"
          >
            <BarChart3 className="h-4 w-4" aria-hidden />
            Open Analytics
          </Link>
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {REPORTS.map((r) => (
          <Link
            key={r.spaTo}
            to={`${r.spaTo}${periodQuery}`}
            className="group flex gap-4 rounded-2xl border border-gray-200/90 bg-white p-5 shadow-sm ring-1 ring-gray-950/[0.04] transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md"
          >
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gray-900 text-white ring-1 ring-white/10">
              <r.icon className="h-6 w-6" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-gray-900 group-hover:text-primary">{r.title}</h2>
              <p className="mt-1 text-sm text-gray-500">{r.description}</p>
              <span className="mt-3 inline-flex items-center text-sm font-medium text-primary">
                Open report
                <span className="ml-1 transition group-hover:translate-x-0.5">→</span>
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

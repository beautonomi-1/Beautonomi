import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { BarChart3, CreditCard, FileBarChart, Gift, Store, Users } from "lucide-react";
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
    description: "Customer behavior and LTV",
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
    title: "Yoco reconciliation",
    description: "Payments sync debugging",
    spaTo: "/reports/yoco-reconciliation",
    icon: CreditCard,
  },
];

export function ReportsHubPage() {
  const { denied } = useAdminSectionPage(
    ADMIN_SECTION_OVERVIEW,
    "Overview access is required to open finance reports in the SPA (matches report API AuthZ)."
  );
  const { bootstrap } = useAdminSession();
  if (denied) return denied;

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Reports"
        description="Finance and operations reports for your tenant scope. Each opens the SPA report viewer with export where the API supports it."
      />
      {bootstrap?.isSuperadmin ? (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-gray-900">
          <p className="font-medium text-primary">Superadmin reporting</p>
          <p className="mt-1 text-gray-700">
            For interactive trends and breakdowns, use{" "}
            <Link to={adminSpaTo("/admin/analytics")} className="font-semibold text-primary underline">
              Analytics
            </Link>{" "}
            and{" "}
            <Link to={adminSpaTo("/admin/gods-eye")} className="font-semibold text-primary underline">
              Gods Eye
            </Link>{" "}
            (tenant scope follows your admin scope selector).
          </p>
          <Link
            to={adminSpaTo("/admin/analytics")}
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
            to={r.spaTo}
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

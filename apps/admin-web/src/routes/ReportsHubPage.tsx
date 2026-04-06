import { Link } from "react-router-dom";
import { ADMIN_SECTION_OVERVIEW } from "@beautonomi/admin-access";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { legacyAdminHref } from "@/lib/legacyAdminOrigin";

const REPORTS: { title: string; description: string; spaTo: string; legacyPath: string }[] = [
  {
    title: "Revenue report",
    description: "Platform revenue analysis and trends",
    spaTo: "reports/revenue",
    legacyPath: "/admin/reports/revenue",
  },
  {
    title: "Booking report",
    description: "Booking statistics and completion rates",
    spaTo: "reports/bookings",
    legacyPath: "/admin/reports/bookings",
  },
  {
    title: "Provider report",
    description: "Provider performance metrics",
    spaTo: "reports/providers",
    legacyPath: "/admin/reports/providers",
  },
  {
    title: "Customer report",
    description: "Customer behavior and LTV",
    spaTo: "reports/customers",
    legacyPath: "/admin/reports/customers",
  },
  {
    title: "Gift card report",
    description: "Gift card sales and redemptions",
    spaTo: "reports/gift-cards",
    legacyPath: "/admin/reports/gift-cards",
  },
  {
    title: "Yoco reconciliation",
    description: "Payments sync debugging",
    spaTo: "reports/yoco-reconciliation",
    legacyPath: "/admin/reports/yoco-reconciliation",
  },
];

export function ReportsHubPage() {
  const { denied } = useAdminSectionPage(
    ADMIN_SECTION_OVERVIEW,
    "Overview access is required to open finance reports in the SPA (matches report API AuthZ)."
  );
  if (denied) return denied;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Reports"
        description="Open reports in the SPA (overview AuthZ) or fall back to legacy for chart parity."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {REPORTS.map((r) => (
          <AdminPanel key={r.spaTo}>
            <h2 className="text-lg font-semibold text-gray-900">{r.title}</h2>
            <p className="mt-1 text-sm text-gray-500">{r.description}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Link to={r.spaTo} className="text-sm font-medium text-primary hover:underline">
                Open in SPA →
              </Link>
              <a href={legacyAdminHref(r.legacyPath)} className="text-sm font-medium text-gray-600 underline">
                Legacy
              </a>
            </div>
          </AdminPanel>
        ))}
      </div>
    </div>
  );
}

import { Link, useLocation } from "react-router-dom";
import {
  ADMIN_SECTION_FINANCE,
  ADMIN_SECTION_OVERVIEW,
  ADMIN_SECTION_PLATFORM_CONFIG,
  type AdminSection,
} from "@beautonomi/admin-access";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { NAV_GROUPS } from "@/config/nav";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminSession } from "@/providers/AdminSessionProvider";

const QUICK_LINKS: { to: string; label: string; section?: AdminSection; superadminOnly?: boolean }[] = [
  { to: adminSpaTo("/admin/dashboard"), label: "Dashboard", section: ADMIN_SECTION_OVERVIEW },
  { to: adminSpaTo("/admin/gods-eye"), label: "Gods Eye", superadminOnly: true },
  { to: adminSpaTo("/admin/analytics"), label: "Analytics", superadminOnly: true },
  { to: adminSpaTo("/admin/control-plane/overview"), label: "Control plane", superadminOnly: true },
  { to: adminSpaTo("/admin/finance"), label: "Finance", section: ADMIN_SECTION_FINANCE },
  { to: adminSpaTo("/admin/reports"), label: "Reports", section: ADMIN_SECTION_OVERVIEW },
  { to: adminSpaTo("/admin/settings"), label: "Settings", section: ADMIN_SECTION_PLATFORM_CONFIG },
];

function sidebarSpaPaths(): string[] {
  const out: string[] = [];
  for (const g of NAV_GROUPS) {
    for (const item of g.items) {
      out.push(adminSpaTo(item.href));
    }
  }
  return out;
}

export function AdminNotFoundPage() {
  const { denied } = useAdminSectionPage(ADMIN_SECTION_OVERVIEW, "Overview access is required.");
  const { bootstrap, canAccess } = useAdminSession();
  const location = useLocation();
  const registered = sidebarSpaPaths();
  const quickLinks = QUICK_LINKS.filter((link) => {
    if (link.superadminOnly) return bootstrap?.isSuperadmin === true;
    return !link.section || canAccess(link.section);
  });

  if (denied) return denied;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Page not found"
        description="This path is not handled by the admin SPA router. Check the sidebar for a registered page, or use recovery links below."
      />
      <AdminPanel>
        <p className="text-sm text-gray-600">
          Path: <code className="rounded bg-gray-100 px-1">{location.pathname}</code>
        </p>
        <p className="mt-3 text-xs text-gray-500">
          {registered.length} sidebar routes are registered (see <code className="rounded bg-gray-50 px-1">config/nav.ts</code> +{" "}
          <code className="rounded bg-gray-50 px-1">App.tsx</code>).
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {quickLinks.map((l) => (
            <Link
              key={l.label}
              to={l.to}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm hover:border-gray-300 hover:bg-gray-50"
            >
              {l.label}
            </Link>
          ))}
        </div>
        <Link to={adminSpaTo("/admin/dashboard")} className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
          Back to dashboard →
        </Link>
      </AdminPanel>
    </div>
  );
}

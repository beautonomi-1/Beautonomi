"use client";

/**
 * Legacy embedded admin (Next App Router). Required while `ADMIN_SPA_ROUTING=legacy` is supported
 * for Tier-B rollback. Remove `app/admin/**` only after cutover sign-off + cooling-off window
 * (see ADMIN_SPA_CUTOVER_PLAN §8 and ADMIN_LEGACY_DECOMMISSION_REPORT.md).
 */
import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import AdminShell from "@/components/admin/AdminShell";
import RoleGuard from "@/components/auth/RoleGuard";
import { useRouteTracking } from "@/lib/analytics/amplitude/route-tracker";
import { ALL_ADMIN_ROLES } from "@/lib/admin-sections";

function RouteTracker() {
  useRouteTracking();
  return null;
}

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  return (
    <RoleGuard allowedRoles={ALL_ADMIN_ROLES} redirectTo="/admin/login">
      <RouteTracker />
      <AdminShell>{children}</AdminShell>
    </RoleGuard>
  );
}

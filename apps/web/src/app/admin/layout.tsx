"use client";

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

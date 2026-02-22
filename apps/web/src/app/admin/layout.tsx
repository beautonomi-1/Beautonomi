"use client";

import { ReactNode } from "react";
import AdminShell from "@/components/admin/AdminShell";
import RoleGuard from "@/components/auth/RoleGuard";
import { useRouteTracking } from "@/lib/analytics/amplitude/route-tracker";

function RouteTracker() {
  useRouteTracking();
  return null;
}

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/">
      <RouteTracker />
      <AdminShell>{children}</AdminShell>
    </RoleGuard>
  );
}

"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { ProviderPortalProvider } from "@/providers/provider-portal/ProviderPortalProvider";
import { ProviderShell } from "@/components/provider/ProviderShell";
import { ProviderSidebarProvider } from "@/contexts/ProviderSidebarContext";
import RoleGuard from "@/components/auth/RoleGuard";
import { useRouteTracking } from "@/lib/analytics/amplitude/route-tracker";

function RouteTracker() {
  useRouteTracking();
  return null;
}

export default function ProviderLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isOnboardingPage = pathname === "/provider/onboarding";
  const isEmbedPage = pathname === "/provider/embed";

  // Onboarding page allows customers; embed is used by provider app WebView to set session then redirect
  if (isOnboardingPage || isEmbedPage) {
    return <>{children}</>;
  }

  // All other provider pages require provider role.
  // APIs enforce permissions via requireRoleInApi/requirePermission; staff may have limited actions.
  return (
    <RoleGuard allowedRoles={["provider_owner", "provider_staff"]}>
      <RouteTracker />
      <ProviderPortalProvider>
        <ProviderSidebarProvider>
          <ProviderShell>{children}</ProviderShell>
        </ProviderSidebarProvider>
      </ProviderPortalProvider>
    </RoleGuard>
  );
}

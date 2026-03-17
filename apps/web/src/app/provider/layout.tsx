"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { ProviderPortalProvider } from "@/providers/provider-portal/ProviderPortalProvider";
import { ProviderShell } from "@/components/provider/ProviderShell";
import { ProviderSidebarProvider } from "@/contexts/ProviderSidebarContext";
import RoleGuard from "@/components/auth/RoleGuard";
import { ProviderPortalGate } from "./ProviderPortalGate";
import { useRouteTracking } from "@/lib/analytics/amplitude/route-tracker";

function RouteTracker() {
  useRouteTracking();
  return null;
}

export default function ProviderLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isOnboardingPage = pathname === "/provider/onboarding";
  const isEmbedPage = pathname === "/provider/embed";
  const isSubscriptionCheckout = pathname === "/provider/subscription-checkout";

  // Onboarding allows customers; embed is for WebView; subscription-checkout is minimal layout (no shell)
  if (isOnboardingPage || isEmbedPage || isSubscriptionCheckout) {
    return <>{children}</>;
  }

  // All other provider pages require provider role.
  // APIs enforce permissions via requireRoleInApi/requirePermission; staff may have limited actions.
  return (
    <RoleGuard allowedRoles={["provider_owner", "provider_staff"]}>
      <ProviderPortalGate>
        <RouteTracker />
        <ProviderPortalProvider>
          <ProviderSidebarProvider>
            <ProviderShell>{children}</ProviderShell>
          </ProviderSidebarProvider>
        </ProviderPortalProvider>
      </ProviderPortalGate>
    </RoleGuard>
  );
}

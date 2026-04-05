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
  const isGetStartedPage =
    pathname === "/provider/get-started" ||
    (pathname?.startsWith("/provider/get-started/") ?? false);

  // Onboarding allows customers; embed is for WebView; subscription-checkout is minimal layout (no shell)
  if (isOnboardingPage || isEmbedPage || isSubscriptionCheckout) {
    return <>{children}</>;
  }

  // Setup wizard: authenticated provider role but no ProviderPortalProvider (no providers row yet — profile API 404s)
  if (isGetStartedPage) {
    return (
      <RoleGuard allowedRoles={["provider_owner", "provider_staff"]}>
        <ProviderPortalGate>
          <RouteTracker />
          {children}
        </ProviderPortalGate>
      </RoleGuard>
    );
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

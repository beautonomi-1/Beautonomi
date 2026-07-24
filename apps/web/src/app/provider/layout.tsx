"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { ProviderPortalProvider } from "@/providers/provider-portal/ProviderPortalProvider";
import { ProviderShell } from "@/components/provider/ProviderShell";
import { ProviderSidebarProvider } from "@/contexts/ProviderSidebarContext";
import RoleGuard from "@/components/auth/RoleGuard";
import { ProviderPortalGate } from "./ProviderPortalGate";
import { ProviderPortalConfigBundle } from "@/components/provider/ProviderPortalConfigBundle";
import { useRouteTracking } from "@/lib/analytics/amplitude/route-tracker";

function RouteTracker() {
  useRouteTracking();
  return null;
}

export default function ProviderLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isOnboardingPage = pathname === "/provider/onboarding";
  const isJoinPage = pathname === "/provider/join" || pathname?.startsWith("/provider/join/");
  const isEmbedPage = pathname === "/provider/embed";
  const isSubscriptionCheckout = pathname === "/provider/subscription-checkout";
  const isAdsPaymentReturn =
    pathname === "/provider/settings/ads/payment-return" ||
    (pathname?.startsWith("/provider/settings/ads/payment-return/") ?? false);
  const isGetStartedPage =
    pathname === "/provider/get-started" ||
    (pathname?.startsWith("/provider/get-started/") ?? false);

  // Onboarding allows customers; embed is for WebView; subscription-checkout is minimal layout (no shell)
  if (isOnboardingPage || isJoinPage || isEmbedPage || isSubscriptionCheckout || isAdsPaymentReturn) {
    return <>{children}</>;
  }

  // Setup wizard: authenticated provider role but no ProviderPortalProvider (no providers row yet — profile API 404s)
  if (isGetStartedPage) {
    return (
      <RoleGuard allowedRoles={["provider_owner", "provider_staff"]}>
        <ProviderPortalConfigBundle>
          <ProviderPortalGate>
            <RouteTracker />
            {children}
          </ProviderPortalGate>
        </ProviderPortalConfigBundle>
      </RoleGuard>
    );
  }

  // All other provider pages require provider role.
  // APIs enforce permissions via requireRoleInApi/requirePermission; staff may have limited actions.
  return (
    <RoleGuard allowedRoles={["provider_owner", "provider_staff"]}>
      <ProviderPortalConfigBundle>
        <ProviderPortalGate>
          <RouteTracker />
          <ProviderPortalProvider>
            <ProviderSidebarProvider>
              <ProviderShell>{children}</ProviderShell>
            </ProviderSidebarProvider>
          </ProviderPortalProvider>
        </ProviderPortalGate>
      </ProviderPortalConfigBundle>
    </RoleGuard>
  );
}

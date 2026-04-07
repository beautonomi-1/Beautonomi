"use client";

import { Suspense, useEffect } from "react";
import { AuthProvider } from "@/providers/AuthProvider";
import { CookieConsentProvider } from "@/providers/CookieConsentProvider";
import { PlatformSettingsProvider } from "@/providers/PlatformSettingsProvider";
import AccountStatusGuard from "@/components/auth/AccountStatusGuard";
import { Toaster } from "sonner";
import AmplitudeProviderWrapper from "@/components/analytics/AmplitudeProvider";
import SessionTracker from "@/components/analytics/SessionTracker";
import MarketingAttributionCapture from "@/components/analytics/MarketingAttributionCapture";
import DynamicBranding from "@/components/platform/DynamicBranding";
import { ImpersonationBanner } from "@/components/auth/ImpersonationBanner";
import FaviconSpinner from "@/components/global/favicon-spinner";
import AuthLoadingSpinner from "@/components/global/auth-loading-spinner";
import I18nInit from "@/components/i18n/I18nInit";
import { ConfigBundleProvider } from "@/providers/ConfigBundleProvider";
import OneSignalProvider from "@/components/global/OneSignalProvider";
import { DownloadBannerContainer } from "@/components/download-banner";
import MaintenanceGate from "@/components/maintenance/MaintenanceGate";
import MarketAvailabilityGate from "@/components/global/MarketAvailabilityGate";
import type { OsType } from "@/lib/utils/os-type";
import CookieConsentExperience from "@/components/cookie-consent/CookieConsentExperience";
import GatedClientAnalytics from "@/components/cookie-consent/GatedClientAnalytics";

interface ClientAppShellProps {
  children: React.ReactNode;
  osType: OsType;
}

function QueueMicrotaskCompat() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof window.queueMicrotask === "function") return;
    window.queueMicrotask = (callback: VoidFunction) => {
      Promise.resolve()
        .then(callback)
        .catch(() => setTimeout(callback, 0));
    };
  }, []);
  return null;
}

export default function ClientAppShell({ children, osType }: ClientAppShellProps) {
  return (
    <AuthProvider>
      <CookieConsentProvider>
        <QueueMicrotaskCompat />
        <I18nInit />
        <AuthLoadingSpinner />
        <PlatformSettingsProvider>
          <ConfigBundleProvider platform="web" environment={process.env.NODE_ENV === "development" ? "development" : "production"}>
            <FaviconSpinner />
            <DynamicBranding />
            <OneSignalProvider />
            <AmplitudeProviderWrapper>
              <Suspense fallback={null}>
                <MarketingAttributionCapture />
              </Suspense>
              <SessionTracker />
              <ImpersonationBanner />
              <AccountStatusGuard>
                <MaintenanceGate>{children}</MaintenanceGate>
              </AccountStatusGuard>
              <MarketAvailabilityGate />
              <Toaster position="top-center" />
              <DownloadBannerContainer osType={osType} />
            </AmplitudeProviderWrapper>
            <CookieConsentExperience />
            <GatedClientAnalytics />
          </ConfigBundleProvider>
        </PlatformSettingsProvider>
      </CookieConsentProvider>
    </AuthProvider>
  );
}

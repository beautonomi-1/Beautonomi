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
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import type { RequestLanguageContext } from "@/lib/locale/resolve-request-language";
import { ConfigBundleProvider } from "@/providers/ConfigBundleProvider";
import OneSignalProvider from "@/components/global/OneSignalProvider";
import { DownloadBannerContainer } from "@/components/download-banner";
import MaintenanceGate from "@/components/maintenance/MaintenanceGate";
import MarketAvailabilityGate from "@/components/global/MarketAvailabilityGate";
import type { OsType } from "@/lib/utils/os-type";
import CookieConsentExperience from "@/components/cookie-consent/CookieConsentExperience";
import GatedClientAnalytics from "@/components/cookie-consent/GatedClientAnalytics";
import { GlobalPreferencesProvider } from "@/components/global/GlobalPreferencesDialog";

interface ClientAppShellProps {
  children: React.ReactNode;
  osType: OsType;
  locale: RequestLanguageContext;
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

export default function ClientAppShell({ children, osType, locale }: ClientAppShellProps) {
  return (
    <AuthProvider>
      <CookieConsentProvider>
        <QueueMicrotaskCompat />
        <LocaleProvider
          initial={{
            language: locale.language,
            dir: locale.dir,
            formatLocale: locale.formatLocale,
            regionCode: locale.regionCode,
            chargeCurrency: locale.chargeCurrency,
            displayCurrency: locale.displayCurrency,
            timezone: locale.timezone,
            marketSupportedLanguages: locale.marketSupportedLanguages,
          }}
        >
        <AuthLoadingSpinner />
        <PlatformSettingsProvider>
          <ConfigBundleProvider platform="web" environment={process.env.NODE_ENV === "development" ? "development" : "production"}>
            <FaviconSpinner />
            <DynamicBranding />
            <OneSignalProvider />
            <AmplitudeProviderWrapper>
              <GlobalPreferencesProvider>
              <Suspense fallback={null}>
                <MarketingAttributionCapture />
              </Suspense>
              <SessionTracker />
              <ImpersonationBanner />
              <AccountStatusGuard>
                <MaintenanceGate>
                  <Suspense fallback={null}>
                    <MarketAvailabilityGate />
                  </Suspense>
                  {children}
                </MaintenanceGate>
              </AccountStatusGuard>
              <Toaster position="top-center" />
              <DownloadBannerContainer osType={osType} />
              </GlobalPreferencesProvider>
            </AmplitudeProviderWrapper>
            <CookieConsentExperience />
            <GatedClientAnalytics />
          </ConfigBundleProvider>
        </PlatformSettingsProvider>
        </LocaleProvider>
      </CookieConsentProvider>
    </AuthProvider>
  );
}

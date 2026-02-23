"use client";

import { AuthProvider } from "@/providers/AuthProvider";
import { PlatformSettingsProvider } from "@/providers/PlatformSettingsProvider";
import AccountStatusGuard from "@/components/auth/AccountStatusGuard";
import { Toaster } from "sonner";
import AmplitudeProviderWrapper from "@/components/analytics/AmplitudeProvider";
import SessionTracker from "@/components/analytics/SessionTracker";
import DynamicBranding from "@/components/platform/DynamicBranding";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
import FaviconSpinner from "@/components/global/favicon-spinner";
import AuthLoadingSpinner from "@/components/global/auth-loading-spinner";
import I18nInit from "@/components/i18n/I18nInit";
import { ConfigBundleProvider } from "@/providers/ConfigBundleProvider";
import OneSignalProvider from "@/components/global/OneSignalProvider";

export default function ClientAppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <I18nInit />
      <AuthLoadingSpinner />
      <PlatformSettingsProvider>
        <ConfigBundleProvider platform="web" environment={process.env.NODE_ENV === "development" ? "development" : "production"}>
          <FaviconSpinner />
          <DynamicBranding />
          <OneSignalProvider />
          <AmplitudeProviderWrapper>
            <SessionTracker />
            <ImpersonationBanner />
            <AccountStatusGuard>
              {children}
            </AccountStatusGuard>
            <Toaster position="top-center" />
          </AmplitudeProviderWrapper>
        </ConfigBundleProvider>
      </PlatformSettingsProvider>
    </AuthProvider>
  );
}

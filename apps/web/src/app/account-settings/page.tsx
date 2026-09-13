import { Suspense } from "react";
import EmailVerificationBanner from "@/components/global/email-verification-banner";
import AccountHubGrid from "./components/account-hub-grid";
import AccountSettingsRedirectClient from "./account-settings-redirect-client";
import AccountHomeUpcomingPreview from "./components/account-home-upcoming-preview";
import { getServerT } from "@/lib/i18n/server";
import { resolveRequestLanguage } from "@/lib/locale/resolve-request-language";

export default async function AccountSettingsPage() {
  const ctx = await resolveRequestLanguage();
  const t = await getServerT(ctx.language);
  return (
    <div className="w-full max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
      <Suspense fallback={null}>
        <AccountSettingsRedirectClient />
      </Suspense>
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-normal text-gray-900 tracking-tight">{t("web.accountSettings.account") as string}</h1>
        <p className="text-sm text-gray-500 mt-1 font-light">{t("web.accountSettings.home.subtitle") as string}</p>
      </div>

      <div className="mb-6 md:mb-8">
        <EmailVerificationBanner />
      </div>

      <AccountHomeUpcomingPreview />

      <div className="mt-6 md:mt-8" id="account-management">
        <AccountHubGrid />
      </div>
    </div>
  );
}

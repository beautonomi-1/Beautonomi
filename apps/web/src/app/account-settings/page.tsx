import dynamic from "next/dynamic";
import { Suspense } from "react";
import EmailVerificationBanner from "@/components/global/email-verification-banner";
import AccountHubGrid from "./components/account-hub-grid";
import AccountSettingsRedirectClient from "./account-settings-redirect-client";

const UpcomingBookingPreview = dynamic(
  () =>
    import("./components/upcoming-booking-preview").then((m) => ({
      default: m.UpcomingBookingPreview,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="mb-6 h-28 max-w-full rounded-xl border border-gray-100 bg-gray-50/90 animate-pulse" />
    ),
  },
);

export default function AccountSettingsPage() {
  return (
    <div className="w-full max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
      <Suspense fallback={null}>
        <AccountSettingsRedirectClient />
      </Suspense>
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-normal text-gray-900 tracking-tight">Account</h1>
        <p className="text-sm text-gray-500 mt-1 font-light">Profile, bookings, and preferences</p>
      </div>

      <div className="mb-6 md:mb-8">
        <EmailVerificationBanner />
      </div>

      <div className="mb-6">
        <UpcomingBookingPreview />
      </div>

      <div className="mt-6 md:mt-8" id="account-management">
        <AccountHubGrid />
      </div>
    </div>
  );
}

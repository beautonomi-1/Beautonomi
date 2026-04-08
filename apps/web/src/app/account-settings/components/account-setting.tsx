"use client";
import React from "react";
import dynamic from "next/dynamic";
import EmailVerificationBanner from "@/components/global/email-verification-banner";
import { UpcomingBookingPreview } from "./upcoming-booking-preview";
import { useAuth } from "@/providers/AuthProvider";
import AccountHubGrid from "./account-hub-grid";

const AccountProfileSections = dynamic(
  () => import("./account-profile-sections"),
  {
    loading: () => (
      <div className="space-y-4" aria-busy="true">
        <div className="rounded-2xl border border-gray-100 bg-gray-50/90 p-6 md:p-8 animate-pulse min-h-[10rem]" />
        <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-5 h-20 animate-pulse" />
      </div>
    ),
    ssr: false,
  }
);

const AccountSettingsPage: React.FC = () => {
  const { user, isLoading: isLoadingAuth } = useAuth();

  return (
    <div className="w-full max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-normal text-gray-900 tracking-tight">Account</h1>
        <p className="text-sm text-gray-500 mt-1 font-light">Profile, bookings, and preferences</p>
      </div>

      <EmailVerificationBanner />

      {!isLoadingAuth && (
        <div className="mb-8 md:mb-10">
          <AccountProfileSections />
        </div>
      )}

      {user && (
        <div className="mb-6">
          <UpcomingBookingPreview />
        </div>
      )}

      <AccountHubGrid embeddedInProfile />

      <div className="mt-8 md:mt-10 text-center border-t border-gray-100 pt-8">
        <p className="mb-2 text-sm text-gray-600 font-light">Need to deactivate your account?</p>
        <a
          href="/account-settings/login-and-security"
          className="text-sm text-primary hover:text-primary-hover underline font-medium transition-colors"
        >
          Login &amp; security
        </a>
      </div>
    </div>
  );
};

export default AccountSettingsPage;

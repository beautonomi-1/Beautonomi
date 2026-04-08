"use client";
import React from "react";
import EmailVerificationBanner from "@/components/global/email-verification-banner";
import { UpcomingBookingPreview } from "./upcoming-booking-preview";
import { LoyaltyTeaser } from "./LoyaltyTeaser";
import { useAuth } from "@/providers/AuthProvider";
import AccountHubGrid from "./account-hub-grid";

const AccountSettingsPage: React.FC = () => {
  const { user, isLoading: isLoadingAuth } = useAuth();

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
      <h1 className="text-2xl md:text-3xl font-normal mb-3 md:mb-4 text-gray-900">Account</h1>
      <EmailVerificationBanner />
      {user && (
        <div className="mb-4 md:mb-6">
          <UpcomingBookingPreview />
        </div>
      )}
      {user?.role === "customer" && <LoyaltyTeaser />}
      <div className="mb-4 md:mb-6">
        {isLoadingAuth ? (
          <span className="text-sm md:text-base text-gray-600 font-light">Loading...</span>
        ) : (
          <span className="text-sm md:text-base text-gray-600 font-light">
            {user?.full_name || "User"}, {user?.email || ""} ·{" "}
          </span>
        )}
        <a
          href="/profile"
          className="text-sm md:text-base text-primary hover:text-primary-hover underline font-medium transition-colors"
        >
          Go to profile
        </a>
        <span className="text-sm text-gray-500 font-light"> — same shortcuts as below.</span>
      </div>

      <AccountHubGrid />

      <div className="mt-6 md:mt-8 text-center">
        <p className="mb-2 text-sm md:text-base font-light text-gray-600">Need to deactivate your account?</p>
        <a
          href="/account-settings/login-and-security"
          className="text-sm md:text-base text-primary hover:text-primary-hover underline font-medium transition-colors"
        >
          Take care of that now
        </a>
      </div>
    </div>
  );
};

export default AccountSettingsPage;

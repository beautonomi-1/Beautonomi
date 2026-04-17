"use client";
import React, { useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import EmailVerificationBanner from "@/components/global/email-verification-banner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/AuthProvider";
import AccountProfileSections from "./account-profile-sections";
import DeferredAccountHub from "./deferred-account-hub";

const UpcomingBookingPreview = dynamic(
  () => import("./upcoming-booking-preview").then((m) => ({ default: m.UpcomingBookingPreview })),
  { ssr: false }
);

const AccountSettingsPage: React.FC = () => {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const warmFooterRoutes = () => {
      router.prefetch("/account-settings/login-and-security");
      router.prefetch("/account-settings/privacy-and-sharing");
    };
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(warmFooterRoutes, { timeout: 3000 });
      return () => cancelIdleCallback(id);
    }
    const t = window.setTimeout(warmFooterRoutes, 400);
    return () => window.clearTimeout(t);
  }, [router]);

  const handleSignOut = async () => {
    try {
      await signOut();
      if (pathname !== "/") router.push("/");
      router.refresh();
    } catch {
      router.push("/");
      router.refresh();
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-normal text-gray-900 tracking-tight">Account</h1>
        <p className="text-sm text-gray-500 mt-1 font-light">Profile, bookings, and preferences</p>
      </div>

      <div className="mb-8 md:mb-10">
        <AccountProfileSections />
      </div>

      <div className="mb-6 md:mb-8">
        <EmailVerificationBanner />
      </div>

      <DeferredAccountHub embeddedInProfile />

      {user && (
        <div className="mb-6">
          <UpcomingBookingPreview />
        </div>
      )}

      {user ? (
        <div className="mt-10 md:mt-12 border-t border-gray-100 pt-8 md:pt-10 flex flex-col items-stretch max-w-md mx-auto gap-3">
          <Button
            type="button"
            variant="outline"
            className="w-full border-gray-300 text-gray-900 hover:bg-gray-50"
            onClick={() => void handleSignOut()}
          >
            Sign out
          </Button>
          <p className="text-center text-xs text-gray-500 font-light leading-relaxed">
            Password, deactivate, or account data —{" "}
            <Link
              href="/account-settings/login-and-security"
              className="text-gray-700 underline underline-offset-2 hover:text-gray-900"
            >
              Login &amp; security
            </Link>
            {" · "}
            <Link
              href="/account-settings/privacy-and-sharing"
              className="text-gray-700 underline underline-offset-2 hover:text-gray-900"
            >
              Privacy &amp; data
            </Link>
          </p>
        </div>
      ) : null}
    </div>
  );
};

export default AccountSettingsPage;

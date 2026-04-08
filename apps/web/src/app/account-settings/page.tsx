"use client";
import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AccountSettingsPage from "./components/account-setting";
import AuthGuard from "@/components/auth/auth-guard";

function AccountSettingsGate() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");
  return (
    <AuthGuard redirectTo={redirect ?? undefined}>
      <AccountSettingsPage />
    </AuthGuard>
  );
}

export default function AccountSettingsPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] max-w-5xl mx-auto px-4 py-10">
          <div className="h-8 w-40 bg-gray-100 rounded animate-pulse mb-6" />
          <div className="h-40 rounded-2xl bg-gray-50 animate-pulse" />
        </div>
      }
    >
      <AccountSettingsGate />
    </Suspense>
  );
}
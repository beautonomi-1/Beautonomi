"use client";
import React from "react";
import { useSearchParams } from "next/navigation";
import AccountSettingsPage from "./components/account-setting";
import AuthGuard from "@/components/auth/auth-guard";

export default function AccountSettingsPageWrapper() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");
  return (
    <AuthGuard redirectTo={redirect ?? undefined}>
      <AccountSettingsPage />
    </AuthGuard>
  );
}

export default page
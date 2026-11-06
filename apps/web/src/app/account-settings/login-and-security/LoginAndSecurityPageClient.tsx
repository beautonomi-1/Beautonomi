"use client";
import React from "react";
import LoginAccount from "./component/tab";
import type { LoginAndSecurityInitial } from "./fetch-login-and-security-initial";

export default function LoginAndSecurityPageClient({
  initial,
  accountHomeHref = "/account-settings",
  accountHomeLabel = "Account",
  showProviderSecurity = false,
}: {
  initial: LoginAndSecurityInitial | null;
  accountHomeHref?: string;
  accountHomeLabel?: string;
  showProviderSecurity?: boolean;
}) {
  return (
    <LoginAccount
      initial={initial}
      accountHomeHref={accountHomeHref}
      accountHomeLabel={accountHomeLabel}
      showProviderSecurity={showProviderSecurity}
    />
  );
}
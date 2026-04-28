"use client";
import React from "react";
import LoginAccount from "./component/tab";
import type { LoginAndSecurityInitial } from "./fetch-login-and-security-initial";

export default function LoginAndSecurityPageClient({
  initial,
  accountHomeHref = "/account-settings",
  accountHomeLabel = "Account",
}: {
  initial: LoginAndSecurityInitial | null;
  accountHomeHref?: string;
  accountHomeLabel?: string;
}) {
  return (
    <LoginAccount
      initial={initial}
      accountHomeHref={accountHomeHref}
      accountHomeLabel={accountHomeLabel}
    />
  );
}
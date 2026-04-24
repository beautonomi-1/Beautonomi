"use client";
import React from "react";
import LoginAccount from "./component/tab";
import type { LoginAndSecurityInitial } from "./fetch-login-and-security-initial";

export default function LoginAndSecurityPageClient({
  initial,
}: {
  initial: LoginAndSecurityInitial | null;
}) {
  return <LoginAccount initial={initial} />;
}
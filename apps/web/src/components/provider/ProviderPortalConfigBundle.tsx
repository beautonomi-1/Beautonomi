"use client";

import React from "react";
import { ConfigBundleProvider } from "@/providers/ConfigBundleProvider";
import { useAuth } from "@/providers/AuthProvider";

/**
 * Provider portal resolves feature flags with platform=provider (same as native app),
 * overriding the global platform=web bundle from ClientAppShell.
 */
export function ProviderPortalConfigBundle({ children }: { children: React.ReactNode }) {
  const { user, role } = useAuth();
  const environment =
    typeof window !== "undefined" && process.env.NODE_ENV === "development"
      ? "development"
      : "production";

  return (
    <ConfigBundleProvider
      platform="provider"
      environment={environment}
      userId={user?.id ?? null}
      role={role ?? null}
    >
      {children}
    </ConfigBundleProvider>
  );
}

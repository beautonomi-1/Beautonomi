"use client";

import { useSearchParams } from "next/navigation";
import AccountSettingsPage from "./components/account-setting";
import AuthGuard from "@/components/auth/auth-guard";

/**
 * Client entry: search params + auth guard. Kept out of page.tsx so the route
 * can stay a server component (perf/no-client-page).
 */
export default function AccountSettingsClient() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");
  return (
    <AuthGuard redirectTo={redirect ?? undefined}>
      <AccountSettingsPage />
    </AuthGuard>
  );
}

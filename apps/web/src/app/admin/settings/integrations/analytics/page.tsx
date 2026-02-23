"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import RoleGuard from "@/components/auth/RoleGuard";

/**
 * Redirect /admin/settings/integrations/analytics to /admin/integrations/amplitude
 * where the full Amplitude config UI lives.
 */
export default function AnalyticsSettingsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/integrations/amplitude");
  }, [router]);
  return <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">{null}</RoleGuard>;
}

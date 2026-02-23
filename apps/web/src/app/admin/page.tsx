"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import LoadingTimeout from "@/components/ui/loading-timeout";
import RoleGuard from "@/components/auth/RoleGuard";

/**
 * Admin root page - redirects to admin dashboard
 */
export default function AdminPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to admin dashboard on client side only
    router.replace("/admin/dashboard");
  }, [router]);

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/">
      <LoadingTimeout loadingMessage="Redirecting to admin dashboard..." />
    </RoleGuard>
  );
}

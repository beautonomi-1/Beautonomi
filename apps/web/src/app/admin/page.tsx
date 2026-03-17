"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import LoadingTimeout from "@/components/ui/loading-timeout";
import RoleGuard from "@/components/auth/RoleGuard";
import { ALL_ADMIN_ROLES } from "@/lib/admin-sections";

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
    <RoleGuard allowedRoles={ALL_ADMIN_ROLES} redirectTo="/admin/login">
      <LoadingTimeout loadingMessage="Redirecting to admin dashboard..." />
    </RoleGuard>
  );
}

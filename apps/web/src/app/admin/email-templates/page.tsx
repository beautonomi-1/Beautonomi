"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import RoleGuard from "@/components/auth/RoleGuard";

/**
 * Email Templates admin page is deprecated.
 * All template editing (including email) is in Notification Templates.
 * Redirect so old bookmarks still work.
 */
export default function EmailTemplatesRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/notification-templates");
  }, [router]);
  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
      <div className="container mx-auto px-4 py-8 text-center text-muted-foreground">
        Redirecting to Notification Templates…
      </div>
    </RoleGuard>
  );
}

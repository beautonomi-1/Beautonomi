"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import RoleGuard from "@/components/auth/RoleGuard";

/**
 * SMS Templates admin page is deprecated.
 * All template editing (including SMS) is in Notification Templates.
 * Redirect so old bookmarks still work.
 */
export default function SmsTemplatesRedirect() {
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

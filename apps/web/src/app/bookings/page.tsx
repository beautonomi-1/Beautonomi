"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/auth/auth-guard";
import LoadingTimeout from "@/components/ui/loading-timeout";

export default function BookingsPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the actual bookings page
    router.replace("/account-settings/bookings");
  }, [router]);

  return (
    <AuthGuard>
      <div className="min-h-screen flex items-center justify-center">
        <LoadingTimeout loadingMessage="Loading bookings..." />
      </div>
    </AuthGuard>
  );
}

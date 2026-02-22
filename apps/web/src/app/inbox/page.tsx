"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/auth/auth-guard";
import LoadingTimeout from "@/components/ui/loading-timeout";

export default function InboxPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the actual messages page
    router.replace("/account-settings/messages");
  }, [router]);

  return (
    <AuthGuard>
      <div className="min-h-screen flex items-center justify-center">
        <LoadingTimeout loadingMessage="Loading messages..." />
      </div>
    </AuthGuard>
  );
}

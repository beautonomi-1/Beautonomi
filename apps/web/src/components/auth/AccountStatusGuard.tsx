"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import LoadingTimeout from "@/components/ui/loading-timeout";

/**
 * AccountStatusGuard - Redirects suspended/deactivated users to appropriate pages
 */
export default function AccountStatusGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, signOut } = useAuth();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    if (isLoading || !user) {
      setIsChecking(false);
      return;
    }

    // Don't check on the suspended page itself to avoid redirect loops
    if (pathname === "/account-suspended") {
      setIsChecking(false);
      return;
    }

    const checkAccountStatus = async () => {
      try {
        const response = await fetch("/api/me/account-status");
        if (response.ok) {
          const data = await response.json();
          const status = data.data;

          if (status?.is_suspended) {
            router.replace("/account-suspended");
            return;
          }

          if (status?.is_deactivated) {
            if (status.deactivated_by === "user") {
              try {
                const reactivateRes = await fetch("/api/me/reactivate-account", {
                  method: "POST",
                });
                const reactivateData = await reactivateRes.json();
                if (reactivateData?.data?.reactivated) {
                  const recheck = await fetch("/api/me/account-status");
                  const recheckData = await recheck.json();
                  if (!recheckData?.data?.is_deactivated) {
                    setIsChecking(false);
                    return;
                  }
                }
              } catch {
                // Fall through to sign out
              }
            }
            await signOut();
            router.replace("/?deactivated=true");
            return;
          }
        }
      } catch (error) {
        console.error("Error checking account status:", error);
      } finally {
        setIsChecking(false);
      }
    };

    checkAccountStatus();
  }, [user, isLoading, pathname, router, signOut]);

  if (isLoading || isChecking) {
    return <LoadingTimeout />;
  }

  return <>{children}</>;
}

"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { isCustomerShellPublicRoute } from "@/lib/navigation/customer-shell-public-routes";

/**
 * AccountStatusGuard - Redirects suspended/deactivated users to appropriate pages
 */
const ACCOUNT_STATUS_BLOCKING_PREFIXES = [
  "/account-settings",
  "/bookings",
  "/cart",
  "/checkout",
  "/inbox",
  "/orders",
  "/profile",
] as const;

function requiresConfirmedAccountStatus(pathname: string | null): boolean {
  if (!pathname) return false;
  return ACCOUNT_STATUS_BLOCKING_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export default function AccountStatusGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, signOut } = useAuth();
  const [isChecking, setIsChecking] = useState(true);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

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
            const canSelfReactivate =
              status.deactivated_by === "user" || status.deactivated_by === "inactive_retention";
            if (canSelfReactivate) {
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
        } else {
          setCheckError("We couldn't verify your account status. Check your connection and try again.");
        }
      } catch (error) {
        console.error("Error checking account status:", error);
        setCheckError("We couldn't verify your account status. Check your connection and try again.");
      } finally {
        setIsChecking(false);
      }
    };

    setCheckError(null);
    setIsChecking(true);
    checkAccountStatus();
  }, [user, isLoading, pathname, router, signOut, retryKey]);

  // Public marketplace shell renders immediately. Authenticated account surfaces wait for account-status.
  if (!user && isCustomerShellPublicRoute(pathname)) {
    return <>{children}</>;
  }

  if (user && isCustomerShellPublicRoute(pathname) && !requiresConfirmedAccountStatus(pathname)) {
    return <>{children}</>;
  }

  if (isLoading || isChecking) {
    return <LoadingTimeout loadingMessage="Checking account status..." />;
  }

  if (user && checkError && requiresConfirmedAccountStatus(pathname)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-gray-900">Account check needed</h1>
          <p className="mt-2 text-sm leading-6 text-gray-600">{checkError}</p>
          <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
              onClick={() => setRetryKey((value) => value + 1)}
            >
              Try again
            </button>
            <button
              type="button"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700"
              onClick={() => {
                void signOut();
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { BeautonomiLoadingIcon } from "@/components/BeautonomiLoadingIcon";
import { isCustomerShellPublicRoute } from "@/lib/navigation/customer-shell-public-routes";

/**
 * AuthLoadingSpinner Component
 *
 * Shows Beautonomi logo loading overlay when authentication is being checked.
 * Hidden on public routes (e.g. /learn) so those pages load immediately.
 */
export default function AuthLoadingSpinner() {
  const pathname = usePathname();
  const { isLoading, isSigningOut } = useAuth();
  const [timedOut, setTimedOut] = useState(false);
  const showOverlay = isLoading || isSigningOut;

  useEffect(() => {
    if (!showOverlay) {
      setTimedOut(false);
      return;
    }
    const timeout = setTimeout(() => {
      // Failsafe so older browsers can't get trapped behind overlay forever.
      setTimedOut(true);
    }, 12000);
    return () => clearTimeout(timeout);
  }, [showOverlay]);

  if (!showOverlay || isCustomerShellPublicRoute(pathname) || timedOut) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center backdrop-blur-sm bg-white/80 animate-in fade-in duration-200"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="backdrop-blur-2xl bg-white/90 border border-border shadow-2xl rounded-2xl p-8 flex flex-col items-center gap-4 animate-in zoom-in-95 fade-in duration-200">
        <BeautonomiLoadingIcon size={56} />
        <p className="text-sm font-medium text-muted-foreground tracking-tight animate-in fade-in slide-in-from-bottom-2 duration-200 delay-75">
          {isSigningOut ? "Signing out…" : "Checking authentication..."}
        </p>
      </div>
    </div>
  );
}

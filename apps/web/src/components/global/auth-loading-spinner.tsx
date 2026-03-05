"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { BeautonomiLoadingIcon } from "@/components/BeautonomiLoadingIcon";

/** Routes that do not show auth overlay so they can load immediately. */
const PUBLIC_ROUTES_PREFIXES = ["/learn", "/help", "/login", "/signup", "/forgot-password", "/partner-profile", "/category", "/explore", "/gift-card", "/privacy-policy", "/terms-and-condition", "/accessibility", "/against-discrimination", "/BCover-for-partners", "/beautonomi-friendly", "/career", "/news", "/resources", "/become-a-partner"];

function isPublicRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === "/" || PUBLIC_ROUTES_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/**
 * AuthLoadingSpinner Component
 *
 * Shows Beautonomi logo loading overlay when authentication is being checked.
 * Hidden on public routes (e.g. /learn) so those pages load immediately.
 */
export default function AuthLoadingSpinner() {
  const pathname = usePathname();
  const { isLoading } = useAuth();

  if (!isLoading || isPublicRoute(pathname)) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center backdrop-blur-sm bg-white/80 animate-in fade-in duration-200"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="backdrop-blur-2xl bg-white/90 border border-border shadow-2xl rounded-2xl p-8 flex flex-col items-center gap-4 animate-in zoom-in-95 fade-in duration-200">
        <BeautonomiLoadingIcon size={56} />
        <p className="text-sm font-medium text-muted-foreground tracking-tight animate-in fade-in slide-in-from-bottom-2 duration-200 delay-75">
          Checking authentication...
        </p>
      </div>
    </div>
  );
}

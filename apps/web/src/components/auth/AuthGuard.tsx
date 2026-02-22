"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import LoadingTimeout from "@/components/ui/loading-timeout";

interface AuthGuardProps {
  children: React.ReactNode;
  /** If true, redirects to login if not authenticated */
  requireAuth?: boolean;
  /** Redirect path when not authenticated (default: "/") */
  redirectTo?: string;
}

/**
 * AuthGuard Component
 * 
 * Protects routes that require authentication.
 * Shows loading state while checking auth, then either:
 * - Renders children if authenticated (or if requireAuth=false)
 * - Redirects to login if not authenticated and requireAuth=true
 */
export default function AuthGuard({
  children,
  requireAuth = true,
  redirectTo = "/",
}: AuthGuardProps) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && requireAuth && !user) {
      // Store intended destination for redirect after login
      const returnUrl = encodeURIComponent(pathname);
      router.push(`${redirectTo}?returnUrl=${returnUrl}`);
    }
  }, [isLoading, requireAuth, user, router, pathname, redirectTo]);

  if (isLoading) {
    return <LoadingTimeout loadingMessage="Checking authentication..." />;
  }

  if (requireAuth && !user) {
    // Will redirect, but show loading in the meantime
    return <LoadingTimeout loadingMessage="Redirecting to login..." />;
  }

  return <>{children}</>;
}

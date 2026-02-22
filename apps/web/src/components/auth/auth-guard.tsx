"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import LoginModal from "@/components/global/login-modal";
import { useState } from "react";

interface AuthGuardProps {
  children: React.ReactNode;
  redirectTo?: string;
  showLoginPrompt?: boolean;
}

/**
 * AuthGuard component that protects routes requiring authentication
 * - Shows loading state while checking auth
 * - Redirects to login if not authenticated
 * - Shows login prompt modal if showLoginPrompt is true
 * - Renders children only if authenticated
 */
export default function AuthGuard({ 
  children, 
  redirectTo,
  showLoginPrompt = false 
}: AuthGuardProps) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const _searchParams = useSearchParams();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [hasRedirected, setHasRedirected] = useState(false);

  useEffect(() => {
    // Only redirect if we're sure the user is not authenticated
    // Add a longer delay during development to prevent redirects during HMR/rebuilds
    if (!isLoading && !user && !hasRedirected) {
      // Longer delay to allow auth state to stabilize, especially during rebuilds
      const delay = process.env.NODE_ENV === 'development' ? 1500 : 500;
      const timeoutId = setTimeout(async () => {
        // Double-check that user is still null after delay
        // Also verify there's no session before redirecting (prevents false logouts during rebuilds)
        if (!user) {
          try {
            // Quick session check to avoid redirecting during rebuilds
            const { getSupabaseClient } = await import("@/lib/supabase/client");
            const supabase = getSupabaseClient();
            const { data: { session } } = await supabase.auth.getSession();
            
            // If session exists but user is null, this is likely a rebuild - don't redirect
            if (session) {
              // Session exists, just wait a bit more for user to load
              return;
            }
          } catch {
            // If check fails, proceed with redirect (safer to redirect than stay on protected page)
          }
          
          setHasRedirected(true);
          if (showLoginPrompt) {
            setIsLoginModalOpen(true);
          } else {
            const redirectPath = redirectTo || window.location.pathname;
            router.push(`/?login=true&redirect=${encodeURIComponent(redirectPath)}`);
          }
        }
      }, delay);

      return () => clearTimeout(timeoutId);
    } else if (user) {
      // Reset redirect flag if user becomes authenticated
      setHasRedirected(false);
    }
  }, [user, isLoading, router, redirectTo, showLoginPrompt, hasRedirected]);

  // Show loading state while checking auth (with timeout to prevent infinite loading)
  if (isLoading) {
    // Use a shorter loading timeout - if auth takes too long, show content anyway
    // The AuthProvider should handle auth state quickly
    return (
      <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-12 lg:py-16 text-center">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-4 border-[#FF0077] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  // If not authenticated and showLoginPrompt is true, show login modal
  if (!user && showLoginPrompt) {
    return (
      <>
        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-12 lg:py-16 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
            Please log in to continue
          </h2>
          <p className="text-gray-600 mb-6">
            You need to be logged in to access this page.
          </p>
        </div>
        <LoginModal 
          open={isLoginModalOpen} 
          setOpen={(loggedIn) => {
            setIsLoginModalOpen(false);
            if (loggedIn) {
              // Stay on the same page after login
            }
          }} 
        />
      </>
    );
  }

  // If not authenticated, don't render children (redirect will happen)
  if (!user) {
    return null;
  }

  // User is authenticated, render children
  return <>{children}</>;
}

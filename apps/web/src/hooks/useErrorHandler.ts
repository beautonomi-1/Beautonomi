"use client";

import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import { FetchError } from '@/lib/http/fetcher';
import { useEffect } from 'react';

/**
 * Global error handler hook that redirects providers to provider portal
 * when they encounter 403 or 404 errors
 */
export function useErrorHandler() {
  const router = useRouter();
  const { user, role, isLoading } = useAuth();

  const handleError = (error: unknown) => {
    // Only handle FetchError with 403 or 404 status
    if (error instanceof FetchError && (error.status === 403 || error.status === 404)) {
      // Check if user is a provider
      if (!isLoading && user && role) {
        if (role === 'provider_owner' || role === 'provider_staff' || role === 'superadmin') {
          // Redirect to provider dashboard
          router.replace('/provider/dashboard');
          return true; // Indicates error was handled
        }
      }
    }
    return false; // Error not handled, let caller handle it
  };

  return { handleError };
}

/**
 * Global error handler that automatically redirects providers on 403/404
 * This can be used in a useEffect to catch unhandled errors
 */
export function useGlobalErrorRedirect() {
  const router = useRouter();
  const { user, role, isLoading } = useAuth();

  useEffect(() => {
    // Only set up global handler if user is a provider
    if (isLoading || !user || !role) return;
    if (role !== 'provider_owner' && role !== 'provider_staff' && role !== 'superadmin') return;

    const handleUnhandledError = (event: ErrorEvent) => {
      const error = event.error;
      if (error instanceof FetchError && (error.status === 403 || error.status === 404)) {
        // Only redirect if we're not already on a provider route
        if (!window.location.pathname.startsWith('/provider')) {
          event.preventDefault(); // Prevent default error handling
          router.replace('/provider/dashboard');
        }
      }
    };

    window.addEventListener('error', handleUnhandledError);
    return () => window.removeEventListener('error', handleUnhandledError);
  }, [user, role, isLoading, router]);
}

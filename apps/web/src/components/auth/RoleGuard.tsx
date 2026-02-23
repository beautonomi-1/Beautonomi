"use client";

import { useAuth } from "@/providers/AuthProvider";
import type { UserRole } from "@/types/beautonomi";
import { useRouter, usePathname } from "next/navigation";
import React, { useEffect, useRef, useState, useMemo } from "react";
import LoadingTimeout from "@/components/ui/loading-timeout";

interface RoleGuardProps {
  children: React.ReactNode;
  /** Required roles (user must have one of these) */
  allowedRoles: UserRole[];
  /** Redirect path when role doesn't match (default: "/") */
  redirectTo?: string;
  /** Show loading while checking (default: true) */
  showLoading?: boolean;
}

// Cache permission checks per route to avoid re-checking on every render
const permissionCache = new Map<string, { allowed: boolean; timestamp: number }>();
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes (increased for better UX)

// Persistent user session cache in localStorage (survives tab switches and refreshes)
const SESSION_CACHE_KEY = 'beautonomi_session_cache';
const SESSION_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Use a hook to safely access localStorage only after mount (prevents hydration mismatch)
function useSessionCache() {
  const [cache, setCache] = React.useState<{ userId: string; role: UserRole; timestamp: number } | null>(null);
  const [isHydrated, setIsHydrated] = React.useState(false);
  
  React.useEffect(() => {
    setIsHydrated(true);
    try {
      const cached = localStorage.getItem(SESSION_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.timestamp && Date.now() - parsed.timestamp < SESSION_CACHE_DURATION) {
          setCache(parsed);
        }
      }
    } catch {
      // Ignore errors
    }
  }, []);
  
  return { cache, isHydrated };
}

function setSessionCache(userId: string, role: UserRole) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({
      userId,
      role,
      timestamp: Date.now()
    }));
  } catch {
    // Ignore errors
  }
}

function clearSessionCache() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SESSION_CACHE_KEY);
  } catch {
    // Ignore errors
  }
}

/**
 * RoleGuard Component
 * 
 * Protects routes that require specific user roles.
 * Only renders children if user has one of the allowed roles.
 * 
 * Optimized to cache permission checks and minimize re-renders.
 */
export default function RoleGuard({
  children,
  allowedRoles,
  redirectTo,
  showLoading = true,
}: RoleGuardProps) {
  const { user, role, isLoading, refreshUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  
  // Track if this is the initial load (not a tab switch)
  const isInitialLoad = useRef(true);
  const [hasShownContent, setHasShownContent] = useState(false);
  
  // Check persistent session cache (hydration-safe)
  const { cache: sessionCache, isHydrated } = useSessionCache();
  
  // Smart default redirect: if on provider route, redirect to provider dashboard, otherwise home
  const defaultRedirect = pathname?.startsWith("/provider") 
    ? "/provider/dashboard" 
    : "/";
  const finalRedirectTo = redirectTo ?? defaultRedirect;
  const hasRefreshed = useRef(false);
  const isRedirecting = useRef(false);
  const [hasTimedOut, setHasTimedOut] = useState(false);
  // When user exists but role is null (profile still loading), wait before redirecting so superadmin role can load
  const [roleLoadGraceExpired, setRoleLoadGraceExpired] = useState(false);

  // Avoid mutating the incoming array (allowedRoles.sort() mutates)
  const sortedAllowedRoles = useMemo(() => [...allowedRoles].sort(), [allowedRoles]);
  
  // Create cache key based on pathname and allowed roles
  const cacheKey = useMemo(() => {
    return `${pathname}-${sortedAllowedRoles.join(",")}`;
  }, [pathname, sortedAllowedRoles]);

  // Check cache first
  const cachedResult = useMemo(() => {
    const cached = permissionCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.allowed;
    }
    return null;
  }, [cacheKey]);

  // Determine if access is allowed
  const isAllowed = useMemo(() => {
    if (cachedResult !== null) {
      return cachedResult;
    }
    if (!isLoading && user && role) {
      const allowed = allowedRoles.includes(role);
      // Cache the result
      permissionCache.set(cacheKey, { allowed, timestamp: Date.now() });
      // Also update persistent session cache
      if (allowed) {
        setSessionCache(user.id, role);
      }
      return allowed;
    }
    // Check persistent session cache as fallback
    if (sessionCache && allowedRoles.includes(sessionCache.role)) {
      return true;
    }
    return null;
  }, [cachedResult, isLoading, user, role, allowedRoles, cacheKey, sessionCache]);
  
  // Mark that we've shown content once (for returning users)
  useEffect(() => {
    if (isAllowed === true || (sessionCache && allowedRoles.includes(sessionCache.role))) {
      setHasShownContent(true);
      isInitialLoad.current = false;
    }
  }, [isAllowed, sessionCache, allowedRoles]);
  
  // Clear session cache on logout
  useEffect(() => {
    if (!isLoading && !user && !sessionCache) {
      clearSessionCache();
      permissionCache.clear();
    }
  }, [isLoading, user, sessionCache]);

  // Refresh user data once if role doesn't match (role might have been changed in database)
  useEffect(() => {
    if (!isLoading && user && role && !allowedRoles.includes(role) && !hasRefreshed.current) {
      hasRefreshed.current = true;
      // Clear cache before refreshing
      permissionCache.delete(cacheKey);
      refreshUser();
    }
  }, [isLoading, user, role, allowedRoles, refreshUser, cacheKey]);

  // Grace period when user exists but role is null (profile/role still loading from API)
  useEffect(() => {
    if (!user || role != null) {
      setRoleLoadGraceExpired(false);
      return;
    }
    const t = setTimeout(() => setRoleLoadGraceExpired(true), 5000);
    return () => clearTimeout(t);
  }, [user, role]);

  // Build redirect URL: when sending to home, preserve current path so login can return here (e.g. admin portal)
  const redirectUrl =
    finalRedirectTo === "/" && pathname
      ? `/?login=true&redirect=${encodeURIComponent(pathname)}`
      : finalRedirectTo;

  // Reset redirect flag when user becomes available (so logout → login → admin works again)
  useEffect(() => {
    if (user) isRedirecting.current = false;
  }, [user]);

  // Redirect if role still doesn't match after refresh, or if user is null (logged out)
  // IMPORTANT: Wait for hydration before redirecting (to check localStorage cache first)
  useEffect(() => {
    // Don't redirect until hydration is complete (we need to check localStorage first)
    if (!isHydrated) return;
    
    // If we have a persistent session, don't redirect
    if (sessionCache && allowedRoles.includes(sessionCache.role)) return;
    
    // If user is null and we're not already redirecting, redirect after a short delay
    // (avoids redirecting when auth is briefly restoring session from cookie on admin)
    if (!isLoading && !user && !isRedirecting.current) {
      isRedirecting.current = true;
      permissionCache.clear(); // Clear all cache on logout
      const delay = pathname?.startsWith("/admin") ? 1500 : 0;
      const id = setTimeout(() => {
        router.push(redirectUrl);
      }, delay);
      return () => clearTimeout(id);
    }

    // If role doesn't match after refresh, redirect
    if (!isLoading && user && role && !allowedRoles.includes(role) && hasRefreshed.current && !isRedirecting.current) {
      isRedirecting.current = true;
      permissionCache.delete(cacheKey);
      // Use setTimeout to ensure this happens after render completes
      setTimeout(() => {
        router.push(redirectUrl);
      }, 0);
    }
  }, [isLoading, user, role, allowedRoles, router, redirectUrl, cacheKey, isHydrated, sessionCache, pathname]);

  // Simple timeout - only triggers if we're stuck loading without any cached session
  // This is much less aggressive since we now trust cached sessions
  useEffect(() => {
    // Skip timeout if we have a persistent session or have shown content before
    if (sessionCache || hasShownContent) {
      setHasTimedOut(false);
      return;
    }
    
    if (isLoading && isInitialLoad.current) {
      const timer = setTimeout(() => {
        // Only set timeout if tab is visible and we still have no session
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          setHasTimedOut(true);
        }
      }, 10000); // 10 seconds for initial load only
      return () => clearTimeout(timer);
    } else {
      setHasTimedOut(false);
    }
  }, [isLoading, sessionCache, hasShownContent]);

  // KEY PRINCIPLE: Like Airbnb/Facebook - NEVER show loading for returning users
  // If we have a persistent session cache and we've shown content before, render immediately
  const hasPersistentSession = sessionCache && allowedRoles.includes(sessionCache.role);
  
  // FAST PATH 1: If we have valid permission cache or persistent session, render immediately
  // This is the key to fast tab switching - trust the cache, refresh in background
  if (hasPersistentSession || (cachedResult === true)) {
    // Trigger background refresh if auth is still loading (but don't block rendering)
    if (isLoading && !hasRefreshed.current) {
      // Silent background refresh - don't await
      refreshUser().catch(() => {});
    }
    return <>{children}</>;
  }

  // FAST PATH 2: If we have authenticated user with correct role, render immediately
  if (!isLoading && user && role && allowedRoles.includes(role)) {
    return <>{children}</>;
  }
  
  // FAST PATH 3: If we've shown content before and user exists, trust it (tab switch scenario)
  if (hasShownContent && user) {
    return <>{children}</>;
  }

  // If we have a user but no role (profile still loading or timeout), show loading during grace period then be lenient
  if (user && !role) {
    if (!roleLoadGraceExpired) {
      if (showLoading) {
        return <LoadingTimeout loadingMessage="Checking access..." timeoutMs={6000} onRetry={refreshUser} />;
      }
      return null;
    }
    // Grace expired: allow rendering and let the API handle authorization (avoids redirecting superadmin before role loads)
    return <>{children}</>;
  }

  // Handle explicit logout or no session - redirect in useEffect, not render
  // This condition is checked in useEffect above (lines 173-194)
  if (!isLoading && !user && !hasPersistentSession && isHydrated) {
    if (showLoading) {
      return <LoadingTimeout loadingMessage="Redirecting to login..." timeoutMs={5000} />;
    }
    return null;
  }

  // Handle initial loading state (only on first visit, not tab switches)
  // Also wait for hydration to check if we have a cached session
  if (isLoading && isInitialLoad.current && !hasPersistentSession && isHydrated) {
    if (showLoading) {
      return <LoadingTimeout loadingMessage="Loading..." timeoutMs={10000} onRetry={refreshUser} />;
    }
    return null;
  }
  
  // Before hydration completes, don't show anything (avoids flash of loading)
  if (!isHydrated && isLoading && !user) {
    return null;
  }

  // Handle role mismatch - redirect in useEffect, not render
  // This condition is checked in useEffect above (lines 173-194)
  if (!isLoading && user && role && !allowedRoles.includes(role)) {
    // Try refreshing once
    if (!hasRefreshed.current) {
      hasRefreshed.current = true;
      permissionCache.delete(cacheKey);
      refreshUser();
      if (showLoading) {
        return <LoadingTimeout loadingMessage="Checking access..." timeoutMs={5000} />;
      }
      return null;
    }
    // After refresh, redirect will happen in useEffect
    if (showLoading) {
      return <LoadingTimeout loadingMessage="Access denied. Redirecting..." timeoutMs={3000} />;
    }
    return null;
  }

  // Default: show loading only if we have no cached data at all
  if (showLoading && isInitialLoad.current) {
    return <LoadingTimeout loadingMessage="Loading..." timeoutMs={10000} onRetry={refreshUser} />;
  }
  
  // Fallback: render children if we have any indication of a valid session
  if (user || hasPersistentSession || hasShownContent) {
    return <>{children}</>;
  }

  return null;
}

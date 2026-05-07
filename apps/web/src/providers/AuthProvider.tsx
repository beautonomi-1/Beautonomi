"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { User, UserRole } from "@/types/beautonomi";
import type { Session } from "@supabase/supabase-js";
import { scheduleRetentionSyncOnSession } from "@/lib/retention/client-sync";
import { clearFetcherCache } from "@/lib/http/fetcher";
import { readAllowsFunctionalFromStorage } from "@/lib/cookie-consent/guards";
import { signIn as signInViaProxy } from "@/lib/supabase/auth";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: UserRole | null;
  isLoading: boolean;
  /** True while sign-in is in flight (show signing-in UI / disable double submit). */
  isSigningIn: boolean;
  /** True while sign-out is in flight (show signing-out UI). */
  isSigningOut: boolean;
  isEmailVerified: boolean; // Email verification status
  signOut: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName?: string, phone?: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ROLE_FETCH_TIMEOUT_MS = 5000;
const SESSION_RECHECK_TIMEOUT_MS = 4000;

function raceWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return Promise.race<T | null>([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

function isSupabaseAuthLockError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message?: unknown }).message)
        : String(error ?? "");
  return message.includes("Lock ") && message.includes("was released because another request stole it");
}

async function fetchRoleWithTimeout(
  url: string,
  timeoutMs: number = ROLE_FETCH_TIMEOUT_MS
): Promise<UserRole | null> {
  try {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeout = setTimeout(() => controller?.abort(), timeoutMs);
    try {
      const response = await raceWithTimeout(
        fetch(url, {
          credentials: "include",
          signal: controller?.signal,
        }),
        timeoutMs
      );
      if (!response || !response.ok) return null;
      const json = (await response.json()) as { data?: { role?: UserRole } };
      return json?.data?.role ?? null;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const userRef = useRef<User | null>(null);
  const isLoadingRef = useRef(false);
  const sessionRef = useRef<Session | null>(null);

  /** Read persisted auth for client-only restore (must not run during SSR initial state). */
  function getInitialAuthFromCache(): { user: User | null; session: Session | null; role: UserRole | null } {
    if (typeof window === "undefined") return { user: null, session: null, role: null };
    try {
      const cached = localStorage.getItem("beautonomi_auth_cache");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.timestamp && Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
          return {
            user: parsed.user ?? null,
            session: parsed.session ?? null,
            role: parsed.role ?? null,
          };
        }
      }
    } catch {
      // Ignore
    }
    return { user: null, session: null, role: null };
  }

  /**
   * §Hydration (React #418): Server always renders `user/session/role` as null. Seeding `useState`
   * from `localStorage` on the client made the first client render differ from server HTML.
   * Restore cache in `useLayoutEffect` so the hydrating render matches, then apply cache before paint.
   */
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(true);
  const router = useRouter();
  const _pathname = usePathname();
  const supabase = getSupabaseClient();

  useLayoutEffect(() => {
    const cached = getInitialAuthFromCache();
    if (cached.user && !userRef.current) userRef.current = cached.user;
    if (cached.session && !sessionRef.current) sessionRef.current = cached.session;
    if (cached.user) setUser(cached.user);
    if (cached.session) setSession(cached.session);
    if (cached.role != null) setRole(cached.role);
  }, []);
  
  // Save to cache whenever state changes - use localStorage for persistence
  useEffect(() => {
    if (typeof window !== 'undefined' && (user || session)) {
      try {
        localStorage.setItem('beautonomi_auth_cache', JSON.stringify({
          user,
          session,
          role,
          timestamp: Date.now(),
        }));
      } catch {
        // Ignore storage errors
      }
    }
  }, [user, session, role]);
  
  // Clear cache on explicit logout
  const clearAuthCache = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('beautonomi_auth_cache');
        localStorage.removeItem('beautonomi_session_cache');
        const sessionKeysToRemove: string[] = [];
        for (let i = 0; i < sessionStorage.length; i += 1) {
          const key = sessionStorage.key(i);
          if (!key) continue;
          if (
            key === "provider_dashboard_stats" ||
            key.startsWith("provider_dashboard_stats_") ||
            key.startsWith("provider_dashboard_stats:")
          ) {
            sessionKeysToRemove.push(key);
          }
        }
        sessionKeysToRemove.forEach((key) => sessionStorage.removeItem(key));
        const primaryKeys: string[] = [];
        for (let i = 0; i < sessionStorage.length; i += 1) {
          const k = sessionStorage.key(i);
          if (k?.startsWith("beautonomi_primary_loc_v1_")) primaryKeys.push(k);
        }
        primaryKeys.forEach((k) => sessionStorage.removeItem(k));
      } catch {
        // Ignore errors
      }
    }
  }, []);

  // Request deduplication: prevent concurrent refreshUser calls
  const refreshInProgress = useRef(false);
  const lastRefreshTime = useRef<number>(0);
  const pendingRefreshCallbacks = useRef<Array<{ resolve: (user: User | null) => void; reject: (error: any) => void }>>([]);
  const REFRESH_COOLDOWN = 2000; // 2 seconds cooldown between refresh attempts
  const TIMEOUT_WARNING_COOLDOWN = 10000; // Only log timeout warning once per 10 seconds
  const lastTimeoutWarningTime = useRef<number>(0);

  // Helper to check email verification status
  const checkEmailVerification = useCallback((currentSession: Session | null): boolean => {
    if (!currentSession?.user) return false;
    
    // If email_confirmed_at exists, email is definitely verified
    const emailConfirmedAt = currentSession.user.email_confirmed_at;
    if (emailConfirmedAt) return true;
    
    // If email_confirmed_at is null, we need to determine if verification is enabled or disabled
    // In Supabase:
    // - If email confirmation is DISABLED: user gets a session immediately, email_confirmed_at is null
    // - If email confirmation is ENABLED: user gets NO session until verified, email_confirmed_at is null until verified
    
    // Since we have a session here, it means either:
    // 1. Email confirmation is disabled (user is "verified" by default)
    // 2. Email confirmation is enabled AND user already verified (but email_confirmed_at might not be set yet)
    // 3. Email confirmation is enabled but verification was bypassed somehow
    
    // The safest approach: if we have a valid session, assume user is verified
    // The banner component will show if email_confirmed_at is null AND verification is actually required
    // This way, if verification is disabled, banner won't show (because we return true here)
    // If verification is enabled but not confirmed, banner will show (because email_confirmed_at is null)
    
    // In mock/development mode, always assume verified
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const isMockMode = process.env.NODE_ENV !== "production" && (
      supabaseUrl.includes('placeholder') || 
      supabaseUrl === 'https://placeholder.supabase.co' ||
      !supabaseUrl || supabaseUrl === ''
    );
    
    if (isMockMode) return true;
    
    // If we have a session, user can access the app
    // This means either verification is disabled OR user is verified
    // We'll let the banner component make the final check
    return true;
  }, []);

  const refreshUser = useCallback(async (): Promise<User | null> => {
    // Request deduplication: if a refresh is already in progress, wait for it
    if (refreshInProgress.current) {
      return new Promise<User | null>((resolve, reject) => {
        pendingRefreshCallbacks.current.push({ resolve, reject });
      });
    }

    // Cooldown check: if we just refreshed recently, return cached user
    const timeSinceLastRefresh = Date.now() - lastRefreshTime.current;
    if (timeSinceLastRefresh < REFRESH_COOLDOWN && userRef.current) {
      return userRef.current;
    }

    // Mark refresh as in progress
    refreshInProgress.current = true;
    lastRefreshTime.current = Date.now();

    // Supabase client is null during SSR; skip and clear loading when on client
    if (!supabase) {
      setIsLoading(false);
      refreshInProgress.current = false;
      const result = userRef.current;
      pendingRefreshCallbacks.current.forEach((cb) => cb.resolve(result));
      pendingRefreshCallbacks.current = [];
      return result;
    }

    // Don't clear user state immediately - wait until we confirm no session
    // This prevents the flash of logout during rebuilds

    try {
      // Skip Supabase calls if using placeholder values (mock mode)
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
      
      // Check if we're in mock/development mode (only if using placeholder values)
      const isMockMode = process.env.NODE_ENV !== "production" && (
                        supabaseUrl.includes('placeholder') || 
                        supabaseUrl === 'https://placeholder.supabase.co' ||
                        supabaseAnonKey.includes('placeholder') ||
                        (!supabaseUrl || supabaseUrl === '') ||
                        (!supabaseAnonKey || supabaseAnonKey === '')
                      );
      
      if (isMockMode) {
        // In mock/development mode, set a mock provider user for testing
        const mockUser: User = {
          id: 'mock-provider-user',
          email: 'provider@beautonomi.com',
          full_name: 'Mock Provider',
          phone: '+27123456789',
          avatar_url: null,
          role: 'provider_owner',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        // Create a mock session object
        const mockSession: Session = {
          access_token: 'mock-token',
          refresh_token: 'mock-refresh-token',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          token_type: 'bearer',
          user: {
            id: 'mock-provider-user',
            email: 'provider@beautonomi.com',
            app_metadata: {},
            user_metadata: {},
            aud: 'authenticated',
            created_at: new Date().toISOString(),
          },
        };
        setSession(mockSession);
        setUser(mockUser);
        setRole('provider_owner');
        setIsEmailVerified(true); // Mock users are always verified
        setIsLoading(false);
        
        // Resolve pending callbacks
        const result = mockUser;
        pendingRefreshCallbacks.current.forEach(cb => cb.resolve(result));
        pendingRefreshCallbacks.current = [];
        refreshInProgress.current = false;
        
        return mockUser;
      }

      // Get session — never treat a timer race as "logged out". The old pattern raced getSession()
      // against `{ session: null }`; when the tab was backgrounded, getSession often lost the race
      // and users were cleared even though cookies still had a valid session.
      const SESSION_GET_TIMEOUT_MS = 12000;
      const SESSION_GET_TIMEOUT = Symbol("supabase_get_session_timeout");

      let getSessionPromise: ReturnType<typeof supabase.auth.getSession>;
      try {
        getSessionPromise = supabase.auth.getSession();
      } catch (error) {
        console.warn("Error creating session promise, Supabase client may be stale:", error);
        const freshSupabase = getSupabaseClient();
        if (!freshSupabase) throw error;
        getSessionPromise = freshSupabase.auth.getSession();
      }

      const sessionRace = await Promise.race([
        getSessionPromise.then((r) => ({ kind: "result" as const, r })),
        new Promise<{ kind: typeof SESSION_GET_TIMEOUT }>((resolve) =>
          setTimeout(() => resolve({ kind: SESSION_GET_TIMEOUT }), SESSION_GET_TIMEOUT_MS)
        ),
      ]);

      let currentSession: Session | null = null;

      if (sessionRace.kind === SESSION_GET_TIMEOUT) {
        if (userRef.current || sessionRef.current) {
          if (process.env.NODE_ENV === "development") {
            console.warn(
              "[auth] getSession() slow (e.g. after switching tabs) — keeping existing session; retrying in background"
            );
          }
          setIsLoading(false);
          refreshInProgress.current = false;
          const preserved = userRef.current;
          pendingRefreshCallbacks.current.forEach((cb) => cb.resolve(preserved));
          pendingRefreshCallbacks.current = [];
          void getSessionPromise
            .then(({ data: { session: s } }) => {
              if (s?.user) {
                setSession(s);
                refreshUser().catch(() => {});
              }
            })
            .catch(() => {});
          return preserved;
        }
        const late = await raceWithTimeout(getSessionPromise, SESSION_RECHECK_TIMEOUT_MS);
        if (!late) {
          setIsLoading(false);
          refreshInProgress.current = false;
          const result = userRef.current;
          pendingRefreshCallbacks.current.forEach((cb) => cb.resolve(result));
          pendingRefreshCallbacks.current = [];
          return result;
        }
        if (late.error) {
          console.error("Error getting session:", late.error);
          if (late.error.message !== "timeout" && late.error.code !== "PGRST301") {
            setSession(null);
            setUser(null);
            setRole(null);
            setIsEmailVerified(false);
          }
          setIsLoading(false);
          refreshInProgress.current = false;
          const result = userRef.current;
          pendingRefreshCallbacks.current.forEach((cb) => cb.resolve(result));
          pendingRefreshCallbacks.current = [];
          return result;
        }
        currentSession = late.data.session;
      } else {
        const { data: { session: initialSession }, error: sessionError } = sessionRace.r;
        if (sessionError) {
          console.error("Error getting session:", sessionError);
          if (sessionError.message !== "timeout" && sessionError.code !== "PGRST301") {
            setSession(null);
            setUser(null);
            setRole(null);
            setIsEmailVerified(false);
          }
          setIsLoading(false);
          const result = userRef.current;
          pendingRefreshCallbacks.current.forEach((cb) => cb.resolve(result));
          pendingRefreshCallbacks.current = [];
          refreshInProgress.current = false;
          return result;
        }
        currentSession = initialSession;
      }

      // NOTE: We no longer call supabase.auth.refreshSession() here.
      // Next.js `src/proxy.ts` uses the @supabase/ssr cookie pattern to
      // refresh expiring tokens on navigations before protected pages render. Calling
      // refreshSession() client-side was redundant and — when it failed due to a
      // network blip or expired refresh token — triggered a SIGNED_OUT auth event
      // that cleared state and logged the user out unexpectedly.

      setSession(currentSession);

      if (!currentSession?.user) {
        setUser(null);
        setRole(null);
        setIsEmailVerified(false);
        setIsLoading(false);
        
        // Resolve pending callbacks
        const result = null;
        pendingRefreshCallbacks.current.forEach(cb => cb.resolve(result));
        pendingRefreshCallbacks.current = [];
        refreshInProgress.current = false;
        
        return null;
      }

      // Check email verification status
      const emailVerified = checkEmailVerification(currentSession);
      setIsEmailVerified(emailVerified);

      // Try to get role from cache first (if available)
      let cachedRole: UserRole | null = null;
      if (typeof window !== 'undefined') {
        try {
          const cached = sessionStorage.getItem('user_role_cache');
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed.userId === currentSession.user.id && parsed.timestamp && Date.now() - parsed.timestamp < 5 * 60 * 1000) {
              cachedRole = parsed.role;
            }
          }
        } catch {
          // Ignore cache errors
        }
      }

      // First, try a quick role-only query (faster than full profile)
      let userRole: UserRole | null = cachedRole;
      if (!userRole) {
        try {
          const roleTimeout = new Promise<null>((resolve) => {
            setTimeout(() => resolve(null), 2000); // 2 second timeout for role query
          });
          
          const roleQueryPromise = supabase
            .from('users')
            .select('role')
            .eq('id', currentSession.user.id)
            .maybeSingle();
          
          const roleResult = await Promise.race([roleQueryPromise, roleTimeout]) as { data?: { role: UserRole }; error?: any } | null;
          
          if (roleResult && !('error' in roleResult) && roleResult.data) {
            userRole = roleResult.data.role;
            // Cache the role
            if (typeof window !== 'undefined') {
              try {
                sessionStorage.setItem('user_role_cache', JSON.stringify({
                  userId: currentSession.user.id,
                  role: userRole,
                  timestamp: Date.now(),
                }));
              } catch {
                // Ignore cache errors
              }
            }
          }
        } catch (e) {
          console.warn("Role query failed, will try full profile query:", e);
        }
      }

      // Provider context: when on provider portal, resolve effective role (e.g. customer+staff -> provider_staff)
      if (
        typeof window !== "undefined" &&
        window.location?.pathname?.startsWith("/provider") &&
        userRole === "customer"
      ) {
        const resolvedRole = await fetchRoleWithTimeout("/api/me/role?portal=provider");
        if (resolvedRole) {
          userRole = resolvedRole;
        }
      }

      // Admin portal: server-authoritative role (fixes stale sessionStorage / slow profile query showing wrong role, e.g. superadmin as customer)
      if (typeof window !== "undefined" && window.location?.pathname?.startsWith("/admin")) {
        const resolvedRole = await fetchRoleWithTimeout("/api/me/role");
        if (resolvedRole) {
          userRole = resolvedRole;
          try {
            sessionStorage.setItem(
              "user_role_cache",
              JSON.stringify({
                userId: currentSession.user.id,
                role: userRole,
                timestamp: Date.now(),
              }),
            );
          } catch {
            // Ignore cache errors
          }
        }
      }

      // Fetch user profile from database with timeout
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 3000); // Increased to 3 seconds for better reliability
      });

      // Only select role first for faster redirect, then fetch full profile if needed
      const queryPromise = supabase
        .from('users')
        .select('id, role, email, full_name, phone, avatar_url, created_at, updated_at')
        .eq('id', currentSession.user.id)
        .maybeSingle(); // Use maybeSingle to avoid errors if user doesn't exist

      const result = await Promise.race([queryPromise, timeoutPromise]);

      if (result === null) {
        // Throttle timeout warnings: only log once per 10 seconds to reduce console noise
        const timeSinceLastWarning = Date.now() - lastTimeoutWarningTime.current;
        if (process.env.NODE_ENV === 'development' && timeSinceLastWarning >= TIMEOUT_WARNING_COOLDOWN) {
          lastTimeoutWarningTime.current = Date.now();
          console.warn("User profile query timed out after 3 seconds - using session data");
        }
        // Don't set user to null on timeout - use session data instead
        // This prevents premature logouts when database is slow
        // IMPORTANT: Preserve existing role if we have one (don't clear during tab switches)
        // Use cached role if available, otherwise try existing role, then session metadata, finally default to customer
        const fallbackRole = userRole || role || currentSession.user.user_metadata?.role || 'customer';
        const sessionUser: User = {
          id: currentSession.user.id,
          email: currentSession.user.email || '',
          full_name: currentSession.user.user_metadata?.full_name || '',
          phone: currentSession.user.user_metadata?.phone || null,
          avatar_url: currentSession.user.user_metadata?.avatar_url || null,
          role: fallbackRole,
          created_at: currentSession.user.created_at,
          updated_at: currentSession.user.updated_at || currentSession.user.created_at,
        };
        setUser(sessionUser);
        // Only update role if we got a new one, otherwise preserve existing
        if (userRole || !role) {
          setRole(fallbackRole);
        }
        setIsEmailVerified(emailVerified);
        setIsLoading(false);
        
        // Resolve pending callbacks
        pendingRefreshCallbacks.current.forEach(cb => cb.resolve(sessionUser));
        pendingRefreshCallbacks.current = [];
        refreshInProgress.current = false;
        
        return sessionUser;
      }

      const { data: userData, error: userError } = result as any;

      if (userError) {
        console.error("Error fetching user profile:", userError);
        // Don't clear user/role on error - preserve existing state
        // This prevents losing auth state during network issues or tab switches
        // Only clear if we truly have no existing state
        if (!userRef.current && !role) {
          setUser(null);
          setRole(null);
          setIsEmailVerified(false);
        }
        setIsLoading(false);
        
        // Resolve pending callbacks with existing user if available
        const result = userRef.current || null;
        pendingRefreshCallbacks.current.forEach(cb => cb.resolve(result));
        pendingRefreshCallbacks.current = [];
        refreshInProgress.current = false;
        
        return result;
      }

      if (!userData) {
        console.warn("User profile not found in database");
        // Don't clear user/role if profile not found - might be temporary
        // Only clear if we truly have no existing state
        if (!userRef.current && !role) {
          setUser(null);
          setRole(null);
          setIsEmailVerified(false);
        }
        setIsLoading(false);
        
        // Resolve pending callbacks with existing user if available
        const result = userRef.current || null;
        pendingRefreshCallbacks.current.forEach(cb => cb.resolve(result));
        pendingRefreshCallbacks.current = [];
        refreshInProgress.current = false;
        
        return result;
      }

      const dbUser = userData as User;
      const effectiveRole =
        userRole ||
        dbUser.role ||
        role ||
        (currentSession.user.user_metadata?.role as UserRole | undefined) ||
        "customer";
      const user: User = {
        ...dbUser,
        role: effectiveRole,
      };
      setUser(user);
      setRole(effectiveRole);
      
      // Cache the role for future use
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem('user_role_cache', JSON.stringify({
            userId: user.id,
            role: effectiveRole,
            timestamp: Date.now(),
          }));
        } catch {
          // Ignore cache errors
        }
      }
      
      setIsLoading(false);
      
      // Resolve pending callbacks
      pendingRefreshCallbacks.current.forEach(cb => cb.resolve(user));
      pendingRefreshCallbacks.current = [];
      refreshInProgress.current = false;
      
      return user;
    } catch (error) {
      if (isSupabaseAuthLockError(error)) {
        // Another tab/request won Supabase's browser auth lock. Keep the
        // current state and let the next auth event/visibility refresh settle it.
        setIsLoading(false);
        const preserved = userRef.current;
        pendingRefreshCallbacks.current.forEach((cb) => cb.resolve(preserved));
        pendingRefreshCallbacks.current = [];
        refreshInProgress.current = false;
        return preserved;
      }
      console.error("Unexpected error in refreshUser:", error);
      setUser(null);
      setRole(null);
      setIsEmailVerified(false);
      setIsLoading(false);
      
      // Reject pending callbacks
      pendingRefreshCallbacks.current.forEach(cb => cb.reject(error));
      pendingRefreshCallbacks.current = [];
      refreshInProgress.current = false;
      
      return null;
    }
  }, [supabase, checkEmailVerification]);

  // Update refs when values change
  useEffect(() => {
    userRef.current = user;
    isLoadingRef.current = isLoading;
    sessionRef.current = session;
  }, [user, isLoading, session]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isSupabaseAuthLockError(event.reason)) {
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => window.removeEventListener("unhandledrejection", handleUnhandledRejection);
  }, []);

  // When navigating to provider portal with role customer, re-resolve role (e.g. staff get provider_staff)
  useEffect(() => {
    if (
      _pathname?.startsWith("/provider") &&
      user &&
      role === "customer" &&
      !refreshInProgress.current
    ) {
      refreshUser().catch(() => {});
    }
  }, [_pathname, user, role, refreshUser]);

  useEffect(() => {
    // Supabase client is null during SSR; effect runs on client so we need it
    if (!supabase) {
      setIsLoading(false);
      return;
    }
    let isMounted = true;
    let safetyTimeout: NodeJS.Timeout | null = null;
    let subscription: { unsubscribe: () => void } | null = null;
    const visibilityCheckTimeout: NodeJS.Timeout | null = null;
    let lastTokenRefreshTime = 0;
    const TOKEN_REFRESH_DEBOUNCE = 5000; // 5 seconds debounce for token refresh
    
    // Initial load with timeout fallback
    const loadAuth = async () => {
      try {
        // First, quickly check if we have a session before clearing user state
        // This prevents the "flash" of logout during HMR/rebuilds
        try {
          const quickSessionResult = await raceWithTimeout(
            supabase.auth.getSession(),
            SESSION_RECHECK_TIMEOUT_MS
          );
          const quickSession = quickSessionResult?.data?.session ?? null;
          if (quickSession && !userRef.current) {
            // We have a session but no user state - this is likely a rebuild
            // Don't clear anything, just refresh in background
            refreshUser()
              .then(() => scheduleRetentionSyncOnSession())
              .catch(() => {
              // Ignore errors during background refresh
            });
            return;
          }
        } catch {
          // If quick check fails, proceed with normal flow
        }
        
        await refreshUser();
        scheduleRetentionSyncOnSession();
        // Clear timeout if auth loaded successfully
        if (isMounted && safetyTimeout) {
          clearTimeout(safetyTimeout);
          safetyTimeout = null;
        }
      } catch (error) {
        if (!isSupabaseAuthLockError(error)) {
          console.error("Error in initial auth load:", error);
        }
        // Ensure loading state is cleared even on error
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    // Add a safety timeout - if auth hasn't resolved in 10 seconds, clear loading state
    // This prevents the app from being stuck in a loading state indefinitely
    // Increased from 5s to 10s to reduce false warnings during slow network conditions
    // IMPORTANT: Don't fire timeout when tab is hidden (browser pauses JS execution)
    safetyTimeout = setTimeout(() => {
      if (isMounted) {
        // Don't fire timeout warnings when tab is hidden - browser pauses JS execution
        const isTabHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
        if (isTabHidden) {
          // Tab is hidden - don't log warnings, just clear loading state silently
          setIsLoading(false);
          return;
        }
        // Only log warning if tab is visible
        if (process.env.NODE_ENV === 'development') {
          console.warn("Auth initialization taking too long, clearing loading state");
        }
        setIsLoading(false);
      }
    }, 10000);

    loadAuth();

    // Listen for auth changes
    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!isMounted) return;
      
      if (event === 'SIGNED_OUT') {
        // Explicit sign out - always clear state
        setSession(null);
        setUser(null);
        setRole(null);
        setIsEmailVerified(false);
        setIsLoading(false);
      } else if (!newSession) {
        // No new session, but not explicitly signed out (e.g. tab visibility, HMR)
        // 1) If we have state in refs, keep it - do not clear
        if (sessionRef.current || userRef.current || role) {
          return;
        }
        // 2) Re-check session from storage/cookies before clearing (recovers from spurious null events)
        raceWithTimeout(supabase.auth.getSession(), SESSION_RECHECK_TIMEOUT_MS).then((recheckResult) => {
          if (!isMounted) return;
          const recheckSession = recheckResult?.data?.session ?? null;
          if (recheckSession) {
            setSession(recheckSession);
            refreshUser().catch(() => {});
            return;
          }
          setSession(null);
          setUser(null);
          setRole(null);
          setIsEmailVerified(false);
          setIsLoading(false);
        }).catch(() => {
          if (!isMounted) return;
          setSession(null);
          setUser(null);
          setIsLoading(false);
        });
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        // Update session first to check verification status
        if (newSession) {
          setSession(newSession);
          const verified = checkEmailVerification(newSession);
          setIsEmailVerified(verified);
          
          // For TOKEN_REFRESHED, don't clear user state - just update session silently
          // This prevents the "flash" of logout/login during rebuilds and token refreshes
          if (event === 'TOKEN_REFRESHED') {
            // Token refreshed - just update session, don't refresh user to prevent loops
            // Only refresh user if we don't have one
            const now = Date.now();
            if (!userRef.current) {
              // No user but session exists - do full refresh
              await refreshUser();
            } else if (now - lastTokenRefreshTime > TOKEN_REFRESH_DEBOUNCE) {
              // Only refresh user if it's been more than 5 seconds since last refresh
              // This prevents rapid token refresh events from causing loops
              lastTokenRefreshTime = now;
              refreshUser().catch(() => {
                // If refresh fails, don't clear user - session is still valid
                console.warn("Background user refresh failed, but session is valid");
              });
            }
            // Otherwise, just update session silently - user state is still valid
          } else {
            // SIGNED_IN or USER_UPDATED: set optimistic user from session so UI updates immediately
            // (navbar, modal, etc. show logged-in state without waiting for refreshUser/DB)
            const su = newSession.user;
            const optimisticRole = (su.user_metadata?.role as UserRole) || role || 'customer';
            const optimisticUser: User = {
              id: su.id,
              email: su.email ?? '',
              full_name: su.user_metadata?.full_name ?? null,
              phone: su.user_metadata?.phone ?? null,
              avatar_url: su.user_metadata?.avatar_url ?? null,
              role: optimisticRole,
              created_at: su.created_at,
              updated_at: su.updated_at ?? su.created_at,
            };
            setUser(optimisticUser);
            setRole(optimisticRole);
            userRef.current = optimisticUser;
            // Then load full profile from DB (will overwrite with real role/data)
            await refreshUser();
            scheduleRetentionSyncOnSession();
            router.refresh();
          }
        }
      }
    });
    
    subscription = authSubscription;

    // When tab becomes visible again, restore auth state only if it was lost
    // (e.g. the provider was unmounted while the tab was backgrounded).
    // We deliberately do NOT call refreshUser() here — that triggers a full DB
    // round-trip and was the cause of "feels slow after switching tabs".
    // Token refresh is handled transparently by Next.js `src/proxy.ts` (Supabase SSR).
    let visibilityDebounce: NodeJS.Timeout | null = null;
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (visibilityDebounce) clearTimeout(visibilityDebounce);
      visibilityDebounce = setTimeout(() => {
        visibilityDebounce = null;
        if (!isMounted) return;
        // Only act when we've lost our user state but may still have a session in cookies
        if (userRef.current) return; // nothing to do, state is intact
        raceWithTimeout(supabase.auth.getSession(), SESSION_RECHECK_TIMEOUT_MS).then((sessionResult) => {
          const s = sessionResult?.data?.session ?? null;
          if (!isMounted || !s) return;
          // Session still alive — restore user state with a single full refresh
          setSession(s);
          refreshUser().catch(() => {});
        }).catch(() => {});
      }, 400);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      if (safetyTimeout) clearTimeout(safetyTimeout);
      if (visibilityCheckTimeout) clearTimeout(visibilityCheckTimeout);
      if (visibilityDebounce) clearTimeout(visibilityDebounce);
      if (subscription) subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // Only depend on stable functions, not state values that change frequently
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshUser, supabase, checkEmailVerification]);

  /** After login, apply default saved address to marketplace `userLocation` once per session (unless user clears session storage). */
  useEffect(() => {
    if (!user?.id || !session || typeof window === "undefined") return;
    const syncKey = `beautonomi_primary_loc_v1_${user.id}`;
    if (sessionStorage.getItem(syncKey)) return;

    const role = user.role;
    if (role === "superadmin") {
      sessionStorage.setItem(syncKey, "1");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/addresses", { credentials: "include" });
        if (!res.ok || cancelled) {
          sessionStorage.setItem(syncKey, "1");
          return;
        }
        const json = (await res.json()) as { data?: unknown };
        const list = json?.data;
        if (!Array.isArray(list) || list.length === 0) {
          sessionStorage.setItem(syncKey, "1");
          return;
        }
        const primary =
          (list as Array<{ is_default?: boolean; latitude?: number | null; longitude?: number | null }>).find(
            (a) => a.is_default === true,
          ) || (list as any[])[0];
        const lat = Number(primary?.latitude);
        const lng = Number(primary?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          sessionStorage.setItem(syncKey, "1");
          return;
        }
        const line1 = (primary as { address_line1?: string }).address_line1;
        const city = (primary as { city?: string }).city;
        const country = (primary as { country?: string }).country;
        const label = (primary as { label?: string }).label;
        const addressStr =
          [line1, city, country].filter(Boolean).join(", ").trim() ||
          (typeof label === "string" ? label : "") ||
          "Saved address";
        const locationData = { latitude: lat, longitude: lng, address: addressStr };
        if (readAllowsFunctionalFromStorage()) {
          localStorage.setItem("userLocation", JSON.stringify(locationData));
        }
        window.dispatchEvent(new CustomEvent("userLocationChanged", { detail: locationData }));
      } catch {
        // ignore
      } finally {
        if (!cancelled) sessionStorage.setItem(syncKey, "1");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, user?.id, user?.role]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    setIsSigningOut(true);
    const started = Date.now();
    const endSigningOutSoon = () => {
      const elapsed = Date.now() - started;
      const rest = Math.max(0, 450 - elapsed);
      window.setTimeout(() => setIsSigningOut(false), rest);
    };
    try {
      // Clear auth cache and fetcher response cache first
      clearAuthCache();
      clearFetcherCache();

      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Error signing out from Supabase:", error);
      }

      setSession(null);
      setUser(null);
      setRole(null);
      setIsEmailVerified(false);

      // Hard navigation: `router.refresh()` after `router.push` can revalidate the *current*
      // URL (e.g. /account-settings) before the transition completes, leaving users on a
      // protected shell while cookies clear. A full load guarantees the marketing home.
      if (typeof window !== "undefined") {
        window.location.assign("/");
        return;
      }
      router.replace("/");
    } catch (error) {
      console.error("Unexpected error signing out:", error);
      setSession(null);
      setUser(null);
      setRole(null);
      setIsEmailVerified(false);
      if (typeof window !== "undefined") {
        window.location.assign("/");
        return;
      }
      router.replace("/");
    } finally {
      if (typeof window !== "undefined") endSigningOutSoon();
      else setIsSigningOut(false);
    }
  }, [supabase, router]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return;
    setIsSigningIn(true);
    try {
      // Use the same /api/auth/sign-in proxy as the login page (avoids CORS/502 on some networks).
      await signInViaProxy({ email, password });
      await refreshUser();
    } catch (error) {
      console.error("Sign in error:", error);
      throw error;
    } finally {
      setIsSigningIn(false);
    }
  }, [supabase, refreshUser]);

  const signUp = useCallback(async (
    email: string,
    password: string,
    fullName?: string,
    phone?: string
  ) => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            phone: phone,
            role: 'customer', // Default role
          },
        },
      });

      if (error) {
        throw error;
      }

      // User profile and wallet are created automatically via trigger
      // If email confirmation is disabled, we can refresh user immediately
      if (data.session) {
        // Wait a moment for the session to be fully established
        await new Promise(resolve => setTimeout(resolve, 200));
        await refreshUser();
        // Check verification status after signup
        const verified = checkEmailVerification(data.session);
        setIsEmailVerified(verified);
      } else {
        // No session means email confirmation is required
        setIsEmailVerified(false);
      }
    } catch (error) {
      console.error("Sign up error:", error);
      throw error;
    }
  }, [supabase, refreshUser, checkEmailVerification]);

  const resendVerificationEmail = useCallback(async () => {
    if (!supabase) return;
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: user?.email || '',
      });

      if (error) {
        throw error;
      }
    } catch (error: any) {
      console.error("Error resending verification email:", error);
      throw error;
    }
  }, [supabase, user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        role,
        isLoading,
        isSigningIn,
        isSigningOut,
        isEmailVerified,
        signOut,
        refreshUser,
        signIn,
        signUp,
        resendVerificationEmail,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

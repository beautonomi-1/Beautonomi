"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { User, UserRole } from "@/types/beautonomi";
import type { Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: UserRole | null;
  isLoading: boolean;
  isEmailVerified: boolean; // Email verification status
  signOut: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName?: string, phone?: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const userRef = useRef<User | null>(null);
  const isLoadingRef = useRef(false);
  const sessionRef = useRef<Session | null>(null);

  // Initial state from cache so refs are set on first render (prevents logout when tab switches / remount)
  function getInitialAuthFromCache(): { user: User | null; session: Session | null; role: UserRole | null } {
    if (typeof window === 'undefined') return { user: null, session: null, role: null };
    try {
      const cached = localStorage.getItem('beautonomi_auth_cache');
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

  const cached = getInitialAuthFromCache();
  const [user, setUser] = useState<User | null>(cached.user);
  const [session, setSession] = useState<Session | null>(cached.session);
  const [role, setRole] = useState<UserRole | null>(cached.role);
  const [isLoading, setIsLoading] = useState(true);
  const [isEmailVerified, setIsEmailVerified] = useState(true);
  const router = useRouter();
  const _pathname = usePathname();
  const supabase = getSupabaseClient();

  // Sync refs with initial cache so onAuthStateChange(!newSession) doesn't clear state before refs update
  if (cached.user && !userRef.current) userRef.current = cached.user;
  if (cached.session && !sessionRef.current) sessionRef.current = cached.session;
  
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

      // Get session and refresh if needed - with timeout to prevent hanging
      let currentSession = null;
      
      // Add timeout to getSession to prevent infinite loading
      const sessionTimeout = new Promise<{ data: { session: null }, error: null }>((resolve) => {
        setTimeout(() => {
          resolve({ data: { session: null }, error: null });
        }, 3000); // 3 second timeout
      });

      let sessionPromise: Promise<any>;
      try {
        sessionPromise = supabase.auth.getSession();
      } catch (error) {
        console.warn("Error creating session promise, Supabase client may be stale:", error);
        // If Supabase client is stale, try to get a fresh one
        const freshSupabase = getSupabaseClient();
        sessionPromise = freshSupabase.auth.getSession();
      }

      const sessionResult = await Promise.race([sessionPromise, sessionTimeout]);
      
      const { data: { session: initialSession }, error: sessionError } = sessionResult as any;
      
      if (sessionError) {
        console.error("Error getting session:", sessionError);
        // Only clear state if this is a real error, not a timeout
        // Timeouts might just mean slow network, not actual logout
        if (sessionError.message !== 'timeout' && sessionError.code !== 'PGRST301') {
          setSession(null);
          setUser(null);
          setRole(null);
          setIsEmailVerified(false);
        }
        setIsLoading(false);
        
        // Resolve pending callbacks with current user if available
        const result = userRef.current; // Return current user instead of null on timeout
        pendingRefreshCallbacks.current.forEach(cb => cb.resolve(result));
        pendingRefreshCallbacks.current = [];
        refreshInProgress.current = false;
        
        return result;
      }

      currentSession = initialSession;

      // If we have a session, try to refresh it to ensure it's valid
      // But don't block if refresh fails - use existing session
      if (currentSession) {
        try {
          // Add timeout to refresh to prevent hanging
          const refreshTimeout = new Promise<{ data: { session: null }, error: { message: 'timeout' } }>((resolve) => {
            setTimeout(() => {
              resolve({ data: { session: null }, error: { message: 'timeout' } });
            }, 2000); // 2 second timeout for refresh
          });

          const refreshPromise = supabase.auth.refreshSession();
          const refreshResult = await Promise.race([refreshPromise, refreshTimeout]);
          
          const { data: { session: refreshedSession }, error: refreshError } = refreshResult as any;
          
          if (!refreshError && refreshedSession) {
            currentSession = refreshedSession;
          } else if (refreshError) {
            // If refresh fails or times out, continue with existing session
            // The API will handle expired tokens
            if (refreshError.message !== 'timeout') {
              console.warn("Session refresh failed:", refreshError);
            }
            // Continue with existing session - let the API handle expired tokens
          }
        } catch (refreshError) {
          console.warn("Error refreshing session:", refreshError);
          // Continue with existing session
        }
      }

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
          
          const roleResult = await Promise.race([roleQueryPromise, roleTimeout]) as { data?: { role: UserRole }; error?: unknown } | null;
          
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

      const user = userData as User;
      setUser(user);
      setRole(user.role);
      
      // Cache the role for future use
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem('user_role_cache', JSON.stringify({
            userId: user.id,
            role: user.role,
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
          const { data: { session: quickSession } } = await supabase.auth.getSession();
          if (quickSession && !userRef.current) {
            // We have a session but no user state - this is likely a rebuild
            // Don't clear anything, just refresh in background
            refreshUser().catch(() => {
              // Ignore errors during background refresh
            });
            return;
          }
        } catch {
          // If quick check fails, proceed with normal flow
        }
        
        await refreshUser();
        // Clear timeout if auth loaded successfully
        if (isMounted && safetyTimeout) {
          clearTimeout(safetyTimeout);
          safetyTimeout = null;
        }
      } catch (error) {
        console.error("Error in initial auth load:", error);
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
        supabase.auth.getSession().then(({ data: { session: recheckSession } }) => {
          if (!isMounted) return;
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
            router.refresh();
          }
        }
      }
    });
    
    subscription = authSubscription;

    // When tab becomes visible again, re-validate session so we don't stay "logged out" if state was lost
    let visibilityDebounce: NodeJS.Timeout | null = null;
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (visibilityDebounce) clearTimeout(visibilityDebounce);
      visibilityDebounce = setTimeout(() => {
        visibilityDebounce = null;
        if (!isMounted) return;
        // If we have no user but might have session in cookies, restore from Supabase
        if (!userRef.current) {
          supabase.auth.getSession().then(({ data: { session: s } }) => {
            if (!isMounted || !s) return;
            setSession(s);
            refreshUser().catch(() => {});
          });
        }
      }, 300);
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

  const signOut = useCallback(async () => {
    try {
      // Clear local state first
      setSession(null);
      setUser(null);
      setRole(null);
      setIsEmailVerified(false);
      
      // Clear auth cache
      clearAuthCache();
      
      // Sign out from Supabase
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Error signing out from Supabase:", error);
        // Continue with redirect even if there's an error
      }
      
      // Force navigation to home page
      router.push("/");
      router.refresh(); // Refresh to clear any cached data
    } catch (error) {
      console.error("Unexpected error signing out:", error);
      // Even on error, clear state and redirect
      setSession(null);
      setUser(null);
      setRole(null);
      setIsEmailVerified(false);
      router.push("/");
      router.refresh();
    }
  }, [supabase, router]);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      if (data.session) {
        await refreshUser();
      }
    } catch (error) {
      console.error("Sign in error:", error);
      throw error;
    }
  }, [supabase, refreshUser]);

  const signUp = useCallback(async (
    email: string,
    password: string,
    fullName?: string,
    phone?: string
  ) => {
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

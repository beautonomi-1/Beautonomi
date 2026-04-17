import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { Platform } from "react-native";
import { AppState, type AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { scheduleRetentionSyncOnSession } from "@/lib/retention-sync";
import { APP_URL } from "@/config/public-env";
import {
  CART_CACHE_KEY_PREFIX,
  LEGACY_CART_CACHE_KEY,
  BOOKINGS_CACHE_KEY_PREFIX,
  LEGACY_BOOKINGS_CACHE_KEY_PREFIX,
} from "@/lib/cache-keys";
import {
  normalizeSupabaseAuthPhone,
  normalizeSupabaseSmsOtpToken,
  isCompleteSupabaseSmsOtp,
  SUPABASE_AUTH_OTP_LENGTH,
} from "@/lib/supabase-sms-otp";
import { clearApiCache } from "@/lib/api-response-cache";
import { clearPortalCache } from "@/lib/portal-cache";
import {
  authFlowBreadcrumb,
  clearSentryUser,
  isSentryEnabled,
  setAuthFlowTags,
  setSentryUser,
} from "@/lib/sentry";

WebBrowser.maybeCompleteAuthSession();

const AUTH_SESSION_TIMEOUT_MS = 12 * 1000; // avoid infinite loading if getSession hangs

export type OAuthProvider = "google" | "apple" | "facebook";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  refreshSession: () => Promise<void>;
  signInWithOtp: (phone: string) => Promise<{ error: Error | null }>;
  verifyOtp: (phone: string, token: string) => Promise<{ error: Error | null }>;
  signInWithOtpEmail: (email: string) => Promise<{ error: Error | null }>;
  verifyOtpEmail: (email: string, token: string) => Promise<{ error: Error | null }>;
  signInWithOAuth: (
    provider: OAuthProvider
  ) => Promise<{ error: Error | null }>;
  signInWithEmail: (
    email: string,
    password: string
  ) => Promise<{ error: Error | null; requiresConfirmation?: boolean }>;
  signUpWithEmail: (
    email: string,
    password: string,
    fullName?: string
  ) => Promise<{ error: Error | null; requiresConfirmation?: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getRedirectUrl(): string {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/auth/callback`;
    }
    return `${APP_URL.replace(/\/$/, "")}/auth/callback`;
  }
  return AuthSession.makeRedirectUri({ path: "auth/callback" });
}

async function clearCustomerUserCaches(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter((key) =>
      key === LEGACY_CART_CACHE_KEY ||
      key.startsWith(`${CART_CACHE_KEY_PREFIX}:`) ||
      key.startsWith(LEGACY_BOOKINGS_CACHE_KEY_PREFIX) ||
      key.startsWith(`${BOOKINGS_CACHE_KEY_PREFIX}:`)
    );
    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys);
    }
  } catch {
    // Best-effort cache cleanup only.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const lastUserIdRef = useRef<string | null>(null);

  const updateSession = useCallback((newSession: Session | null) => {
    setSession(newSession);
    setUser(newSession?.user ?? null);
  }, []);

  const refreshSession = useCallback(async () => {
    const { data: { session: s } } = await supabase.auth.getSession();
    updateSession(s);
  }, [updateSession]);

  useEffect(() => {
    let mounted = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const done = () => {
      if (mounted) setLoading(false);
    };

    timeoutId = setTimeout(done, AUTH_SESSION_TIMEOUT_MS);

    supabase.auth
      .getSession()
      .then(({ data: { session: s } }) => {
        if (!mounted) return;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        updateSession(s);
        setLoading(false);
        if (isSentryEnabled()) {
          authFlowBreadcrumb("auth_initial_get_session", { hasSession: !!s });
        }
        if (s?.user) scheduleRetentionSyncOnSession();
      })
      .catch((err) => {
        console.warn("[AUTH] getSession failed", err);
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        done();
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      const nextUserId = newSession?.user?.id ?? null;
      const prevUserId = lastUserIdRef.current;
      if ((prevUserId && prevUserId !== nextUserId) || event === "SIGNED_OUT") {
        clearApiCache();
        clearPortalCache();
      }
      lastUserIdRef.current = nextUserId;
      updateSession(newSession);
      if (isSentryEnabled()) {
        if (event === "SIGNED_OUT") {
          authFlowBreadcrumb("supabase_auth", { event: "SIGNED_OUT" });
          setAuthFlowTags({ auth_state: "signed_out" });
        } else if (event === "SIGNED_IN") {
          authFlowBreadcrumb("supabase_auth", { event: "SIGNED_IN" });
        }
      }
      if (event === "SIGNED_OUT") {
        void clearCustomerUserCaches();
      }
      if (
        newSession?.user &&
        (event === "INITIAL_SESSION" || event === "SIGNED_IN")
      ) {
        scheduleRetentionSyncOnSession();
      }
    });

    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
   
  }, [updateSession]);

  useEffect(() => {
    if (!isSentryEnabled()) return;
    if (user?.id) {
      setSentryUser(user.id);
      setAuthFlowTags({ auth_state: "authenticated" });
    } else {
      clearSentryUser();
      setAuthFlowTags({ auth_state: "anonymous" });
    }
  }, [user?.id]);

  useEffect(() => {
    if (typeof AppState.addEventListener !== "function") return;
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });
    return () => sub.remove();
  }, []);

  const signInWithOtp = useCallback(async (phone: string) => {
    const raw = phone.startsWith("+") ? phone : `+${phone}`;
    const e164 = normalizeSupabaseAuthPhone(raw);
    const { error } = await supabase.auth.signInWithOtp({
      phone: e164,
      options: { channel: "sms", shouldCreateUser: false },
    });
    return { error: error ? new Error(error.message) : null };
  }, []);

  const verifyOtp = useCallback(
    async (phone: string, token: string) => {
      const otpToken = normalizeSupabaseSmsOtpToken(token);
      if (!isCompleteSupabaseSmsOtp(otpToken)) {
        return { error: new Error(`Enter the ${SUPABASE_AUTH_OTP_LENGTH}-digit code from your SMS`) };
      }
      const raw = phone.startsWith("+") ? phone : `+${phone}`;
      const e164 = normalizeSupabaseAuthPhone(raw);
      const { data, error } = await supabase.auth.verifyOtp({
        phone: e164,
        token: otpToken,
        type: "sms",
      });
      if (error) return { error: new Error(error.message) };
      if (data.session) updateSession(data.session);
      return { error: null };
    },
    [updateSession],
  );

  const signInWithOtpEmail = useCallback(async (email: string) => {
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return { error: new Error("Enter a valid email address") };
    }
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: getRedirectUrl(), shouldCreateUser: false },
    });
    return { error: error ? new Error(error.message) : null };
  }, []);

  const verifyOtpEmail = useCallback(
    async (email: string, token: string) => {
      const trimmed = email.trim();
      const otpToken = normalizeSupabaseSmsOtpToken(token);
      if (!isCompleteSupabaseSmsOtp(otpToken)) {
        return { error: new Error(`Enter the ${SUPABASE_AUTH_OTP_LENGTH}-digit code from your email`) };
      }
      const { data, error } = await supabase.auth.verifyOtp({
        email: trimmed,
        token: otpToken,
        type: "email",
      });
      if (error) return { error: new Error(error.message) };
      if (data.session) updateSession(data.session);
      return { error: null };
    },
    [updateSession],
  );

  const signInWithOAuth = useCallback(
    async (provider: OAuthProvider): Promise<{ error: Error | null }> => {
      try {
        const redirectTo = getRedirectUrl();
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo,
            skipBrowserRedirect: true,
          },
        });

        if (error) return { error: new Error(error.message) };
        if (!data?.url) return { error: new Error("No OAuth URL returned") };

        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectTo
        );

        if (result.type === "success" && result.url) {
          const url = result.url;
          const hashParams = new URL(url).hash.slice(1);
          const params = new URLSearchParams(hashParams);
          const accessToken = params.get("access_token");
          const refreshToken = params.get("refresh_token");
          if (accessToken && refreshToken) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (sessionError)
              return { error: new Error(sessionError.message) };
          } else {
            const code = new URL(url).searchParams.get("code");
            if (code) {
              const { error: exchangeError } =
                await supabase.auth.exchangeCodeForSession(code);
              if (exchangeError)
                return { error: new Error(exchangeError.message) };
            } else {
              return { error: new Error("No tokens received from OAuth") };
            }
          }
        } else if (result.type === "cancel") {
          return { error: new Error("Sign-in was cancelled") };
        } else {
          return { error: new Error("OAuth was cancelled or failed") };
        }
        return { error: null };
      } catch (err) {
        return {
          error: err instanceof Error ? err : new Error(String(err)),
        };
      }
    },
    []
  );

  const signInWithEmail = useCallback(
    async (email: string, password: string): Promise<{ error: Error | null; requiresConfirmation?: boolean }> => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) return { error: new Error(error.message) };
      if (data.session) {
        updateSession(data.session);
        return { error: null };
      }
      return { error: new Error("Login succeeded but no session was returned. Please try again.") };
    },
    [updateSession]
  );

  const signUpWithEmail = useCallback(
    async (
      email: string,
      password: string,
      fullName?: string
    ): Promise<{ error: Error | null; requiresConfirmation?: boolean }> => {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName?.trim(),
            role: "customer",
          },
        },
      });
      if (error) return { error: new Error(error.message) };
      if (data.session) {
        updateSession(data.session);
        return { error: null };
      }
      return { error: null, requiresConfirmation: true };
    },
    [updateSession]
  );

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      clearApiCache();
      clearPortalCache();
      await clearCustomerUserCaches();
      updateSession(null);
    } catch {
      clearApiCache();
      clearPortalCache();
      await clearCustomerUserCaches();
      updateSession(null);
    }
  }, [updateSession]);

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        loading,
        refreshSession,
        signInWithOtp,
        verifyOtp,
        signInWithOtpEmail,
        verifyOtpEmail,
        signInWithOAuth,
        signInWithEmail,
        signUpWithEmail,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

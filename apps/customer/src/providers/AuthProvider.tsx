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
  PROFILE_SUMMARY_CACHE_KEY_PREFIX,
} from "@/lib/cache-keys";
import {
  normalizeSupabaseAuthPhone,
  normalizeSupabaseSmsOtpToken,
  isCompleteSupabaseSmsOtp,
  SUPABASE_AUTH_OTP_LENGTH,
} from "@/lib/supabase-sms-otp";
import { clearApiCache } from "@/lib/api-response-cache";
import { invalidateApiAccessTokenCache } from "@/lib/api-client";
import { clearPortalCache } from "@/lib/portal-cache";
import { clearBiometricPreference } from "@/hooks/useBiometricAuth";
import {
  authFlowBreadcrumb,
  clearSentryUser,
  isSentryEnabled,
  setAuthFlowTags,
  setSentryUser,
} from "@/lib/sentry";

WebBrowser.maybeCompleteAuthSession();

const AUTH_SESSION_TIMEOUT_MS = 12 * 1000; // avoid infinite loading if getSession hangs

export type OAuthProvider = "google" | "apple";

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
    provider: OAuthProvider,
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

/**
 * Remove per-user disk caches after sign-out. When `userId` is set we
 * only delete keys belonging to that user (cart / bookings rows embed
 * the id in the key) so `getAllKeys()` stays cheap on devices with lots
 * of unrelated AsyncStorage entries. Legacy non-namespaced keys are
 * still cleared whenever any customer signs out.
 */
async function clearCustomerUserCaches(userId: string | null): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const id = userId?.trim() || null;
    const cacheKeys = keys.filter((key) => {
      // Unknown user id (edge case): fall back to the broader sweep so we
      // never leave another user's cached PII on disk.
      if (!id) {
        return (
          key === LEGACY_CART_CACHE_KEY ||
          key.startsWith(`${CART_CACHE_KEY_PREFIX}:`) ||
          key.startsWith(LEGACY_BOOKINGS_CACHE_KEY_PREFIX) ||
          key.startsWith(`${BOOKINGS_CACHE_KEY_PREFIX}:`) ||
          key.startsWith(`${PROFILE_SUMMARY_CACHE_KEY_PREFIX}.`)
        );
      }
      if (key === LEGACY_CART_CACHE_KEY) return true;
      if (key.startsWith(`${CART_CACHE_KEY_PREFIX}:`)) {
        return key.split(":").includes(id);
      }
      if (key.startsWith(LEGACY_BOOKINGS_CACHE_KEY_PREFIX)) return true;
      if (key.startsWith(`${BOOKINGS_CACHE_KEY_PREFIX}:`)) {
        return key.split(":").includes(id);
      }
      if (key.startsWith(`${PROFILE_SUMMARY_CACHE_KEY_PREFIX}.`)) {
        return key === `${PROFILE_SUMMARY_CACHE_KEY_PREFIX}.${id}`;
      }
      return false;
    });
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
  /** Always the latest signed-in user id — read inside `signOut` before clearing session. */
  const currentUserIdRef = useRef<string | null>(null);

  const updateSession = useCallback((newSession: Session | null) => {
    setSession(newSession);
    setUser(newSession?.user ?? null);
    currentUserIdRef.current = newSession?.user?.id ?? null;
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

    /**
     * §Release-audit 2026-04: a single transient getSession() failure at
     * cold boot would previously drop us straight to the login screen (the
     * catch branch just called `done()` with no session). On flaky
     * networks this showed users a login form even though they had a
     * valid cached session on device. Retry with exponential-ish backoff
     * so we only surface "no session" after we're confident it's real.
     */
    const MAX_ATTEMPTS = 3;
    const attemptGetSession = (attempt: number): void => {
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
            authFlowBreadcrumb("auth_initial_get_session", {
              hasSession: !!s,
              attempt,
            });
          }
          if (s?.user) scheduleRetentionSyncOnSession();
        })
        .catch((err) => {
          if (!mounted) return;
          console.warn(`[AUTH] getSession failed (attempt ${attempt})`, err);
          if (isSentryEnabled()) {
            authFlowBreadcrumb("auth_initial_get_session_error", {
              attempt,
              message: err instanceof Error ? err.message : String(err),
            });
          }
          if (attempt < MAX_ATTEMPTS) {
            const delay = 400 * attempt;
            setTimeout(() => {
              if (mounted) attemptGetSession(attempt + 1);
            }, delay);
            return;
          }
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          done();
        });
    };
    attemptGetSession(1);

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
        // `lastUserIdRef` is already cleared to `nextUserId` above — use
        // `prevUserId` so we still know which user's rows to delete.
        void clearCustomerUserCaches(prevUserId);
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
    // Unified auth: verifying an OTP creates the account if it doesn't exist (Airbnb-style).
    const { error } = await supabase.auth.signInWithOtp({
      phone: e164,
      options: { channel: "sms", shouldCreateUser: true },
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
    // Passwordless email: no emailRedirectTo. Numeric code vs magic link comes from the Supabase
    // "Magic Link" email template (`{{ .Token }}`); see supabase/email-templates/README.md.
    // shouldCreateUser: true so verifying the code creates the account.
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: true },
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
        const oauthOptions: {
          redirectTo: string;
          skipBrowserRedirect: true;
          scopes?: string;
        } = {
          redirectTo,
          skipBrowserRedirect: true,
        };
        if (provider === "apple") {
          oauthOptions.scopes = "name email";
        }

        const { data, error } = await supabase.auth.signInWithOAuth({
          provider,
          options: oauthOptions,
        });

        if (error) return { error: new Error(error.message) };
        if (!data?.url) return { error: new Error("No OAuth URL returned") };

        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, {
          preferEphemeralSession: true,
        });

        if (result.type === "success" && result.url) {
          const url = result.url;
          const hashParams = new URL(url).hash.slice(1);
          const params = new URLSearchParams(hashParams);
          const accessToken = params.get("access_token");
          const refreshToken = params.get("refresh_token");
          if (accessToken && refreshToken) {
            try {
              const { error: sessionError } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });
              if (sessionError)
                return { error: new Error(sessionError.message) };
            } catch (err: any) {
              if (err.message?.includes("Lock") && err.message?.includes("stole it")) {
                console.warn("Ignored lock error on setSession", err);
              } else {
                throw err;
              }
            }
          } else {
            const code = new URL(url).searchParams.get("code");
            if (code) {
              try {
                const { error: exchangeError } =
                  await supabase.auth.exchangeCodeForSession(code);
                if (exchangeError)
                  return { error: new Error(exchangeError.message) };
              } catch (err: any) {
                if (err.message?.includes("Lock") && err.message?.includes("stole it")) {
                  console.warn("Ignored lock error on exchangeCodeForSession", err);
                } else {
                  throw err;
                }
              }
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
    const signedOutUserId = currentUserIdRef.current;
    // §Customer-audit 2026-04 (logout UX + perf): the old flow awaited
    // `supabase.auth.signOut()` (network to GoTrue to revoke the refresh
    // token) *before* `updateSession(null)`, then awaited
    // `AsyncStorage.getAllKeys()` for cache cleanup. On slow networks or
    // large local storage that meant the user tapped "Log out" and
    // nothing appeared to happen for many seconds — or forever if the
    // revoke request hung.
    //
    // New order: clear React session + API token cache immediately so
    // `(app)/_layout` can `router.replace` to login on the same tick, then
    // try a bounded remote revoke, then fall back to local-only sign-out,
    // then run heavy AsyncStorage work off the critical path.
    invalidateApiAccessTokenCache();
    updateSession(null);
    clearApiCache();
    clearPortalCache();

    const SIGN_OUT_NETWORK_MS = 2800;
    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("sign_out_timeout")), SIGN_OUT_NETWORK_MS);
        }),
      ]);
    } catch {
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // Best-effort — UI is already logged out via updateSession(null).
      }
    }

    void Promise.allSettled([
      clearCustomerUserCaches(signedOutUserId),
      clearBiometricPreference(),
    ]);
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

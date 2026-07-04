import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { AppState, DeviceEventEmitter, Platform, type AppStateStatus } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { scheduleRetentionSyncOnSession } from "@/lib/retention-sync";
import { abortInFlightRequests } from "@beautonomi/api";
import { APP_URL } from "@/config/public-env";
import {
  authFlowBreadcrumb,
  clearSentryUser,
  isSentryEnabled,
  setAuthFlowTags,
  setSentryUser,
} from "@/lib/sentry";
import { clearApiCache } from "@/lib/api-response-cache";
import { invalidateApiAccessTokenCache } from "@/lib/api-client";
import { clearPortalCache } from "@/lib/portal-cache";
import { clearBiometricPreference } from "@/hooks/useBiometricAuth";
import {
  clearBiometricPromptPending,
  clearBiometricSetupPromptDismissed,
} from "@/lib/biometric-setup-prompt";
import {
  normalizeSupabaseAuthPhone,
  normalizeSupabaseSmsOtpToken,
  isCompleteSupabaseSmsOtp,
  SUPABASE_AUTH_OTP_LENGTH,
} from "@/lib/supabase-sms-otp";
import { resolveMailableAccountEmail } from "@beautonomi/utils";

WebBrowser.maybeCompleteAuthSession();

const AUTH_SESSION_TIMEOUT_MS = 12 * 1000; // avoid infinite loading if getSession hangs

export type OAuthProvider = "google" | "apple";

interface SignUpMetadata {
  full_name: string;
  phone?: string;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** True when session exists and user has verified email (email_confirmed_at set). */
  isEmailVerified: boolean;
  /** Resend verification email for the current user (for signup confirmation). */
  resendVerificationEmail: () => Promise<void>;
  /** Resend signup confirmation before the user is logged in (must match signUp emailRedirectTo). */
  resendSignupConfirmationEmail: (email: string) => Promise<void>;
  signInWithOtp: (phone: string) => Promise<{ error: Error | null }>;
  verifyOtp: (phone: string, token: string) => Promise<{ error: Error | null }>;
  signInWithOtpEmail: (email: string) => Promise<{ error: Error | null }>;
  verifyOtpEmail: (email: string, token: string) => Promise<{ error: Error | null }>;
  /** Verify the numeric OTP from the Supabase "Confirm signup" email (password signup flow). */
  verifySignupEmailOtp: (email: string, token: string) => Promise<{ error: Error | null }>;
  signInWithOAuth: (
    provider: OAuthProvider,
  ) => Promise<{ error: Error | null }>;
  signUpWithEmail: (
    email: string,
    password: string,
    metadata: SignUpMetadata,
  ) => Promise<{ error: Error | null; requiresConfirmation?: boolean }>;
  signInWithEmail: (
    email: string,
    password: string,
  ) => Promise<{ error: Error | null }>;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const lastUserIdRef = useRef<string | null>(null);

  const updateSession = useCallback((newSession: Session | null) => {
    setSession(newSession);
    setUser(newSession?.user ?? null);
  }, []);

  useEffect(() => {
    let mounted = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const done = () => {
      if (mounted) setLoading(false);
    };

    timeoutId = setTimeout(done, AUTH_SESSION_TIMEOUT_MS);

    /**
     * §Release-audit 2026-04: previously a single transient failure
     * (e.g. Secure Store decrypt race, network blip on cold start) would
     * drop us to the login screen despite a valid cached session. Retry
     * up to 3 times before giving up.
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
    if (user?.id) {
      setSentryUser(user.id, user.email ?? undefined);
      if (isSentryEnabled()) {
        setAuthFlowTags({ auth_state: "authenticated" });
      }
    } else {
      clearSentryUser();
      if (isSentryEnabled()) {
        setAuthFlowTags({ auth_state: "anonymous" });
      }
    }
  }, [user?.id, user?.email]);

  // Keep session fresh when app comes to foreground (native only; web always "active")
  useEffect(() => {
    if (typeof AppState.addEventListener !== "function") return;
    let focusEmitTimer: ReturnType<typeof setTimeout> | null = null;
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") {
        supabase.auth.startAutoRefresh();
        // Brief delay lets the radio and NetInfo settle before every hook refetches
        // at once (which otherwise looks like "offline" and times out in a batch).
        if (focusEmitTimer) clearTimeout(focusEmitTimer);
        focusEmitTimer = setTimeout(() => {
          focusEmitTimer = null;
          DeviceEventEmitter.emit("beautonomi:app:focus");
        }, 400);
      } else {
        if (focusEmitTimer) {
          clearTimeout(focusEmitTimer);
          focusEmitTimer = null;
        }
        supabase.auth.stopAutoRefresh();
        // iOS pauses JS timers while suspended, so in-flight GETs can't time out
        // and hang until resume — then reject as a batch of "Request timed out".
        // Cancel them now; the focus listener refetches fresh when we return.
        if (state === "background") {
          abortInFlightRequests();
        }
      }
    });
    return () => {
      if (focusEmitTimer) clearTimeout(focusEmitTimer);
      sub.remove();
    };
  }, []);

  const signInWithOtp = useCallback(async (phone: string) => {
    const raw = phone.startsWith("+") ? phone : `+${phone}`;
    const e164 = normalizeSupabaseAuthPhone(raw);
    const { error } = await supabase.auth.signInWithOtp({
      phone: e164,
      options: { channel: "sms", shouldCreateUser: true },
    });
    return { error: error ? new Error(error.message) : null };
  }, []);

  const verifyOtp = useCallback(async (phone: string, token: string) => {
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
  }, [updateSession]);

  const signInWithOtpEmail = useCallback(async (email: string) => {
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return { error: new Error("Enter a valid email address") };
    }
    // Passwordless email: no emailRedirectTo. Numeric code vs magic link comes from the Supabase
    // "Magic Link" email template (`{{ .Token }}`); see supabase/email-templates/README.md.
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
          queryParams?: Record<string, string>;
        } = {
          redirectTo,
          skipBrowserRedirect: true,
        };
        if (provider === "apple") {
          oauthOptions.scopes = "name email";
        }
        if (provider === "google") {
          // Show the account chooser so the user picks which Google account/email to use.
          oauthOptions.queryParams = {
            access_type: "offline",
            prompt: "select_account consent",
          };
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

          // Ensure role is set to provider_owner for OAuth sign-ins when no role exists yet
          const { data: u } = await supabase.auth.getUser();
          const existingRole =
            (u.user?.user_metadata as { role?: string } | undefined)?.role ?? null;
          if (!existingRole) {
            await supabase.auth.updateUser({
              data: { role: "provider_owner" },
            });
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
    [],
  );

  const signUpWithEmail = useCallback(
    async (
      email: string,
      password: string,
      metadata: SignUpMetadata,
    ): Promise<{ error: Error | null; requiresConfirmation?: boolean }> => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: metadata.full_name,
            phone: metadata.phone ?? null,
            role: "provider_owner",
          },
          emailRedirectTo: getRedirectUrl(),
        },
      });
      if (error) return { error: new Error(error.message) };
      if (data.session) {
        updateSession(data.session);
        return { error: null };
      }
      return { error: null, requiresConfirmation: true };
    },
    [updateSession],
  );

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (!error && data.session) updateSession(data.session);
      if (!error) return { error: null };
      // Supabase 400 often returns "Invalid login credentials" or "Email not confirmed"
      const message =
        error.message?.trim() ||
        "Invalid email or password. If you signed up recently, check your inbox to confirm your email.";
      return { error: new Error(message) };
    },
    [updateSession],
  );

  const signOut = useCallback(async () => {
    const signedOutUserId = session?.user?.id ?? user?.id ?? null;
    // §Provider-audit 2026-04 (parity with customer): same issue — awaiting
    // remote `signOut()` before `updateSession(null)` meant the UI stayed on
    // the authenticated stack until GoTrue responded. Clear session + token
    // cache first so `(app)/_layout` can `<Redirect>` immediately; then
    // bounded revoke + local fallback; biometric cleanup off-thread.
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
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    }

    void clearBiometricPromptPending(signedOutUserId);
    void Promise.allSettled([
      clearBiometricPreference(),
      clearBiometricSetupPromptDismissed(signedOutUserId),
    ]);
  }, [updateSession, session?.user?.id, user?.id]);

  const isEmailVerified = !!(session?.user as { email_confirmed_at?: string } | undefined)?.email_confirmed_at;

  const resendVerificationEmail = useCallback(async () => {
    const email = resolveMailableAccountEmail(user?.email, session?.user?.email);
    if (!email) throw new Error("No email to send verification to");
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: getRedirectUrl() },
    });
    if (error) throw error;
  }, [user?.email, session?.user?.email]);

  const resendSignupConfirmationEmail = useCallback(async (emailAddr: string) => {
    const trimmed = emailAddr.trim();
    if (!trimmed) throw new Error("Email is required");
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: trimmed,
      options: { emailRedirectTo: getRedirectUrl() },
    });
    if (error) throw error;
  }, []);

  /**
   * Verify the numeric OTP from the Supabase "Confirm signup" email — replaces the
   * click-the-link confirmation step for provider email/password signup. Uses
   * `type: "signup"` to match the password signup confirmation flow (distinct from
   * passwordless email `type: "email"`).
   */
  const verifySignupEmailOtp = useCallback(
    async (emailAddr: string, token: string): Promise<{ error: Error | null }> => {
      const trimmed = emailAddr.trim();
      const otpToken = normalizeSupabaseSmsOtpToken(token);
      if (!isCompleteSupabaseSmsOtp(otpToken)) {
        return {
          error: new Error(`Enter the ${SUPABASE_AUTH_OTP_LENGTH}-digit code from your email`),
        };
      }
      const { data, error } = await supabase.auth.verifyOtp({
        email: trimmed,
        token: otpToken,
        type: "signup",
      });
      if (error) return { error: new Error(error.message) };
      if (data.session) updateSession(data.session);
      return { error: null };
    },
    [updateSession],
  );

  const contextValue = useMemo<AuthContextType>(
    () => ({
      session,
      user,
      loading,
      isEmailVerified,
      resendVerificationEmail,
      resendSignupConfirmationEmail,
      signInWithOtp,
      verifyOtp,
      signInWithOtpEmail,
      verifyOtpEmail,
      verifySignupEmailOtp,
      signInWithOAuth,
      signUpWithEmail,
      signInWithEmail,
      signOut,
    }),
    [
      session,
      user,
      loading,
      isEmailVerified,
      resendVerificationEmail,
      resendSignupConfirmationEmail,
      signInWithOtp,
      verifyOtp,
      signInWithOtpEmail,
      verifyOtpEmail,
      verifySignupEmailOtp,
      signInWithOAuth,
      signUpWithEmail,
      signInWithEmail,
      signOut,
    ],
  );

  return (
    <AuthContext.Provider value={contextValue}>
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

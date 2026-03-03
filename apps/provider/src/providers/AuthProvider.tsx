import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { Platform } from "react-native";
import { AppState, type AppStateStatus } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { APP_URL } from "@/config/public-env";

WebBrowser.maybeCompleteAuthSession();

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
  signInWithOtp: (phone: string) => Promise<{ error: Error | null }>;
  verifyOtp: (phone: string, token: string) => Promise<{ error: Error | null }>;
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

  const updateSession = useCallback((newSession: Session | null) => {
    const data = { hasSession: !!newSession, userId: newSession?.user?.id ?? null };
    console.log("[AUTH] updateSession", data);
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/89f3cdbd-444d-401b-9bce-c59a37625210", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "AuthProvider.tsx:updateSession",
        message: "updateSession called",
        data,
        timestamp: Date.now(),
        hypothesisId: "B",
      }),
    }).catch(() => {});
    // #endregion
    setSession(newSession);
    setUser(newSession?.user ?? null);
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      const data = { hasSession: !!s, userId: s?.user?.id ?? null, mounted };
      console.log("[AUTH] getSession resolved", data);
      // #region agent log
      fetch("http://127.0.0.1:7243/ingest/89f3cdbd-444d-401b-9bce-c59a37625210", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: "AuthProvider.tsx:getSession.then",
          message: "getSession resolved",
          data,
          timestamp: Date.now(),
          hypothesisId: "B",
        }),
      }).catch(() => {});
      // #endregion
      if (mounted) {
        updateSession(s);
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      const data = { event, hasSession: !!newSession, userId: newSession?.user?.id ?? null };
      console.log("[AUTH] onAuthStateChange", data);
      // #region agent log
      fetch("http://127.0.0.1:7243/ingest/89f3cdbd-444d-401b-9bce-c59a37625210", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: "AuthProvider.tsx:onAuthStateChange",
          message: "auth state change",
          data,
          timestamp: Date.now(),
          hypothesisId: "B",
        }),
      }).catch(() => {});
      // #endregion
      updateSession(newSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [updateSession]);

  // Keep session fresh when app comes to foreground (native only; web always "active")
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
    const { error } = await supabase.auth.signInWithOtp({
      phone: phone.startsWith("+") ? phone : `+${phone}`,
    });
    return { error: error ? new Error(error.message) : null };
  }, []);

  const verifyOtp = useCallback(async (phone: string, token: string) => {
    const normalizedPhone = phone.startsWith("+") ? phone : `+${phone}`;
    const { error } = await supabase.auth.verifyOtp({
      phone: normalizedPhone,
      token,
      type: "sms",
    });
    return { error: error ? new Error(error.message) : null };
  }, []);

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
          redirectTo,
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

          // Ensure role is set to provider_owner for OAuth sign-ins
          await supabase.auth.updateUser({
            data: { role: "provider_owner" },
          });
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
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (!error) return { error: null };
      // Supabase 400 often returns "Invalid login credentials" or "Email not confirmed"
      const message =
        error.message?.trim() ||
        "Invalid email or password. If you signed up recently, check your inbox to confirm your email.";
      return { error: new Error(message) };
    },
    [],
  );

  const signOut = useCallback(async () => {
    console.log("[AUTH] signOut start");
    try {
      await supabase.auth.signOut();
      console.log("[AUTH] signOut supabase done, calling updateSession(null)");
      updateSession(null);
    } catch (e) {
      console.warn("[AUTH] signOut error", e);
      updateSession(null);
    }
  }, [updateSession]);

  const isEmailVerified = !!(session?.user as { email_confirmed_at?: string } | undefined)?.email_confirmed_at;

  const resendVerificationEmail = useCallback(async () => {
    const email = user?.email;
    if (!email) throw new Error("No email to send verification to");
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
    });
    if (error) throw error;
  }, [user?.email]);

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        loading,
        isEmailVerified,
        resendVerificationEmail,
        signInWithOtp,
        verifyOtp,
        signInWithOAuth,
        signUpWithEmail,
        signInWithEmail,
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

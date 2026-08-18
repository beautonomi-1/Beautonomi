/**
 * Calls GET /api/me/account-status when the user has a session.
 * If deactivated or (for providers) suspended, signs out and redirects to login with query params for messaging.
 */
import { useEffect, useState, useRef } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { GateLoadingScreen } from "@/components/GateLoadingScreen";
import { Colors } from "@/constants/colors";
import {
  authFlowBreadcrumb,
  captureAuthMessage,
  captureError,
  isSentryEnabled,
  setAuthFlowTags,
  setAuthGateContext,
} from "@/lib/sentry";

const GUARD = "account_status_guard";
const ACCOUNT_STATUS_PENDING_WARN_MS = 25_000;

type AccountStatus = {
  is_deactivated?: boolean;
  is_suspended?: boolean;
  is_pending_deletion?: boolean;
  purge_after_at?: string | null;
  deactivated_at?: string;
  deactivated_by?: string | null;
  suspension_reason?: string;
};

export function AccountStatusGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const userId = session?.user?.id ?? null;
  const [checked, setChecked] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const didCheckForUser = useRef<string | null>(null);
  const hangReportedRef = useRef(false);
  const userPresenceLoggedRef = useRef(false);
  const renderPhaseRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isSentryEnabled()) return;
    authFlowBreadcrumb(`${GUARD}.mount`, {});
  }, []);

  useEffect(() => {
    if (!userId) {
      userPresenceLoggedRef.current = false;
      return;
    }
    if (!isSentryEnabled() || userPresenceLoggedRef.current) return;
    userPresenceLoggedRef.current = true;
    authFlowBreadcrumb(`${GUARD}.user_id_detected`, { hasSessionUser: true });
  }, [userId]);

  useEffect(() => {
    if (!isSentryEnabled()) return;
    const view: "bypass_no_session" | "loading" | "children" = !session
      ? "bypass_no_session"
      : !checked
        ? "loading"
        : "children";
    if (renderPhaseRef.current === view) return;
    renderPhaseRef.current = view;
    authFlowBreadcrumb(`${GUARD}.render`, { view });
  }, [session, checked]);

  useEffect(() => {
    if (!userId) {
      didCheckForUser.current = null;
      setCheckError(null);
      setChecked(true);
      return;
    }
    if (didCheckForUser.current === userId) {
      setChecked(true);
      return;
    }

    let cancelled = false;
    setChecked(false);
    setCheckError(null);
    didCheckForUser.current = userId;

    (async () => {
      if (isSentryEnabled()) {
        setAuthFlowTags({ guard_name: "account_status" });
        authFlowBreadcrumb(`${GUARD}.request_start`, {});
        setAuthGateContext("account_status", { phase: "request_start" });
      }
      if (__DEV__) {
        console.log("[AccountStatusGuard] GET /api/me/account-status start", userId);
      }
      try {
        /**
         * Retry transient failures, then fail closed behind a retry screen so
         * a flaky backend does not admit suspended or deactivated users.
         */
        const MAX_ATTEMPTS = 3;
        let res: { data?: AccountStatus; error?: { message?: string; status?: number } } | null = null;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
          if (cancelled) return;
          res = (await api.get<AccountStatus>("/api/me/account-status")) as {
            data?: AccountStatus;
            error?: { message?: string; status?: number };
          };
          const status = (res.error as { status?: number } | undefined)?.status;
          const isTransient = !res.data && (status === undefined || status >= 500);
          if (!isTransient || attempt === MAX_ATTEMPTS) break;
          if (isSentryEnabled()) {
            authFlowBreadcrumb(`${GUARD}.retry`, { attempt, status });
          }
          await new Promise((r) => setTimeout(r, 400 * attempt));
        }
        if (cancelled || !res) return;
        const status = res.data;
        if (res.error || !status) {
          const message =
            res.error?.message ||
            "We couldn't verify your account status. Check your connection and try again.";
          if (isSentryEnabled()) {
            setAuthGateContext("account_status", { phase: "resolved", outcome: "no_status" });
            authFlowBreadcrumb(`${GUARD}.request_complete`, { ok: false, hasBody: !!status });
          }
          setCheckError(message);
          return;
        }
        if (isSentryEnabled()) {
          authFlowBreadcrumb(`${GUARD}.request_success`, { hasStatus: true });
        }

        if (status.is_suspended) {
          if (isSentryEnabled()) {
            authFlowBreadcrumb(`${GUARD}.branch_suspended`, {});
          }
          await signOut();
          if (!cancelled) router.replace("/(auth)/login?suspended=1" as never);
          return;
        }
        if (status.is_deactivated) {
          if (status.is_pending_deletion || status.deactivated_by === "pending_deletion") {
            if (isSentryEnabled()) {
              authFlowBreadcrumb(`${GUARD}.branch_pending_deletion`, {});
            }
            await signOut();
            if (!cancelled) router.replace("/(auth)/login?deletion_scheduled=1" as never);
            return;
          }
          const canSelfReactivate =
            status.deactivated_by === "user" || status.deactivated_by === "inactive_retention";
          if (canSelfReactivate) {
            try {
              const reactivateRes = (await api.post<{ data?: { reactivated?: boolean } }>(
                "/api/me/reactivate-account",
                {}
              )) as { data?: { reactivated?: boolean }; error?: unknown };
              if (reactivateRes?.data?.reactivated && !cancelled) {
                const recheck = (await api.get<AccountStatus>("/api/me/account-status")) as {
                  data?: AccountStatus;
                  error?: unknown;
                };
                if (!recheck?.data?.is_deactivated) {
                  if (isSentryEnabled()) {
                    authFlowBreadcrumb(`${GUARD}.branch_reactivated`, {});
                  }
                  setChecked(true);
                  return;
                }
              }
            } catch {
              // Fall through to sign out
            }
          }
          if (isSentryEnabled()) {
            authFlowBreadcrumb(`${GUARD}.branch_deactivated`, {});
          }
          await signOut();
          if (!cancelled) router.replace("/(auth)/login?deactivated=1" as never);
          return;
        }
        if (isSentryEnabled()) {
          setAuthGateContext("account_status", { phase: "resolved", outcome: "ok" });
          authFlowBreadcrumb(`${GUARD}.path_active_ok`, {});
        }
      } catch (e) {
        if (!cancelled) {
          setCheckError(
            e instanceof Error
              ? e.message
              : "We couldn't verify your account status. Check your connection and try again.",
          );
        }
        if (isSentryEnabled()) {
          captureError(e, { area: "AccountStatusGuard.account-status" });
          authFlowBreadcrumb(`${GUARD}.catch_error`, {
            message: e instanceof Error ? e.message : String(e),
          });
        }
      } finally {
        if (isSentryEnabled()) {
          authFlowBreadcrumb(`${GUARD}.finally_done`, {});
        }
        if (__DEV__) {
          console.log("[AccountStatusGuard] GET /api/me/account-status done", userId);
        }
        if (!cancelled) setChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, signOut, router, retryKey]);

  useEffect(() => {
    if (!session?.user?.id) {
      hangReportedRef.current = false;
      return;
    }
    if (checked) return;
    const t = setTimeout(() => {
      if (!checked && !hangReportedRef.current) {
        hangReportedRef.current = true;
        if (isSentryEnabled()) {
          authFlowBreadcrumb(`${GUARD}.timeout_safeguard`, { waitedMs: ACCOUNT_STATUS_PENDING_WARN_MS });
          captureAuthMessage(`${GUARD}_pending`, "warning", {
            waitedMs: ACCOUNT_STATUS_PENDING_WARN_MS,
          });
        }
      }
    }, ACCOUNT_STATUS_PENDING_WARN_MS);
    return () => clearTimeout(t);
  }, [session?.user?.id, checked]);

  // §Customer-audit 2026-04 (loading-polish): branded gate across session /
  // account-status checks so the flash between login and home is on-brand.
  if (!session) return <>{children}</>;
  if (checkError) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          backgroundColor: Colors.white,
        }}
      >
        <Text style={{ fontSize: 20, fontWeight: "700", color: Colors.gray[900], textAlign: "center" }}>
          Account check needed
        </Text>
        <Text style={{ marginTop: 10, fontSize: 15, lineHeight: 22, color: Colors.gray[600], textAlign: "center" }}>
          {checkError}
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Retry account status check"
          onPress={() => {
            didCheckForUser.current = null;
            setCheckError(null);
            setChecked(false);
            setRetryKey((value) => value + 1);
          }}
          style={{
            marginTop: 24,
            minHeight: 48,
            minWidth: 180,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 14,
            backgroundColor: Colors.primary,
            paddingHorizontal: 24,
            paddingVertical: 12,
          }}
        >
          <Text style={{ color: Colors.white, fontSize: 15, fontWeight: "700" }}>Try again</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          onPress={() => {
            void signOut();
          }}
          style={{ marginTop: 14, paddingHorizontal: 20, paddingVertical: 10 }}
        >
          <Text style={{ color: Colors.gray[500], fontSize: 14, fontWeight: "600" }}>Sign out</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (!checked) return <GateLoadingScreen message="Checking account…" />;
  return <>{children}</>;
}

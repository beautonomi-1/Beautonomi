/**
 * Checks GET /api/me/account-status when the user has a session.
 * If the account is deactivated (by self or super admin) or suspended,
 * signs out and redirects to login with a query param so the login screen can show a message.
 */
import { useEffect, useState, useRef } from "react";
import { View, ActivityIndicator, Text } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
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
  deactivated_at?: string;
  deactivated_by?: string | null;
  suspension_reason?: string;
};

export function AccountStatusGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const userId = session?.user?.id ?? null;
  const [checked, setChecked] = useState(false);
  const didCheck = useRef(false);
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
      didCheck.current = false;
      setChecked(true);
      return;
    }
    if (didCheck.current) {
      setChecked(true);
      return;
    }

    let cancelled = false;
    didCheck.current = true;

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
        const res = await api.get<AccountStatus>("/api/me/account-status") as {
          data?: AccountStatus;
          error?: { message?: string };
        };
        if (cancelled) return;
        const status = res.data;
        if (res.error || !status) {
          if (isSentryEnabled()) {
            setAuthGateContext("account_status", { phase: "resolved", outcome: "no_status" });
            authFlowBreadcrumb(`${GUARD}.request_complete`, { ok: false, hasBody: !!status });
          }
          setChecked(true);
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
          if (status.deactivated_by === "user") {
            try {
              const reactivateRes = await api.post<{ data?: { reactivated?: boolean } }>(
                "/api/me/reactivate-account",
                {}
              ) as { data?: { reactivated?: boolean }; error?: unknown };
              if (reactivateRes?.data?.reactivated && !cancelled) {
                const recheck = await api.get<AccountStatus>("/api/me/account-status") as {
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
  }, [userId, signOut, router]);

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

  if (!session) return <>{children}</>;
  if (!checked) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.white }}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ marginTop: 12, fontSize: 14, color: Colors.gray[600] }}>Checking account…</Text>
      </View>
    );
  }
  return <>{children}</>;
}

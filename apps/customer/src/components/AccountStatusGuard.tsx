/**
 * Calls GET /api/me/account-status when the user has a session.
 * If deactivated or (for providers) suspended, signs out and redirects to login with query params for messaging.
 */
import { useEffect, useState, useRef } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { GateLoadingScreen } from "@/components/GateLoadingScreen";
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
      setChecked(true);
      return;
    }
    if (didCheckForUser.current === userId) {
      setChecked(true);
      return;
    }

    let cancelled = false;
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
         * §Release-audit 2026-04: retry transient failures before falling
         * open. Previously a single 5xx / timeout would let the user
         * through as if no account-status check had happened, so a
         * flaky backend could momentarily admit suspended users. Retry
         * up to 3 times for non-4xx errors; 4xx failures are authoritative
         * and still pass through (user isn't deactivated/suspended there).
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

  // §Customer-audit 2026-04 (loading-polish): branded gate across session /
  // account-status checks so the flash between login and home is on-brand.
  if (!session) return <GateLoadingScreen />;
  if (!checked) return <GateLoadingScreen message="Checking account…" />;
  return <>{children}</>;
}

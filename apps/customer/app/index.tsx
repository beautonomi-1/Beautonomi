import { useEffect, useRef, useState } from "react";
import { Redirect } from "expo-router";
import { AppState, DeviceEventEmitter, View, Text, TouchableOpacity } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/providers/AuthProvider";
import { useTranslation } from "@beautonomi/i18n";
import { GateLoadingScreen } from "@/components/GateLoadingScreen";
import { Colors } from "@/constants/colors";
import { onboardingDoneKey } from "./(app)/onboarding/index";
import { api } from "@/lib/api-client";
import { WrongAppScreen } from "@/components/WrongAppScreen";
import { APP_URL, isScreenshotMode } from "@/config/public-env";
import { getCachedPortal, getPersistedPortal, setCachedPortal, clearPortalCache } from "@/lib/portal-cache";
import {
  authFlowBreadcrumb,
  captureAuthMessage,
  isSentryEnabled,
  setAuthFlowTags,
  setAuthGateContext,
} from "@/lib/sentry";

const IDX = "customer_index";
// §Customer-perf 2026-04: these were 400ms / 300ms artificial delays before
// hitting `/api/me/portal` and `/api/me/profile-completion`. That added
// ~700ms to every cold start after auth resolved for no user-visible benefit
// (the API client now resolves tokens locally without extra round-trips).
const PORTAL_CHECK_DELAY_MS = 0;
const PORTAL_TIMEOUT_MS = 12 * 1000;
/** Extra grace after the first portal deadline: one silent re-fetch before the error screen. */
const PORTAL_TIMEOUT_GRACE_MS = 8 * 1000;
const PROFILE_COMPLETION_DELAY_MS = 0;
const PROFILE_COMPLETION_TIMEOUT_MS = 8000;
const ONBOARDING_STATUS_WARN_MS = 25_000;
const ONBOARDING_STATUS_HARD_TIMEOUT_MS = 15_000;

type PortalState = "idle" | "loading" | "customer" | "wrong_app" | "error";

/**
 * §Release-audit 2026-04: classify portal-check failures so the error screen
 * can show the right CTA. Mirrors the provider app — previously the customer
 * app would "fail open" to customer on timeout/fallback-failure, which
 * briefly admitted providers / admins / unknown-role users into the customer
 * shell.
 */
type PortalErrorKind = "timeout" | "unauthorized" | "no_portal" | "network" | "config_missing";

/**
 * §Release-audit 2026-04: map a raw users.role to the portal label the customer app
 * cares about. Used when `/api/me/portal` fails but the lightweight `/api/me/role`
 * responds — lets us still detect wrong-app login instead of flipping to error.
 */
function portalFromRole(role: string | undefined | null): string | null {
  if (!role) return null;
  if (role === "customer") return "customer";
  if (role === "provider_owner" || role === "provider_staff") return "provider";
  if (role === "provider_onboarding") return "provider_onboarding";
  if (role === "superadmin" || role.startsWith("admin_")) return "admin";
  return null;
}

/** Profile completion API response (GET /api/me/profile-completion) */
type ProfileCompletionItem = { id: string; completed: boolean; required?: boolean };
type ProfileCompletion = {
  checklistItems?: ProfileCompletionItem[];
  percentage?: number;
};

function hasIncompleteRequired(data: ProfileCompletion | null): boolean {
  const items = data?.checklistItems ?? [];
  return items.some((item) => item.required === true && !item.completed);
}

/** First incomplete required item id → route for that screen */
function getIncompleteRedirectRoute(data: ProfileCompletion | null): string {
  const items = data?.checklistItems ?? [];
  const first = items.find((item) => item.required === true && !item.completed);
  if (first?.id === "address") return "/(app)/account-settings/addresses";
  return "/(app)/account-settings/personal-info";
}

/** Single derived “gate” label for redirect / loading branches (matches render order). */
function computeGatePhase(args: {
  loading: boolean;
  hasSession: boolean;
  portalState: PortalState;
  customerOnboardingDone: boolean | null;
  profileState: "idle" | "loading" | "complete" | "incomplete" | "error";
  screenshot: boolean;
}): string {
  const { loading, hasSession, portalState, customerOnboardingDone, profileState, screenshot } = args;
  if (loading || (hasSession && portalState === "idle") || portalState === "loading") {
    return "loading_portal";
  }
  if (!hasSession) return "redirect_home_guest";
  if (portalState === "error") return "screen_portal_error";
  if (portalState === "wrong_app") return "screen_wrong_app";
  if (portalState === "customer" && screenshot) return "redirect_home_screenshot";
  if (portalState === "customer" && customerOnboardingDone === false) return "redirect_home_deferred_onboarding";
  if (portalState === "customer" && customerOnboardingDone === null && !screenshot) {
    return "loading_onboarding_status";
  }
  if (portalState === "customer" && (profileState === "idle" || profileState === "loading")) {
    return "loading_profile_completion";
  }
  if (portalState === "customer" && profileState === "error") return "redirect_home_profile_error";
  if (portalState === "customer" && profileState === "incomplete") return "redirect_home_profile_incomplete";
  return "redirect_home";
}

export default function Index() {
  const { t } = useTranslation();
  const { session, loading, signOut } = useAuth();
  const [portalState, setPortalState] = useState<PortalState>("idle");
  const [wrongPortal, setWrongPortal] = useState<string | null>(null);
  const [portalErrorKind, setPortalErrorKind] = useState<PortalErrorKind | null>(null);
  const [portalRetryKey, setPortalRetryKey] = useState(0);
  const [profileState, setProfileState] = useState<"idle" | "loading" | "complete" | "incomplete" | "error">("idle");
  const [profileCompletionData, setProfileCompletionData] = useState<ProfileCompletion | null>(null);
  /** null = still checking; false = must complete customer onboarding wizard */
  const [customerOnboardingDone, setCustomerOnboardingDone] = useState<boolean | null>(null);
  const onboardingHangReported = useRef(false);

  const prevAuthLoading = useRef<boolean | undefined>(undefined);
  const prevPortalState = useRef<PortalState | undefined>(undefined);
  const prevProfileState = useRef<string | undefined>(undefined);
  const prevGatePhase = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!isSentryEnabled()) return;
    authFlowBreadcrumb(`${IDX}.route_mount`, {});
    setAuthFlowTags({ route_group: "root_index" });
  }, []);

  useEffect(() => {
    if (!isSentryEnabled()) return;
    if (prevAuthLoading.current === loading) return;
    prevAuthLoading.current = loading;
    authFlowBreadcrumb(`${IDX}.auth_loading`, { loading });
  }, [loading]);

  useEffect(() => {
    if (!isSentryEnabled()) return;
    if (prevPortalState.current === portalState) return;
    const from = prevPortalState.current ?? "init";
    prevPortalState.current = portalState;
    authFlowBreadcrumb(`${IDX}.portal_state`, { from, to: portalState });
  }, [portalState]);

  useEffect(() => {
    if (!isSentryEnabled()) return;
    if (prevProfileState.current === profileState) return;
    const from = prevProfileState.current ?? "init";
    prevProfileState.current = profileState;
    authFlowBreadcrumb(`${IDX}.profile_state`, { from, to: profileState });
  }, [profileState]);

  const gatePhase = computeGatePhase({
    loading,
    hasSession: !!session,
    portalState,
    customerOnboardingDone,
    profileState,
    screenshot: isScreenshotMode(),
  });

  useEffect(() => {
    if (!isSentryEnabled()) return;
    if (prevGatePhase.current === gatePhase) return;
    prevGatePhase.current = gatePhase;
    authFlowBreadcrumb(`${IDX}.gate_phase`, { phase: gatePhase });
    setAuthGateContext("customer_index", {
      phase: gatePhase,
      authLoading: loading,
      hasSession: !!session,
      portalState,
      customerOnboardingDone,
      profileState,
    });
  }, [gatePhase, loading, session, portalState, customerOnboardingDone, profileState]);

  useEffect(() => {
    if (loading || !session) {
      return;
    }

    // §Release-audit 2026-04: previously this fell through to "customer" when
    // EXPO_PUBLIC_APP_URL was unset, silently admitting any signed-in user to
    // the customer shell with zero backend verification. In dev `getBackendUrl`
    // transparently falls back to http://localhost:3000, so a missing env there
    // is OK; in release builds (no __DEV__) it means the app is misconfigured
    // and we cannot safely resolve the user's portal — so fail closed with a
    // clear screen rather than pretend everything is fine.
    const isDev = typeof __DEV__ !== "undefined" && __DEV__;
    if (!APP_URL?.trim()) {
      if (isDev) {
        setPortalState("customer");
        return;
      }
      setPortalErrorKind("config_missing");
      setPortalState("error");
      if (isSentryEnabled()) {
        captureAuthMessage(`${IDX}.missing_app_url`, "fatal");
      }
      return;
    }

    const uid = session.user.id;
    const cached = getCachedPortal(uid);
    // §Graceful cross-role entry (2026-04-17): we no longer hard-block
    // provider-role users from the customer app. Server-side endpoints
    // (`/api/public/bookings`, `/api/me/*`) accept any authenticated user,
    // and on web a provider can already book through `/providers/<slug>`.
    // Match that behaviour on mobile — if the user chose to open the
    // Customer app, trust them and let them book. Only `admin` is still
    // steered to the web admin console (it's the right tool, and mobile has
    // no admin UI to deliver).
    if (
      cached === "customer" ||
      cached === "provider" ||
      cached === "provider_owner" ||
      cached === "provider_staff" ||
      cached === "provider_onboarding"
    ) {
      setPortalState("customer");
      return;
    }
    if (cached === "admin") {
      setPortalState("wrong_app");
      setWrongPortal(cached);
      return;
    }

    let cancelled = false;
    let portalTimedOut = false;
    /** Set once resolution reaches a terminal state (portal applied or error shown). */
    let resolved = false;
    /**
     * Set once we've rendered from a persisted last-known-good portal. While
     * true, any network failure during the background re-verify is swallowed —
     * we never drop the user back to the "Taking longer than expected" screen
     * after we've already shown the app. This is the core cold-resume fix.
     */
    let hasPersistedFallback = false;
    setPortalState("loading");
    setPortalErrorKind(null);

    let portalDeadlineId: ReturnType<typeof setTimeout> | null = null;
    const clearPortalDeadline = () => {
      if (portalDeadlineId !== null) {
        clearTimeout(portalDeadlineId);
        portalDeadlineId = null;
      }
    };

    const enterError = (kind: PortalErrorKind) => {
      if (cancelled) return;
      // Stop the 12s watchdog so it cannot fire after we've already resolved
      // (success or failure). Otherwise `timeout` overwrites `unauthorized` and
      // users see "Please sign in again" flash then "Taking longer than expected".
      clearPortalDeadline();
      // Already rendered from a persisted portal — keep the user in the app and
      // let the network heal on its own (focus / connectivity auto-retry).
      if (hasPersistedFallback) return;
      resolved = true;
      setPortalErrorKind(kind);
      setPortalState("error");
      if (isSentryEnabled()) {
        authFlowBreadcrumb(`${IDX}.portal_error`, { kind });
      }
    };

    // §Cold-resume fix: on a slow-waking radio the first probe often just needs
    // a nudge. Rather than fail straight to the error screen at the deadline,
    // fire one silent re-fetch and extend the watchdog once; only surface the
    // timeout if that grace window also elapses.
    let deadlineGraceUsed = false;
    const onPortalDeadline = () => {
      portalDeadlineId = null;
      if (cancelled || portalTimedOut) return;
      if (!deadlineGraceUsed && !hasPersistedFallback) {
        deadlineGraceUsed = true;
        fetchPortal(0);
        portalDeadlineId = setTimeout(onPortalDeadline, PORTAL_TIMEOUT_GRACE_MS);
        return;
      }
      portalTimedOut = true;
      // §Release-audit 2026-04: was "fail open" — silently treating timeouts
      // as customer. That briefly admitted providers/admins into the customer
      // shell when /api/me/portal was slow. Now we fail closed and surface a
      // retry screen so the user can recover explicitly.
      enterError("timeout");
    };
    portalDeadlineId = setTimeout(onPortalDeadline, PORTAL_TIMEOUT_MS);

    const applyPortal = (portal: string) => {
      clearPortalDeadline();
      resolved = true;
      setCachedPortal(uid, portal);
      // §Graceful cross-role entry (2026-04-17): previously provider-role
      // and provider_onboarding users were redirected to a WrongAppScreen.
      // The policy changed – we trust a verified user who chose to open
      // the Customer app and let them book. Server endpoints are already
      // user-scoped, not role-scoped, for all customer surfaces.
      // `admin` is still steered to the web admin console (no mobile admin UI).
      if (portal === "admin") {
        setWrongPortal(portal);
        setPortalState("wrong_app");
      } else {
        setPortalState("customer");
      }
    };

    // §Release-audit 2026-04: last-ditch fallback when `/api/me/portal` keeps failing
    // (typical Bearer/mobile cause: missing public.users row that the server-side
    // self-heal in /api/me/portal should now handle, but an older web deploy won't).
    // We hit the lighter `/api/me/role` once and derive the portal locally. On
    // exhaustion we now fail-closed rather than defaulting to customer.
    const fetchRoleFallback = (reason: PortalErrorKind) => {
      api
        .get<{ role?: string }>("/api/me/role")
        .then((res) => {
          if (cancelled || portalTimedOut) return;
          // Deliberate background abort — the foreground restart re-probes; never
          // surface it as a network/no-role error.
          if ((res.error as { code?: string } | undefined)?.code === "CANCELLED") return;
          if (res.error || !res.data?.role) {
            const status = (res.error as { status?: number } | undefined)?.status;
            if (status === 401 || status === 403) {
              enterError("unauthorized");
              return;
            }
            if (isSentryEnabled()) {
              authFlowBreadcrumb(`${IDX}.portal_fallback_role_failed`, { reason });
            }
            enterError(reason);
            return;
          }
          const derived = portalFromRole(res.data.role);
          if (!derived) {
            enterError("no_portal");
            return;
          }
          if (isSentryEnabled()) {
            authFlowBreadcrumb(`${IDX}.portal_fallback_role_ok`, {
              role: res.data.role,
              portal: derived,
            });
          }
          applyPortal(derived);
        })
        .catch(() => {
          if (!cancelled && !portalTimedOut) enterError(reason);
        });
    };

    const fetchPortal = (attempt: number) => {
      api
        .get<{ portal?: string }>("/api/me/portal")
        .then((res) => {
          if (cancelled || portalTimedOut) return;
          if (res.error) {
            // Deliberate background abort — ignore; the foreground restart re-probes.
            if ((res.error as { code?: string }).code === "CANCELLED") return;
            const status = (res.error as { status?: number }).status;
            if ((status === 401 || status === 403) && attempt < 4) {
              setTimeout(() => fetchPortal(attempt + 1), 350 * (attempt + 1));
              return;
            }
            fetchRoleFallback(status === 401 || status === 403 ? "unauthorized" : "network");
            return;
          }
          const portal = res.data?.portal;
          if (!portal) {
            fetchRoleFallback("no_portal");
            return;
          }
          applyPortal(portal);
        })
        .catch(() => {
          if (!cancelled && !portalTimedOut) fetchRoleFallback("network");
        });
    };

    /**
     * §Cold-resume fix: before the network probe, try the persisted
     * last-known-good portal. If present we render immediately; a fresh value
     * skips the network entirely, a stale one re-verifies quietly in the
     * background without ever surfacing the timeout/error screen.
     */
    const startPortalResolution = async () => {
      let fallback: { portal: string; fresh: boolean } | null = null;
      try {
        fallback = await getPersistedPortal(uid);
      } catch {
        fallback = null;
      }
      if (cancelled || portalTimedOut) return;
      if (fallback) {
        hasPersistedFallback = true;
        applyPortal(fallback.portal);
        if (fallback.fresh) return; // trusted recent value — no network needed
        // Stale: re-verify quietly. applyPortal already cleared the watchdog,
        // and enterError is now a no-op while hasPersistedFallback.
      }
      fetchPortal(0);
    };

    const t = setTimeout(() => {
      if (cancelled) return;
      void startPortalResolution();
    }, PORTAL_CHECK_DELAY_MS);

    // §Cold-resume fix (background-freeze): iOS suspends the JS thread in the
    // background, so the watchdog `setTimeout` above never fires on schedule —
    // it fires "overdue" the instant we resume and would declare a bogus
    // `timeout` (the real cause was suspension, not a slow server). Cancel the
    // watchdog when we background, then restart resolution from scratch on the
    // next foreground if we hadn't resolved yet. The in-flight reads were
    // already aborted (CANCELLED) by AuthProvider on background.
    let appWasBackgrounded = false;
    const portalAppStateSub = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        appWasBackgrounded = true;
        clearPortalDeadline();
      } else if (state === "active" && appWasBackgrounded) {
        appWasBackgrounded = false;
        if (!cancelled && !resolved && !portalTimedOut) {
          setPortalRetryKey((k) => k + 1);
        }
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(t);
      clearPortalDeadline();
      portalAppStateSub.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session?.user?.id, portalRetryKey]);

  // §Cold-resume fix: when the gate is parked on the portal error screen,
  // recover automatically as soon as the app refocuses or connectivity returns.
  // The user no longer has to tap "Try again".
  useEffect(() => {
    if (portalState !== "error") return;

    const retry = () => {
      // Preserve the persisted last-known-good portal (do not clear cache);
      // re-running the effect will retry the persisted fallback + network.
      setPortalErrorKind(null);
      setPortalState("idle");
      setPortalRetryKey((k) => k + 1);
    };

    const focusSub = DeviceEventEmitter.addListener("beautonomi:app:focus", retry);
    const netSub = DeviceEventEmitter.addListener("beautonomi:network:recover", retry);
    const appStateSub = AppState.addEventListener("change", (s) => {
      if (s === "active") retry();
    });
    return () => {
      focusSub.remove();
      netSub.remove();
      appStateSub.remove();
    };
  }, [portalState]);

  // Customer onboarding (web + native): server is source of truth before sending users home.
  useEffect(() => {
    if (portalState !== "customer" || !session?.user?.id) {
      setCustomerOnboardingDone(null);
      return;
    }
    if (!APP_URL?.trim()) {
      setCustomerOnboardingDone(true);
      return;
    }
    if (isScreenshotMode()) {
      setCustomerOnboardingDone(true);
      return;
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let hardTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;
    setCustomerOnboardingDone(null);

    if (isSentryEnabled()) {
      authFlowBreadcrumb(`${IDX}.onboarding_fetch_start`, {});
    }

    const uid = session.user.id;

    const settle = () => {
      settled = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (hardTimeoutTimer) {
        clearTimeout(hardTimeoutTimer);
        hardTimeoutTimer = null;
      }
    };

    const resolveOnboardingAfterFailure = async () => {
      if (settled || cancelled) return;
      settle();
      const stored = await AsyncStorage.getItem(onboardingDoneKey(uid));
      if (!cancelled) setCustomerOnboardingDone(stored === "1");
    };

    const fetchOnboarding = (attempt: number) => {
      api
        .get<{ completed?: boolean }>("/api/me/onboarding/complete")
        .then(async (res) => {
          if (cancelled) return;
          if (isSentryEnabled()) {
            if (res.error) {
              authFlowBreadcrumb(`${IDX}.onboarding_fetch_error`, {
                kind: "api_error",
                attempt,
              });
            } else {
              authFlowBreadcrumb(`${IDX}.onboarding_fetch_success`, {
                completed: res.data?.completed === true,
              });
            }
          }
          if (res.error) {
            if (attempt < 3 && !cancelled) {
              retryTimer = setTimeout(() => fetchOnboarding(attempt + 1), 2000 * (attempt + 1));
              return;
            }
            if (isSentryEnabled()) {
              captureAuthMessage(`${IDX}_onboarding_fetch_exhausted`, "warning", {
                attempts: attempt + 1,
              });
            }
            await resolveOnboardingAfterFailure();
            return;
          }
          const completed = res.data?.completed === true;
          if (completed) {
            settle();
            await AsyncStorage.setItem(onboardingDoneKey(uid), "1");
            if (!cancelled) setCustomerOnboardingDone(true);
            return;
          }
          settle();
          const key = onboardingDoneKey(uid);
          const stored = await AsyncStorage.getItem(key);
          if (stored === "1") await AsyncStorage.removeItem(key);
          if (!cancelled) setCustomerOnboardingDone(false);
        })
        .catch(async (e) => {
          if (isSentryEnabled()) {
            authFlowBreadcrumb(`${IDX}.onboarding_fetch_error`, {
              kind: "throw",
              message: e instanceof Error ? e.message : String(e),
              attempt,
            });
          }
          if (attempt < 3 && !cancelled) {
            retryTimer = setTimeout(() => fetchOnboarding(attempt + 1), 2000 * (attempt + 1));
            return;
          }
          if (isSentryEnabled()) {
            captureAuthMessage(`${IDX}_onboarding_fetch_threw_exhausted`, "warning", {
              attempts: attempt + 1,
              message: e instanceof Error ? e.message : String(e),
            });
          }
          await resolveOnboardingAfterFailure();
        });
    };

    hardTimeoutTimer = setTimeout(() => {
      if (settled || cancelled) return;
      if (isSentryEnabled()) {
        authFlowBreadcrumb(`${IDX}.onboarding_fetch_hard_timeout`, {
          waitedMs: ONBOARDING_STATUS_HARD_TIMEOUT_MS,
        });
      }
      // Never leave the gate in a pending state indefinitely.
      void resolveOnboardingAfterFailure();
    }, ONBOARDING_STATUS_HARD_TIMEOUT_MS);

    fetchOnboarding(0);

    return () => {
      cancelled = true;
      settle();
    };
  }, [portalState, session?.user?.id]);

  // Phase 2: profile completion (only when portal is customer and onboarding finished)
  useEffect(() => {
    if (portalState !== "customer" || !session?.user?.id || !APP_URL?.trim()) return;
    if (customerOnboardingDone !== true) return;

    let cancelled = false;
    setProfileCompletionData(null);
    setProfileState("loading");

    const timeoutId = setTimeout(() => {
      if (cancelled) return;
      setProfileState("error");
    }, PROFILE_COMPLETION_TIMEOUT_MS);

    const t = setTimeout(() => {
      api
        .get<ProfileCompletion>("/api/me/profile-completion")
        .then((res) => {
          if (cancelled) return;
          if (res.error) {
            setProfileState("error");
            return;
          }
          const data = res.data ?? null;
          setProfileCompletionData(data);
          setProfileState(hasIncompleteRequired(data) ? "incomplete" : "complete");
        })
        .catch(() => {
          if (!cancelled) setProfileState("error");
        });
    }, PROFILE_COMPLETION_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(t);
      clearTimeout(timeoutId);
    };
  }, [portalState, session?.user?.id, customerOnboardingDone]);

  useEffect(() => {
    if (!__DEV__) return;
    console.log("[customer index] route gate state", {
      authLoading: loading,
      hasSession: !!session,
      portalState,
      customerOnboardingDone,
      profileState,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session?.user?.id, portalState, customerOnboardingDone, profileState]);

  useEffect(() => {
    if (!session?.user?.id || portalState !== "customer") {
      onboardingHangReported.current = false;
      return;
    }
    if (customerOnboardingDone !== null || isScreenshotMode() || !APP_URL?.trim()) return;
    const t = setTimeout(() => {
      if (customerOnboardingDone === null && !onboardingHangReported.current) {
        onboardingHangReported.current = true;
        if (isSentryEnabled()) {
          authFlowBreadcrumb(`${IDX}.onboarding_fetch_timeout`, { waitedMs: ONBOARDING_STATUS_WARN_MS });
          captureAuthMessage(`${IDX}_onboarding_pending`, "warning", {
            waitedMs: ONBOARDING_STATUS_WARN_MS,
          });
        }
      }
    }, ONBOARDING_STATUS_WARN_MS);
    return () => clearTimeout(t);
  }, [session?.user?.id, portalState, customerOnboardingDone]);

  if (loading || (session && portalState === "idle") || portalState === "loading") {
    return (
      <GateLoadingScreen
        message={t("authGate.checkingAccess")}
        primaryColor={Colors.primary}
        backgroundColor="#fff"
      />
    );
  }

  if (!session) {
    return <Redirect href="/(app)/(tabs)/home" />;
  }

  if (portalState === "wrong_app" && wrongPortal) {
    return (
      <WrongAppScreen
        portal={wrongPortal}
        onSignOut={() => {
          clearPortalCache();
          signOut();
        }}
      />
    );
  }

  // §Release-audit 2026-04: explicit error screen instead of fail-open to customer.
  if (portalState === "error") {
    const kind = portalErrorKind ?? "network";
    const { title, body, primaryLabel, showRetry, showSignOut } = (() => {
      switch (kind) {
        case "unauthorized":
          return {
            title: "Please sign in again",
            body: "Your session expired while we were checking your account.",
            primaryLabel: "Sign in again",
            showRetry: false,
            showSignOut: false,
          };
        case "timeout":
          return {
            title: "Taking longer than expected",
            body: "We couldn't reach our servers in time. Check your connection and try again.",
            primaryLabel: "Try again",
            showRetry: true,
            showSignOut: true,
          };
        case "no_portal":
          return {
            title: "We couldn't place your account",
            body: "Your account is signed in but we couldn't confirm a customer role. Retry or sign out and back in.",
            primaryLabel: "Try again",
            showRetry: true,
            showSignOut: true,
          };
        case "config_missing":
          return {
            title: "App not configured",
            body: "This build is missing a required setting (EXPO_PUBLIC_APP_URL). Please reinstall the latest app from the store, or contact support if the problem persists.",
            primaryLabel: "Sign out",
            showRetry: false,
            showSignOut: false,
          };
        case "network":
        default:
          return {
            title: "Couldn't verify your account",
            body: "We had trouble confirming your customer access. Check your connection and try again.",
            primaryLabel: "Try again",
            showRetry: true,
            showSignOut: true,
          };
      }
    })();

    const handlePrimary = () => {
      clearPortalCache();
      if (kind === "unauthorized" || kind === "config_missing") {
        signOut();
        return;
      }
      setPortalState("idle");
      setPortalErrorKind(null);
      setPortalRetryKey((k) => k + 1);
    };

    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff", padding: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: "600", color: "#1f2937", textAlign: "center", marginBottom: 8 }}>
          {title}
        </Text>
        <Text style={{ fontSize: 14, color: "#6b7280", textAlign: "center", marginBottom: 24 }}>
          {body}
        </Text>
        {showRetry || !showSignOut ? (
          <TouchableOpacity
            onPress={handlePrimary}
            style={{ backgroundColor: "#1f2937", paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10, marginBottom: 12 }}
            accessibilityRole="button"
            accessibilityLabel={primaryLabel}
          >
            <Text style={{ color: "#fff", fontWeight: "600" }}>{primaryLabel}</Text>
          </TouchableOpacity>
        ) : null}
        {showSignOut ? (
          <TouchableOpacity
            onPress={() => {
              clearPortalCache();
              signOut();
            }}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            <Text style={{ color: "#6b7280", fontSize: 14, textDecorationLine: "underline" }}>Sign out</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  if (portalState === "customer" && session && isScreenshotMode()) {
    return <Redirect href="/(app)/(tabs)/home" />;
  }

  if (portalState === "customer" && session && customerOnboardingDone === false) {
    return <Redirect href="/(app)/(tabs)/home" />;
  }

  // Onboarding status loading
  if (portalState === "customer" && session && customerOnboardingDone === null && !isScreenshotMode()) {
    return (
      <GateLoadingScreen
        message={t("authGate.checkingSetup")}
        primaryColor={Colors.primary}
        backgroundColor="#fff"
      />
    );
  }

  // Profile completion loading (only blocks when APP_URL is set; without it the effect
  // returns early and profileState stays "idle" — skip the spinner to avoid stuck loading).
  if (portalState === "customer" && APP_URL?.trim() && (profileState === "idle" || profileState === "loading")) {
    return (
      <GateLoadingScreen
        message={t("authGate.preparingProfile")}
        primaryColor={Colors.primary}
        backgroundColor="#fff"
      />
    );
  }

  // Profile completion error: don't block, go to home; user can complete from profile
  if (portalState === "customer" && profileState === "error") {
    return <Redirect href="/(app)/(tabs)/home" />;
  }

  // Required profile items incomplete — allow browse; user can complete from profile
  if (portalState === "customer" && profileState === "incomplete") {
    return <Redirect href="/(app)/(tabs)/home" />;
  }

  return <Redirect href="/(app)/(tabs)/home" />;
}

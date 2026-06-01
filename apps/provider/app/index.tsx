import { useEffect, useState, useRef } from "react";
import { Redirect } from "expo-router";
import { AppState, DeviceEventEmitter, View, Text, TouchableOpacity } from "react-native";
import { useTranslation } from "@beautonomi/i18n";
import { GateLoadingScreen } from "@/components/GateLoadingScreen";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { getHttpErrorStatus, isTransientApiFailure } from "@/lib/api-error";
import { WrongAppScreen } from "@/components/WrongAppScreen";
import { Colors } from "@/constants/colors";
import { APP_URL, isScreenshotMode } from "@/config/public-env";
import { getCachedPortal, getPersistedPortal, setCachedPortal, clearPortalCache } from "@/lib/portal-cache";
import {
  authFlowBreadcrumb,
  captureAuthMessage,
  isSentryEnabled,
  setAuthFlowTags,
  setAuthGateContext,
} from "@/lib/sentry";

// §Provider-perf parity 2026-04: match customer — these were 400ms / 600ms before
// `/api/me/portal` and profile check; cold start paid that cost every time after
// auth resolved with no user-visible benefit (token is resolved locally).
const PROFILE_CHECK_DELAY_MS = 0;
const AUTH_RETRY_DELAY_MS = 0;
const PORTAL_TIMEOUT_MS = 12 * 1000; // 12s – avoid infinite loading
/** Extra grace after the first portal deadline: one silent re-fetch before the error screen. */
const PORTAL_TIMEOUT_GRACE_MS = 8 * 1000;
const PROFILE_TIMEOUT_MS = 12 * 1000; // 12s – avoid infinite loading
const PROFILE_AUTH_RETRY_MAX = 4;
const PROFILE_TRANSIENT_RETRY_MAX = 4;
/** Extra GET /api/me/portal attempts when the failure is offline/transient (RN status_code 0). */
const PORTAL_TRANSIENT_RETRY_MAX = 4;
/** GET /api/me/role retries inside fetchRoleFallback before surfacing an error. */
const ROLE_FALLBACK_RETRY_MAX = 3;

/**
 * §Release-audit 2026-04: classify why the portal check failed so the error
 * screen can show the right CTA. Previously every failure rendered a single
 * blanket "Couldn't verify your account" message, which masked both transient
 * network issues and unauthenticated sessions behind the same retry button.
 */
type PortalErrorKind = "timeout" | "unauthorized" | "no_portal" | "network" | "config_missing";

/**
 * §Release-audit 2026-04: mirrors `portalFromRole` in the customer app. When
 * `/api/me/portal` keeps failing we hit `/api/me/role` once and derive the
 * portal ourselves, so an auth-row self-heal on another request can still
 * rescue this boot without forcing the user to sign out.
 */
function portalFromRole(role: string | undefined | null): string | null {
  if (!role) return null;
  if (role === "customer") return "customer";
  if (role === "provider_owner" || role === "provider_staff") return "provider";
  if (role === "provider_onboarding") return "provider_onboarding";
  if (role === "superadmin" || role.startsWith("admin_")) return "admin";
  return null;
}

export default function Index() {
  const { t } = useTranslation();
  const { session, loading, signOut } = useAuth();
  const [portalState, setPortalState] = useState<"idle" | "loading" | "wrong_app" | "ok" | "error">("idle");
  const [portalErrorKind, setPortalErrorKind] = useState<PortalErrorKind | null>(null);
  const [portalRetryKey, setPortalRetryKey] = useState(0);
  const [wrongPortal, setWrongPortal] = useState<string | null>(null);
  /**
   * §Release-audit 2026-04: remember whether the portal resolved to
   * `provider_onboarding` (draft / pending_approval / suspended providers).
   * Web routes those users to `/provider/get-started`; mobile now matches by
   * forcing the onboarding hub instead of dashboard, even when a provider
   * profile row already exists. Previously a provider in `pending_approval`
   * landed on the dashboard which masked the "waiting for approval" state.
   */
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [checkingProfile, setCheckingProfile] = useState(false);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [profileLoadError, setProfileLoadError] = useState(false); // timeout or network
  const retryCountRef = useRef(0);
  const profileRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileDeadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Mirrors `hasProfile` so the background/resume handler can tell "still checking" (null) from a resolved answer. */
  const hasProfileRef = useRef<boolean | null>(null);
  useEffect(() => {
    hasProfileRef.current = hasProfile;
  }, [hasProfile]);

  // Phase 1: portal check (is this user a provider?)
  useEffect(() => {
    if (loading) return;
    if (!session) return;
    // §Release-audit 2026-04: previously this treated a missing
    // EXPO_PUBLIC_APP_URL as "ok" and tried to continue with relative API
    // paths. That's fine in Expo Dev (getBackendUrl falls back to
    // http://localhost:3000), but in a release build there's no backend to
    // hit and the user ended up stuck on the dashboard with every API call
    // failing silently. Fail closed in release builds instead.
    const isDev = typeof __DEV__ !== "undefined" && __DEV__;
    if (!APP_URL?.trim()) {
      if (isDev) {
        setPortalState("ok");
        return;
      }
      setPortalErrorKind("config_missing");
      setPortalState("error");
      if (isSentryEnabled()) {
        captureAuthMessage("provider_index.missing_app_url", "fatal");
      }
      return;
    }

    const uid = session.user.id;
    const cached = getCachedPortal(uid);
    // §Graceful cross-role entry (2026-04-17): previously a customer-role
    // user who opened the Partner app was hard-blocked by WrongAppScreen.
    // The policy changed – we trust a verified user who opened the Partner
    // app on purpose. Let them in and treat them as "needs onboarding":
    //   - phase-2 `/api/provider/profile` returns 404 → routed to /onboarding
    //   - `/api/provider/setup-status` returns an empty 0% status for
    //     non-provider users, so the onboarding hub renders a clean
    //     "Start setup" entry point.
    // `admin` is the only role still steered to the web admin console.
    if (cached === "admin") {
      setWrongPortal(cached);
      setPortalState("wrong_app");
      return;
    }
    if (
      cached === "provider" ||
      cached === "provider_owner" ||
      cached === "provider_staff" ||
      cached === "provider_onboarding" ||
      cached === "customer"
    ) {
      setNeedsOnboarding(
        cached === "provider_onboarding" || cached === "customer",
      );
      setPortalState("ok");
      return;
    }

    let cancelled = false;
    /** After timeout we assume provider; ignore late /api/me/portal responses so they can't flip to wrong_app. */
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
      // (success or failure). Otherwise `timeout` overwrites `unauthorized`.
      clearPortalDeadline();
      // Already rendered from a persisted portal — keep the user in the app and
      // let the network heal on its own (focus / connectivity auto-retry).
      if (hasPersistedFallback) return;
      resolved = true;
      setPortalErrorKind(kind);
      setPortalState("error");
      if (isSentryEnabled()) {
        authFlowBreadcrumb("provider_index.portal_error", { kind });
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
        fetchPortal(0, 0);
        portalDeadlineId = setTimeout(onPortalDeadline, PORTAL_TIMEOUT_GRACE_MS);
        return;
      }
      portalTimedOut = true;
      // §Provider-launch (audit 2026-04): was "fail open" assuming provider.
      // That allowed customers / admins / suspended users to briefly enter
      // the provider shell on flaky networks. Now we fail closed: show a
      // retry screen rather than gamble on the user's role.
      enterError("timeout");
    };
    portalDeadlineId = setTimeout(onPortalDeadline, PORTAL_TIMEOUT_MS);

    const applyPortalResult = (portal: string) => {
      clearPortalDeadline();
      resolved = true;
      setCachedPortal(uid, portal);
      // §Graceful cross-role entry (2026-04-17): customer-role users are
      // no longer hard-blocked. They're treated like provider_onboarding
      // so they land on the onboarding hub, where they can either start
      // provider signup or back out of the app. `admin` stays on web.
      if (portal === "admin") {
        setWrongPortal(portal);
        setPortalState("wrong_app");
      } else {
        setNeedsOnboarding(
          portal === "provider_onboarding" || portal === "customer",
        );
        setPortalState("ok");
      }
    };

    // §Release-audit 2026-04: fallback to the lighter /api/me/role endpoint when
    // /api/me/portal keeps failing. Addresses the historic "Couldn't verify your
    // provider access" screen on fresh Bearer sessions where public.users hadn't
    // been materialised yet — the server-side self-heal in /api/me/portal should
    // cover the common case, but this is defence-in-depth for older deploys.
    const fetchRoleFallback = (reason: PortalErrorKind, roleAttempt = 0) => {
      api
        .get<{ role?: string; portal?: string }>("/api/me/role")
        .then((res) => {
          if (cancelled || portalTimedOut) return;
          // Deliberate background abort — the foreground restart re-probes; never
          // surface it as a network/no-role error.
          if ((res.error as { code?: string } | undefined)?.code === "CANCELLED") return;
          if (res.error || !res.data?.role) {
            const status = getHttpErrorStatus(res.error);
            if (
              res.error &&
              isTransientApiFailure(res.error) &&
              roleAttempt < ROLE_FALLBACK_RETRY_MAX - 1
            ) {
              setTimeout(
                () => fetchRoleFallback(reason, roleAttempt + 1),
                400 + roleAttempt * 450,
              );
              return;
            }
            if (status === 401 || status === 403) {
              enterError("unauthorized");
              return;
            }
            enterError(reason);
            return;
          }
          const derived =
            typeof res.data?.portal === "string" && res.data.portal.trim()
              ? res.data.portal.trim()
              : portalFromRole(res.data.role);
          if (!derived) {
            enterError("no_portal");
            return;
          }
          if (isSentryEnabled()) {
            authFlowBreadcrumb("provider_index.portal_fallback_role_ok", {
              role: res.data.role,
              portal: derived,
              from_role_endpoint: Boolean(res.data?.portal),
            });
          }
          applyPortalResult(derived);
        })
        .catch(() => {
          if (
            !cancelled &&
            !portalTimedOut &&
            roleAttempt < ROLE_FALLBACK_RETRY_MAX - 1
          ) {
            setTimeout(
              () => fetchRoleFallback(reason, roleAttempt + 1),
              400 + roleAttempt * 450,
            );
            return;
          }
          if (!cancelled && !portalTimedOut) enterError(reason);
        });
    };

    const fetchPortal = (authAttempt: number, transientAttempt = 0) => {
      api
        .get<{ portal?: string; role?: string }>("/api/me/portal")
        .then((res) => {
          if (cancelled || portalTimedOut) return;
          // Critical: on 401/empty data, do NOT default to "customer" — iOS often fires this
          // before the Bearer session is ready, which falsely showed Wrong app for providers.
          if (res.error) {
            // Deliberate background abort — ignore; the foreground restart re-probes.
            if ((res.error as { code?: string }).code === "CANCELLED") return;
            const status = getHttpErrorStatus(res.error);
            if ((status === 401 || status === 403) && authAttempt < 4) {
              setTimeout(
                () => fetchPortal(authAttempt + 1, 0),
                350 * (authAttempt + 1),
              );
              return;
            }
            if (
              isTransientApiFailure(res.error) &&
              transientAttempt < PORTAL_TRANSIENT_RETRY_MAX
            ) {
              setTimeout(
                () => fetchPortal(authAttempt, transientAttempt + 1),
                280 + transientAttempt * 320,
              );
              return;
            }
            if (isSentryEnabled()) {
              const exhaustedTransient =
                isTransientApiFailure(res.error) &&
                transientAttempt >= PORTAL_TRANSIENT_RETRY_MAX;
              if (exhaustedTransient) {
                authFlowBreadcrumb("provider_index.portal_exhausted_transient", {
                  transient_rounds: transientAttempt + 1,
                  auth_attempts: authAttempt + 1,
                });
              } else {
                captureAuthMessage("provider_index_portal_exhausted", "warning", {
                  status: status ?? null,
                  auth_attempts: authAttempt + 1,
                  transient_rounds: transientAttempt + 1,
                });
              }
            }
            fetchRoleFallback(status === 401 || status === 403 ? "unauthorized" : "network");
            return;
          }
          const portal = res.data?.portal;
          if (!portal) {
            fetchRoleFallback("no_portal");
            return;
          }
          applyPortalResult(portal);
        })
        .catch(() => {
          if (
            !cancelled &&
            !portalTimedOut &&
            transientAttempt < PORTAL_TRANSIENT_RETRY_MAX
          ) {
            setTimeout(
              () => fetchPortal(authAttempt, transientAttempt + 1),
              280 + transientAttempt * 320,
            );
            return;
          }
          if (!cancelled && !portalTimedOut) fetchRoleFallback("network");
        });
    };

    /**
     * §Cold-resume fix: before (or alongside) the network probe, try the
     * persisted last-known-good portal. If present we render immediately; a
     * fresh value skips the network entirely, a stale one re-verifies quietly
     * in the background without ever surfacing the timeout/error screen.
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
        applyPortalResult(fallback.portal);
        if (fallback.fresh) return; // trusted recent value — no network needed
        // Stale: re-verify quietly. applyPortalResult already cleared the
        // watchdog, and enterError is now a no-op while hasPersistedFallback.
      }
      fetchPortal(0, 0);
    };

    const t = setTimeout(() => {
      if (cancelled) return;
      void startPortalResolution();
    }, PROFILE_CHECK_DELAY_MS);

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

  // Phase 2: profile check (only when portal is ok)
  const clearProfileDeadline = () => {
    if (profileDeadlineRef.current) {
      clearTimeout(profileDeadlineRef.current);
      profileDeadlineRef.current = null;
    }
  };

  const scheduleProfileRetry = (attempt: number) => {
    if (profileRetryTimeoutRef.current) {
      clearTimeout(profileRetryTimeoutRef.current);
    }
    const delayMs = Math.max(AUTH_RETRY_DELAY_MS, 250 + attempt * 350);
    profileRetryTimeoutRef.current = setTimeout(() => runProfileCheck(attempt + 1), delayMs);
  };

  const runProfileCheck = (attempt: number) => {
    setProfileLoadError(false);
    setCheckingProfile(true);
    api.get<{ id: string }>("/api/provider/profile").then((res) => {
      if (res.data?.id) {
        setHasProfile(true);
        setCheckingProfile(false);
        setProfileLoadError(false);
        clearProfileDeadline();
        return;
      }

      const err = (res as { error?: { status?: number; code?: string } }).error;
      const status = getHttpErrorStatus(err);
      const code = err && typeof err === "object" ? (err as { code?: string }).code : undefined;
      const isNotFound = status === 404 || code === "NOT_FOUND";
      const isAuthError = status === 401 || status === 403;

      if (isNotFound) {
        setHasProfile(false);
        setCheckingProfile(false);
        setProfileLoadError(false);
        clearProfileDeadline();
        return;
      }

      // New signups (customer/provider_onboarding portal) are expected to miss
      // provider-gated profile access until onboarding creates/upgrades provider role.
      // Route them to onboarding instead of trapping them behind profile errors.
      if (isAuthError && needsOnboarding) {
        setHasProfile(false);
        setCheckingProfile(false);
        setProfileLoadError(false);
        clearProfileDeadline();
        return;
      }

      const isTransient = !!err && isTransientApiFailure(err);

      if (isAuthError && attempt < PROFILE_AUTH_RETRY_MAX - 1) {
        retryCountRef.current = attempt + 1;
        scheduleProfileRetry(attempt);
        return;
      }

      if (isTransient && attempt < PROFILE_TRANSIENT_RETRY_MAX - 1) {
        retryCountRef.current = attempt + 1;
        scheduleProfileRetry(attempt);
        return;
      }

      // Non-404, non-retryable error (5xx, rate limit, malformed response, etc.).
      // Show retry UI instead of sending to onboarding — the provider profile may well exist.
      setHasProfile(null);
      setProfileLoadError(true);
      setCheckingProfile(false);
      clearProfileDeadline();
    }).catch((e) => {
      if (isTransientApiFailure(e) && attempt < PROFILE_TRANSIENT_RETRY_MAX - 1) {
        retryCountRef.current = attempt + 1;
        scheduleProfileRetry(attempt);
        return;
      }
      // Network/throw error exhausted — show retry UI; do NOT route to onboarding.
      setHasProfile(null);
      setProfileLoadError(true);
      setCheckingProfile(false);
      clearProfileDeadline();
    });
  };

  useEffect(() => {
    if (portalState !== "ok" || !session) return;
    if (needsOnboarding) {
      setCheckingProfile(false);
      setProfileLoadError(false);
      setHasProfile(false);
      clearProfileDeadline();
      if (profileRetryTimeoutRef.current) {
        clearTimeout(profileRetryTimeoutRef.current);
        profileRetryTimeoutRef.current = null;
      }
      return;
    }

    let cancelled = false;
    setCheckingProfile(true);
    setProfileLoadError(false);
    retryCountRef.current = 0;

    profileDeadlineRef.current = setTimeout(() => {
      if (cancelled) return;
      setCheckingProfile(false);
      setHasProfile(null);
      setProfileLoadError(true); // show retry UI
      profileDeadlineRef.current = null;
    }, PROFILE_TIMEOUT_MS);

    const t = setTimeout(() => {
      if (cancelled) return;
      runProfileCheck(0);
    }, PROFILE_CHECK_DELAY_MS);

    // §Cold-resume fix (background-freeze): the profile watchdog below is a JS
    // timer that iOS freezes in the background; it fires "overdue" on resume and
    // would flash a bogus "Couldn't load your profile" screen. Cancel it (and any
    // pending retry) when we background, then re-arm + re-probe on the next
    // foreground if the profile check hadn't resolved yet.
    let appWasBackgrounded = false;
    const armProfileDeadline = () => {
      clearProfileDeadline();
      profileDeadlineRef.current = setTimeout(() => {
        if (cancelled) return;
        setCheckingProfile(false);
        setHasProfile(null);
        setProfileLoadError(true);
        profileDeadlineRef.current = null;
      }, PROFILE_TIMEOUT_MS);
    };
    const profileAppStateSub = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        appWasBackgrounded = true;
        clearProfileDeadline();
        if (profileRetryTimeoutRef.current) {
          clearTimeout(profileRetryTimeoutRef.current);
          profileRetryTimeoutRef.current = null;
        }
      } else if (state === "active" && appWasBackgrounded) {
        appWasBackgrounded = false;
        if (!cancelled && hasProfileRef.current === null) {
          armProfileDeadline();
          runProfileCheck(0);
        }
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(t);
      clearProfileDeadline();
      profileAppStateSub.remove();
      if (profileRetryTimeoutRef.current) {
        clearTimeout(profileRetryTimeoutRef.current);
        profileRetryTimeoutRef.current = null;
      }
    };
    // runProfileCheck is intentionally omitted to avoid re-running on every identity change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portalState, session?.user?.id, needsOnboarding]);

  // §Cold-resume fix: when the gate is parked on the portal error or profile
  // load error, recover automatically as soon as the app refocuses or
  // connectivity returns. The user no longer has to tap "Try again".
  useEffect(() => {
    const portalErrored = portalState === "error";
    const profileErrored = profileLoadError && hasProfile === null;
    if (!portalErrored && !profileErrored) return;

    const retry = () => {
      if (portalState === "error") {
        // Preserve the persisted last-known-good portal (do not clear cache);
        // re-running the effect will retry the persisted fallback + network.
        setPortalErrorKind(null);
        setPortalState("idle");
        setPortalRetryKey((k) => k + 1);
      } else if (profileLoadError) {
        setProfileLoadError(false);
        runProfileCheck(0);
      }
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
    // runProfileCheck intentionally omitted (stable within a render pass).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portalState, profileLoadError, hasProfile]);

  useEffect(() => {
    if (!__DEV__) return;
    console.log("[provider index] route gate state", {
      authLoading: loading,
      hasSession: !!session,
      portalState,
      checkingProfile,
      hasProfile,
      profileLoadError,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session?.user?.id, portalState, checkingProfile, hasProfile, profileLoadError]);

  useEffect(() => {
    if (!isSentryEnabled()) return;
    setAuthFlowTags({ route_group: "root_index" });
    setAuthGateContext("provider_index", {
      authLoading: loading,
      hasSession: !!session,
      portalState,
      checkingProfile,
      hasProfile,
      profileLoadError,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session?.user?.id, portalState, checkingProfile, hasProfile, profileLoadError]);

  // 1. Auth resolving — always wait here first so a post-login router.replace("/") that
  //    lands before React commits the new session state doesn't redirect back to login.
  if (loading) {
    return (
      <GateLoadingScreen
        message={t("authGate.checkingPartnerAccess")}
        primaryColor={Colors.primary}
        backgroundColor={Colors.white}
      />
    );
  }

  // 2. No session after auth resolved → go to login.
  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  // 3. Session present but portal check not yet started or in progress.
  if (portalState === "idle" || portalState === "loading") {
    return (
      <GateLoadingScreen
        message={t("authGate.checkingPartnerAccess")}
        primaryColor={Colors.primary}
        backgroundColor={Colors.white}
      />
    );
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

  // §Provider-launch: explicit error state instead of fail-open to provider.
  if (portalState === "error") {
    // §Release-audit 2026-04: differentiate the failure so users see the right
    // CTA (and so we stop logging every "auth row not ready yet" as a hard
    // verification failure). The underlying state machine is identical — only
    // the copy and primary CTA change.
    const kind = portalErrorKind ?? "network";
    const { title, body, showSignOut, primaryLabel, showRetry } = (() => {
      switch (kind) {
        case "unauthorized":
          return {
            title: "Please sign in again",
            body: "Your session expired while we were checking your provider access.",
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
            body: "Your account is signed in but we couldn't confirm a provider role. Retry or sign out and back in.",
            primaryLabel: "Try again",
            showRetry: true,
            showSignOut: true,
          };
        case "config_missing":
          return {
            title: "App not configured",
            body: "This build is missing a required setting (EXPO_PUBLIC_APP_URL). Please reinstall the latest provider app from the store, or contact support if the problem persists.",
            primaryLabel: "Sign out",
            showRetry: false,
            showSignOut: false,
          };
        case "network":
        default:
          return {
            title: "Couldn't verify your account",
            body: "We had trouble confirming your provider access. Check your connection and try again.",
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
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.white, padding: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: "600", color: Colors.gray[800], textAlign: "center", marginBottom: 8 }}>
          {title}
        </Text>
        <Text style={{ fontSize: 14, color: Colors.gray[500], textAlign: "center", marginBottom: 24 }}>
          {body}
        </Text>
        {showRetry || !showSignOut ? (
          <TouchableOpacity
            onPress={handlePrimary}
            style={{ backgroundColor: Colors.primary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10, marginBottom: 12 }}
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
            <Text style={{ color: Colors.gray[500], fontSize: 14, textDecorationLine: "underline" }}>Sign out</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  if (portalState === "ok" && session && isScreenshotMode()) {
    return <Redirect href="/(app)/(tabs)/dashboard" />;
  }

  if (profileLoadError && hasProfile === null) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.white, padding: 24 }}>
        <Text style={{ fontSize: 16, color: Colors.gray[700], textAlign: "center", marginBottom: 8 }}>
          {"Couldn't load your profile"}
        </Text>
        <Text style={{ fontSize: 14, color: Colors.gray[500], textAlign: "center", marginBottom: 24 }}>
          Check your connection and try again.
        </Text>
        <TouchableOpacity
          onPress={() => {
            setProfileLoadError(false);
            runProfileCheck(0);
          }}
          style={{ backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
        >
          <Text style={{ color: Colors.white, fontWeight: "600" }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (portalState === "ok" && (checkingProfile || hasProfile === null)) {
    return (
      <GateLoadingScreen
        message={t("authGate.preparingProfile")}
        primaryColor={Colors.primary}
        backgroundColor={Colors.white}
      />
    );
  }

  if (hasProfile === false) {
    return <Redirect href={"/(app)/onboarding" as never} />;
  }

  // §Release-audit 2026-04: parity with web `getDefaultRouteForPortal`. Even
  // when a provider row exists, users whose portal resolved to
  // `provider_onboarding` (draft / pending_approval / suspended) must land on
  // the onboarding hub so they see their setup progress, approval status, or
  // suspension message — not the live dashboard.
  if (needsOnboarding) {
    return <Redirect href={"/(app)/onboarding" as never} />;
  }

  return <Redirect href="/(app)/(tabs)/dashboard" />;
}

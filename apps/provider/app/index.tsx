import { useEffect, useState, useRef } from "react";
import { Redirect } from "expo-router";
import { View, Text, ActivityIndicator, TouchableOpacity } from "react-native";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { WrongAppScreen } from "@/components/WrongAppScreen";
import { Colors } from "@/constants/colors";
import { APP_URL, isScreenshotMode } from "@/config/public-env";
import { getCachedPortal, setCachedPortal, clearPortalCache } from "@/lib/portal-cache";
import {
  authFlowBreadcrumb,
  captureAuthMessage,
  isSentryEnabled,
  setAuthFlowTags,
  setAuthGateContext,
} from "@/lib/sentry";

const PROFILE_CHECK_DELAY_MS = 400;
const AUTH_RETRY_DELAY_MS = 600;
const PORTAL_TIMEOUT_MS = 12 * 1000; // 12s – avoid infinite loading
const PROFILE_TIMEOUT_MS = 12 * 1000; // 12s – avoid infinite loading

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
      setPortalErrorKind(kind);
      setPortalState("error");
      if (isSentryEnabled()) {
        authFlowBreadcrumb("provider_index.portal_error", { kind });
      }
    };

    portalDeadlineId = setTimeout(() => {
      portalDeadlineId = null;
      if (cancelled) return;
      portalTimedOut = true;
      // §Provider-launch (audit 2026-04): was "fail open" assuming provider.
      // That allowed customers / admins / suspended users to briefly enter
      // the provider shell on flaky networks. Now we fail closed: show a
      // retry screen rather than gamble on the user's role.
      enterError("timeout");
    }, PORTAL_TIMEOUT_MS);

    const applyPortalResult = (portal: string) => {
      clearPortalDeadline();
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
    const fetchRoleFallback = (reason: PortalErrorKind) => {
      api
        .get<{ role?: string }>("/api/me/role")
        .then((res) => {
          if (cancelled || portalTimedOut) return;
          if (res.error || !res.data?.role) {
            const status = (res.error as { status?: number } | undefined)?.status;
            if (status === 401 || status === 403) {
              enterError("unauthorized");
              return;
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
            authFlowBreadcrumb("provider_index.portal_fallback_role_ok", {
              role: res.data.role,
              portal: derived,
            });
          }
          applyPortalResult(derived);
        })
        .catch(() => {
          if (!cancelled && !portalTimedOut) enterError(reason);
        });
    };

    const fetchPortal = (attempt: number) => {
      api
        .get<{ portal?: string; role?: string }>("/api/me/portal")
        .then((res) => {
          if (cancelled || portalTimedOut) return;
          // Critical: on 401/empty data, do NOT default to "customer" — iOS often fires this
          // before the Bearer session is ready, which falsely showed Wrong app for providers.
          if (res.error) {
            const status = (res.error as { status?: number }).status;
            if ((status === 401 || status === 403) && attempt < 4) {
              setTimeout(() => fetchPortal(attempt + 1), 350 * (attempt + 1));
              return;
            }
            if (isSentryEnabled()) {
              captureAuthMessage("provider_index_portal_exhausted", "warning", {
                status: status ?? null,
                attempts: attempt + 1,
              });
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
          if (!cancelled && !portalTimedOut) fetchRoleFallback("network");
        });
    };

    const t = setTimeout(() => {
      if (cancelled) return;
      fetchPortal(0);
    }, PROFILE_CHECK_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(t);
      clearPortalDeadline();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session?.user?.id, portalRetryKey]);

  // Phase 2: profile check (only when portal is ok)
  const runProfileCheck = (isRetry: boolean) => {
    setProfileLoadError(false);
    setCheckingProfile(true);
    api.get<{ id: string }>("/api/provider/profile").then((res) => {
      if (res.data?.id) {
        setHasProfile(true);
        setCheckingProfile(false);
        setProfileLoadError(false);
        return;
      }

      const err = (res as { error?: { status?: number; code?: string } }).error;
      const status = err?.status;
      const code = err?.code;
      const isNotFound = status === 404 || code === "NOT_FOUND";
      const isAuthError = status === 401 || status === 403;

      if (isNotFound) {
        setHasProfile(false);
        setCheckingProfile(false);
        setProfileLoadError(false);
        return;
      }

      if (isAuthError && !isRetry && retryCountRef.current < 1) {
        retryCountRef.current += 1;
        profileRetryTimeoutRef.current = setTimeout(() => runProfileCheck(true), AUTH_RETRY_DELAY_MS);
        return;
      }

      // Non-404, non-retryable error (5xx, rate limit, malformed response, etc.).
      // Show retry UI instead of sending to onboarding — the provider profile may well exist.
      setHasProfile(null);
      setProfileLoadError(true);
      setCheckingProfile(false);
    }).catch((e) => {
      // Network/throw error — show retry UI; do NOT route to onboarding.
      setHasProfile(null);
      setProfileLoadError(true);
      setCheckingProfile(false);
    });
  };

  useEffect(() => {
    if (portalState !== "ok" || !session) return;

    let cancelled = false;
    setCheckingProfile(true);
    setProfileLoadError(false);
    retryCountRef.current = 0;

    const timeoutId = setTimeout(() => {
      if (cancelled) return;
      setCheckingProfile(false);
      setHasProfile(null);
      setProfileLoadError(true); // show retry UI
    }, PROFILE_TIMEOUT_MS);

    const t = setTimeout(() => {
      if (cancelled) return;
      runProfileCheck(false);
    }, PROFILE_CHECK_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(t);
      clearTimeout(timeoutId);
      if (profileRetryTimeoutRef.current) {
        clearTimeout(profileRetryTimeoutRef.current);
        profileRetryTimeoutRef.current = null;
      }
    };
    // runProfileCheck is intentionally omitted to avoid re-running on every identity change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portalState, session?.user?.id]);

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
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.white }}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ marginTop: 16, fontSize: 16, color: Colors.gray[600] }}>Loading…</Text>
      </View>
    );
  }

  // 2. No session after auth resolved → go to login.
  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  // 3. Session present but portal check not yet started or in progress.
  if (portalState === "idle" || portalState === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.white }}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ marginTop: 16, fontSize: 16, color: Colors.gray[600] }}>Loading…</Text>
      </View>
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
            runProfileCheck(false);
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
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.white }}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ marginTop: 16, fontSize: 16, color: Colors.gray[600] }}>Loading…</Text>
      </View>
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

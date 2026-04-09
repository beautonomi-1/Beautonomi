import { useEffect, useState, useRef } from "react";
import { Redirect } from "expo-router";
import { View, Text, ActivityIndicator, TouchableOpacity } from "react-native";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { WrongAppScreen } from "@/components/WrongAppScreen";
import { Colors } from "@/constants/colors";
import { APP_URL, isScreenshotMode } from "@/config/public-env";
import { getCachedPortal, setCachedPortal, clearPortalCache } from "@/lib/portal-cache";
import { isSentryEnabled, setAuthFlowTags, setAuthGateContext } from "@/lib/sentry";

const PROFILE_CHECK_DELAY_MS = 400;
const AUTH_RETRY_DELAY_MS = 600;
const PORTAL_TIMEOUT_MS = 12 * 1000; // 12s – avoid infinite loading
const PROFILE_TIMEOUT_MS = 12 * 1000; // 12s – avoid infinite loading

export default function Index() {
  const { session, loading, signOut } = useAuth();
  const [portalState, setPortalState] = useState<"idle" | "loading" | "wrong_app" | "ok">("idle");
  const [wrongPortal, setWrongPortal] = useState<string | null>(null);
  const [checkingProfile, setCheckingProfile] = useState(false);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [profileLoadError, setProfileLoadError] = useState(false); // timeout or network
  const retryCountRef = useRef(0);
  const profileRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Phase 1: portal check (is this user a provider?)
  useEffect(() => {
    if (loading) return;
    if (!session) return;
    // When APP_URL is missing, proceed as "ok" so profile check can use relative API
    if (!APP_URL?.trim()) {
      setPortalState("ok");
      return;
    }

    const uid = session.user.id;
    const cached = getCachedPortal(uid);
    if (cached === "customer" || cached === "admin") {
      setWrongPortal(cached);
      setPortalState("wrong_app");
      return;
    }
    if (cached === "provider" || cached === "provider_onboarding") {
      setPortalState("ok");
      return;
    }

    let cancelled = false;
    /** After timeout we assume provider; ignore late /api/me/portal responses so they can't flip to wrong_app. */
    let portalTimedOut = false;
    setPortalState("loading");

    const timeoutId = setTimeout(() => {
      if (cancelled) return;
      portalTimedOut = true;
      setPortalState("ok"); // assume provider so user isn't stuck
    }, PORTAL_TIMEOUT_MS);

    const applyPortalResult = (portal: string) => {
      setCachedPortal(uid, portal);
      if (portal === "customer" || portal === "admin") {
        setWrongPortal(portal);
        setPortalState("wrong_app");
      } else {
        setPortalState("ok");
      }
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
            setPortalState("ok");
            return;
          }
          const portal = res.data?.portal;
          if (!portal) {
            setPortalState("ok");
            return;
          }
          applyPortalResult(portal);
        })
        .catch(() => {
          if (!cancelled && !portalTimedOut) setPortalState("ok");
        });
    };

    const t = setTimeout(() => {
      if (cancelled) return;
      fetchPortal(0);
    }, PROFILE_CHECK_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(t);
      clearTimeout(timeoutId);
    };
  }, [loading, session?.user?.id]);

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

  return <Redirect href="/(app)/(tabs)/dashboard" />;
}

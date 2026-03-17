import { useEffect, useState, useRef } from "react";
import { Redirect } from "expo-router";
import { View, Text, ActivityIndicator, TouchableOpacity } from "react-native";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { WrongAppScreen } from "@/components/WrongAppScreen";
import { Colors } from "@/constants/colors";
import { APP_URL } from "@/config/public-env";

const PORTAL_CACHE_MS = 10 * 60 * 1000; // 10 minutes
const PROFILE_CHECK_DELAY_MS = 400;
const AUTH_RETRY_DELAY_MS = 600;
const PORTAL_TIMEOUT_MS = 12 * 1000; // 12s – avoid infinite loading
const PROFILE_TIMEOUT_MS = 12 * 1000; // 12s – avoid infinite loading

let portalCache: { portal: string; ts: number } | null = null;

function getCachedPortal(): string | null {
  if (portalCache && Date.now() - portalCache.ts < PORTAL_CACHE_MS) {
    return portalCache.portal;
  }
  portalCache = null;
  return null;
}

function setCachedPortal(portal: string) {
  portalCache = { portal, ts: Date.now() };
}

export default function Index() {
  const { session, loading, signOut } = useAuth();
  const [portalState, setPortalState] = useState<"idle" | "loading" | "wrong_app" | "ok">("idle");
  const [wrongPortal, setWrongPortal] = useState<string | null>(null);
  const [checkingProfile, setCheckingProfile] = useState(false);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [profileLoadError, setProfileLoadError] = useState(false); // timeout or network
  const retryCountRef = useRef(0);

  // Phase 1: portal check (is this user a provider?)
  useEffect(() => {
    if (loading) return;
    if (!session) return;
    // When APP_URL is missing, proceed as "ok" so profile check can use relative API
    if (!APP_URL?.trim()) {
      setPortalState("ok");
      return;
    }

    const cached = getCachedPortal();
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
    setPortalState("loading");

    const timeoutId = setTimeout(() => {
      if (cancelled) return;
      setPortalState("ok"); // assume provider so user isn't stuck
    }, PORTAL_TIMEOUT_MS);

    const t = setTimeout(() => {
      api
        .get<{ portal?: string }>("/api/me/portal")
        .then((res) => {
          if (cancelled) return;
          const portal = res.data?.portal ?? "customer";
          setCachedPortal(portal);
          if (portal === "customer" || portal === "admin") {
            setWrongPortal(portal);
            setPortalState("wrong_app");
          } else {
            setPortalState("ok");
          }
        })
        .catch(() => {
          if (!cancelled) setPortalState("ok");
        });
    }, PROFILE_CHECK_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(t);
      clearTimeout(timeoutId);
    };
  }, [session, loading]);

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
        setTimeout(() => runProfileCheck(true), AUTH_RETRY_DELAY_MS);
        return;
      }

      setHasProfile(false);
      setCheckingProfile(false);
    }).catch(() => {
      setHasProfile(false);
      setCheckingProfile(false);
      setProfileLoadError(true);
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
    };
    // runProfileCheck is intentionally omitted to avoid re-running on every identity change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portalState, session?.user?.id]);

  // Not logged in: redirect to login immediately (don't show Loading…)
  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  // Auth still resolving
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.white }}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ marginTop: 16, fontSize: 16, color: Colors.gray[600] }}>Loading…</Text>
      </View>
    );
  }

  // Portal check in progress
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
          portalCache = null;
          signOut();
        }}
      />
    );
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

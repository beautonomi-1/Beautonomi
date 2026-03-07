import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { View, Text, ActivityIndicator } from "react-native";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { WrongAppScreen } from "@/components/WrongAppScreen";
import { APP_URL } from "@/config/public-env";

const PORTAL_CACHE_MS = 10 * 60 * 1000; // 10 minutes
const PORTAL_CHECK_DELAY_MS = 400;
const PROFILE_COMPLETION_DELAY_MS = 300;
const PROFILE_COMPLETION_TIMEOUT_MS = 8000;

type PortalState = "idle" | "loading" | "customer" | "wrong_app";

/** Profile completion API response (GET /api/me/profile-completion) */
type ProfileCompletionItem = { id: string; completed: boolean; required?: boolean };
type ProfileCompletion = {
  checklistItems?: ProfileCompletionItem[];
  percentage?: number;
};

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

function hasIncompleteRequired(data: ProfileCompletion | null): boolean {
  const items = data?.checklistItems ?? [];
  return items.some((item) => item.required === true && !item.completed);
}

export default function Index() {
  const { session, loading, signOut } = useAuth();
  const [portalState, setPortalState] = useState<PortalState>("idle");
  const [wrongPortal, setWrongPortal] = useState<string | null>(null);
  const [profileState, setProfileState] = useState<"idle" | "loading" | "complete" | "incomplete" | "error">("idle");

  useEffect(() => {
    if (loading || !session || !APP_URL?.trim()) {
      if (!loading && session && !APP_URL?.trim()) {
        setPortalState("customer");
      }
      return;
    }

    const cached = getCachedPortal();
    if (cached === "customer") {
      setPortalState("customer");
      return;
    }
    if (cached === "provider" || cached === "admin") {
      setPortalState("wrong_app");
      setWrongPortal(cached);
      return;
    }

    let cancelled = false;
    setPortalState("loading");

    const t = setTimeout(() => {
      api
        .get<{ portal?: string }>("/api/me/portal")
        .then((res) => {
          if (cancelled) return;
          const portal = res.data?.portal ?? "customer";
          setCachedPortal(portal);
          if (portal === "provider" || portal === "admin") {
            setWrongPortal(portal);
            setPortalState("wrong_app");
          } else {
            setPortalState("customer");
          }
        })
        .catch(() => {
          if (!cancelled) setPortalState("customer");
        });
    }, PORTAL_CHECK_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [session, loading]);

  // Phase 2: profile completion (only when portal is customer)
  useEffect(() => {
    if (portalState !== "customer" || !session || !APP_URL?.trim()) return;

    let cancelled = false;
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
          const data = res.data ?? null;
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
  }, [portalState, session]);

  if (loading || (session && portalState === "idle") || portalState === "loading") {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#fff",
          minHeight: 400,
        }}
      >
        <ActivityIndicator size="large" color="#4B5563" />
        <Text style={{ marginTop: 16, fontSize: 16, color: "#4B5563" }}>Loading…</Text>
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
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

  // Profile completion loading
  if (portalState === "customer" && (profileState === "idle" || profileState === "loading")) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#fff",
          minHeight: 400,
        }}
      >
        <ActivityIndicator size="large" color="#4B5563" />
        <Text style={{ marginTop: 16, fontSize: 16, color: "#4B5563" }}>Loading…</Text>
      </View>
    );
  }

  // Profile completion error: don't block, go to home; user can complete from profile
  if (portalState === "customer" && profileState === "error") {
    return <Redirect href="/(app)/(tabs)/home" />;
  }

  // Required profile items incomplete (e.g. email not verified) → nudge to complete
  if (portalState === "customer" && profileState === "incomplete") {
    return <Redirect href="/(app)/account-settings/personal-info" />;
  }

  return <Redirect href="/(app)/(tabs)/home" />;
}

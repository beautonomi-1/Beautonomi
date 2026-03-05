import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { View, Text, ActivityIndicator } from "react-native";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { WrongAppScreen } from "@/components/WrongAppScreen";
import { APP_URL } from "@/config/public-env";

const PORTAL_CACHE_MS = 10 * 60 * 1000; // 10 minutes
const PORTAL_CHECK_DELAY_MS = 400;

type PortalState = "idle" | "loading" | "customer" | "wrong_app";

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
  const [portalState, setPortalState] = useState<PortalState>("idle");
  const [wrongPortal, setWrongPortal] = useState<string | null>(null);

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

  if (loading || (session && portalState === "idle") || portalState === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" />
        <Text className="mt-4 text-base text-gray-600">Loading…</Text>
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

  return <Redirect href="/(app)/(tabs)/home" />;
}

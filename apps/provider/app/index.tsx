import { useEffect, useState, useRef } from "react";
import { Redirect } from "expo-router";
import { View, Text, ActivityIndicator } from "react-native";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { Colors } from "@/constants/colors";

/** Minimal delay so Supabase session/token is available before first API call (mobile). */
const PROFILE_CHECK_DELAY_MS = 400;
const AUTH_RETRY_DELAY_MS = 600;

export default function Index() {
  const { session, loading } = useAuth();
  const [checkingProfile, setCheckingProfile] = useState(false);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const retryCountRef = useRef(0);

  useEffect(() => {
    if (loading || !session) return;

    let cancelled = false;
    setCheckingProfile(true);
    retryCountRef.current = 0;

    function checkProfile(isRetry: boolean) {
      api.get<{ id: string }>("/api/provider/profile").then((res) => {
        if (cancelled) return;

        if (res.data?.id) {
          setHasProfile(true);
          setCheckingProfile(false);
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
          return;
        }

        if (isAuthError && !isRetry && retryCountRef.current < 1) {
          retryCountRef.current += 1;
          setTimeout(() => {
            if (!cancelled) checkProfile(true);
          }, AUTH_RETRY_DELAY_MS);
          return;
        }

        setHasProfile(false);
        setCheckingProfile(false);
      }).catch(() => {
        if (cancelled) return;
        setHasProfile(false);
        setCheckingProfile(false);
      });
    }

    const t = setTimeout(() => {
      if (!cancelled) checkProfile(false);
    }, PROFILE_CHECK_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [session, loading]);

  // #region agent log
  if (!loading && session !== undefined) {
    fetch("http://127.0.0.1:7243/ingest/89f3cdbd-444d-401b-9bce-c59a37625210", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "index.tsx:gate",
        message: "index gate",
        data: { hasSession: !!session, hasProfile, checkingProfile },
        timestamp: Date.now(),
        hypothesisId: "C",
      }),
    }).catch(() => {});
  }
  // #endregion

  if (loading || checkingProfile || (session && hasProfile === null)) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text className="mt-4 text-base text-gray-600">Loading…</Text>
      </View>
    );
  }

  if (!session) {
    console.log("[AUTH] index redirect → login (no session)");
    return <Redirect href="/(auth)/login" />;
  }

  if (hasProfile === false) {
    console.log("[AUTH] index redirect → onboarding (no profile)");
    return <Redirect href={"/(app)/onboarding" as never} />;
  }

  console.log("[AUTH] index redirect → dashboard (session + profile)");
  return <Redirect href="/(app)/(tabs)/dashboard" />;
}

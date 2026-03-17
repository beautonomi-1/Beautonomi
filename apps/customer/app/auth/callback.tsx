/**
 * OAuth callback – receives redirect from OAuth providers.
 * Web: reads code/tokens from window.location, sets session, redirects to home.
 * Native: reads code/error from URL params (deep link), exchanges code, then redirects to (app)/(tabs)/home so user stays in app.
 */
import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, Platform } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase/client";
import { Colors } from "@/constants/colors";

export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function handleCallback() {
      const isWeb = Platform.OS === "web" && typeof window !== "undefined";

      let error: string | null = null;
      let code: string | null = null;
      let accessToken: string | null = null;
      let refreshToken: string | null = null;

      if (isWeb) {
        const urlObj = new URL(window.location.href);
        error = urlObj.searchParams.get("error") ?? params.error ?? null;
        code = urlObj.searchParams.get("code") ?? params.code ?? null;
        const hash = urlObj.hash.slice(1);
        if (hash) {
          const hashParams = new URLSearchParams(hash);
          accessToken = hashParams.get("access_token");
          refreshToken = hashParams.get("refresh_token");
        }
      } else {
        error = params.error ?? null;
        code = params.code ?? null;
      }

      if (error) {
        if (!cancelled) {
          setStatus("error");
          setErrorMsg(isWeb ? (new URL(window.location.href).searchParams.get("error_description") || error) : (params.error_description || error));
        }
        return;
      }

      try {
        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError) throw sessionError;
        } else if (code) {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        } else {
          throw new Error("No authentication data received");
        }

        if (!cancelled) {
          if (isWeb && window.opener) {
            window.close();
          } else if (isWeb) {
            router.replace("/(app)/(tabs)/home");
          } else {
            router.replace("/(app)/(tabs)/home");
          }
        }
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setErrorMsg(err instanceof Error ? err.message : String(err));
        }
      }
    }

    handleCallback();
    return () => {
      cancelled = true;
    };
  }, [router, params.code, params.error, params.error_description]);

  if (status === "error") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ marginBottom: 16, textAlign: "center", fontSize: 16, color: "#DC2626" }}>{errorMsg}</Text>
        <Text style={{ color: Colors.primary, textDecorationLine: "underline" }} onPress={() => router.replace("/(auth)/login")}>Back to login</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={{ marginTop: 16, color: Colors.gray[600] }}>Completing sign in...</Text>
    </View>
  );
}

/**
 * OAuth callback handler - receives redirect from OAuth providers (Google, Apple).
 * Used when provider app runs on web. Extracts tokens/code from URL, sets session,
 * then redirects to app root (which sends user to onboarding or dashboard).
 */
import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, Platform } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase/client";
import { Colors } from "@/constants/colors";

export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; error?: string }>();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function handleCallback() {
      if (Platform.OS !== "web" || typeof window === "undefined") {
        if (!cancelled) router.replace("/(auth)/login" as never);
        return;
      }

      const url = window.location.href;
      const urlObj = new URL(url);

      const error = urlObj.searchParams.get("error") ?? params.error;
      if (error) {
        if (!cancelled) {
          setStatus("error");
          setErrorMsg(
            urlObj.searchParams.get("error_description") || error
          );
        }
        return;
      }

      const code = urlObj.searchParams.get("code") ?? params.code;
      const tokenHash = urlObj.searchParams.get("token_hash");
      const type = urlObj.searchParams.get("type") ?? undefined;
      const hash = urlObj.hash.slice(1);
      const hashParams = new URLSearchParams(hash);
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

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
        } else if (tokenHash && (type === "signup" || type === "recovery" || type === "email")) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as "signup" | "recovery" | "email",
          });
          if (verifyError) throw verifyError;
        } else {
          throw new Error("No authentication data received");
        }

        await supabase.auth.updateUser({
          data: { role: "provider_owner" },
        });

        if (!cancelled) {
          if (window.opener) {
            window.close();
          } else {
            router.replace("/" as never);
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
  }, [router, params.code, params.error]);

  if (status === "error") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ marginBottom: 16, textAlign: "center", fontSize: 16, color: Colors.error }}>
          {errorMsg}
        </Text>
        <Text
          style={{ color: Colors.primary, textDecorationLine: "underline" }}
          onPress={() => router.replace("/(auth)/login" as never)}
        >
          Back to login
        </Text>
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

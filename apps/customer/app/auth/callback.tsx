/**
 * OAuth callback handler - receives redirect from OAuth providers.
 * Extracts tokens/code from URL, sets session, then redirects to app.
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
        if (!cancelled) router.replace("/(auth)/login");
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
        } else {
          throw new Error("No authentication data received");
        }

        if (!cancelled) {
          if (window.opener) {
            window.close();
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
  }, [router, params.code, params.error]);

  if (status === "error") {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <Text className="mb-4 text-center text-base text-red-600">
          {errorMsg}
        </Text>
        <Text
          className="text-primary underline"
          onPress={() => router.replace("/(auth)/login")}
        >
          Back to login
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center">
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text className="mt-4 text-gray-600">Completing sign in...</Text>
    </View>
  );
}

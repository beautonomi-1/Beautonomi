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
  const params = useLocalSearchParams<{ code?: string; error?: string; error_description?: string; token_hash?: string; type?: string }>();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function handleCallback() {
      const isWeb = Platform.OS === "web" && typeof window !== "undefined";

      let error: string | null = null;
      let code: string | null = null;
      let tokenHash: string | null = null;
      let type: string | undefined;
      let accessToken: string | null = null;
      let refreshToken: string | null = null;

      if (isWeb) {
        const urlObj = new URL(window.location.href);
        error = urlObj.searchParams.get("error") ?? params.error ?? null;
        code = urlObj.searchParams.get("code") ?? params.code ?? null;
        tokenHash = urlObj.searchParams.get("token_hash") ?? params.token_hash ?? null;
        type = urlObj.searchParams.get("type") ?? params.type ?? undefined;
        const hash = urlObj.hash.slice(1);
        if (hash) {
          const hashParams = new URLSearchParams(hash);
          accessToken = hashParams.get("access_token");
          refreshToken = hashParams.get("refresh_token");
        }
      } else {
        error = params.error ?? null;
        code = params.code ?? null;
        tokenHash = params.token_hash ?? null;
        type = params.type;
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
        } else if (tokenHash && (type === "signup" || type === "recovery" || type === "email")) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as "signup" | "recovery" | "email",
          });
          if (verifyError) throw verifyError;
        } else {
          throw new Error("No authentication data received");
        }

        await supabase.auth.getSession();

        if (!cancelled) {
          if (isWeb && window.opener) {
            window.close();
          } else {
            // Root index runs portal check, customer onboarding, and profile completion before home.
            router.replace("/");
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
  }, [router, params.code, params.error, params.error_description, params.token_hash, params.type]);

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

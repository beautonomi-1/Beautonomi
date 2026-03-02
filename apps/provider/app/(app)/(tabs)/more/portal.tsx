/**
 * In-app portal: loads a provider web path inside a WebView with session.
 * Not linked from any menu; kept for direct/deep links only. All provider features use native screens.
 * Route: (app)/(tabs)/more/portal?path=/provider/...
 */
import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, TouchableOpacity } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { WebView } from "react-native-webview";
import * as Haptics from "expo-haptics";
import { getWebProviderBaseUrl } from "@/lib/web-url";
import { supabase } from "@/lib/supabase/client";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";

const DEFAULT_PATH = "/provider/dashboard";

export default function PortalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ path?: string; title?: string }>();
  const pathParam = params.path ? decodeURIComponent(params.path) : DEFAULT_PATH;
  const path = pathParam.startsWith("/") ? pathParam : `/${pathParam}`;
  const displayTitle = params.title ? decodeURIComponent(params.title) : "Settings";
  const [sessionTokens, setSessionTokens] = useState<{ access_token: string; refresh_token: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (cancelled) return;
      if (session?.access_token && session.refresh_token) {
        setSessionTokens({ access_token: session.access_token, refresh_token: session.refresh_token });
      } else {
        setLoadError("Not signed in");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const baseUrl = getWebProviderBaseUrl();
  const embedPath = "/provider/embed";
  const pathQuery = encodeURIComponent(path);
  const hash = sessionTokens
    ? "#" + encodeURIComponent(JSON.stringify({
        access_token: sessionTokens.access_token,
        refresh_token: sessionTokens.refresh_token,
      }))
    : "";
  const uri = `${baseUrl}${embedPath}?path=${pathQuery}${hash}`;

  if (loadError) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={displayTitle} onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-center text-gray-600">{loadError}</Text>
          <TouchableOpacity onPress={() => router.back()} className="mt-4 rounded-xl bg-gray-900 px-6 py-3">
            <Text className="font-medium text-white">Go back</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  if (!sessionTokens) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={displayTitle} onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#FF0077" />
          <Text className="mt-3 text-gray-500">Loading…</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title={displayTitle}
        onBack={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.back();
        }}
      />
      <View className="flex-1">
        <WebView
          source={{ uri }}
          style={{ flex: 1 }}
          onError={(e) => setLoadError(e.nativeEvent.description || "Failed to load")}
          onHttpError={(e) => setLoadError(`HTTP ${e.nativeEvent.statusCode}`)}
          startInLoadingState
          renderLoading={() => (
            <View className="absolute inset-0 items-center justify-center bg-white">
              <ActivityIndicator size="large" color="#FF0077" />
              <Text className="mt-3 text-gray-500">Loading…</Text>
            </View>
          )}
        />
      </View>
    </ScreenContainer>
  );
}

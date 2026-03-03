/**
 * In-app browser: loads a URL (e.g. invoice PDF, Stripe page) in a WebView
 * so providers never leave the app.
 * Route: (app)/(tabs)/more/in-app-browser?url=<encoded>&title=Invoice
 */
import { useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { WebView } from "react-native-webview";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";

export default function InAppBrowserScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ url?: string; title?: string }>();
  const rawUrl = params.url ? decodeURIComponent(params.url) : "";
  const displayTitle = params.title ? decodeURIComponent(params.title) : "Document";
  const [loadError, setLoadError] = useState<string | null>(null);

  const isValid =
    rawUrl.startsWith("https://") || rawUrl.startsWith("http://");

  if (!rawUrl || !isValid) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={displayTitle} onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-center text-gray-600">Invalid or missing link.</Text>
          <Text
            className="mt-4 text-center text-sm font-medium text-indigo-600"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
          >
            Go back
          </Text>
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
          source={{ uri: rawUrl }}
          style={{ flex: 1 }}
          onError={(e) => setLoadError(e.nativeEvent.description || "Failed to load")}
          onHttpError={(e) => setLoadError(`HTTP ${e.nativeEvent.statusCode}`)}
          startInLoadingState
          renderLoading={() => (
            <View className="absolute inset-0 items-center justify-center bg-white">
              <ActivityIndicator size="large" color="#6366f1" />
              <Text className="mt-3 text-gray-500">Loading…</Text>
            </View>
          )}
        />
        {loadError ? (
          <View className="absolute inset-0 items-center justify-center bg-white p-6">
            <Text className="text-center text-gray-600">{loadError}</Text>
            <Text
              className="mt-4 text-center text-sm font-medium text-indigo-600"
              onPress={() => router.back()}
            >
              Go back
            </Text>
          </View>
        ) : null}
      </View>
    </ScreenContainer>
  );
}

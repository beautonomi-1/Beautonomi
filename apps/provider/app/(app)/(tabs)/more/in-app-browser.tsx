/**
 * In-app browser: loads a URL (e.g. invoice PDF, Stripe page) in a WebView
 * so providers never leave the app.
 * Route: (app)/(tabs)/more/in-app-browser?url=<encoded>&title=Invoice
 */
import { useState } from "react";
import { View, Text, ActivityIndicator, TouchableOpacity } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { WebView } from "react-native-webview";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Colors } from "@/constants/colors";

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
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Text style={{ textAlign: "center", color: Colors.gray[600] }}>Invalid or missing link.</Text>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            style={{ marginTop: 16 }}
          >
            <Text style={{ textAlign: "center", fontSize: 14, fontWeight: "500", color: "#4f46e6" }}>Go back</Text>
          </TouchableOpacity>
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
      <View style={{ flex: 1 }}>
        <WebView
          source={{ uri: rawUrl }}
          style={{ flex: 1 }}
          onError={(e) => setLoadError(e.nativeEvent.description || "Failed to load")}
          onHttpError={(e) => setLoadError(`HTTP ${e.nativeEvent.statusCode}`)}
          startInLoadingState
          renderLoading={() => (
            <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: Colors.white }}>
              <ActivityIndicator size="large" color="#6366f1" />
              <Text style={{ marginTop: 12, color: Colors.gray[500] }}>Loading…</Text>
            </View>
          )}
        />
        {loadError ? (
          <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: Colors.white, padding: 24 }}>
            <Text style={{ textAlign: "center", color: Colors.gray[600] }}>{loadError}</Text>
            <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
              <Text style={{ textAlign: "center", fontSize: 14, fontWeight: "500", color: "#4f46e6" }}>Go back</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </ScreenContainer>
  );
}

/**
 * In-app WebView for provider dashboard / payment / receipt URLs.
 * Route: (app)/(tabs)/more/in-app-browser?url=<encoded>&title=<encoded>
 */
import { useCallback, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Linking,
} from "react-native";
import { WebView } from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";

export default function InAppBrowserScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ url?: string; title?: string }>();
  const rawUrl = params.url ? decodeURIComponent(params.url) : "";
  const displayTitle = params.title ? decodeURIComponent(params.title) : "Web";

  const [error, setError] = useState<string | null>(null);

  const onWebMessage = useCallback(
    (e: WebViewMessageEvent) => {
      try {
        const raw = JSON.parse(e.nativeEvent.data) as { type?: string };
        // Ads budget: `/provider/settings/ads/payment-return` posts BEAUTONOMI_ADS_PAYMENT_DONE.
        // Provider subscription / renew / initialize-payment: Paystack callback lands on
        // `/provider/subscription?payment_success=true&in_app=1`, which posts `subscription_success`
        // (see apps/web `provider/subscription/page.tsx`) so the shell can pop back to native UI.
        if (raw?.type === "BEAUTONOMI_ADS_PAYMENT_DONE" || raw?.type === "subscription_success") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.back();
        }
      } catch {
        // ignore non-JSON messages
      }
    },
    [router],
  );

  const isValid =
    rawUrl.startsWith("https://") || rawUrl.startsWith("http://");

  const openExternally = useCallback(() => {
    if (!rawUrl || !isValid) return;
    Linking.openURL(rawUrl).catch(() => {});
  }, [rawUrl, isValid]);

  if (!rawUrl || !isValid) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            style={styles.backBtn}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Ionicons name="arrow-back" size={24} color={Colors.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {displayTitle}
          </Text>
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Invalid or missing link.</Text>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            style={styles.backLink}
          >
            <Text style={styles.backLinkText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Expo web: no native WebView parity for all flows; open system browser.
  if (Platform.OS === "web") {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            style={styles.backBtn}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Ionicons name="arrow-back" size={24} color={Colors.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {displayTitle}
          </Text>
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorText}>
            Opening in browser (web preview). Use the iOS or Android app for an in-app view.
          </Text>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              openExternally();
            }}
            style={styles.backLink}
          >
            <Text style={styles.backLinkText}>Open link</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={styles.backBtn}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={24} color={Colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {displayTitle}
        </Text>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            openExternally();
          }}
          style={styles.openExternalBtn}
          accessibilityLabel="Open in external browser"
          accessibilityRole="button"
        >
          <Ionicons name="open-outline" size={22} color={Colors.gray[600]} />
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            onPress={() => {
              setError(null);
            }}
            style={styles.backLink}
          >
            <Text style={styles.backLinkText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <WebView
          source={{ uri: rawUrl }}
          style={styles.webview}
          originWhitelist={["https://*", "http://*", "provider://*"]}
          onShouldStartLoadWithRequest={(request) => {
            const u = request.url;
            if (u.startsWith("provider://")) {
              Linking.openURL(u).catch(() => {});
              return false;
            }
            return true;
          }}
          onMessage={onWebMessage}
          onError={() => {
            setError("Could not load this page.");
          }}
          onHttpError={() => {
            setError("This page returned an error.");
          }}
          startInLoadingState
          setSupportMultipleWindows={false}
          allowsBackForwardNavigationGestures
          renderLoading={() => (
            <View style={styles.webviewLoading}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  webview: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.gray[200],
  },
  backBtn: { padding: 8, marginRight: 4 },
  openExternalBtn: { padding: 8, marginLeft: 4 },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    color: Colors.gray[900],
  },
  webviewLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.white,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorText: { textAlign: "center", color: Colors.gray[600] },
  backLink: { marginTop: 16 },
  backLinkText: { fontSize: 14, fontWeight: "500", color: Colors.primary },
});

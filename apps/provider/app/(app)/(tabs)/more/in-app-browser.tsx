/**
 * In-app browser: loads a URL (e.g. Paystack payment, onboarding, invoices) in a WebView
 * so providers stay in the app and remain authenticated.
 * Route: (app)/(tabs)/more/in-app-browser?url=<encoded>&title=...
 */
import { useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Linking,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/colors";

export default function InAppBrowserScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ url?: string; title?: string }>();
  const rawUrl = params.url ? decodeURIComponent(params.url) : "";
  const displayTitle = params.title ? decodeURIComponent(params.title) : "Link";
  const [loadError, setLoadError] = useState<string | null>(null);

  const isValid =
    rawUrl.startsWith("https://") || rawUrl.startsWith("http://");

  if (!rawUrl || !isValid) {
    return (
      <View style={styles.container}>
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
      </View>
    );
  }

  return (
    <View style={styles.container}>
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
      <View style={styles.webviewWrap}>
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
          onMessage={(e) => {
            try {
              const msg = JSON.parse(e.nativeEvent.data);
              if (msg?.type === "subscription_success") {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                router.replace("/(app)/(tabs)/more/settings/subscription" as never);
              }
            } catch {
              // ignore
            }
          }}
          onError={(e) =>
            setLoadError(e.nativeEvent.description || "Failed to load")
          }
          onHttpError={(e) =>
            setLoadError(`HTTP ${e.nativeEvent.statusCode}`)
          }
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Loading…</Text>
            </View>
          )}
        />
        {loadError ? (
          <View style={styles.loadError}>
            <Text style={styles.errorText}>{loadError}</Text>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backLink}
            >
              <Text style={styles.backLinkText}>Go back</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.gray[200],
  },
  backBtn: { padding: 8, marginRight: 8 },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    color: Colors.gray[900],
  },
  webviewWrap: { flex: 1 },
  webview: { flex: 1 },
  loading: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.white,
  },
  loadingText: { marginTop: 12, color: Colors.gray[500] },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadError: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.white,
    padding: 24,
  },
  errorText: { textAlign: "center", color: Colors.gray[600] },
  backLink: { marginTop: 16 },
  backLinkText: { fontSize: 14, fontWeight: "500", color: Colors.primary },
});

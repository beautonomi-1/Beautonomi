import { useState } from "react";
import { View, ActivityIndicator, StyleSheet, Text, TouchableOpacity } from "react-native";
import { WebView } from "react-native-webview";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { getBackendUrl, inAppWebViewUserAgentProps } from "@/config/public-env";
import { Colors } from "@/constants/colors";

export default function AboutScreen() {
  useScreenTracking("About Us");
  const base = getBackendUrl().replace(/\/$/, "");
  const [webError, setWebError] = useState<string | null>(null);

  return (
    <View style={styles.container}>
      {base ? (
        webError ? (
          <View style={styles.errorWrap}>
            <Text style={styles.errorText}>{webError}</Text>
            <TouchableOpacity onPress={() => setWebError(null)} accessibilityRole="button">
              <Text style={styles.retry}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <WebView
            source={{ uri: `${base}/about` }}
            {...inAppWebViewUserAgentProps()}
            style={styles.webview}
            startInLoadingState
            onError={(e: any) => setWebError(e.nativeEvent.description || "Could not load page")}
            onHttpError={(e: any) => setWebError(`HTTP ${e.nativeEvent.statusCode}`)}
            renderLoading={() => (
              <View style={styles.loading}>
                <ActivityIndicator size="large" color={Colors.primary} />
              </View>
            )}
          />
        )
      ) : (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>App URL is not configured.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  webview: { flex: 1 },
  loading: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  errorWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  errorText: { color: Colors.gray[600], textAlign: "center" },
  retry: { marginTop: 16, color: Colors.primary, fontWeight: "600", fontSize: 16 },
});

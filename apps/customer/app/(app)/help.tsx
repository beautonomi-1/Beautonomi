import { View, ActivityIndicator, StyleSheet, TouchableOpacity, Text } from "react-native";
import { WebView } from "react-native-webview";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { APP_URL } from "@/config/public-env";
import { Colors } from "@/constants/colors";

export default function HelpScreen() {
  useScreenTracking("Help");
  const router = useRouter();
  const base = APP_URL.replace(/\/$/, "");

  const openInAppBrowser = (path: string, title: string) => {
    router.push({
      pathname: "/(app)/in-app-browser",
      params: { url: encodeURIComponent(`${base}${path}`), title: encodeURIComponent(title) },
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.quickLinks}>
        <TouchableOpacity
          style={[styles.quickLink, styles.quickLinkFirst]}
          onPress={() => openInAppBrowser("/help/my-tickets", "My tickets")}
          accessibilityLabel="View my support tickets"
          accessibilityRole="button"
        >
          <Ionicons name="ticket-outline" size={20} color={Colors.primary} style={styles.quickLinkIcon} />
          <Text style={styles.quickLinkText}>My tickets</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickLink}
          onPress={() => openInAppBrowser("/help/submit-ticket", "Submit ticket")}
          accessibilityLabel="Submit a support ticket"
          accessibilityRole="button"
        >
          <Ionicons name="create-outline" size={20} color={Colors.primary} style={styles.quickLinkIcon} />
          <Text style={styles.quickLinkText}>Submit ticket</Text>
        </TouchableOpacity>
      </View>
      <WebView
        source={{ uri: `${APP_URL}/help` }}
        style={styles.webview}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  quickLinks: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
    backgroundColor: Colors.gray[50],
  },
  quickLink: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  quickLinkFirst: {
    marginRight: 12,
  },
  quickLinkIcon: { marginRight: 6 },
  quickLinkText: { fontSize: 14, fontWeight: "500", color: Colors.gray[800] },
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
});

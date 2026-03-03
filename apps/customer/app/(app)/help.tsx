import { View, ActivityIndicator, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { APP_URL } from "@/config/public-env";
import { Colors } from "@/constants/colors";

export default function HelpScreen() {
  useScreenTracking("Help");

  return (
    <View style={styles.container}>
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

/**
 * In-app PDF preview for receipts/invoices downloaded to the local cache.
 * Route: (app)/(tabs)/more/pdf-preview?uri=<encoded file:// uri>&title=<encoded>
 *
 * iOS has no Downloads folder, so "Download" pushes here instead of saving
 * silently: the user sees the PDF immediately and can tap Share to save it
 * to Files, AirDrop it, print it, etc. with the correct PDF UTI/mime type.
 */
import { useCallback, useState } from "react";
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { sharePdf } from "@/lib/pdf-file";

export default function PdfPreviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ uri?: string; title?: string }>();
  const rawUri = params.uri ? decodeURIComponent(params.uri) : "";
  const displayTitle = params.title ? decodeURIComponent(params.title) : "Document";

  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const onShare = useCallback(async () => {
    if (!rawUri || sharing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSharing(true);
    try {
      await sharePdf(rawUri, { dialogTitle: displayTitle });
    } finally {
      setSharing(false);
    }
  }, [rawUri, sharing, displayTitle]);

  const isValid = rawUri.length > 0;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={styles.headerBtn}
          accessibilityLabel="Close"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={24} color={Colors.gray[700]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {displayTitle}
        </Text>
        <TouchableOpacity
          onPress={onShare}
          style={styles.headerBtn}
          disabled={!isValid || sharing}
          accessibilityLabel="Share or save PDF"
          accessibilityRole="button"
        >
          {sharing ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Ionicons name="share-outline" size={22} color={isValid ? Colors.primary : Colors.gray[300]} />
          )}
        </TouchableOpacity>
      </View>

      {!isValid ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>This PDF could not be found.</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)} style={styles.retryLink}>
            <Text style={styles.retryLinkText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <WebView
          source={{ uri: rawUri }}
          style={styles.webview}
          originWhitelist={["file://*"]}
          onError={() => setError("Could not display this PDF.")}
          startInLoadingState
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
  headerBtn: { padding: 8, minWidth: 40, alignItems: "center" },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    color: Colors.gray[900],
    textAlign: "center",
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
  retryLink: { marginTop: 16 },
  retryLinkText: { fontSize: 14, fontWeight: "500", color: Colors.primary },
});

/**
 * External link launcher (legacy route compatibility).
 * Opens target URLs in the device browser instead of in-app WebView.
 * Route: (app)/(tabs)/more/in-app-browser?url=<encoded>&title=...
 */
import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import * as Linking from "expo-linking";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/colors";

export default function InAppBrowserScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ url?: string; title?: string }>();
  const rawUrl = params.url ? decodeURIComponent(params.url) : "";
  const displayTitle = params.title ? decodeURIComponent(params.title) : "Link";
  const [openError, setOpenError] = useState<string | null>(null);
  const [opening, setOpening] = useState(true);
  const hasOpened = useRef(false);

  const isValid =
    rawUrl.startsWith("https://") || rawUrl.startsWith("http://");

  useEffect(() => {
    if (!isValid || !rawUrl || hasOpened.current) {
      setOpening(false);
      return;
    }
    hasOpened.current = true;
    Linking.openURL(rawUrl)
      .catch((error) => {
        setOpenError(error instanceof Error ? error.message : "Failed to open link");
      })
      .finally(() => {
        setOpening(false);
      });
  }, [isValid, rawUrl]);

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
      <View style={styles.centered}>
        {opening ? (
          <>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Opening in browser…</Text>
          </>
        ) : (
          <>
            <Text style={styles.errorText}>
              {openError ?? "Opened in your browser. Return to continue in the app."}
            </Text>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                Linking.openURL(rawUrl).catch(() => {});
              }}
              style={styles.backLink}
            >
              <Text style={styles.backLinkText}>Open again</Text>
            </TouchableOpacity>
          </>
        )}
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
  loadingText: { marginTop: 12, color: Colors.gray[500] },
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

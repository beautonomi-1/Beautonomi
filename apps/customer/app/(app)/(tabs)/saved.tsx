import { Redirect } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { View, Text, StyleSheet } from "react-native";
import { ScreenFrame } from "@/components/ScreenFrame";
import { SCREEN_PADDING, TAB_CONTENT_PADDING_BOTTOM } from "@/constants/layout";

/**
 * Saved / Wishlists – parity with web /explore/saved and /account-settings/wishlists.
 * Redirects to account-settings/wishlists when authenticated.
 */
export default function SavedScreen() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <ScreenFrame paddingBottom={TAB_CONTENT_PADDING_BOTTOM}>
        <View style={styles.center}>
          <Text style={styles.loading}>Loading...</Text>
        </View>
      </ScreenFrame>
    );
  }

  if (!user) {
    return (
      <ScreenFrame paddingBottom={TAB_CONTENT_PADDING_BOTTOM}>
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Saved</Text>
          <Text style={styles.emptySubtitle}>
            Sign in to see your saved providers and posts
          </Text>
        </View>
      </ScreenFrame>
    );
  }

  return <Redirect href="/(app)/account-settings/wishlists" />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: SCREEN_PADDING,
  },
  loading: {
    fontSize: 16,
    color: "#6b7280",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
  },
});

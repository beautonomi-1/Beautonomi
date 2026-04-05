import { useAuth } from "@/providers/AuthProvider";
import { View, Text, StyleSheet } from "react-native";
import { ScreenFrame } from "@/components/ScreenFrame";
import { useResponsive } from "@/hooks/useResponsive";
import { TAB_CONTENT_PADDING_BOTTOM } from "@/constants/layout";
import { SavedTabContent } from "@/components/SavedTabContent";

/**
 * Saved tab: saved posts + providers + products (unified with wishlists).
 * When authenticated, shows tabbed content; when not, shows sign-in message.
 */
export default function SavedScreen() {
  const { user, loading } = useAuth();
  const { contentPadding } = useResponsive();

  if (loading) {
    return (
      <ScreenFrame paddingBottom={TAB_CONTENT_PADDING_BOTTOM}>
        <View style={[styles.center, { paddingHorizontal: contentPadding }]}>
          <Text style={styles.loading}>Loading...</Text>
        </View>
      </ScreenFrame>
    );
  }

  if (!user) {
    return (
      <ScreenFrame paddingBottom={TAB_CONTENT_PADDING_BOTTOM}>
        <View style={[styles.center, { paddingHorizontal: contentPadding }]}>
          <Text style={styles.emptyTitle}>Saved</Text>
          <Text style={styles.emptySubtitle}>
            Sign in to see your saved providers, products and posts
          </Text>
        </View>
      </ScreenFrame>
    );
  }

  return (
    <SavedTabContent
      showRecentlyViewed={false}
      screenName="Saved"
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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

import { useAuth } from "@/providers/AuthProvider";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useResponsive } from "@/hooks/useResponsive";
import { useTabContentPaddingBottom } from "@/hooks/useTabContentPaddingBottom";
import { SavedTabContent } from "@/components/SavedTabContent";
import { Colors } from "@/constants/colors";
import { pushCustomerLogin } from "@/lib/guest-browse-policy";

/**
 * Saved tab: saved posts + providers + products (unified with wishlists).
 * When authenticated, shows tabbed content; when not, shows sign-in message.
 */
export default function SavedScreen() {
  const { user, loading } = useAuth();
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const tabScrollPaddingBottom = useTabContentPaddingBottom();

  const tabletConstraint = isTablet
    ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const }
    : {};

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.gray[50] }}>
        <SafeAreaView edges={["top"]} style={{ backgroundColor: Colors.gray[50] }} />
        <View style={[tabletConstraint, { flex: 1, backgroundColor: Colors.white, paddingBottom: tabScrollPaddingBottom }]}>
          <View style={{ paddingHorizontal: contentPadding, paddingTop: contentPadding, paddingBottom: 8 }}>
            <Text style={styles.screenTitle}>Saved</Text>
          </View>
          <View style={[styles.center, { paddingHorizontal: contentPadding, flex: 1 }]}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loading}>Loading...</Text>
          </View>
        </View>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.gray[50] }}>
        <SafeAreaView edges={["top"]} style={{ backgroundColor: Colors.gray[50] }} />
        <View style={[tabletConstraint, { flex: 1, backgroundColor: Colors.white, paddingBottom: tabScrollPaddingBottom }]}>
          <View style={{ paddingHorizontal: contentPadding, paddingTop: contentPadding, paddingBottom: 8 }}>
            <Text style={styles.screenTitle}>Saved</Text>
          </View>
          <View style={[styles.center, { paddingHorizontal: contentPadding, flex: 1 }]}>
            <Text style={styles.emptyTitle}>Nothing saved yet</Text>
            <Text style={styles.emptySubtitle}>
              Sign in to see your saved providers, products and posts
            </Text>
            <TouchableOpacity
              onPress={() => pushCustomerLogin("/(app)/(tabs)/saved")}
              style={{
                marginTop: 24,
                backgroundColor: Colors.primary,
                paddingHorizontal: 32,
                paddingVertical: 16,
                borderRadius: 12,
              }}
              accessibilityRole="button"
            >
              <Text style={{ color: Colors.white, fontWeight: "600" }}>Log in</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
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
  screenTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.gray[900],
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loading: {
    fontSize: 16,
    color: Colors.gray[600],
    marginTop: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.gray[900],
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.gray[600],
    textAlign: "center",
    maxWidth: 320,
  },
});

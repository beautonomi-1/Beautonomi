import { useLocalSearchParams, router } from "expo-router";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useAuth } from "@/providers/AuthProvider";
import { SavedTabContent } from "@/components/SavedTabContent";
import { ScreenFrame } from "@/components/ScreenFrame";
import { useResponsive } from "@/hooks/useResponsive";
import { useTabContentPaddingBottom } from "@/hooks/useTabContentPaddingBottom";
import { Colors } from "@/constants/colors";
import { useTranslation } from "@beautonomi/i18n";

export default function WishlistsScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const initialTab = params.tab === "posts" ? "posts" : "providers";
  const { user, loading } = useAuth();
  const { contentPadding } = useResponsive();
  const tabScrollPaddingBottom = useTabContentPaddingBottom();
  const { t } = useTranslation();
  const wl = (key: string) => t(`customer.mobile.screens.wishlists.${key}`) as string;

  if (loading) {
    return (
      <ScreenFrame paddingBottom={tabScrollPaddingBottom}>
        <View style={[styles.center, { paddingHorizontal: contentPadding }]}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </ScreenFrame>
    );
  }

  if (!user) {
    return (
      <ScreenFrame paddingBottom={tabScrollPaddingBottom}>
        <View style={[styles.center, { paddingHorizontal: contentPadding }]}>
          <Text style={styles.title}>{wl("title")}</Text>
          <Text style={styles.subtitle}>{wl("subtitle")}</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() =>
              router.push({
                pathname: "/(auth)/login",
                params: { return_to: "/(app)/account-settings/wishlists" },
              } as never)
            }
          >
            <Text style={styles.buttonText}>{wl("signInCta")}</Text>
          </TouchableOpacity>
        </View>
      </ScreenFrame>
    );
  }

  return (
    <SavedTabContent
      showRecentlyViewed={true}
      screenName="Wishlists"
      initialTab={initialTab}
      layoutVariant="stack"
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 20,
  },
  button: {
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});

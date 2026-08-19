import { Stack, router } from "expo-router";
import { TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useTranslation } from "@beautonomi/i18n";
import { useThemedColors } from "@/hooks/useThemedColors";

export default function AccountSettingsLayout() {
  const { t } = useTranslation();
  const themed = useThemedColors();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackTitle: t("common.back"),
        headerTintColor: Colors.primary,
        headerTitleStyle: { fontWeight: "600", color: themed.textPrimary },
        headerStyle: { backgroundColor: themed.surface },
        contentStyle: { backgroundColor: themed.surface },
        headerLeft: () => (
          <TouchableOpacity
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace("/(app)/(tabs)/profile");
              }
            }}
            style={{ marginLeft: Platform.OS === "ios" ? 8 : 0, padding: 8 }}
            accessibilityLabel={t("common.back")}
            accessibilityRole="button"
          >
            <Ionicons name="arrow-back" size={24} color={Colors.primary} />
          </TouchableOpacity>
        ),
      }}
    >
      <Stack.Screen name="index" options={{ title: t("customer.account") }} />
      <Stack.Screen name="personal-info" options={{ title: t("customer.accountSettings.personalInfoTitle") }} />
      <Stack.Screen name="profile-details" options={{ title: t("customer.accountSettings.profileDetailsTitle") }} />
      <Stack.Screen name="login-and-security" options={{ title: t("customer.accountSettings.loginSecurityTitle") }} />
      <Stack.Screen name="identity-verification" options={{ title: t("customer.accountSettings.identityVerificationTitle") }} />
      <Stack.Screen name="payments" options={{ title: t("customer.accountSettings.stackPayments") }} />
      <Stack.Screen name="wallet" options={{ title: t("customer.wallet") }} />
      <Stack.Screen name="taxes" options={{ title: t("customer.accountSettings.taxDocumentsTitle") }} />
      <Stack.Screen name="addresses" options={{ title: t("customer.accountSettings.savedAddressesTitle") }} />
      <Stack.Screen name="bookings" options={{ title: t("customer.accountSettings.bookingsMenuTitle") }} />
      <Stack.Screen name="notifications" options={{ title: t("customer.notifications") }} />
      <Stack.Screen name="preferences" options={{ title: t("customer.accountSettings.languageRegionTitle") }} />
      <Stack.Screen name="privacy-and-sharing" options={{ title: t("customer.accountSettings.privacySharingTitle") }} />
      <Stack.Screen name="emergency-contact" options={{ headerShown: false }} />
      <Stack.Screen name="content-and-safety-controls" options={{ headerShown: false }} />
      <Stack.Screen name="blocked-users" options={{ headerShown: false }} />
      <Stack.Screen name="deactivate-account" options={{ title: t("customer.accountSettings.stackDeactivateAccount") }} />
      <Stack.Screen name="delete-account" options={{ title: t("customer.accountSettings.stackDeleteAccount") }} />
      <Stack.Screen name="referrals" options={{ title: t("customer.referrals") }} />
      <Stack.Screen name="loyalty" options={{ title: t("customer.accountSettings.stackLoyaltyPoints") }} />
      <Stack.Screen name="reviews" options={{ title: t("customer.accountSettings.reviewsTitle") }} />
      <Stack.Screen name="wishlists" options={{ title: t("customer.accountSettings.savedWishlistsTitle") }} />
      <Stack.Screen name="messages" options={{ title: t("customer.messages") }} />
      <Stack.Screen name="waitlist" options={{ title: t("customer.accountSettings.waitlistTitle") }} />
      <Stack.Screen name="recurring-bookings" options={{ title: t("customer.accountSettings.recurringBookingsTitle") }} />
      <Stack.Screen name="custom-requests" options={{ title: t("customer.customRequests") }} />
      <Stack.Screen name="membership" options={{ title: t("customer.accountSettings.membershipTitle") }} />
      <Stack.Screen name="language" options={{ title: t("customer.accountSettings.stackLanguage") }} />
    </Stack>
  );
}

import { Stack } from "expo-router";
import { Colors } from "@/constants/colors";

export default function AccountSettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackTitle: "Back",
        headerTintColor: Colors.primary,
        headerTitleStyle: { fontWeight: "600" },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Account" }} />
      <Stack.Screen name="personal-info" options={{ title: "Personal Info" }} />
      <Stack.Screen name="login-and-security" options={{ title: "Login & Security" }} />
      <Stack.Screen name="payments" options={{ title: "Payments" }} />
      <Stack.Screen name="wallet" options={{ title: "Wallet" }} />
      <Stack.Screen name="taxes" options={{ title: "Tax Documents" }} />
      <Stack.Screen name="addresses" options={{ title: "Saved Addresses" }} />
      <Stack.Screen name="bookings" options={{ title: "Bookings" }} />
      <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
      <Stack.Screen name="preferences" options={{ title: "Language & Region" }} />
      <Stack.Screen name="privacy-and-sharing" options={{ title: "Privacy & Sharing" }} />
      <Stack.Screen name="referrals" options={{ title: "Referrals" }} />
      <Stack.Screen name="loyalty" options={{ title: "Loyalty Points" }} />
      <Stack.Screen name="reviews" options={{ title: "My Reviews" }} />
      <Stack.Screen name="wishlists" options={{ title: "Saved & Wishlists" }} />
      <Stack.Screen name="messages" options={{ title: "Messages" }} />
      <Stack.Screen name="waitlist" options={{ title: "Waitlist" }} />
      <Stack.Screen name="recurring-bookings" options={{ title: "Recurring Bookings" }} />
      <Stack.Screen name="custom-requests" options={{ title: "Custom Requests" }} />
      <Stack.Screen name="membership" options={{ title: "Membership" }} />
      <Stack.Screen name="business" options={{ title: "Business Account" }} />
      <Stack.Screen name="language" options={{ title: "Language" }} />
    </Stack>
  );
}

import { View, Platform, TouchableOpacity } from "react-native";
import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { RoleGate } from "@/components/RoleGate";
import { SingularLinkHandler } from "@/components/SingularLinkHandler";
import { Colors } from "@/constants/colors";

export default function AppLayout() {
  const headerBackFallback = () => (
    <TouchableOpacity
      onPress={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace("/(app)/(tabs)/profile");
        }
      }}
      style={{ marginLeft: Platform.OS === "ios" ? 8 : 0, padding: 8 }}
      accessibilityLabel="Back"
      accessibilityRole="button"
    >
      <Ionicons name="arrow-back" size={24} color={Colors.primary} />
    </TouchableOpacity>
  );

  return (
    <RoleGate>
      <SingularLinkHandler />
      <View style={{ flex: 1, ...(Platform.OS === "web" ? { width: "100%" } : {}) }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { flex: 1, ...(Platform.OS === "web" ? { width: "100%" } : {}) },
          headerLeft: headerBackFallback,
          headerTintColor: Colors.primary,
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="account-settings" options={{ headerShown: false }} />
        <Stack.Screen name="partner-profile" options={{ headerShown: false }} />
        <Stack.Screen name="book" options={{ headerShown: false }} />
        <Stack.Screen name="book-checkout" options={{ headerShown: false }} />
        <Stack.Screen name="chat" options={{ headerShown: true, title: "Chat" }} />
        <Stack.Screen name="explore-post" options={{ headerShown: true, title: "Post" }} />
        <Stack.Screen name="custom-request-create" options={{ headerShown: true, title: "Custom Request" }} />
        <Stack.Screen name="notifications" options={{ headerShown: true, title: "Notifications" }} />
        <Stack.Screen name="booking-detail" options={{ headerShown: true, title: "Booking" }} />
        <Stack.Screen name="help" options={{ headerShown: true, title: "Help" }} />
        <Stack.Screen name="about" options={{ headerShown: true, title: "About Us" }} />
        <Stack.Screen name="gift-card-purchase" options={{ headerShown: true, title: "Buy Gift Card" }} />
        <Stack.Screen name="review-write" options={{ headerShown: true, title: "Write Review" }} />
        <Stack.Screen name="cart" options={{ headerShown: true, title: "Cart" }} />
        <Stack.Screen name="product-detail" options={{ headerShown: true, title: "Product" }} />
        <Stack.Screen name="product-orders" options={{ headerShown: true, title: "My Orders" }} />
        <Stack.Screen name="my-returns" options={{ headerShown: true, title: "Returns & Refunds" }} />
        <Stack.Screen name="on-demand/waiting" options={{ headerShown: true, title: "Finding a provider" }} />
        <Stack.Screen name="on-demand/result" options={{ headerShown: true, title: "Result" }} />
        <Stack.Screen name="more-providers/[section]" options={{ headerShown: true }} />
      </Stack>
      </View>
    </RoleGate>
  );
}

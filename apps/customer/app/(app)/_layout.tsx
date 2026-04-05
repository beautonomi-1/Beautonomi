import { useEffect, useRef } from "react";
import { View, Platform, TouchableOpacity, Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { RoleGate } from "@/components/RoleGate";
import { AccountStatusGuard } from "@/components/AccountStatusGuard";
import { SingularLinkHandler } from "@/components/SingularLinkHandler";
import MaintenanceGate from "@/components/MaintenanceGate";
import { NativePermissionsOnboarding } from "@/components/NativePermissionsOnboarding";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { ONBOARDING_DONE_KEY } from "./onboarding/index";
import { isScreenshotMode } from "@/config/public-env";

const CUSTOMER_SCHEME = "customer://";
const REFERRAL_REF_KEY = "referral_ref";

function handleCustomerDeepLink(url: string): boolean {
  if (!url.startsWith(CUSTOMER_SCHEME)) return false;
  const path = url.slice(CUSTOMER_SCHEME.length).split("?")[0];
  const query = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
  const params = Object.fromEntries(new URLSearchParams(query));

  if (path === "booking-detail" && params.id) {
    router.replace({ pathname: "/(app)/booking-detail", params: { id: params.id } } as never);
    return true;
  }
  if (path === "account-settings/custom-requests") {
    router.replace("/(app)/account-settings/custom-requests" as never);
    return true;
  }
  if (path === "profile") {
    router.replace("/(app)/(tabs)/profile" as never);
    return true;
  }
  if (path === "bookings") {
    router.replace("/(app)/(tabs)/bookings" as never);
    return true;
  }
  if (path === "product-orders") {
    router.replace("/(app)/product-orders" as never);
    return true;
  }
  if (path === "signup" && params.ref) {
    router.replace({ pathname: "/(auth)/signup", params: { ref: params.ref } } as never);
    return true;
  }
  if (path === "book/continue" && params.hold_id) {
    router.replace({
      pathname: "/(app)/book/continue",
      params: {
        hold_id: params.hold_id,
        ...(params.reschedule_booking_id ? { reschedule_booking_id: params.reschedule_booking_id } : {}),
      },
    } as never);
    return true;
  }
  if (path.startsWith("book/l/")) {
    const slug = path.slice("book/l/".length).split("/")[0];
    if (slug) {
      router.replace({ pathname: "/(app)/book/l/[linkSlug]", params: { linkSlug: slug } } as never);
      return true;
    }
  }
  return false;
}

export default function AppLayout() {
  const { session } = useAuth();
  // Prevent the onboarding guard from running more than once per app session
  // (avoids spurious redirects during background token refreshes).
  const onboardingChecked = useRef(false);

  // Attach pending referral after login (e.g. post email verification)
  useEffect(() => {
    if (!session?.access_token) return;
    AsyncStorage.getItem(REFERRAL_REF_KEY).then((ref) => {
      if (!ref?.trim()) return;
      api
        .post("/api/me/referrals/attach", { referral_code: ref.trim() })
        .finally(() => AsyncStorage.removeItem(REFERRAL_REF_KEY));
    });
  }, [session?.access_token]);

  // Reset the check flag when the user signs out so the next login re-checks.
  useEffect(() => {
    if (!session?.access_token) {
      onboardingChecked.current = false;
    }
  }, [session?.access_token]);

  // Customer onboarding guard — redirect new users to the wizard on first login.
  // Runs once per session (guarded by onboardingChecked ref).
  // Strategy:
  //   1. If AsyncStorage flag is set → already done, skip.
  //   2. Otherwise, ask the server (handles cross-device: user finished on web).
  //      If the server says done → heal the local flag and skip.
  //      If the server says not done → redirect to onboarding.
  useEffect(() => {
    if (isScreenshotMode()) return;
    if (!session?.access_token) return;
    if (onboardingChecked.current) return;
    onboardingChecked.current = true;

    AsyncStorage.getItem(ONBOARDING_DONE_KEY).then(async (done) => {
      if (done === "1") return; // Already confirmed locally — no redirect needed

      try {
        const res = await api.get<{ completed: boolean }>("/api/me/onboarding/complete");
        if (!res.error && res?.data?.completed) {
          // Heal local flag so future launches skip the network call
          await AsyncStorage.setItem(ONBOARDING_DONE_KEY, "1");
          return;
        }
      } catch {
        // Network unavailable — fall through to redirect so the wizard can run
        // and re-attempt completion; this is safe because the wizard is idempotent.
      }

      router.replace("/(app)/onboarding");
    });
  }, [session?.access_token]);
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

  useEffect(() => {
    if (Platform.OS === "web") return;
    Linking.getInitialURL().then((url) => {
      if (url) handleCustomerDeepLink(url);
    });
    const sub = Linking.addEventListener("url", ({ url }) => handleCustomerDeepLink(url));
    return () => sub.remove();
  }, []);

  return (
    <MaintenanceGate>
    <AccountStatusGuard>
    <RoleGate>
      <SingularLinkHandler />
      <NativePermissionsOnboarding />
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
        <Stack.Screen name="explore-collection/[id]" options={{ headerShown: true, title: "Board" }} />
        <Stack.Screen name="custom-request-create" options={{ headerShown: true, title: "Custom Request" }} />
        <Stack.Screen name="notifications" options={{ headerShown: true, title: "Notifications" }} />
        <Stack.Screen name="booking-detail" options={{ headerShown: true, title: "Booking" }} />
        <Stack.Screen name="help" options={{ headerShown: true, title: "Help" }} />
        <Stack.Screen name="about" options={{ headerShown: true, title: "About Us" }} />
        <Stack.Screen name="gift-card-purchase" options={{ headerShown: true, title: "Buy Gift Card" }} />
        <Stack.Screen name="review-write" options={{ headerShown: true, title: "Write Review" }} />
        <Stack.Screen name="cart" options={{ headerShown: true, title: "Cart" }} />
        <Stack.Screen name="product-detail" options={{ headerShown: true, title: "Product" }} />
        <Stack.Screen name="shop" options={{ headerShown: true, title: "Shop" }} />
        <Stack.Screen name="product-checkout" options={{ headerShown: true, title: "Checkout" }} />
        <Stack.Screen name="product-order-detail" options={{ headerShown: true, title: "Order Details" }} />
        <Stack.Screen name="request-return" options={{ headerShown: true, title: "Request Return" }} />
        <Stack.Screen name="product-orders" options={{ headerShown: true, title: "My Orders" }} />
        <Stack.Screen name="my-returns" options={{ headerShown: true, title: "Returns & Refunds" }} />
        <Stack.Screen name="on-demand/waiting" options={{ headerShown: true, title: "Finding a provider" }} />
        <Stack.Screen name="on-demand/result" options={{ headerShown: true, title: "Result" }} />
        <Stack.Screen name="more-providers/[section]" options={{ headerShown: true }} />
        <Stack.Screen name="in-app-browser" options={{ headerShown: false, title: "Link" }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false, animation: "fade" }} />
      </Stack>
      </View>
    </RoleGate>
    </AccountStatusGuard>
    </MaintenanceGate>
  );
}

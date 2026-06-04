import { useEffect, useRef, useCallback } from "react";
import { View, Platform, TouchableOpacity, Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack, router, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { RoleGate } from "@/components/RoleGate";
import { AccountStatusGuard } from "@/components/AccountStatusGuard";
import { SingularLinkHandler } from "@/components/SingularLinkHandler";
import MaintenanceGate from "@/components/MaintenanceGate";
import { NativePermissionsOnboarding } from "@/components/NativePermissionsOnboarding";
import { BiometricSetupPrompt } from "@/components/BiometricSetupPrompt";
import { BiometricGate } from "@/components/BiometricGate";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { onboardingDoneKey } from "./onboarding/index";
import { isScreenshotMode } from "@/config/public-env";
import {
  authFlowBreadcrumb,
  isSentryEnabled,
  setAuthFlowTags,
} from "@/lib/sentry";
import { useTranslation } from "@beautonomi/i18n";

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
  if (path === "account-settings/payments") {
    router.replace("/(app)/account-settings/payments" as never);
    return true;
  }
  if (path.startsWith("support-tickets/")) {
    const ticketId = path.slice("support-tickets/".length).split("/")[0]?.trim();
    if (ticketId) {
      router.replace({
        pathname: "/(app)/(tabs)/support-tickets/[id]",
        params: { id: ticketId },
      } as never);
      return true;
    }
  }
  if (path === "support-tickets") {
    if (params.id) {
      router.replace({
        pathname: "/(app)/(tabs)/support-tickets/[id]",
        params: { id: params.id },
      } as never);
    } else {
      router.replace("/(app)/(tabs)/support-tickets" as never);
    }
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
  const { t } = useTranslation();
  const stackTitle = useCallback((key: string) => t(`customer.mobile.stackTitles.${key}`), [t]);
  const { session, loading: authLoading } = useAuth();

  /** Stable per signed-in user — do NOT key on access_token (it changes on refresh and caused repeat router.replace / “swiping” on iOS). */
  const userId = session?.user?.id ?? null;
  /** Last user id we ran the onboarding deep-link guard for (token refresh keeps same id → no re-run). */
  const onboardingGuardRanForUserId = useRef<string | null>(null);
  /** Ref holds the current pathname so async callbacks can read it without a stale closure. */
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    if (!authLoading && !session) {
      // Preserve an in-flight express booking link (e.g. a provider's custom
      // shortlink opened while signed out) so it resumes after authentication
      // instead of being dropped on the floor. Native booking still requires a
      // session, so we round-trip through login and replay the deep link.
      const current = pathnameRef.current || "";
      const isBookingDeepLink =
        current.startsWith("/book/l/") || current.startsWith("/book");
      const returnTo = isBookingDeepLink ? `/(app)${current}` : undefined;
      router.replace(
        returnTo
          ? ({ pathname: "/(auth)/login", params: { return_to: returnTo } } as never)
          : ("/(auth)/login" as never),
      );
    }
  }, [authLoading, session]);

  // Attach pending referral after login (e.g. post email verification)
  useEffect(() => {
    if (!userId) return;
    AsyncStorage.getItem(REFERRAL_REF_KEY).then((ref) => {
      if (!ref?.trim()) return;
      api
        .post("/api/me/referrals/attach", { referral_code: ref.trim() })
        .finally(() => AsyncStorage.removeItem(REFERRAL_REF_KEY));
    });
  }, [userId]);

  // Customer onboarding guard — deep links into (app) without visiting root index.
  // Must match app/index.tsx: only force onboarding when the server says completed === false.
  // On API error, do not navigate (root index already sent the user home; fighting it caused stack thrash / swipe loops on tablet).
  // pathnameRef check: skip replace when already on /onboarding — prevents the double-replace animation
  // that occurred when root index also redirected here (login → root "/" → onboarding → guard fires too → swipe loop).
  useEffect(() => {
    if (isScreenshotMode()) return;
    if (!userId) {
      onboardingGuardRanForUserId.current = null;
      return;
    }
    if (onboardingGuardRanForUserId.current === userId) return;
    onboardingGuardRanForUserId.current = userId;

    let cancelled = false;

    AsyncStorage.getItem(onboardingDoneKey(userId)).then(async (done) => {
      if (cancelled) return;
      if (done === "1") return;

      try {
        const res = await api.get<{ completed: boolean }>("/api/me/onboarding/complete");
        if (cancelled) return;
        if (!res.error && res.data?.completed === true) {
          await AsyncStorage.setItem(onboardingDoneKey(userId), "1");
          return;
        }
        if (!res.error && res.data?.completed === false) {
          // Guard against double-replace: root index may have already navigated here.
          if (!pathnameRef.current?.includes("/onboarding")) {
            router.replace("/(app)/onboarding");
          }
          return;
        }
      } catch {
        // Same as error path — do not replace route
      }
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);
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

  const sentryLayoutLoggedForUser = useRef<string | null>(null);
  useEffect(() => {
    if (!session?.user?.id) {
      sentryLayoutLoggedForUser.current = null;
      return;
    }
    if (!isSentryEnabled()) return;
    const uid = session.user.id;
    if (sentryLayoutLoggedForUser.current === uid) return;
    sentryLayoutLoggedForUser.current = uid;
    setAuthFlowTags({ route_group: "(app)" });
    authFlowBreadcrumb("authenticated_app_layout", { phase: "mount" });
  }, [session?.user?.id]);

  return (
    <MaintenanceGate>
    <BiometricGate>
    <AccountStatusGuard>
    <RoleGate>
      <SingularLinkHandler />
      <NativePermissionsOnboarding />
      <BiometricSetupPrompt />
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
        <Stack.Screen name="chat" options={{ headerShown: true, title: stackTitle("chat") }} />
        <Stack.Screen name="explore-post" options={{ headerShown: true, title: stackTitle("post") }} />
        <Stack.Screen name="explore-collection/[id]" options={{ headerShown: true, title: stackTitle("board") }} />
        <Stack.Screen name="custom-request-create" options={{ headerShown: true, title: stackTitle("customRequest") }} />
        <Stack.Screen name="notifications" options={{ headerShown: true, title: stackTitle("notifications") }} />
        <Stack.Screen name="announcements" options={{ headerShown: true, title: stackTitle("announcements") }} />
        <Stack.Screen name="booking-detail" options={{ headerShown: true, title: stackTitle("booking") }} />
        <Stack.Screen name="help" options={{ headerShown: true, title: stackTitle("help") }} />
        <Stack.Screen name="privacy-policy" options={{ headerShown: true, title: stackTitle("privacyPolicy") }} />
        <Stack.Screen name="terms-of-service" options={{ headerShown: true, title: stackTitle("termsOfService") }} />
        <Stack.Screen name="contact-support" options={{ headerShown: false }} />
        <Stack.Screen name="about" options={{ headerShown: true, title: stackTitle("aboutUs") }} />
        <Stack.Screen name="gift-card-purchase" options={{ headerShown: true, title: stackTitle("buyGiftCard") }} />
        <Stack.Screen name="review-write" options={{ headerShown: true, title: stackTitle("writeReview") }} />
        <Stack.Screen name="product-detail" options={{ headerShown: true, title: stackTitle("product") }} />
        <Stack.Screen name="product-order-detail" options={{ headerShown: true, title: stackTitle("orderDetails") }} />
        <Stack.Screen name="request-return" options={{ headerShown: true, title: stackTitle("requestReturn") }} />
        <Stack.Screen name="product-orders" options={{ headerShown: true, title: stackTitle("myOrders") }} />
        <Stack.Screen name="my-returns" options={{ headerShown: true, title: stackTitle("returnsRefunds") }} />
        <Stack.Screen name="on-demand/waiting" options={{ headerShown: true, title: stackTitle("findingProvider") }} />
        <Stack.Screen name="on-demand/result" options={{ headerShown: true, title: stackTitle("result") }} />
        <Stack.Screen name="more-providers/[section]" options={{ headerShown: true }} />
        <Stack.Screen name="in-app-browser" options={{ headerShown: false, title: stackTitle("link") }} />
        <Stack.Screen name="onboarding/index" options={{ headerShown: false, gestureEnabled: false, animation: "fade" }} />
      </Stack>
      </View>
    </RoleGate>
    </AccountStatusGuard>
    </BiometricGate>
    </MaintenanceGate>
  );
}

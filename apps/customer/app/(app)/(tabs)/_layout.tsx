import { useCallback, useEffect, useState } from "react";
import type { ComponentProps } from "react";
import { Tabs, useFocusEffect } from "expo-router";
import { Platform, TouchableOpacity, View, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors, Shadows } from "@/constants/colors";
import { useTranslation } from "@beautonomi/i18n";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { onCartUpdated } from "@/lib/cart-events";
import { haptic } from "@/lib/haptics";
import { guestCartItemCount, loadGuestCartLines } from "@/lib/guest-cart";
import { authFlowBreadcrumb, isSentryEnabled } from "@/lib/sentry";
import { TAB_BAR_MIN_BOTTOM_INSET, tabBarOuterHeight } from "@/constants/layout";

function fetchCartCount(setCount: (n: number) => void, isUser: boolean) {
  if (!isUser) {
    loadGuestCartLines()
      .then((lines) => setCount(guestCartItemCount(lines)))
      .catch(() => setCount(0));
    return;
  }
  api
    .get<{ items: { quantity?: number }[] }>("/api/me/cart")
    .then((res) => {
      const items = (res.data as { items?: { quantity?: number }[] } | null)?.items;
      const total = Array.isArray(items)
        ? items.reduce(
            (sum, item) => sum + (typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : 1),
            0,
          )
        : 0;
      setCount(total);
    })
    .catch(() => setCount(0));
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { isTablet } = useResponsive();
  const { t } = useTranslation();
  const { user } = useAuth();
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    if (!isSentryEnabled()) return;
    authFlowBreadcrumb("authenticated_tabs_layout_mount", { app: "customer" });
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchCartCount(setCartCount, !!user);
    }, [user]),
  );

  useEffect(() => {
    const unsubscribe = onCartUpdated(() => fetchCartCount(setCartCount, !!user));
    return unsubscribe;
  }, [user]);

  const safeBottom = Math.max(insets.bottom, TAB_BAR_MIN_BOTTOM_INSET);
  const TAB_BAR_HEIGHT = tabBarOuterHeight(insets.bottom);

  const tabsWrapperStyle =
    Platform.OS === "web"
      ? { flex: 1, flexDirection: "column" as const, width: "100%" as const, minHeight: 0 }
      : { flex: 1 };

  return (
    <View nativeID="tabs-root" style={tabsWrapperStyle} collapsable={false}>
      <Tabs
        screenOptions={{
        sceneStyle: {
          flex: 1,
          backgroundColor: Colors.white,
          ...(Platform.OS === "web" ? { width: "100%", paddingBottom: TAB_BAR_HEIGHT } : {}),
        },
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.gray[400],
        tabBarShowLabel: true,
        tabBarItemStyle: {
          minWidth: 64,
          justifyContent: "center",
          alignItems: "center",
        },
        tabBarLabelStyle: {
          // §UI-audit 2026-04: 10px was below the comfortable-legibility
          // floor for tab labels (HIG recommends ~11–12). Bumped to 11
          // which still fits the fixed tab height used across platforms.
          fontSize: 11,
          fontWeight: "600",
          marginBottom: 4,
          textAlign: "center",
        },
        tabBarStyle: {
          flexDirection: "row",
          justifyContent: "space-around",
          alignItems: "center",
          backgroundColor: Colors.white,
          borderTopWidth: 1,
          borderTopColor: Colors.gray[200],
          height: TAB_BAR_HEIGHT,
          minHeight: TAB_BAR_HEIGHT,
          flexShrink: 0,
          paddingTop: 8,
          paddingBottom: safeBottom,
          ...Shadows.tabBar,
          ...(isTablet ? { paddingHorizontal: 40 } : {}),
          // On web, avoid position:fixed (broken with RNW flexbox); keep tab bar in flow at bottom.
          ...(Platform.OS === "web" ? { width: "100%" } : {}),
        },
        tabBarButton: (props) => {
          const { onPress, ...rest } = props;
          const touchableProps = {
            ...rest,
            onPress: (e: Parameters<NonNullable<typeof onPress>>[0]) => {
              haptic.selection();
              onPress?.(e);
            },
            activeOpacity: 0.7,
            delayLongPress: rest.delayLongPress ?? undefined,
            disabled: rest.disabled ?? undefined,
            onBlur: rest.onBlur ?? undefined,
            onFocus: rest.onFocus ?? undefined,
          } as ComponentProps<typeof TouchableOpacity>;
          return <TouchableOpacity {...touchableProps} />;
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t("customer.home"),
          tabBarIcon: ({ focused, color }) => (
            <View style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name={focused ? "home" : "home-outline"} size={24} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t("customer.search"),
          tabBarLabel: t("customer.searchShort"),
          tabBarIcon: ({ focused, color }) => (
            <View style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name={focused ? "search" : "search-outline"} size={24} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: t("customer.bookings"),
          tabBarLabel: t("customer.bookingsShort"),
          tabBarIcon: ({ focused, color }) => (
            <View style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name={focused ? "calendar" : "calendar-outline"} size={24} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: t("customer.cart", "Cart"),
          headerShown: true,
          tabBarIcon: ({ focused, color }) => (
            <View style={{ minWidth: 24, minHeight: 24, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name={focused ? "cart" : "cart-outline"} size={24} color={color} />
              {cartCount > 0 && (
                <View
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -10,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    backgroundColor: "#EF4444",
                    alignItems: "center",
                    justifyContent: "center",
                    paddingHorizontal: 4,
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }} numberOfLines={1}>
                    {cartCount > 99 ? "99+" : cartCount}
                  </Text>
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: t("customer.messages"),
          tabBarIcon: ({ focused, color }) => (
            <View style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name={focused ? "chatbubble" : "chatbubble-outline"} size={24} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("customer.profile"),
          tabBarIcon: ({ focused, color }) => (
            <View style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name={focused ? "person" : "person-outline"} size={24} color={color} />
            </View>
          ),
        }}
      />

      {/* Hidden tabs (reachable from home top nav / deep links) */}
      <Tabs.Screen name="shop" options={{ href: null }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
      <Tabs.Screen name="saved" options={{ href: null }} />
      </Tabs>
    </View>
  );
}

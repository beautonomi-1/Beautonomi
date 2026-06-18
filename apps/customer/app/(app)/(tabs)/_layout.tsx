import { useCallback, useEffect, useMemo, useState, memo } from "react";
import type { ComponentProps } from "react";
import { Tabs, useFocusEffect, useRouter } from "expo-router";
import {
  Platform,
  TouchableOpacity,
  View,
  Text,
  useWindowDimensions,
  InteractionManager,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors, Shadows } from "@/constants/colors";
import {
  tabBarBottomInset,
  tabBarOuterHeight,
  TAB_BAR_LABEL_FONT_SIZE,
  TAB_BAR_LABEL_FONT_SIZE_NARROW,
  TAB_BAR_LABEL_LINE_HEIGHT,
  TAB_BAR_LABEL_LINE_HEIGHT_NARROW,
  TAB_BAR_NARROW_WIDTH_THRESHOLD,
} from "@/constants/layout";
import { useTranslation } from "@beautonomi/i18n";
import { useAuth } from "@/providers/AuthProvider";
import { useNotifications } from "@/providers/NotificationsContext";
import { api } from "@/lib/api-client";
import { onCartUpdated } from "@/lib/cart-events";
import { haptic } from "@/lib/haptics";
import { guestCartItemCount, loadGuestCartLines } from "@/lib/guest-cart";
import { authFlowBreadcrumb, isSentryEnabled } from "@/lib/sentry";

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

const TabIconBox = memo(function TabIconBox({
  name,
  nameOutline,
  focused,
  color,
}: {
  name: keyof typeof Ionicons.glyphMap;
  nameOutline: keyof typeof Ionicons.glyphMap;
  focused: boolean;
  color: string;
}) {
  return (
    <View style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={focused ? name : nameOutline} size={24} color={color} />
    </View>
  );
});

const CartTabIcon = memo(function CartTabIcon({
  focused,
  color,
  cartCount,
}: {
  focused: boolean;
  color: string;
  cartCount: number;
}) {
  return (
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
  );
});

const ChatsTabIcon = memo(function ChatsTabIcon({
  focused,
  color,
  chatUnreadCount,
}: {
  focused: boolean;
  color: string;
  chatUnreadCount: number;
}) {
  return (
    <View style={{ minWidth: 24, minHeight: 24, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={focused ? "chatbubble" : "chatbubble-outline"} size={24} color={color} />
      {chatUnreadCount > 0 && (
        <View
          style={{
            position: "absolute",
            top: -4,
            right: -10,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: Colors.primary,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 4,
          }}
        >
          <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }} numberOfLines={1}>
            {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
          </Text>
        </View>
      )}
    </View>
  );
});

export default function TabsLayout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { isTablet } = useResponsive();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { chatUnreadCount } = useNotifications();
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    if (!isSentryEnabled()) return;
    authFlowBreadcrumb("authenticated_tabs_layout_mount", { app: "customer" });
  }, []);

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        fetchCartCount(setCartCount, !!user);
      });
      return () => task.cancel();
    }, [user]),
  );

  useEffect(() => {
    const unsubscribe = onCartUpdated(() => fetchCartCount(setCartCount, !!user));
    return unsubscribe;
  }, [user]);

  const safeBottom = tabBarBottomInset(insets.bottom);
  const TAB_BAR_HEIGHT = tabBarOuterHeight(insets.bottom);
  const sideInset = Math.max(insets.left, insets.right);
  const isNarrow = windowWidth < TAB_BAR_NARROW_WIDTH_THRESHOLD;
  const labelFontSize = isNarrow ? TAB_BAR_LABEL_FONT_SIZE_NARROW : TAB_BAR_LABEL_FONT_SIZE;
  const labelLineHeight = isNarrow ? TAB_BAR_LABEL_LINE_HEIGHT_NARROW : TAB_BAR_LABEL_LINE_HEIGHT;

  const tabsWrapperStyle =
    Platform.OS === "web"
      ? { flex: 1, flexDirection: "column" as const, width: "100%" as const, minHeight: 0 }
      : { flex: 1 };

  const ensureTabRoot =
    (tabName: string, rootPath: string) =>
    ({ navigation }: { navigation: { getState: () => { routes: { name: string; state?: { index?: number } }[]; index: number } } }) => ({
      tabPress: (e: { preventDefault: () => void }) => {
        const state = navigation.getState();
        const tabRoute = state.routes.find((r) => r.name === tabName);
        const st = tabRoute?.state;
        const alreadyOnTab = state.routes[state.index]?.name === tabName;

        if (!alreadyOnTab) {
          e.preventDefault();
          router.replace(rootPath as never);
          return;
        }

        if (typeof st?.index === "number" && st.index > 0) {
          e.preventDefault();
          router.replace(rootPath as never);
        }
      },
    });

  const screenOptions = useMemo(
    () =>
      ({
        freezeOnBlur: true,
        sceneStyle: {
          flex: 1,
          backgroundColor: Colors.white,
          ...(Platform.OS === "web" ? { width: "100%" as const, paddingBottom: TAB_BAR_HEIGHT } : {}),
        },
      headerShown: false,
      tabBarActiveTintColor: Colors.primary,
      tabBarInactiveTintColor: Colors.gray[400],
      tabBarShowLabel: true,
      tabBarAllowFontScaling: false,
      tabBarItemStyle: {
        flex: 1,
        justifyContent: "center" as const,
        alignItems: "center" as const,
        paddingVertical: 2,
      },
      tabBarLabelStyle: {
        fontSize: labelFontSize,
        lineHeight: labelLineHeight,
        fontWeight: "600" as const,
        marginTop: 2,
        textAlign: "center" as const,
      },
      tabBarStyle: {
        backgroundColor: Colors.white,
        borderTopWidth: 1,
        borderTopColor: Colors.gray[200],
        height: TAB_BAR_HEIGHT,
        minHeight: TAB_BAR_HEIGHT,
        flexShrink: 0,
        paddingTop: 8,
        paddingBottom: safeBottom,
        paddingLeft: sideInset,
        paddingRight: sideInset,
        elevation: 8,
        ...Shadows.tabBar,
        ...(isTablet ? { paddingHorizontal: 40 + sideInset } : {}),
        ...(Platform.OS === "web"
          ? ({
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              width: "100%",
              zIndex: 999,
              boxShadow: "0 -2px 6px rgba(0,0,0,0.06)",
            } as unknown as ViewStyle)
          : {}),
      },
        tabBarButton: (props: any) => {
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
      }) as const,
    [TAB_BAR_HEIGHT, isTablet, labelFontSize, labelLineHeight, safeBottom, sideInset],
  );

  return (
    <View nativeID="tabs-root" style={tabsWrapperStyle} collapsable={false}>
      <Tabs screenOptions={screenOptions}>
        <Tabs.Screen
          name="home"
          options={{
            title: t("customer.home"),
            tabBarIcon: ({ focused, color }) => (
              <TabIconBox name="home" nameOutline="home-outline" focused={focused} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: t("customer.search"),
            tabBarLabel: t("customer.searchShort"),
            tabBarIcon: ({ focused, color }) => (
              <TabIconBox name="search" nameOutline="search-outline" focused={focused} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="bookings"
          options={{
            title: t("customer.bookings"),
            tabBarLabel: t("customer.bookingsShort"),
            tabBarIcon: ({ focused, color }) => (
              <TabIconBox name="calendar" nameOutline="calendar-outline" focused={focused} color={color} />
            ),
          }}
          listeners={ensureTabRoot("bookings", "/(app)/(tabs)/bookings")}
        />
        <Tabs.Screen
          name="cart"
          options={{
            title: t("customer.cart", "Cart"),
            headerShown: true,
            tabBarIcon: ({ focused, color }) => (
              <CartTabIcon focused={focused} color={color} cartCount={cartCount} />
            ),
          }}
          listeners={ensureTabRoot("cart", "/(app)/(tabs)/cart")}
        />
        <Tabs.Screen
          name="chats"
          options={{
            title: t("customer.messages"),
            tabBarLabel: t("customer.messagesShort", "Chats"),
            tabBarIcon: ({ focused, color }) => (
              <ChatsTabIcon focused={focused} color={color} chatUnreadCount={chatUnreadCount} />
            ),
          }}
          listeners={ensureTabRoot("chats", "/(app)/(tabs)/chats")}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: t("customer.profile"),
            tabBarIcon: ({ focused, color }) => (
              <TabIconBox name="person" nameOutline="person-outline" focused={focused} color={color} />
            ),
          }}
        />

        {/* Hidden tabs (reachable from home top nav / deep links) */}
        <Tabs.Screen name="shop" options={{ href: null }} />
        <Tabs.Screen name="explore" options={{ href: null }} />
        <Tabs.Screen name="saved" options={{ href: null }} />
        <Tabs.Screen name="support-tickets" options={{ href: null, title: "Support" }} />
      </Tabs>
    </View>
  );
}

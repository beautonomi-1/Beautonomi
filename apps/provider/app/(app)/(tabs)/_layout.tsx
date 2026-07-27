import { Tabs, useRouter, usePathname, type Router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef } from "react";
import { View, Platform, AppState, InteractionManager, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { StackActions, type NavigationProp, type ParamListBase } from "@react-navigation/native";
import { useResponsive } from "@/hooks/useResponsive";
import { useTranslation } from "@beautonomi/i18n";
import { Colors } from "@/constants/colors";
import { tabBarBottomInset, tabBarOuterHeight, TAB_BAR_LABEL_FONT_SIZE, TAB_BAR_LABEL_LINE_HEIGHT } from "@/constants/layout";
import { AppHeader } from "@/components/AppHeader";
import { authFlowBreadcrumb, isSentryEnabled } from "@/lib/sentry";
import { useNotificationsCount } from "@/providers/NotificationsCountContext";
import { useProvider } from "@/providers/ProviderContext";
import { useAuth } from "@/providers/AuthProvider";
import { prefetchApi } from "@/hooks/useApi";
import { supabase } from "@/lib/supabase/client";
import { nextRealtimeTopic } from "@/lib/supabase/realtime-topic";
import { isMoreTabNestedScreen } from "@/lib/provider-tab-navigation";
import { emitProviderBookingsRefresh } from "@/lib/provider-bookings-events";

type IconName = keyof typeof Ionicons.glyphMap;

type HubTab = "bookings" | "chats" | "more" | "clients";

const formatTabBadge = (count: number): string | undefined => {
  if (count <= 0) return undefined;
  return count > 99 ? "99+" : String(count);
};

/**
 * Tapping a tab that hosts a stack should (1) go to the hub when switching
 * from another tab, and (2) pop to the hub when re-tapping the same tab while
 * nested (same behavior as the More menu).
 */
function makeHubTabListener(
  tabName: HubTab,
  hubHref: `/(app)/(tabs)/${HubTab}`,
  exoRouter: Router,
  pathname: string | null | undefined,
) {
  return ({ navigation }: { navigation: NavigationProp<ParamListBase> }) => ({
    tabPress: (e: { preventDefault: () => void }) => {
      const state = navigation.getState() as { routes: { name: string; state?: { index?: number; key?: string } }[]; index: number };
      const tabRoute = state.routes.find((r) => r.name === tabName) as
        | { name: string; state?: { index?: number; key?: string } }
        | undefined;
      const st = tabRoute?.state;
      const alreadyOnThisTab = state.routes[state.index]?.name === tabName;
      const moreNestedByPath = tabName === "more" && isMoreTabNestedScreen(pathname);

      if (!alreadyOnThisTab) {
        e.preventDefault();
        exoRouter.replace(hubHref as never);
        return;
      }

      const stackNested = typeof st?.index === "number" && st.index > 0;
      if (stackNested || moreNestedByPath) {
        e.preventDefault();
        if (stackNested && st.key) {
          navigation.dispatch({
            ...StackActions.popToTop(),
            target: st.key,
          });
        } else {
          exoRouter.replace(hubHref as never);
        }
      }
    },
  });
}

function TabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  return <Ionicons name={name} size={22} color={focused ? Colors.primary : "#9ca3af"} />;
}

export default function TabsLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { isTablet } = useResponsive();
  const { t } = useTranslation();
  const { provider, selectedLocationId } = useProvider();
  const { session } = useAuth();
  const { notificationUnread, chatUnreadCount, navCounts, refresh: refreshUnreadCount, refreshNavCounts } =
    useNotificationsCount();
  const prefetchedTabsRef = useRef(false);

  const bookingsBadge = formatTabBadge(
    Number(navCounts?.pending_bookings ?? 0) + Number(navCounts?.waiting_room ?? 0),
  );
  const chatsBadge = formatTabBadge(chatUnreadCount);
  const moreCriticalCount = Math.max(
    Number(navCounts?.active_product_orders ?? 0),
    Number(navCounts?.critical_total ?? 0) -
      Number(navCounts?.pending_bookings ?? 0) -
      Number(navCounts?.waiting_room ?? 0) -
      Number(navCounts?.unread_messages ?? 0),
    notificationUnread,
  );
  const moreBadge = formatTabBadge(moreCriticalCount);

  // Debounce guard: prevents the 25 s interval and the AppState "active"
  // handler from both firing refreshNavCounts in the same JS tick, which
  // was contributing to the JS thread saturation that caused the ANR.
  const lastNavRefreshRef = useRef(0);
  const refreshNavCountsDebounced = useRef(() => {});
  refreshNavCountsDebounced.current = () => {
    const now = Date.now();
    if (now - lastNavRefreshRef.current < 5_000) return;
    lastNavRefreshRef.current = now;
    void refreshNavCounts();
    void refreshUnreadCount();
  };

  useEffect(() => {
    if (!isSentryEnabled()) return;
    authFlowBreadcrumb("authenticated_tabs_layout_mount", { app: "provider" });
  }, []);

  useEffect(() => {
    const providerId = provider?.id;
    const userId = session?.user?.id;
    if (!providerId || !userId || prefetchedTabsRef.current) return;
    prefetchedTabsRef.current = true;
    const locQ = selectedLocationId
      ? `?location_id=${encodeURIComponent(selectedLocationId)}`
      : "";
    // Only paths the destination screens read back through useApi's cache are
    // worth warming. The bookings tab is deliberately absent: it loads through
    // usePagedProviderBookings, which calls api.get directly with date-filtered
    // paged URLs, so a prefetch there would just be an extra cold-start request.
    void prefetchApi(`/api/provider/dashboard${locQ}`, { userId });
    void prefetchApi("/api/provider/conversations", { userId });
  }, [provider?.id, session?.user?.id, selectedLocationId]);

  useEffect(() => {
    const interval = setInterval(() => {
      refreshNavCountsDebounced.current();
    }, 25_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshNavCountsDebounced.current();
    });
    return () => sub.remove();
  }, []);

  // Realtime badge updates across dashboard/bookings/chats/more counters.
  // §provider-nav-counts-realtime 2026-05: module-level topic suffix — useRef
  // resets when TabsLayout unmounts (e.g. onboarding), reusing `:1` before
  // removeChannel finishes caused "postgres_changes after subscribe()".
  useEffect(() => {
    const providerId = provider?.id;
    if (!providerId) return;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const scheduleRefresh = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        refreshNavCountsDebounced.current();
      }, 120);
    };

    try {
      const topic = nextRealtimeTopic(`provider-nav-counts:${providerId}`);
      channel = supabase
        .channel(topic)
        .on(
          "postgres_changes" as never,
          {
            event: "*",
            schema: "public",
            table: "bookings",
            filter: `provider_id=eq.${providerId}`,
          },
          scheduleRefresh,
        )
        .on(
          "postgres_changes" as never,
          {
            event: "*",
            schema: "public",
            table: "product_orders",
            filter: `provider_id=eq.${providerId}`,
          },
          scheduleRefresh,
        )
        .on(
          "postgres_changes" as never,
          {
            event: "*",
            schema: "public",
            table: "conversations",
            filter: `provider_id=eq.${providerId}`,
          },
          scheduleRefresh,
        )
        .on(
          "postgres_changes" as never,
          {
            event: "*",
            schema: "public",
            table: "product_return_requests",
            filter: `provider_id=eq.${providerId}`,
          },
          scheduleRefresh,
        )
        .on(
          "postgres_changes" as never,
          {
            event: "*",
            schema: "public",
            table: "custom_requests",
            filter: `provider_id=eq.${providerId}`,
          },
          scheduleRefresh,
        )
        .subscribe();
    } catch {
      // Non-fatal: badges still refresh on interval / focus / tab press.
    }

    return () => {
      if (debounce) clearTimeout(debounce);
      if (!channel) return;
      try {
        supabase.removeChannel(channel);
      } catch {
        // ignore
      }
    };
  }, [provider?.id]);

  // Ensure badges wake up immediately when returning to dashboard hub.
  useEffect(() => {
    if (!pathname?.includes("/(tabs)/dashboard")) return;
    refreshNavCountsDebounced.current();
  }, [pathname]);

  const safeBottom = tabBarBottomInset(insets.bottom);
  const TAB_BAR_HEIGHT = tabBarOuterHeight(insets.bottom);
  const sideInset = Math.max(insets.left, insets.right);
  const screenOptions = useMemo(
    () => ({
      freezeOnBlur: true,
      sceneStyle: {
        backgroundColor: "#ffffff",
        ...(Platform.OS === "web" ? { paddingBottom: TAB_BAR_HEIGHT } : {}),
      },
      headerShown: false,
      tabBarActiveTintColor: Colors.primary,
      tabBarInactiveTintColor: "#9ca3af",
      tabBarAllowFontScaling: false,
      tabBarItemStyle: {
        flex: 1,
        justifyContent: "center" as const,
        alignItems: "center" as const,
        paddingVertical: 2,
      },
      tabBarStyle: {
        backgroundColor: "#ffffff",
        borderTopWidth: 1,
        borderTopColor: "#f3f4f6",
        height: TAB_BAR_HEIGHT,
        minHeight: TAB_BAR_HEIGHT,
        flexShrink: 0,
        paddingTop: 8,
        paddingBottom: safeBottom,
        paddingLeft: sideInset,
        paddingRight: sideInset,
        elevation: 8,
        ...(Platform.OS === "web"
          ? { boxShadow: "0 -2px 6px rgba(0,0,0,0.06)" }
          : {
              shadowColor: "#000",
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: 0.06,
              shadowRadius: 6,
            }),
        ...(isTablet ? { paddingHorizontal: 40 + sideInset } : {}),
        ...(Platform.OS === "web"
          ? ({
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 999,
            } as unknown as ViewStyle)
          : {}),
      },
      tabBarLabelStyle: {
        fontSize: TAB_BAR_LABEL_FONT_SIZE,
        lineHeight: TAB_BAR_LABEL_LINE_HEIGHT,
        fontWeight: "600" as const,
        marginTop: 2,
        textAlign: "center" as const,
      },
      tabBarBadgeStyle: {
        backgroundColor: "#ef4444",
        color: "#ffffff",
        fontSize: 10,
        fontWeight: "700" as const,
      },
    }),
    [TAB_BAR_HEIGHT, isTablet, safeBottom, sideInset],
  );

  return (
    <View style={{ flex: 1 }}>
      <AppHeader />

    <Tabs
      screenOptions={screenOptions}
      screenListeners={{
        tabPress: () => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          InteractionManager.runAfterInteractions(() => {
            void refreshNavCounts();
            void refreshUnreadCount();
          });
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: t("provider.dashboard"),
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? "grid" : "grid-outline"} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: t("provider.clients"),
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? "people" : "people-outline"} focused={focused} />,
        }}
        listeners={makeHubTabListener("clients", "/(app)/(tabs)/clients", router, pathname)}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: t("provider.chats"),
          tabBarBadge: chatsBadge,
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? "chatbubbles" : "chatbubbles-outline"} focused={focused} />,
        }}
        listeners={makeHubTabListener("chats", "/(app)/(tabs)/chats", router, pathname)}
      />
      {/*
        §Provider-audit 2026-04: the previous "Transaction History" tab was
        rarely the first thing providers wanted — bookings are. We surface
        bookings here and move sales/transactions into the More tab.
      */}
      <Tabs.Screen
        name="bookings"
        options={{
          title: t("provider.bookings"),
          tabBarBadge: bookingsBadge,
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? "calendar-clear" : "calendar-clear-outline"} focused={focused} />,
        }}
        listeners={({ navigation }) => {
          const hub = makeHubTabListener("bookings", "/(app)/(tabs)/bookings", router, pathname)({
            navigation,
          });
          return {
            tabPress: (e) => {
              emitProviderBookingsRefresh();
              hub.tabPress(e);
            },
          };
        }}
      />
      {/* Sales is still reachable via More → Sales history. */}
      <Tabs.Screen name="sales" options={{ href: null }} />
      <Tabs.Screen
        name="more"
        options={{
          title: t("common.more"),
          tabBarBadge: moreBadge,
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? "menu" : "menu-outline"} focused={focused} />,
        }}
        listeners={makeHubTabListener("more", "/(app)/(tabs)/more", router, pathname)}
      />
      {/* Hide settings from tab bar - it's now inside More */}
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
    </View>
  );
}

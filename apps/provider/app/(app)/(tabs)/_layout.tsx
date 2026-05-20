import { Tabs, useRouter, usePathname, type Router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef } from "react";
import { View, Platform, AppState, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { StackActions, type NavigationProp, type ParamListBase } from "@react-navigation/native";
import { useResponsive } from "@/hooks/useResponsive";
import { useTranslation } from "@beautonomi/i18n";
import { Colors } from "@/constants/colors";
import { TAB_BAR_MIN_BOTTOM_INSET, tabBarOuterHeight } from "@/constants/layout";
import { AppHeader } from "@/components/AppHeader";
import { authFlowBreadcrumb, isSentryEnabled } from "@/lib/sentry";
import { useApi } from "@/hooks/useApi";
import { useNotificationsCount } from "@/providers/NotificationsCountContext";
import { useProvider } from "@/providers/ProviderContext";
import { supabase } from "@/lib/supabase/client";

type IconName = keyof typeof Ionicons.glyphMap;

type HubTab = "bookings" | "chats" | "more" | "clients";

type ProviderNavCounts = {
  pending_bookings: number;
  active_product_orders: number;
  unread_messages: number;
  waiting_room: number;
  open_return_requests?: number;
  critical_total: number;
};

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
) {
  return ({ navigation }: { navigation: NavigationProp<ParamListBase> }) => ({
    tabPress: (e: { preventDefault: () => void }) => {
      const state = navigation.getState() as { routes: { name: string; state?: { index?: number; key?: string } }[]; index: number };
      const tabRoute = state.routes.find((r) => r.name === tabName) as
        | { name: string; state?: { index?: number; key?: string } }
        | undefined;
      const st = tabRoute?.state;
      const alreadyOnThisTab = state.routes[state.index]?.name === tabName;

      if (!alreadyOnThisTab) {
        e.preventDefault();
        exoRouter.replace(hubHref as never);
        return;
      }

      if (typeof st?.index === "number" && st.index > 0) {
        e.preventDefault();
        if (st.key) {
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
  const { provider } = useProvider();
  const { totalUnread: unreadNotifications, refresh: refreshUnreadCount } = useNotificationsCount();
  const { data: navCounts, refresh: refreshNavCounts } = useApi<ProviderNavCounts>(
    "/api/provider/nav-counts",
    { staleTimeMs: 15_000 },
  );

  const bookingsBadge = formatTabBadge(
    Number(navCounts?.pending_bookings ?? 0) + Number(navCounts?.waiting_room ?? 0),
  );
  const chatsBadge = formatTabBadge(Number(navCounts?.unread_messages ?? 0));
  const moreCriticalCount = Math.max(
    Number(navCounts?.active_product_orders ?? 0),
    Number(navCounts?.critical_total ?? 0) -
      Number(navCounts?.pending_bookings ?? 0) -
      Number(navCounts?.waiting_room ?? 0) -
      Number(navCounts?.unread_messages ?? 0),
    Number(unreadNotifications ?? 0),
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
  // §provider-nav-counts-realtime 2026-05: previous topic name was static
  // (`provider-nav-counts:${providerId}`), so when React re-mounted this
  // effect (Strict Mode, fast refresh, tab remount) the Supabase realtime
  // client reused the already-subscribed channel and threw
  // "tried to add postgres_changes callbacks after subscribe()". A
  // per-mount counter guarantees a fresh channel topic every effect cycle,
  // and the cleanup removes the old channel so we don't leak listeners.
  const navChannelGen = useRef(0);
  useEffect(() => {
    const providerId = provider?.id;
    if (!providerId) return;
    navChannelGen.current += 1;
    const gen = navChannelGen.current;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(`provider-nav-counts:${providerId}:${gen}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
          filter: `provider_id=eq.${providerId}`,
        },
        () => {
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(() => {
            refreshNavCountsDebounced.current();
          }, 120);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "product_orders",
          filter: `provider_id=eq.${providerId}`,
        },
        () => {
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(() => {
            refreshNavCountsDebounced.current();
          }, 120);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `provider_id=eq.${providerId}`,
        },
        () => {
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(() => {
            refreshNavCountsDebounced.current();
          }, 120);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "product_return_requests",
          filter: `provider_id=eq.${providerId}`,
        },
        () => {
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(() => {
            refreshNavCountsDebounced.current();
          }, 120);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "custom_requests",
          filter: `provider_id=eq.${providerId}`,
        },
        () => {
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(() => {
            refreshNavCountsDebounced.current();
          }, 120);
        },
      )
      .subscribe();
    return () => {
      if (debounce) clearTimeout(debounce);
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

  const safeBottom = Math.max(insets.bottom, TAB_BAR_MIN_BOTTOM_INSET);
  const TAB_BAR_HEIGHT = tabBarOuterHeight(insets.bottom);
  const screenOptions = useMemo(
    () => ({
      sceneStyle: {
        backgroundColor: "#ffffff",
        ...(Platform.OS === "web" ? { paddingBottom: TAB_BAR_HEIGHT } : {}),
      },
      headerShown: false,
      tabBarActiveTintColor: Colors.primary,
      tabBarInactiveTintColor: "#9ca3af",
      tabBarStyle: {
        backgroundColor: "#ffffff",
        borderTopWidth: 1,
        borderTopColor: "#f3f4f6",
        height: TAB_BAR_HEIGHT,
        minHeight: TAB_BAR_HEIGHT,
        flexShrink: 0,
        paddingTop: 8,
        paddingBottom: safeBottom,
        elevation: 8,
        ...(Platform.OS === "web"
          ? { boxShadow: "0 -2px 6px rgba(0,0,0,0.06)" }
          : {
              shadowColor: "#000",
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: 0.06,
              shadowRadius: 6,
            }),
        ...(isTablet ? { paddingHorizontal: 40 } : {}),
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
        fontSize: 11,
        fontWeight: "600" as const,
        marginTop: 2,
      },
      tabBarBadgeStyle: {
        backgroundColor: "#ef4444",
        color: "#ffffff",
        fontSize: 10,
        fontWeight: "700" as const,
      },
      /**
       * Six tabs on a narrow phone used to overlap when squeezed into one row; that made the
       * last tab (More) register presses on the wrong route (often Chats). Scrolling tabs fixes it.
       * We use the default tab bar button so React Navigation receives refs/hitSlop correctly.
       */
      tabBarScrollEnabled: Platform.OS !== "web",
    }),
    [TAB_BAR_HEIGHT, isTablet, safeBottom],
  );

  return (
    <View style={{ flex: 1 }}>
      <AppHeader />

    <Tabs
      screenOptions={screenOptions}
      screenListeners={{
        tabPress: () => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          void refreshNavCounts();
          void refreshUnreadCount();
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
        listeners={makeHubTabListener("clients", "/(app)/(tabs)/clients", router)}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: t("provider.chats"),
          tabBarBadge: chatsBadge,
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? "chatbubbles" : "chatbubbles-outline"} focused={focused} />,
        }}
        listeners={makeHubTabListener("chats", "/(app)/(tabs)/chats", router)}
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
        listeners={makeHubTabListener("bookings", "/(app)/(tabs)/bookings", router)}
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
        listeners={makeHubTabListener("more", "/(app)/(tabs)/more", router)}
      />
      {/* Hide settings from tab bar - it's now inside More */}
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
    </View>
  );
}

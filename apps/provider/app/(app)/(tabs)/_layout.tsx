import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo } from "react";
import { View, Platform, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { StackActions } from "@react-navigation/native";
import { useResponsive } from "@/hooks/useResponsive";
import { useTranslation } from "@beautonomi/i18n";
import { Colors } from "@/constants/colors";
import { TAB_BAR_MIN_BOTTOM_INSET, tabBarOuterHeight } from "@/constants/layout";
import { AppHeader } from "@/components/AppHeader";
import { authFlowBreadcrumb, isSentryEnabled } from "@/lib/sentry";

type IconName = keyof typeof Ionicons.glyphMap;

function TabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  return <Ionicons name={name} size={22} color={focused ? Colors.primary : "#9ca3af"} />;
}

export default function TabsLayout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isTablet } = useResponsive();
  const { t } = useTranslation();

  useEffect(() => {
    if (!isSentryEnabled()) return;
    authFlowBreadcrumb("authenticated_tabs_layout_mount", { app: "provider" });
  }, []);

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
        name="calendar"
        options={{
          title: t("provider.calendar"),
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? "calendar" : "calendar-outline"} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: t("provider.clients"),
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? "people" : "people-outline"} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: t("provider.chats"),
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? "chatbubbles" : "chatbubbles-outline"} focused={focused} />,
        }}
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
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? "calendar-clear" : "calendar-clear-outline"} focused={focused} />,
        }}
      />
      {/* Sales is still reachable via More → Sales history. */}
      <Tabs.Screen name="sales" options={{ href: null }} />
      <Tabs.Screen
        name="more"
        options={{
          title: t("common.more"),
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? "menu" : "menu-outline"} focused={focused} />,
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            // §Provider-launch (audit 2026-04): previously we tried to pop
            // the nested "more" stack via router.replace("/(app)/(tabs)/more")
            // whenever the More tab was tapped while deeper pages (e.g. a
            // booking detail under /more/bookings/[id]) were in the stack.
            // Expo Router treats the same target path as a no-op, so the
            // user stayed on the inner screen — the exact "clicking More
            // keeps me on booking details" bug. Dispatching
            // `StackActions.popToTop()` on the nested navigator reliably
            // unwinds back to the More hub from any depth.
            const state = navigation.getState();
            const moreRoute = state.routes.find(
              (r: { name: string }) => r.name === "more",
            ) as { state?: { index?: number; key?: string } } | undefined;
            const st = moreRoute?.state;
            const alreadyOnMoreTab = state.routes[state.index]?.name === "more";
            if (typeof st?.index === "number" && st.index > 0) {
              if (alreadyOnMoreTab) {
                e.preventDefault();
              }
              if (st.key) {
                navigation.dispatch({
                  ...StackActions.popToTop(),
                  target: st.key,
                });
              } else {
                router.replace("/(app)/(tabs)/more" as never);
              }
            }
          },
        })}
      />
      {/* Hide settings from tab bar - it's now inside More */}
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
    </View>
  );
}

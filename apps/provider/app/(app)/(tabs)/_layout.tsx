import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { View, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useResponsive } from "@/hooks/useResponsive";
import { useTranslation } from "@beautonomi/i18n";
import { Colors } from "@/constants/colors";
import { AppHeader } from "@/components/AppHeader";

type IconName = keyof typeof Ionicons.glyphMap;

function TabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  return <Ionicons name={name} size={22} color={focused ? Colors.primary : "#9ca3af"} />;
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { isTablet } = useResponsive();
  const { t } = useTranslation();

  const TAB_BAR_HEIGHT = 60 + (insets.bottom > 0 ? insets.bottom : 10);
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
        paddingTop: 8,
        paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
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
            } as any)
          : {}),
      },
      tabBarLabelStyle: {
        fontSize: 11,
        fontWeight: "600" as const,
        marginTop: 2,
      },
    }),
    [TAB_BAR_HEIGHT, insets.bottom, isTablet],
  );

  return (
    <View style={{ flex: 1 }}>
      <AppHeader />

    <Tabs screenOptions={screenOptions}>
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
      <Tabs.Screen
        name="sales"
        options={{
          title: t("payments.transactionHistory"),
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? "card" : "card-outline"} focused={focused} />,
          href: null,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t("common.more"),
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? "menu" : "menu-outline"} focused={focused} />,
        }}
      />
      {/* Hide settings from tab bar - it's now inside More */}
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
    </View>
  );
}

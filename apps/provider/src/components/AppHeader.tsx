import { useState } from "react";
import { View, Text, TouchableOpacity, Platform, ActionSheetIOS, Modal, Pressable } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useResponsive } from "@/hooks/useResponsive";
import * as Haptics from "expo-haptics";
import { BeautonomiLogo } from "@/components/ui/BeautonomiLogo";
import { LocationSwitcher } from "@/components/ui/LocationSwitcher";
import { ProviderNotificationsDropdown } from "@/components/ProviderNotificationsDropdown";
import { useProvider } from "@/providers/ProviderContext";
import { useNotificationsCount } from "@/providers/NotificationsCountContext";

const QUICK_ACTION_ITEMS: { label: string; route: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: "New Appointment", route: "/(app)/(tabs)/calendar", icon: "calendar-outline" },
  { label: "New Client", route: "/(app)/(tabs)/clients", icon: "person-add-outline" },
  { label: "New Sale", route: "/(app)/(tabs)/more/walk-in-sale", icon: "cart-outline" },
  { label: "Explore post", route: "/(app)/(tabs)/more/explore-posts", icon: "camera-outline" },
];

export function AppHeader() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { screenPadding } = useResponsive();
  const { provider } = useProvider();
  const showLocationSwitcher = (provider?.locations?.length ?? 0) > 0;
  const [quickActionsVisible, setQuickActionsVisible] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { totalUnread: unreadCount } = useNotificationsCount();

  // Hide global brand chrome on chat threads (Chats tab or More → Messages)
  // so the conversation header and composer get full vertical space.
  const isMessagingThread =
    pathname?.includes("/more/messaging/") && !pathname.endsWith("/messaging");
  const isChatsThread = Boolean(pathname?.match(/\/chats\/[^/?#]+/));
  const isFocusFlow = isMessagingThread || isChatsThread;
  if (isFocusFlow) return null;
  const isDashboard = pathname === "/" || pathname?.endsWith("/dashboard");
  const showNotificationBadge = !isDashboard && unreadCount > 0;

  const iconSize = 22;
  const iconColor = "#374151";
  const hitSlop = { top: 10, bottom: 10, left: 10, right: 10 };

  function openQuickActions() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === "ios" && !Platform.isPad && ActionSheetIOS.showActionSheetWithOptions) {
      const options = ["Cancel", ...QUICK_ACTION_ITEMS.map((i) => i.label)];
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 0 },
        (buttonIndex) => {
          if (buttonIndex > 0 && buttonIndex <= QUICK_ACTION_ITEMS.length) {
            router.push(QUICK_ACTION_ITEMS[buttonIndex - 1].route as never);
          }
        }
      );
      return;
    }
    setQuickActionsVisible(true);
  }

  function closeQuickActions() {
    setQuickActionsVisible(false);
  }

  function pickQuickAction(route: string) {
    closeQuickActions();
    router.push(route as never);
  }

  return (
    <View
      style={{
        paddingTop: insets.top,
        paddingBottom: 10,
        paddingHorizontal: screenPadding,
        backgroundColor: "#ffffff",
        borderBottomWidth: 1,
        borderBottomColor: "#f3f4f6",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: 44,
        }}
      >
        {/* Logo */}
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/(app)/(tabs)/dashboard" as never);
          }}
          hitSlop={hitSlop}
          accessibilityLabel="Beautonomi logo, go to dashboard"
          accessibilityRole="button"
        >
          <BeautonomiLogo size={28} />
        </TouchableOpacity>

        {/* Right: search, notification, quick action, location */}
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/(app)/search" as never);
            }}
            hitSlop={hitSlop}
            accessibilityLabel="Search clients, appointments, services"
            accessibilityRole="button"
            style={{ marginRight: Platform.OS === "web" ? 16 : 12 }}
          >
            <Ionicons name="search-outline" size={iconSize} color={iconColor} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setNotificationsOpen(true);
            }}
            hitSlop={hitSlop}
            accessibilityLabel={showNotificationBadge ? `${unreadCount} unread notifications` : "Notifications"}
            accessibilityRole="button"
            style={{ position: "relative", marginRight: Platform.OS === "web" ? 16 : 12 }}
          >
            <Ionicons name="notifications-outline" size={iconSize} color={iconColor} />
            {showNotificationBadge && (
              <View
                style={{
                  position: "absolute",
                  top: -4,
                  right: -4,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: "#ef4444",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 4,
                }}
              >
                <Text
                  style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}
                  numberOfLines={1}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={openQuickActions}
            hitSlop={hitSlop}
            accessibilityLabel="Quick actions menu"
            accessibilityRole="button"
            style={showLocationSwitcher ? undefined : { marginRight: Platform.OS === "web" ? 16 : 12 }}
          >
            <Ionicons name="add-circle-outline" size={iconSize} color={iconColor} />
          </TouchableOpacity>
          {showLocationSwitcher && (
            <View style={{ marginLeft: 4, flexShrink: 0, maxWidth: "42%" }}>
              <LocationSwitcher />
            </View>
          )}
        </View>
      </View>

      {/* Quick actions dropdown (web + iPad where ActionSheet may not show) */}
      <ProviderNotificationsDropdown
        visible={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        onSeeAll={() => router.push("/(app)/(tabs)/more/notifications" as never)}
      />

      <Modal
        visible={quickActionsVisible}
        transparent
        animationType="fade"
        onRequestClose={closeQuickActions}
      >
        <Pressable
          style={{ flex: 1, justifyContent: "flex-start", alignItems: "flex-end", paddingTop: insets.top + 54, paddingRight: 16 }}
          onPress={closeQuickActions}
        >
          <Pressable
            style={{
              backgroundColor: "#fff",
              borderRadius: 12,
              minWidth: 220,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 12,
              elevation: 8,
              overflow: "hidden",
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ paddingVertical: 6 }}>
              {QUICK_ACTION_ITEMS.map((item) => (
                <TouchableOpacity
                  key={item.route}
                  onPress={() => pickQuickAction(item.route)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 12,
                    paddingHorizontal: screenPadding,
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name={item.icon} size={20} color="#374151" style={{ marginRight: 12 }} />
                  <Text style={{ fontSize: 15, color: "#111827", fontWeight: "500" }}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

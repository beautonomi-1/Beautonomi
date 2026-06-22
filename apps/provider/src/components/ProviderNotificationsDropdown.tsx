/**
 * Global notifications panel (customer-app style): opens from the header bell,
 * shows recent items, tap to navigate, "See all" → full notifications hub.
 */
import { useCallback, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  Pressable as RNPressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import {
  GestureHandlerRootView,
  Pressable,
  ScrollView,
  TouchableOpacity,
} from "react-native-gesture-handler";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/colors";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { useNotificationsCount } from "@/providers/NotificationsCountContext";
import { twStyle } from "@/lib/twStyle";
import {
  SwipeableNotificationRow,
  useNotificationSwipeRegistry,
} from "@/components/SwipeableNotificationRow";
import {
  navigateFromProviderNotification,
  type ProviderNotificationNavPayload,
} from "@/lib/provider-notification-navigation";

type Notification = {
  id: string;
  title?: string | null;
  message?: string | null;
  type?: string | null;
  read?: boolean;
  /** Raw server fields — kept so read-state matches the full list exactly. */
  read_at?: string | null;
  is_read?: boolean | null;
  timestamp?: string;
  link?: string;
  action_url?: string;
  data?: ProviderNotificationNavPayload["data"];
};

/**
 * Unified read-state check, identical to the full notifications list, so the
 * dropdown and list never disagree about whether an item is read. The API maps
 * is_read -> read, but also spreads the raw row, so accept any of them.
 */
function isNotificationRead(n: Notification): boolean {
  return Boolean(n.read_at || n.read || n.is_read);
}

type NotificationsResponse = {
  notifications?: Notification[];
  total_unread?: number;
};

function formatDateTimeSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleString();
}

const DROPDOWN_LIMIT = 10;
const MAX_HEIGHT = 400;

export interface ProviderNotificationsDropdownProps {
  visible: boolean;
  onClose: () => void;
  onSeeAll: () => void;
}

export function ProviderNotificationsDropdown({ visible, onClose, onSeeAll }: ProviderNotificationsDropdownProps) {
  const router = useRouter();
  const swipeRegistry = useNotificationSwipeRegistry();
  const { refresh: refreshCount, adjustUnreadCount, replaceUnreadCount, resetNotificationUnreadBias } = useNotificationsCount();
  const { data, loading, error, refresh, mutate } = useApi<NotificationsResponse>(
    "/api/provider/notifications?limit=" + DROPDOWN_LIMIT,
  );
  const { execute: markAllRead, loading: markingRead } = useApiMutation("post");
  const { execute: markReadOne } = useApiMutation("post");
  const { execute: deleteNotif } = useApiMutation("delete");

  useEffect(() => {
    if (visible) void refresh();
  }, [visible, refresh]);

  const notifications: Notification[] = (data as NotificationsResponse)?.notifications ?? [];
  const unreadCount = (data as NotificationsResponse)?.total_unread ?? 0;
  const hasUnread = unreadCount > 0;

  const handleMarkAllRead = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const prevData = data;
    replaceUnreadCount(0);
    resetNotificationUnreadBias();
    if (data?.notifications) {
      mutate({
        notifications: data.notifications.map((n) => ({ ...n, read: true, is_read: true })),
        total_unread: 0,
      });
    }
    const res = await markAllRead(
      "/api/provider/notifications/mark-all-read",
      {},
    );
    if (res.error) {
      if (prevData) mutate(prevData);
      resetNotificationUnreadBias();
      await refreshCount();
      Alert.alert("Error", res.error || "Could not mark notifications as read.");
      return;
    }
    const body = (res.data as { total_unread?: number; data?: { total_unread?: number } } | undefined) ?? {};
    const serverNotifUnread =
      typeof body.total_unread === "number"
        ? body.total_unread
        : typeof body.data?.total_unread === "number"
          ? body.data.total_unread
          : 0;
    resetNotificationUnreadBias();
    replaceUnreadCount(serverNotifUnread);
    await refresh();
    await refreshCount();
  }, [markAllRead, refresh, refreshCount, data, mutate, replaceUnreadCount, resetNotificationUnreadBias]);

  const handleSeeAll = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    onSeeAll();
  }, [onClose, onSeeAll]);

  const handleRowPress = useCallback(
    async (n: Notification) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const wasUnread = !isNotificationRead(n);
      if (wasUnread && data) {
        adjustUnreadCount(-1);
        mutate({
          ...data,
          notifications:
            data.notifications?.map((x) =>
              x.id === n.id ? { ...x, read: true, is_read: true } : x,
            ) ?? [],
          total_unread: Math.max(0, (data.total_unread ?? 0) - 1),
        });
      }
      const navigated = navigateFromProviderNotification(router, n as ProviderNotificationNavPayload);
      if (!navigated) {
        // No deep link — land on the inbox so the full message is readable
        // (same fallback as unknown push types).
        router.push("/(app)/(tabs)/more/notifications" as never);
      }
      onClose();
      if (wasUnread) {
        const res = await markReadOne(`/api/provider/notifications/${n.id}/read`, {});
        if (res.error) {
          adjustUnreadCount(1);
          await refresh();
          await refreshCount();
        } else {
          await refresh();
          await refreshCount();
        }
      }
    },
    [router, onClose, markReadOne, refresh, refreshCount, data, mutate, adjustUnreadCount],
  );

  const deleteNotification = useCallback(
    async (n: Notification) => {
      const wasUnread = !isNotificationRead(n);
      const prevData = data;
      if (wasUnread) adjustUnreadCount(-1);
      if (data?.notifications) {
        mutate({
          ...data,
          notifications: data.notifications.filter((x) => x.id !== n.id),
          total_unread: Math.max(0, (data.total_unread ?? 0) - (wasUnread ? 1 : 0)),
        });
      }
      const { error: delErr } = await deleteNotif(`/api/provider/notifications/${n.id}`);
      if (delErr) {
        if (prevData) mutate(prevData);
        if (wasUnread) adjustUnreadCount(1);
        Alert.alert("Error", delErr);
        return;
      }
      await refresh();
      await refreshCount();
    },
    [data, mutate, deleteNotif, adjustUnreadCount, refresh, refreshCount],
  );

  const confirmDelete = useCallback(
    (n: Notification) => {
      Alert.alert("Delete notification?", "This removes it from your list.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void deleteNotification(n),
        },
      ]);
    },
    [deleteNotification],
  );

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <RNPressable
        style={twStyle("flex-1 bg-black/40")}
        onPress={onClose}
        accessibilityLabel="Close notifications"
        accessibilityRole="button"
      >
        <View style={[twStyle("pt-16 px-4"), { maxHeight: "85%" }]}>
          <RNPressable
            style={[twStyle("rounded-2xl border border-gray-200 bg-white overflow-hidden"), { maxHeight: MAX_HEIGHT }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={twStyle("flex-row items-center justify-between border-b border-gray-100 px-4 py-3")}>
              <View style={twStyle("flex-1 pr-3")}>
                <Text style={twStyle("text-lg font-semibold text-gray-900")}>Notifications</Text>
                <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                  Tap to open (marks read). Swipe left to delete. Use Mark all read for the rest.
                </Text>
              </View>
              <View style={twStyle("flex-row items-center")}>
                {hasUnread && (
                  <TouchableOpacity
                    onPress={handleMarkAllRead}
                    disabled={markingRead}
                    style={[twStyle("rounded-lg bg-gray-100 px-3 py-1.5"), { marginRight: 8 }]}
                  >
                    <Text style={twStyle("text-sm font-medium text-gray-700")}>
                      {markingRead ? "…" : "Mark all read"}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={onClose} style={twStyle("p-1.5")}>
                  <Ionicons name="close" size={22} color="#6b7280" />
                </TouchableOpacity>
              </View>
            </View>

            <GestureHandlerRootView style={twStyle("max-h-[320px]")}>
              <ScrollView
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
              {loading && !data ? (
                <View style={twStyle("py-12 items-center")}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={twStyle("mt-2 text-sm text-gray-500")}>Loading…</Text>
                </View>
              ) : error ? (
                <View style={twStyle("py-8 px-4 items-center")}>
                  <Text style={twStyle("text-sm text-gray-500")}>Couldn’t load notifications</Text>
                  <TouchableOpacity onPress={() => refresh()} style={twStyle("mt-2")}>
                    <Text style={twStyle("text-sm font-medium text-primary")}>Retry</Text>
                  </TouchableOpacity>
                </View>
              ) : notifications.length === 0 ? (
                <View style={twStyle("py-10 px-4 items-center")}>
                  <Ionicons name="notifications-outline" size={40} color="#9ca3af" />
                  <Text style={twStyle("mt-3 text-center text-gray-600")}>No notifications</Text>
                  <Text style={twStyle("mt-1 text-center text-sm text-gray-500")}>You’re all caught up</Text>
                </View>
              ) : (
                <View style={twStyle("pb-2")}>
                  {notifications.map((n) => {
                    const read = isNotificationRead(n);
                    return (
                    <SwipeableNotificationRow
                      key={n.id}
                      itemId={n.id}
                      onDelete={() => confirmDelete(n)}
                      swipeRegistry={swipeRegistry}
                    >
                      <Pressable
                        onPress={() => void handleRowPress(n)}
                        style={twStyle(
                          `mx-3 mt-2 rounded-xl border p-3 active:opacity-90 ${read ? "border-gray-100 bg-gray-50/50" : "border-indigo-100 bg-indigo-50/30"}`,
                        )}
                        accessibilityRole="button"
                        accessibilityLabel={`${n.title ?? "Notification"}. ${n.message ?? ""}`}
                        accessibilityHint="Swipe left to delete. Opens related screen."
                      >
                        <View style={twStyle("flex-row items-start justify-between")}>
                          <View style={[twStyle("flex-1 min-w-0"), { marginRight: 8 }]}>
                            <Text
                              style={twStyle(`font-medium ${read ? "text-gray-700" : "text-gray-900"}`)}
                              numberOfLines={1}
                            >
                              {n.title ?? "Notification"}
                            </Text>
                            {n.message ? (
                              <Text style={twStyle("mt-0.5 text-sm text-gray-600")} numberOfLines={2}>
                                {n.message}
                              </Text>
                            ) : null}
                            {n.timestamp ? (
                              <Text style={twStyle("mt-1.5 text-xs text-gray-400")}>{formatDateTimeSafe(n.timestamp)}</Text>
                            ) : null}
                          </View>
                          {!read && <View style={twStyle("h-2 w-2 rounded-full bg-indigo-500 flex-shrink-0 mt-1.5")} />}
                        </View>
                      </Pressable>
                    </SwipeableNotificationRow>
                    );
                  })}
                </View>
              )}
              </ScrollView>
            </GestureHandlerRootView>

            <View style={twStyle("border-t border-gray-100 px-4 py-3 bg-gray-50/50")}>
              <TouchableOpacity onPress={handleSeeAll} style={twStyle("py-2.5 rounded-xl bg-gray-900")} activeOpacity={0.8}>
                <Text style={twStyle("text-center font-medium text-white")}>See all notifications</Text>
              </TouchableOpacity>
            </View>
          </RNPressable>
        </View>
      </RNPressable>
    </Modal>
  );
}

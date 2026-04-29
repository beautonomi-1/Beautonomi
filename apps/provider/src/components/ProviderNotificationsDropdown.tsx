/**
 * Global notifications panel (customer-app style): opens from the header bell,
 * shows recent items, tap to navigate, "See all" → full notifications hub.
 */
import { useCallback, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Alert,
} from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/colors";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { useNotificationsCount } from "@/providers/NotificationsCountContext";
import { twStyle } from "@/lib/twStyle";
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
  timestamp?: string;
  link?: string;
  action_url?: string;
  data?: ProviderNotificationNavPayload["data"];
};

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
  const { refresh: refreshCount, adjustUnreadCount, replaceUnreadCount } = useNotificationsCount();
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
    if (data?.notifications) {
      mutate({
        notifications: data.notifications.map((n) => ({ ...n, read: true })),
        total_unread: 0,
      });
    }
    const res = await markAllRead("/api/provider/notifications/mark-all-read", {});
    if (res.error) {
      if (prevData) mutate(prevData);
      await refreshCount();
      Alert.alert("Error", res.error || "Could not mark notifications as read.");
      return;
    }
    await refresh();
    await refreshCount();
  }, [markAllRead, refresh, refreshCount, data, mutate, replaceUnreadCount]);

  const handleSeeAll = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    onSeeAll();
  }, [onClose, onSeeAll]);

  const handleRowPress = useCallback(
    async (n: Notification) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const wasUnread = !n.read;
      if (wasUnread && data) {
        adjustUnreadCount(-1);
        mutate({
          ...data,
          notifications:
            data.notifications?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? [],
          total_unread: Math.max(0, (data.total_unread ?? 0) - 1),
        });
      }
      navigateFromProviderNotification(router, n as ProviderNotificationNavPayload);
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
      const wasUnread = !n.read;
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
      <Pressable
        style={twStyle("flex-1 bg-black/40")}
        onPress={onClose}
        accessibilityLabel="Close notifications"
        accessibilityRole="button"
      >
        <View style={[twStyle("pt-16 px-4"), { maxHeight: "85%" }]}>
          <Pressable
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

            <ScrollView
              style={twStyle("max-h-[320px]")}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
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
                  {notifications.map((n) => (
                    <ReanimatedSwipeable
                      key={n.id}
                      friction={2}
                      overshootRight={false}
                      rightThreshold={40}
                      renderRightActions={() => (
                        <View
                          style={{
                            width: 80,
                            backgroundColor: "#ef4444",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <TouchableOpacity
                            onPress={() => confirmDelete(n)}
                            accessibilityLabel="Delete notification"
                            accessibilityRole="button"
                            style={{ padding: 14, alignItems: "center" }}
                          >
                            <Ionicons name="trash-outline" size={20} color="#fff" />
                            <Text style={{ marginTop: 2, fontSize: 12, fontWeight: "600", color: "#fff" }}>Delete</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    >
                      <Pressable
                        onPress={() => void handleRowPress(n)}
                        style={twStyle(
                          `mx-3 mt-2 rounded-xl border p-3 active:opacity-90 ${n.read ? "border-gray-100 bg-gray-50/50" : "border-indigo-100 bg-indigo-50/30"}`,
                        )}
                        accessibilityRole="button"
                        accessibilityLabel={`${n.title ?? "Notification"}. ${n.message ?? ""}`}
                        accessibilityHint="Swipe left to delete. Opens related screen."
                      >
                        <View style={twStyle("flex-row items-start justify-between")}>
                          <View style={[twStyle("flex-1 min-w-0"), { marginRight: 8 }]}>
                            <Text
                              style={twStyle(`font-medium ${n.read ? "text-gray-700" : "text-gray-900"}`)}
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
                          {!n.read && <View style={twStyle("h-2 w-2 rounded-full bg-indigo-500 flex-shrink-0 mt-1.5")} />}
                        </View>
                      </Pressable>
                    </ReanimatedSwipeable>
                  ))}
                </View>
              )}
            </ScrollView>

            <View style={twStyle("border-t border-gray-100 px-4 py-3 bg-gray-50/50")}>
              <TouchableOpacity onPress={handleSeeAll} style={twStyle("py-2.5 rounded-xl bg-gray-900")} activeOpacity={0.8}>
                <Text style={twStyle("text-center font-medium text-white")}>See all notifications</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

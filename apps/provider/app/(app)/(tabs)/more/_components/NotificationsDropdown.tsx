/**
 * Notifications dropdown/modal – shows recent notifications in a panel (like many platforms)
 * instead of navigating to a full screen. "See all" opens the full notifications screen.
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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { useNotificationsCount } from "@/providers/NotificationsCountContext";

type Notification = {
  id: string;
  title?: string | null;
  message?: string | null;
  type?: string | null;
  read?: boolean;
  timestamp?: string;
  link?: string;
};

type NotificationsResponse = {
  notifications?: Notification[];
  total_unread?: number;
};

const DROPDOWN_LIMIT = 10;
const MAX_HEIGHT = 400;

interface NotificationsDropdownProps {
  visible: boolean;
  onClose: () => void;
  onSeeAll: () => void;
}

export function NotificationsDropdown({ visible, onClose, onSeeAll }: NotificationsDropdownProps) {
  const { refresh: refreshCount } = useNotificationsCount();
  const { data, loading, error, refresh } = useApi<NotificationsResponse>(
    "/api/provider/notifications?limit=" + DROPDOWN_LIMIT
  );
  const { execute: markAllRead, loading: markingRead } = useApiMutation("post");

  useEffect(() => {
    if (visible) void refresh();
  }, [visible, refresh]);

  const notifications: Notification[] = (data as NotificationsResponse)?.notifications ?? [];
  const unreadCount = (data as NotificationsResponse)?.total_unread ?? 0;
  const hasUnread = unreadCount > 0;

  const handleMarkAllRead = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const res = await markAllRead("/api/provider/notifications/mark-all-read", {});
    if (!res.error) {
      await refresh();
      await refreshCount();
    }
  }, [markAllRead, refresh, refreshCount]);

  const handleSeeAll = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    onSeeAll();
  }, [onClose, onSeeAll]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        className="flex-1 bg-black/40"
        onPress={onClose}
        accessibilityLabel="Close notifications"
        accessibilityRole="button"
      >
        <View className="pt-16 px-4" style={{ maxHeight: "85%" }}>
          <Pressable
            className="rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden"
            style={{ maxHeight: MAX_HEIGHT }}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <View className="flex-row items-center justify-between border-b border-gray-100 px-4 py-3">
              <Text className="text-lg font-semibold text-gray-900">Notifications</Text>
              <View className="flex-row items-center gap-2">
                {hasUnread && (
                  <TouchableOpacity
                    onPress={handleMarkAllRead}
                    disabled={markingRead}
                    className="rounded-lg bg-gray-100 px-3 py-1.5"
                  >
                    <Text className="text-sm font-medium text-gray-700">
                      {markingRead ? "…" : "Mark all read"}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={onClose} className="p-1.5">
                  <Ionicons name="close" size={22} color="#6b7280" />
                </TouchableOpacity>
              </View>
            </View>

            {/* List */}
            <ScrollView
              className="max-h-[320px]"
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
              {loading && !data ? (
                <View className="py-12 items-center">
                  <ActivityIndicator size="small" color="#FF0077" />
                  <Text className="mt-2 text-sm text-gray-500">Loading…</Text>
                </View>
              ) : error ? (
                <View className="py-8 px-4 items-center">
                  <Text className="text-sm text-gray-500">Couldn’t load notifications</Text>
                  <TouchableOpacity onPress={() => refresh()} className="mt-2">
                    <Text className="text-sm font-medium text-[#FF0077]">Retry</Text>
                  </TouchableOpacity>
                </View>
              ) : notifications.length === 0 ? (
                <View className="py-10 px-4 items-center">
                  <Ionicons name="notifications-outline" size={40} color="#9ca3af" />
                  <Text className="mt-3 text-center text-gray-600">No notifications</Text>
                  <Text className="mt-1 text-center text-sm text-gray-500">You’re all caught up</Text>
                </View>
              ) : (
                <View className="pb-2">
                  {notifications.map((n) => (
                    <View
                      key={n.id}
                      className={`mx-3 mt-2 rounded-xl border p-3 ${n.read ? "border-gray-100 bg-gray-50/50" : "border-indigo-100 bg-indigo-50/30"}`}
                    >
                      <View className="flex-row items-start justify-between gap-2">
                        <View className="flex-1 min-w-0">
                          <Text
                            className={`font-medium ${n.read ? "text-gray-700" : "text-gray-900"}`}
                            numberOfLines={1}
                          >
                            {n.title ?? "Notification"}
                          </Text>
                          {n.message ? (
                            <Text className="mt-0.5 text-sm text-gray-600" numberOfLines={2}>
                              {n.message}
                            </Text>
                          ) : null}
                          {n.timestamp && (
                            <Text className="mt-1.5 text-xs text-gray-400">
                              {new Date(n.timestamp).toLocaleString()}
                            </Text>
                          )}
                        </View>
                        {!n.read && (
                          <View className="h-2 w-2 rounded-full bg-indigo-500 flex-shrink-0 mt-1.5" />
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>

            {/* See all */}
            <View className="border-t border-gray-100 px-4 py-3 bg-gray-50/50">
              <TouchableOpacity
                onPress={handleSeeAll}
                className="py-2.5 rounded-xl bg-gray-900"
                activeOpacity={0.8}
              >
                <Text className="text-center font-medium text-white">See all notifications</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

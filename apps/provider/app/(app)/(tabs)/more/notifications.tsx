import { useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Animated,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { useAuth } from "@/providers/AuthProvider";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { formatTimeAgo } from "@/lib/format";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  data?: {
    booking_id?: string;
    client_id?: string;
    review_id?: string;
    payment_id?: string;
  };
}

interface NotificationsResponse {
  notifications: Notification[];
  total_unread: number;
}

type FilterValue = "all" | "unread" | "bookings" | "payments";

const FILTER_OPTIONS: { label: string; value: string }[] = [
  { label: "All", value: "all" },
  { label: "Unread", value: "unread" },
  { label: "Bookings", value: "bookings" },
  { label: "Payments", value: "payments" },
];

function getNotificationIcon(type: string): {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
} {
  switch (type) {
    case "new_booking":
    case "booking_reminder":
      return { name: "book-outline", color: "#6366f1", bg: "bg-indigo-50" };
    case "booking_cancelled":
      return { name: "close-circle-outline", color: "#ef4444", bg: "bg-red-50" };
    case "booking_completed":
      return {
        name: "checkmark-circle-outline",
        color: "#22c55e",
        bg: "bg-green-50",
      };
    case "new_review":
      return { name: "star-outline", color: "#f59e0b", bg: "bg-amber-50" };
    case "new_message":
      return { name: "chatbubble-outline", color: "#3b82f6", bg: "bg-blue-50" };
    case "payment_received":
    case "payout_sent":
      return { name: "cash-outline", color: "#22c55e", bg: "bg-green-50" };
    case "payment_failed":
      return { name: "card-outline", color: "#ef4444", bg: "bg-red-50" };
    case "system":
    case "announcement":
      return {
        name: "information-circle-outline",
        color: "#6b7280",
        bg: "bg-gray-100",
      };
    default:
      return {
        name: "notifications-outline",
        color: "#6b7280",
        bg: "bg-gray-100",
      };
  }
}

function getNotificationRoute(notif: Notification): string | null {
  if (notif.data?.booking_id) {
    return `/(app)/(tabs)/more/bookings/${notif.data.booking_id}`;
  }
  if (notif.data?.client_id) {
    return `/(app)/(tabs)/more/clients/${notif.data.client_id}`;
  }
  if (notif.type === "new_message") {
    return "/(app)/(tabs)/chats";
  }
  if (notif.type === "new_review") {
    return "/(app)/(tabs)/more/reviews";
  }
  if (
    notif.type === "payment_received" ||
    notif.type === "payout_sent" ||
    notif.type === "payment_failed"
  ) {
    return "/(app)/(tabs)/more/finance";
  }
  return null;
}

function isBookingType(type: string): boolean {
  return [
    "new_booking",
    "booking_cancelled",
    "booking_completed",
    "booking_reminder",
  ].includes(type);
}

function isPaymentType(type: string): boolean {
  return ["payment_received", "payout_sent", "payment_failed"].includes(type);
}

function SwipeableNotificationItem({
  notif,
  onPress,
  onDelete,
}: {
  notif: Notification;
  onPress: () => void;
  onDelete: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const iconInfo = getNotificationIcon(notif.type);
  const isUnread = !notif.read_at;

  function handleSwipeRelease() {
    Animated.spring(translateX, {
      toValue: -80,
      useNativeDriver: true,
    }).start();
  }

  return (
    <View className="overflow-hidden">
      {/* Delete background */}
      <View className="absolute bottom-0 right-0 top-0 w-20 items-center justify-center bg-red-500">
        <TouchableOpacity
          onPress={onDelete}
          className="items-center justify-center p-3"
          accessibilityLabel="Delete notification"
          accessibilityRole="button"
        >
          <Ionicons name="trash-outline" size={20} color="#fff" />
          <Text className="mt-0.5 text-xs text-white">Delete</Text>
        </TouchableOpacity>
      </View>

      {/* Main content */}
      <Animated.View
        style={{ transform: [{ translateX }] }}
        className="bg-white"
      >
        <TouchableOpacity
          className={`flex-row items-start border-b border-gray-50 px-1 py-3.5 ${
            isUnread ? "bg-indigo-50/30" : "bg-white"
          }`}
          onPress={onPress}
          onLongPress={handleSwipeRelease}
          accessibilityLabel={`${isUnread ? "Unread notification: " : ""}${notif.title}. ${notif.message}`}
          accessibilityRole="button"
          accessibilityHint="Tap to view details, long press to reveal delete"
        >
          <View
            className={`${iconInfo.bg} h-10 w-10 items-center justify-center rounded-xl`}
          >
            <Ionicons name={iconInfo.name} size={18} color={iconInfo.color} />
          </View>
          <View className="ml-3 flex-1">
            <View className="flex-row items-start justify-between">
              <Text
                className={`flex-1 text-sm ${
                  isUnread
                    ? "font-semibold text-gray-900"
                    : "font-medium text-gray-700"
                }`}
                numberOfLines={2}
              >
                {notif.title}
              </Text>
              <Text className="ml-2 text-xs text-gray-400">
                {formatTimeAgo(notif.created_at)}
              </Text>
            </View>
            <Text className="mt-0.5 text-xs text-gray-500" numberOfLines={2}>
              {notif.message}
            </Text>
          </View>
          {isUnread && (
            <View className="ml-2 mt-1 h-2.5 w-2.5 rounded-full bg-indigo-500" />
          )}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterValue>("all");

  const { session } = useAuth();
  const {
    data: rawData,
    loading,
    refresh,
    mutate: mutateRaw,
  } = useApi<NotificationsResponse>("/api/provider/notifications", { enabled: !!session });
  const notifications = rawData?.notifications ?? null;
  const mutate = (updated: Notification[]) => mutateRaw({ notifications: updated, total_unread: updated.filter((n) => !n.read_at).length });
  const { execute: patchNotification } = useApiMutation("patch");
  const { execute: postAction } = useApiMutation("post");
  const { execute: deleteNotification } = useApiMutation("delete");

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const unreadCount = notifications?.filter((n) => !n.read_at).length ?? 0;

  const filteredNotifications = useMemo(() => {
    if (!notifications) return [];
    switch (filter) {
      case "unread":
        return notifications.filter((n) => !n.read_at);
      case "bookings":
        return notifications.filter((n) => isBookingType(n.type));
      case "payments":
        return notifications.filter((n) => isPaymentType(n.type));
      default:
        return notifications;
    }
  }, [notifications, filter]);

  async function handleMarkAllRead() {
    if (!notifications || unreadCount === 0) return;
    const { error } = await postAction(
      "/api/provider/notifications/mark-all-read",
      {}
    );
    if (error) {
      Alert.alert("Error", error);
    } else {
      const updated = notifications.map((n) => ({
        ...n,
        read_at: n.read_at ?? new Date().toISOString(),
      }));
      mutate(updated);
    }
  }

  async function handleMarkRead(notif: Notification) {
    if (notif.read_at) {
      navigateToNotification(notif);
      return;
    }
    const { error } = await patchNotification(
      `/api/provider/notifications/${notif.id}`,
      { read_at: new Date().toISOString(), is_read: true }
    );
    if (!error && notifications) {
      const updated = notifications.map((n) =>
        n.id === notif.id ? { ...n, read_at: new Date().toISOString() } : n
      );
      mutate(updated);
    }
    navigateToNotification(notif);
  }

  function navigateToNotification(notif: Notification) {
    const route = getNotificationRoute(notif);
    if (route) {
      router.push(route as any);
    }
  }

  async function handleDelete(notif: Notification) {
    const { error } = await deleteNotification(
      `/api/provider/notifications/${notif.id}`
    );
    if (error) {
      Alert.alert("Error", error);
    } else if (notifications) {
      const updated = notifications.filter((n) => n.id !== notif.id);
      mutate(updated);
    }
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Notifications"
        showBack
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : undefined}
        rightAction={
          unreadCount > 0 ? (
            <TouchableOpacity
              className="flex-row items-center rounded-full bg-indigo-50 px-3 py-2"
              onPress={handleMarkAllRead}
              accessibilityLabel="Mark all notifications as read"
              accessibilityRole="button"
            >
              <Ionicons
                name="checkmark-done-outline"
                size={16}
                color="#6366f1"
              />
              <Text className="ml-1 text-xs font-medium text-indigo-600">
                Mark all read
              </Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      <View style={{ flex: 1, minHeight: 0 }}>
      {/* Filters */}
      <View className="mb-3">
        <FilterChipGroup
          options={FILTER_OPTIONS}
          selected={filter}
          onSelect={(v) => setFilter(v as FilterValue)}
        />
      </View>

      {loading && !notifications ? (
        <SkeletonList rows={5} />
      ) : filteredNotifications.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title={
            filter === "unread"
              ? "No unread notifications"
              : filter !== "all"
                ? `No ${filter} notifications`
                : "No notifications"
          }
          description={
            filter === "all"
              ? "You're all caught up!"
              : "Try changing the filter to see more"
          }
        />
      ) : (
        <FlatList
          data={filteredNotifications}
          keyExtractor={(n: Notification) => n.id}
          style={{ flex: 1, minHeight: 0 }}
          showsVerticalScrollIndicator={true}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120 }}
          renderItem={({ item: notif }: { item: Notification }) => (
            <SwipeableNotificationItem
              notif={notif}
              onPress={() => handleMarkRead(notif)}
              onDelete={() => handleDelete(notif)}
            />
          )}
        />
      )}

      </View>
    </ScreenContainer>
  );
}

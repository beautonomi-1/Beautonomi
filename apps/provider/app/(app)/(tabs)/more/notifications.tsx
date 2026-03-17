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
import { useNotificationsCount } from "@/providers/NotificationsCountContext";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { formatTimeAgo } from "@/lib/format";
import { Colors } from "@/constants/colors";

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
      return { name: "book-outline", color: "#6366f1", bg: "#eef2ff" };
    case "booking_cancelled":
      return { name: "close-circle-outline", color: "#ef4444", bg: "#fef2f2" };
    case "booking_completed":
      return { name: "checkmark-circle-outline", color: "#22c55e", bg: "#f0fdf4" };
    case "new_review":
      return { name: "star-outline", color: "#f59e0b", bg: "#fffbeb" };
    case "new_message":
      return { name: "chatbubble-outline", color: "#3b82f6", bg: "#eff6ff" };
    case "payment_received":
    case "payout_sent":
      return { name: "cash-outline", color: "#22c55e", bg: "#f0fdf4" };
    case "payment_failed":
      return { name: "card-outline", color: "#ef4444", bg: "#fef2f2" };
    case "system":
    case "announcement":
      return { name: "information-circle-outline", color: "#6b7280", bg: Colors.gray[100] };
    default:
      return { name: "notifications-outline", color: "#6b7280", bg: Colors.gray[100] };
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
  isUnread: isUnreadProp,
}: {
  notif: Notification;
  onPress: () => void;
  onDelete: () => void;
  isUnread?: boolean;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const iconInfo = getNotificationIcon(notif.type);
  const isUnread = isUnreadProp ?? !(notif.read_at || (notif as any).read === true || (notif as any).is_read === true);

  function handleSwipeRelease() {
    Animated.spring(translateX, {
      toValue: -80,
      useNativeDriver: true,
    }).start();
  }

  return (
    <View style={{ overflow: "hidden" }}>
      <View style={{ position: "absolute", bottom: 0, right: 0, top: 0, width: 80, alignItems: "center", justifyContent: "center", backgroundColor: "#ef4444" }}>
        <TouchableOpacity
          onPress={onDelete}
          style={{ alignItems: "center", justifyContent: "center", padding: 12 }}
          accessibilityLabel="Delete notification"
          accessibilityRole="button"
        >
          <Ionicons name="trash-outline" size={20} color="#fff" />
          <Text style={{ marginTop: 2, fontSize: 12, color: Colors.white }}>Delete</Text>
        </TouchableOpacity>
      </View>

      <Animated.View style={{ transform: [{ translateX }], backgroundColor: Colors.white }}>
        <TouchableOpacity
          style={[
            { flexDirection: "row", alignItems: "flex-start", borderBottomWidth: 1, borderBottomColor: Colors.gray[50], paddingHorizontal: 4, paddingVertical: 14 },
            isUnread ? { backgroundColor: "rgba(238,242,255,0.5)" } : { backgroundColor: Colors.white },
          ]}
          onPress={onPress}
          onLongPress={handleSwipeRelease}
          accessibilityLabel={`${isUnread ? "Unread notification: " : ""}${notif.title}. ${notif.message}`}
          accessibilityRole="button"
          accessibilityHint="Tap to view details, long press to reveal delete"
        >
          <View style={{ backgroundColor: iconInfo.bg, height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 12 }}>
            <Ionicons name={iconInfo.name} size={18} color={iconInfo.color} />
          </View>
          <View style={{ marginLeft: 12, flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
              <Text
                style={[ { flex: 1, fontSize: 14 }, isUnread ? { fontWeight: "600", color: Colors.gray[900] } : { fontWeight: "500", color: Colors.gray[700] } ]}
                numberOfLines={2}
              >
                {notif.title}
              </Text>
              <Text style={{ marginLeft: 8, fontSize: 12, color: Colors.gray[400] }}>
                {formatTimeAgo(notif.created_at)}
              </Text>
            </View>
            <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }} numberOfLines={2}>
              {notif.message}
            </Text>
          </View>
          {isUnread && (
            <View style={{ marginLeft: 8, marginTop: 4, height: 10, width: 10, borderRadius: 5, backgroundColor: "#6366f1" }} />
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
  const { refresh: refreshCount } = useNotificationsCount();
  const {
    data: rawData,
    loading,
    refresh,
    mutate: mutateRaw,
  } = useApi<NotificationsResponse>("/api/provider/notifications", { enabled: !!session });
  const notifications = rawData?.notifications ?? null;
  const isUnread = (n: Notification) => !(n.read_at || (n as any).read === true || (n as any).is_read === true);
  const mutate = (updated: Notification[]) => mutateRaw({ notifications: updated, total_unread: updated.filter((n) => isUnread(n)).length });
  const { execute: patchNotification } = useApiMutation("patch");
  const { execute: postAction } = useApiMutation("post");
  const { execute: deleteNotification } = useApiMutation("delete");

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refresh(), refreshCount()]);
    setRefreshing(false);
  }, [refresh, refreshCount]);

  const unreadCount = notifications?.filter((n) => isUnread(n)).length ?? 0;

  const filteredNotifications = useMemo(() => {
    if (!notifications) return [];
    switch (filter) {
      case "unread":
        return notifications.filter((n) => isUnread(n));
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
        is_read: true,
      }));
      mutate(updated);
      await refreshCount();
    }
  }

  async function handleMarkRead(notif: Notification) {
    if (notif.read_at || (notif as any).is_read || (notif as any).read) {
      navigateToNotification(notif);
      return;
    }
    const { error } = await patchNotification(
      `/api/provider/notifications/${notif.id}`,
      { read_at: new Date().toISOString(), is_read: true }
    );
    if (!error && notifications) {
      const updated = notifications.map((n) =>
        n.id === notif.id ? { ...n, read_at: new Date().toISOString(), is_read: true } : n
      );
      mutate(updated);
      await refreshCount();
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
      await refreshCount();
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
              style={{ flexDirection: "row", alignItems: "center", borderRadius: 9999, backgroundColor: "#eef2ff", paddingHorizontal: 12, paddingVertical: 8 }}
              onPress={handleMarkAllRead}
              accessibilityLabel="Mark all notifications as read"
              accessibilityRole="button"
            >
              <Ionicons name="checkmark-done-outline" size={16} color="#6366f1" />
              <Text style={{ marginLeft: 4, fontSize: 12, fontWeight: "500", color: "#4f46e6" }}>Mark all read</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      <View style={{ flex: 1, minHeight: 0 }}>
      <View style={{ marginBottom: 12 }}>
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
              isUnread={isUnread(notif)}
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

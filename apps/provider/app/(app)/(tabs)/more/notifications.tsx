import { useState, useCallback, useMemo, useEffect } from "react";
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { Ionicons } from "@expo/vector-icons";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { useAuth } from "@/providers/AuthProvider";
import { useNotificationsCount } from "@/providers/NotificationsCountContext";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { formatTimeAgo } from "@/lib/format";
import { navigateFromProviderNotification } from "@/lib/provider-notification-navigation";
import { Colors } from "@/constants/colors";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  /** Legacy/alternate payloads (some rows use `read` instead of `is_read`). */
  read?: boolean;
  read_at: string | null;
  created_at: string;
  link?: string;
  action_url?: string;
  data?: {
    booking_id?: string;
    client_id?: string;
    review_id?: string;
    payment_id?: string;
    conversation_id?: string;
    product_order_id?: string;
    order_id?: string;
    return_request_id?: string;
    on_demand_request_id?: string;
    ticket_id?: string;
    [key: string]: unknown;
  };
}

interface NotificationsResponse {
  notifications: Notification[];
  total_unread: number;
  has_more?: boolean;
}

const PAGE_SIZE = 20;

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
    case "provider_new_review":
      return { name: "star-outline", color: "#f59e0b", bg: "#fffbeb" };
    case "new_message":
    case "provider_new_message":
      return { name: "chatbubble-outline", color: "#3b82f6", bg: "#eff6ff" };
    case "low_stock_alert":
      return { name: "cube-outline", color: "#d97706", bg: "#fffbeb" };
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

function isBookingType(type: string): boolean {
  if (type.startsWith("provider_booking_")) return true;
  if (
    [
      "provider_new_customer",
      "provider_recurring_customer",
      "provider_preferred_customer",
      "provider_special_instructions",
      "allergy_alert_provider",
      "provider_weather_alert",
      "provider_dispute_opened",
      "provider_dispute_resolved",
    ].includes(type)
  ) {
    return true;
  }
  return [
    "new_booking",
    "booking_cancelled",
    "booking_completed",
    "booking_reminder",
  ].includes(type);
}

function isPaymentType(type: string): boolean {
  return (
    ["payment_received", "payout_sent", "payment_failed", "custom_order_paid"].includes(
      type,
    ) ||
    type.startsWith("provider_payout_") ||
    type === "provider_earnings_summary"
  );
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
  const iconInfo = getNotificationIcon(notif.type);
  const isUnread = isUnreadProp ?? !(notif.read_at || notif.read === true || notif.is_read === true);

  return (
    <ReanimatedSwipeable
      friction={2}
      overshootRight={false}
      rightThreshold={40}
      renderRightActions={() => (
        <View
          style={{
            width: 80,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#ef4444",
          }}
        >
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
      )}
    >
      <TouchableOpacity
        style={[
          { flexDirection: "row", alignItems: "flex-start", borderBottomWidth: 1, borderBottomColor: Colors.gray[50], paddingHorizontal: 4, paddingVertical: 14 },
          isUnread ? { backgroundColor: "rgba(238,242,255,0.5)" } : { backgroundColor: Colors.white },
        ]}
        onPress={onPress}
        accessibilityLabel={`${isUnread ? "Unread notification: " : ""}${notif.title}. ${notif.message}`}
        accessibilityRole="button"
        accessibilityHint="Swipe left to delete, or tap to open"
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
    </ReanimatedSwipeable>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterValue>("all");

  const { session } = useAuth();
  const { refresh: refreshCount, adjustUnreadCount, replaceUnreadCount, totalUnread } = useNotificationsCount();
  const {
    data: rawData,
    loading,
    error: notificationsError,
    refresh,
  } = useApi<NotificationsResponse>(
    `/api/provider/notifications?limit=${PAGE_SIZE}&offset=0`,
    { enabled: !!session },
  );

  // Local list is the source of truth for rendering + optimistic updates.
  // The first page comes from useApi (so pull-to-refresh + cache work); older
  // pages are appended via loadMore. Re-seed whenever page 1 changes.
  const [items, setItems] = useState<Notification[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (rawData?.notifications) {
      setItems(rawData.notifications);
      setHasMore(Boolean(rawData.has_more));
    }
  }, [rawData]);

  const notifications = items;
  const isUnread = (n: Notification) => !(n.read_at || n.read === true || n.is_read === true);
  const mutate = useCallback((updated: Notification[]) => setItems(updated), []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !items || items.length === 0) return;
    setLoadingMore(true);
    try {
      const res = await api.get<NotificationsResponse | { data?: NotificationsResponse }>(
        `/api/provider/notifications?limit=${PAGE_SIZE}&offset=${items.length}`,
      );
      const body = (res.data as { data?: NotificationsResponse })?.data ?? (res.data as NotificationsResponse | undefined);
      const next = body?.notifications ?? [];
      setItems((prev) => {
        const base = prev ?? [];
        const seen = new Set(base.map((n) => n.id));
        return [...base, ...next.filter((n) => !seen.has(n.id))];
      });
      setHasMore(Boolean(body?.has_more));
    } catch {
      // Keep current list; user can scroll again to retry.
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, items]);

  const { execute: patchNotification } = useApiMutation("patch");
  const { execute: postAction } = useApiMutation("post");
  const { execute: deleteNotification } = useApiMutation("delete");

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh(), refreshCount()]);
    } finally {
      setRefreshing(false);
    }
  }, [refresh, refreshCount]);

  const localUnreadCount = notifications?.filter((n) => isUnread(n)).length ?? 0;
  const unreadCount = totalUnread > 0 ? totalUnread : localUnreadCount;

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
    // §Provider-audit 2026-04 (round 2): optimistically mark-all-read so
    // the badge and row styling update immediately; if the server call
    // fails we surface the error and roll back.
    const previous = notifications;
    const nowIso = new Date().toISOString();
    const updated = notifications.map((n) => ({
      ...n,
      read_at: n.read_at ?? nowIso,
      is_read: true,
    }));
    mutate(updated);
    replaceUnreadCount(0);
    const { error } = await postAction(
      "/api/provider/notifications/mark-all-read",
      {},
    );
    if (error) {
      mutate(previous);
      await refreshCount();
      Alert.alert("Error", error);
    } else {
      await refreshCount();
    }
  }

  const navigateToNotification = useCallback(
    (notif: Notification): boolean => {
      return navigateFromProviderNotification(router, notif);
    },
    [router],
  );

  const handleMarkRead = useCallback(
    async (notif: Notification) => {
      // §Provider-audit 2026-04 (round 2): navigate first, mark read in the
      // background. Previously we awaited the PATCH before pushing, which
      // introduced a visible ~300–1500ms hang on spotty networks. The
      // optimistic mutate handles the badge locally; failures roll back.
      const alreadyRead =
        !!notif.read_at || !!notif.is_read || !!notif.read;
      navigateToNotification(notif);
      if (alreadyRead) return;

      const readTs = new Date().toISOString();
      adjustUnreadCount(-1);
      if (notifications) {
        const updated = notifications.map((n) =>
          n.id === notif.id ? { ...n, read_at: readTs, is_read: true } : n,
        );
        mutate(updated);
      }
      const { error } = await patchNotification(
        `/api/provider/notifications/${notif.id}`,
        { read_at: readTs, is_read: true },
      );
      if (error) {
        adjustUnreadCount(1);
        // Roll back optimistic update on failure so the badge reflects reality.
        if (notifications) {
          mutate(notifications);
        }
      } else {
        await refreshCount();
      }
    },
    [notifications, patchNotification, mutate, refreshCount, navigateToNotification, adjustUnreadCount],
  );

  const handleDelete = useCallback(
    async (notif: Notification) => {
      const wasUnread = isUnread(notif);
      if (wasUnread) adjustUnreadCount(-1);
      const { error } = await deleteNotification(
        `/api/provider/notifications/${notif.id}`
      );
      if (error) {
        if (wasUnread) adjustUnreadCount(1);
        Alert.alert("Error", error);
      } else if (notifications) {
        const updated = notifications.filter((n) => n.id !== notif.id);
        mutate(updated);
        await refreshCount();
      }
    },
    [notifications, deleteNotification, mutate, refreshCount, adjustUnreadCount],
  );

  const notifKeyExtractor = useCallback((n: Notification) => n.id, []);

  const renderNotificationItem = useCallback(
    ({ item: notif }: { item: Notification }) => (
      <SwipeableNotificationItem
        notif={notif}
        isUnread={isUnread(notif)}
        onPress={() => handleMarkRead(notif)}
        onDelete={() => handleDelete(notif)}
      />
    ),
    [handleMarkRead, handleDelete],
  );

  return (
    <ScreenContainer scrollable={false} edges={["top"]}>
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
      <Text style={{ marginBottom: 12, fontSize: 12, color: Colors.gray[500] }}>
        Tap a notification to open and mark it read. Swipe left on a row to delete.
      </Text>
      <View style={{ marginBottom: 12 }}>
        <FilterChipGroup
          options={FILTER_OPTIONS}
          selected={filter}
          onSelect={(v) => setFilter(v as FilterValue)}
        />
      </View>

      {loading && !notifications ? (
        <SkeletonList rows={5} />
      ) : notificationsError && !notifications ? (
        <ErrorState message={notificationsError} onRetry={refresh} />
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
        <FlashList
          data={filteredNotifications}
          keyExtractor={notifKeyExtractor}
          renderItem={renderNotificationItem}
          showsVerticalScrollIndicator={true}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          // Only auto-paginate when viewing the full unfiltered list — client-side
          // filters operate on already-loaded rows, so paging under a filter would
          // fetch by total offset and could skip/duplicate filtered items.
          onEndReached={filter === "all" ? loadMore : undefined}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            filter === "all" && loadingMore ? (
              <View style={{ paddingVertical: 16 }}>
                <ActivityIndicator size="small" color={Colors.primary} />
              </View>
            ) : null
          }
          contentContainerStyle={{ paddingBottom: 120 }}
        />
      )}

      </View>
    </ScreenContainer>
  );
}

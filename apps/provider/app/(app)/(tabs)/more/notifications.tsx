import { useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Alert,
  PanResponder,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
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
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { formatTimeAgo } from "@/lib/format";
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

function getNotificationRoute(notif: Notification): string | null {
  const link = notif.link ?? notif.action_url ?? "";
  if (link.includes("/provider/ecommerce/orders") || link.includes("ecommerce/orders")) {
    const m = link.match(/order=([a-f0-9-]+)/i) || link.match(/\/orders\/([a-f0-9-]+)/i);
    const oid = m?.[1] ?? notif.data?.product_order_id ?? notif.data?.order_id;
    if (oid) {
      return `/(app)/(tabs)/more/orders-hub?order=${encodeURIComponent(oid)}`;
    }
    return "/(app)/(tabs)/more/orders-hub";
  }
  if (link.includes("/provider/ecommerce/returns") || link.includes("ecommerce/returns")) {
    return "/(app)/(tabs)/more/orders-hub?tab=returns";
  }
  if (link.includes("/product-orders")) {
    const oid = notif.data?.product_order_id ?? notif.data?.order_id;
    if (oid) {
      return `/(app)/(tabs)/more/orders-hub?order=${encodeURIComponent(oid)}`;
    }
    return "/(app)/(tabs)/more/orders-hub";
  }

  if (notif.data?.booking_id) {
    return `/(app)/(tabs)/bookings/${notif.data.booking_id}`;
  }
  if (notif.data?.client_id) {
    return `/(app)/(tabs)/more/clients/${notif.data.client_id}`;
  }
  const conversationId = notif.data?.conversation_id;
  if (
    conversationId &&
    (notif.type === "new_message" || notif.type === "provider_new_message")
  ) {
    return `/(app)/(tabs)/chats/${conversationId}`;
  }
  if (notif.type === "new_message" || notif.type === "provider_new_message") {
    return "/(app)/(tabs)/chats";
  }

  if (
    notif.type === "product_return_requested" ||
    notif.type === "product_return_approved" ||
    notif.type === "product_return_rejected" ||
    notif.type === "product_return_refunded"
  ) {
    return "/(app)/(tabs)/more/orders-hub?tab=returns";
  }

  const productOrderId = notif.data?.product_order_id ?? notif.data?.order_id;
  if (productOrderId) {
    return `/(app)/(tabs)/more/orders-hub?order=${encodeURIComponent(productOrderId)}`;
  }
  if (notif.type === "new_review" || notif.type === "provider_new_review") {
    return "/(app)/(tabs)/more/reviews";
  }
  if (notif.type === "low_stock_alert") {
    return "/(app)/(tabs)/more/products";
  }
  if (
    notif.type === "payment_received" ||
    notif.type === "payout_sent" ||
    notif.type === "payment_failed" ||
    notif.type.startsWith("provider_payout_") ||
    notif.type === "provider_earnings_summary" ||
    notif.type === "custom_order_paid"
  ) {
    return "/(app)/(tabs)/more/finance";
  }
  if (
    notif.type === "staff_invitation" ||
    notif.type === "staff_schedule_change" ||
    notif.type === "team_update"
  ) {
    return "/(app)/(tabs)/more/team";
  }
  if (
    notif.type === "provider_availability_changed" ||
    notif.type === "provider_holiday_mode" ||
    notif.type === "provider_holiday_mode_ending"
  ) {
    return "/(app)/(tabs)/more/settings/hours";
  }
  if (notif.type === "provider_break_scheduled") {
    return "/(app)/(tabs)/calendar";
  }
  if (
    notif.type === "provider_onboarding_welcome" ||
    notif.type === "provider_profile_approved" ||
    notif.type === "provider_profile_rejected"
  ) {
    return "/(app)/(tabs)/more/settings/verification";
  }
  return null;
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
  const translateX = useRef(new Animated.Value(0)).current;
  const iconInfo = getNotificationIcon(notif.type);
  const isUnread = isUnreadProp ?? !(notif.read_at || notif.read === true || notif.is_read === true);

  // §Provider-audit 2026-04 (round 3): real swipe-to-reveal gesture.
  // Previously the delete slot was only exposed via long-press, which
  // iOS/Android users don't discover. Now a horizontal pan past -40px
  // snaps to the exposed state; a gentler drag snaps closed. Tapping
  // anywhere while exposed closes the row (see outer TouchableWithoutFeedback
  // below is avoided because nested TouchableOpacity already handles the
  // press gesture — we just reset on onPress).
  const SWIPE_THRESHOLD = -40;
  const OPEN_POSITION = -80;
  const lastOffset = useRef(0);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderGrant: () => {
        translateX.stopAnimation((v: number) => {
          lastOffset.current = v;
        });
      },
      onPanResponderMove: (_, g) => {
        const next = Math.min(0, lastOffset.current + g.dx);
        translateX.setValue(Math.max(next, OPEN_POSITION * 1.25));
      },
      onPanResponderRelease: (_, g) => {
        const projected = lastOffset.current + g.dx;
        const shouldOpen = projected < SWIPE_THRESHOLD || g.vx < -0.5;
        const target = shouldOpen ? OPEN_POSITION : 0;
        lastOffset.current = target;
        Animated.spring(translateX, {
          toValue: target,
          useNativeDriver: true,
          bounciness: 4,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
        lastOffset.current = 0;
      },
    }),
  ).current;

  function handlePressRow() {
    if (lastOffset.current !== 0) {
      // If swipe was open, a tap should close it rather than navigate.
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
      }).start();
      lastOffset.current = 0;
      return;
    }
    onPress();
  }

  function handleSwipeRelease() {
    lastOffset.current = OPEN_POSITION;
    Animated.spring(translateX, {
      toValue: OPEN_POSITION,
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

      <Animated.View
        style={{ transform: [{ translateX }], backgroundColor: Colors.white }}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          style={[
            { flexDirection: "row", alignItems: "flex-start", borderBottomWidth: 1, borderBottomColor: Colors.gray[50], paddingHorizontal: 4, paddingVertical: 14 },
            isUnread ? { backgroundColor: "rgba(238,242,255,0.5)" } : { backgroundColor: Colors.white },
          ]}
          onPress={handlePressRow}
          onLongPress={handleSwipeRelease}
          accessibilityLabel={`${isUnread ? "Unread notification: " : ""}${notif.title}. ${notif.message}`}
          accessibilityRole="button"
          accessibilityHint="Tap to view, swipe left or long press to reveal delete"
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
    error: notificationsError,
    refresh,
    mutate: mutateRaw,
  } = useApi<NotificationsResponse>("/api/provider/notifications", { enabled: !!session });
  const notifications = rawData?.notifications ?? null;
  const isUnread = (n: Notification) => !(n.read_at || n.read === true || n.is_read === true);
  const mutate = useCallback(
    (updated: Notification[]) =>
      mutateRaw({
        notifications: updated,
        total_unread: updated.filter(
          (n) => !(n.read_at || n.read === true || n.is_read === true),
        ).length,
      }),
    [mutateRaw],
  );
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
    const { error } = await postAction(
      "/api/provider/notifications/mark-all-read",
      {},
    );
    if (error) {
      mutate(previous);
      Alert.alert("Error", error);
    } else {
      await refreshCount();
    }
  }

  const navigateToNotification = useCallback(
    (notif: Notification) => {
      const route = getNotificationRoute(notif);
      if (route) {
        router.push(route as never);
      }
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
        // Roll back optimistic update on failure so the badge reflects reality.
        if (notifications) {
          mutate(notifications);
        }
      } else {
        await refreshCount();
      }
    },
    [notifications, patchNotification, mutate, refreshCount, navigateToNotification],
  );

  const handleDelete = useCallback(
    async (notif: Notification) => {
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
    },
    [notifications, deleteNotification, mutate, refreshCount],
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
          contentContainerStyle={{ paddingBottom: 120 }}
        />
      )}

      </View>
    </ScreenContainer>
  );
}

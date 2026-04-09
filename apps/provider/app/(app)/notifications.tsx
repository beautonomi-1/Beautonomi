import { useCallback, useState, useEffect, useRef } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { useNotificationsCount } from "@/providers/NotificationsCountContext";
import { useAuth } from "@/providers/AuthProvider";
import { supabase } from "@/lib/supabase/client";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { twStyle } from "@/lib/twStyle";

type Notification = {
  id: string;
  title?: string | null;
  message?: string | null;
  type?: string | null;
  read?: boolean;
  is_read?: boolean;
  timestamp?: string;
  link?: string;
  action_url?: string;
  data?: {
    booking_id?: string;
    conversation_id?: string;
    product_order_id?: string;
    order_id?: string;
    [key: string]: unknown;
  };
};

type NotificationsResponse = {
  notifications?: Notification[];
  total_unread?: number;
};

/** Map notification link/data to provider app route and navigate. */
function navigateFromNotification(router: ReturnType<typeof useRouter>, n: Notification) {
  const link = n.link ?? n.action_url ?? "";
  const data = n.data ?? {};

  const productOrderIdFromData =
    typeof data.product_order_id === "string" && data.product_order_id.trim()
      ? data.product_order_id.trim()
      : "";

  // Support tickets (check data.ticket_id first, then link path)
  const ticketIdFromData = typeof data.ticket_id === "string" && data.ticket_id.trim() ? data.ticket_id.trim() : "";
  if (ticketIdFromData) {
    router.push(`/(app)/(tabs)/more/support-tickets/${ticketIdFromData}` as never);
    return;
  }
  if (link.includes("support/tickets") || link.includes("help/my-tickets")) {
    const m = link.match(/(?:support\/tickets|my-tickets)\/([a-f0-9-]{36})/i);
    if (m) {
      router.push(`/(app)/(tabs)/more/support-tickets/${m[1]}` as never);
    } else {
      router.push("/(app)/(tabs)/more/support-tickets" as never);
    }
    return;
  }

  if (data.booking_id) {
    router.push(`/(app)/(tabs)/more/bookings/${data.booking_id}` as never);
    return;
  }
  if (data.conversation_id) {
    router.push(`/(app)/(tabs)/more/messaging/${data.conversation_id}` as never);
    return;
  }
  if (productOrderIdFromData) {
    router.push(
      `/(app)/(tabs)/more/orders-hub?order=${encodeURIComponent(productOrderIdFromData)}` as never,
    );
    return;
  }
  if (link) {
    const idMatch = link.match(/\/bookings\/([a-f0-9-]+)/i) || link.match(/\/booking\/([a-f0-9-]+)/i);
    if (idMatch) {
      router.push(`/(app)/(tabs)/more/bookings/${idMatch[1]}` as never);
      return;
    }
    if (link.includes("messaging") || link.includes("messages")) {
      const convMatch = link.match(/conversation[=:]([a-f0-9-]+)/i) || link.match(/\/([a-f0-9-]+)$/);
      if (convMatch) {
        router.push(`/(app)/(tabs)/more/messaging/${convMatch[1]}` as never);
      } else {
        router.push("/(app)/(tabs)/more/messaging" as never);
      }
      return;
    }
    if (link.includes("calendar")) {
      router.push("/(app)/(tabs)/calendar" as never);
      return;
    }
    if (link.includes("ecommerce/orders") || link.includes("/product-orders")) {
      const q = link.match(/order=([a-f0-9-]+)/i);
      const oid =
        q?.[1] ??
        (typeof data.order_id === "string" && data.order_id.trim() ? data.order_id.trim() : "");
      if (oid) {
        router.push(
          `/(app)/(tabs)/more/orders-hub?order=${encodeURIComponent(oid)}` as never,
        );
      } else {
        router.push("/(app)/(tabs)/more/orders-hub" as never);
      }
      return;
    }
    if (link.includes("ecommerce/returns")) {
      router.push("/(app)/(tabs)/more/orders-hub?tab=returns" as never);
      return;
    }
    if (link.includes("clients")) {
      const clientMatch = link.match(/\/([a-f0-9-]+)$/);
      if (clientMatch) {
        router.push(`/(app)/(tabs)/more/clients/${clientMatch[1]}` as never);
      } else {
        // Fallback to clients list when we can't extract a specific ID
        router.push("/(app)/(tabs)/more/clients" as never);
      }
      return;
    }
    // Generic fallback — open the dashboard so tapping always does something
    router.push("/(app)/(tabs)/dashboard" as never);
  }
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { refresh: refreshCount } = useNotificationsCount();
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const path = `/api/provider/notifications?limit=50${filter === "unread" ? "&unread_only=true" : ""}`;
  const { data, loading, error, refresh } = useApi<NotificationsResponse>(path);
  const { execute: markReadOne } = useApiMutation("post");
  const { execute: markAllRead, loading: markingRead } = useApiMutation("post");

  const notifications: Notification[] = (data as NotificationsResponse)?.notifications ?? [];
  const unreadCount = (data as NotificationsResponse)?.total_unread ?? 0;
  const hasUnread = unreadCount > 0;
  const read = (n: Notification) => n.read ?? n.is_read ?? false;

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`notifications:user:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          refreshRef.current();
          refreshCount();
        }
      )
      .subscribe();
    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        // ignore
      }
    };
  }, [user?.id, refreshCount]);

  const handleMarkAllRead = useCallback(async () => {
    const res = await markAllRead("/api/provider/notifications/mark-all-read", {});
    if (!res.error) {
      await refresh();
      await refreshCount();
    }
  }, [markAllRead, refresh, refreshCount]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    await refreshCount();
    setRefreshing(false);
  }, [refresh, refreshCount]);

  const handleNotificationPress = useCallback(
    async (n: Notification) => {
      if (!read(n)) {
        const res = await markReadOne(`/api/provider/notifications/${n.id}/read`, {});
        if (!res.error) {
          await refresh();
          await refreshCount();
        }
      }
      navigateFromNotification(router, n);
    },
    [markReadOne, refresh, refreshCount, router]
  );

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Notifications" onBack={() => router.back()} />
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Notifications" onBack={() => router.back()} />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Notifications"
        onBack={() => router.back()}
        rightAction={
          hasUnread ? (
            <TouchableOpacity
              onPress={handleMarkAllRead}
              disabled={markingRead}
              style={twStyle("rounded-full bg-gray-100 px-3 py-2")}
              accessibilityLabel="Mark all notifications as read"
              accessibilityRole="button"
            >
              <Text style={twStyle("text-sm font-medium text-gray-700")}>
                {markingRead ? "…" : "Mark all read"}
              </Text>
            </TouchableOpacity>
          ) : null
        }
      />

      <View style={twStyle("flex-row gap-2 px-4 py-3 border-b border-gray-100")}>
        <TouchableOpacity
          onPress={() => setFilter("all")}
          style={twStyle(`rounded-full px-4 py-2 ${filter === "all" ? "bg-gray-900" : "bg-gray-100"}`)}
        >
          <Text style={twStyle(`text-sm font-medium ${filter === "all" ? "text-white" : "text-gray-600"}`)}>
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setFilter("unread")}
          style={twStyle(`rounded-full px-4 py-2 ${filter === "unread" ? "bg-gray-900" : "bg-gray-100"}`)}
        >
          <Text style={twStyle(`text-sm font-medium ${filter === "unread" ? "text-white" : "text-gray-600"}`)}>
            Unread
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {notifications.length === 0 ? (
          <View style={twStyle("py-12 px-4 items-center")}>
            <Ionicons name="notifications-outline" size={48} color="#9ca3af" />
            <Text style={twStyle("mt-4 text-center text-gray-600")}>
              {filter === "unread" ? "No unread notifications" : "No notifications"}
            </Text>
            <Text style={twStyle("mt-2 text-center text-sm text-gray-500")}>
              You&apos;re all caught up
            </Text>
          </View>
        ) : (
          <View style={twStyle("pb-4 px-4")}>
            {notifications.map((n) => (
              <Pressable
                key={n.id}
                onPress={() => handleNotificationPress(n)}
                style={twStyle(
                  `mb-3 rounded-xl border p-4 ${read(n) ? "border-gray-200 bg-white" : "border-indigo-100 bg-indigo-50/50"}`
                )}
              >
                <View style={twStyle("flex-row items-start justify-between")}>
                  <View style={twStyle("flex-1")}>
                    <Text
                      style={twStyle(`font-medium ${read(n) ? "text-gray-700" : "text-gray-900"}`)}
                      numberOfLines={1}
                    >
                      {n.title ?? "Notification"}
                    </Text>
                    {n.message ? (
                      <Text style={twStyle("mt-1 text-sm text-gray-600")} numberOfLines={2}>
                        {n.message}
                      </Text>
                    ) : null}
                    {(n.timestamp ?? (n as any).created_at) && (
                      <Text style={twStyle("mt-2 text-xs text-gray-400")}>
                        {new Date(n.timestamp ?? (n as any).created_at).toLocaleString()}
                      </Text>
                    )}
                  </View>
                  {!read(n) && <View style={twStyle("ml-2 h-2 w-2 rounded-full bg-indigo-500")} />}
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

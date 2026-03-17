import { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  Platform,
  StyleSheet,
} from "react-native";
import { Stack, router } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { useNotifications } from "@/providers/NotificationsContext";
import { api } from "@/lib/api-client";
import { supabase } from "@/lib/supabase/client";
import { Colors } from "@/constants/colors";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  data?: {
    conversation_id?: string;
    booking_id?: string;
    [key: string]: unknown;
  };
  link?: string;
  action_url?: string;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString();
}

/** Map notification to app route and navigate. Handles conversation_id, booking_id, and link/action_url. */
function navigateFromNotification(n: Notification) {
  const link = n.link ?? n.action_url ?? "";
  const data = n.data ?? {};

  if (data.conversation_id) {
    router.push({ pathname: "/(app)/chat", params: { id: data.conversation_id } });
    return;
  }
  if (data.booking_id) {
    router.push({ pathname: "/(app)/booking-detail", params: { id: data.booking_id } });
    return;
  }

  if (link) {
    if (link.includes("/account-settings/bookings/") || link.includes("/bookings/")) {
      const id = link.split("/").filter(Boolean).pop();
      if (id) router.push({ pathname: "/(app)/booking-detail", params: { id } });
      return;
    }
    if (link.includes("waitlist")) {
      router.push("/(app)/account-settings/waitlist");
      return;
    }
    if (link.includes("returns") || link.includes("product-orders") || link.includes("/orders")) {
      router.push("/(app)/product-orders");
      return;
    }
    if (link.includes("my-returns")) {
      router.push("/(app)/my-returns");
      return;
    }
    if (link.includes("referrals")) {
      router.push("/(app)/account-settings/referrals");
      return;
    }
    if (link.includes("loyalty")) {
      router.push("/(app)/account-settings/loyalty");
      return;
    }
    if (link.includes("payments") || link.includes("payments")) {
      router.push("/(app)/account-settings/payments");
      return;
    }
    if (link.includes("bookings")) {
      router.push("/(app)/account-settings/bookings");
      return;
    }
  }
}

export default function NotificationsScreen() {
  useScreenTracking("Notifications");
  const { user } = useAuth();
  const { refetchUnreadCount } = useNotifications();
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const constraint = (isTablet || Platform.OS === "web") ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const } : {};
  const [list, setList] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const load = useCallback(
    async (isRefresh = false) => {
      if (!user?.id) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        const unreadOnly = filter === "unread";
        const url = unreadOnly ? "/api/me/notifications?unread_only=true" : "/api/me/notifications";
        const res = await api.get<{ notifications?: Notification[]; data?: { notifications?: Notification[] } }>(url);
        const body = res.data as any;
        const items = body?.notifications ?? body?.data?.notifications ?? [];
        setList(Array.isArray(items) ? items : []);
        if (isRefresh) await refetchUnreadCount();
      } catch {
        setList([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.id, filter, refetchUnreadCount]
  );

  useEffect(() => {
    if (user?.id) load();
    else setLoading(false);
  }, [user?.id, load]);

  // Realtime: new or updated notifications for this user
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`notifications:user:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadRef.current(true);
          refetchUnreadCount();
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
  }, [user?.id, refetchUnreadCount]);

  const markRead = async (id: string) => {
    try {
      await api.post(`/api/me/notifications/${id}/read`);
      setList((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
      await refetchUnreadCount();
    } catch {
      // ignore
    }
  };

  const markAllRead = async () => {
    try {
      await api.post("/api/me/notifications/mark-all-read");
      setList((prev) => prev.map((n) => ({ ...n, is_read: true })));
      await refetchUnreadCount();
    } catch {
      // ignore
    }
  };

  const onPress = (n: Notification) => {
    if (!n.is_read) markRead(n.id);
    navigateFromNotification(n);
  };

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ color: Colors.gray[600] }}>Log in to view notifications</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "Notifications",
          headerRight: () =>
            list.some((n) => !n.is_read) ? (
              <TouchableOpacity onPress={markAllRead}>
                <Text style={{ color: Colors.primary, fontWeight: "500" }}>Mark all read</Text>
              </TouchableOpacity>
            ) : null,
        }}
      />
      <View style={[styles.filterRow, { paddingHorizontal: contentPadding }]}>
        <TouchableOpacity
          onPress={() => setFilter("all")}
          style={[styles.filterTab, filter === "all" && styles.filterTabActive]}
        >
          <Text style={[styles.filterTabText, filter === "all" && styles.filterTabTextActive]}>All</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setFilter("unread")}
          style={[styles.filterTab, filter === "unread" && styles.filterTabActive]}
        >
          <Text style={[styles.filterTabText, filter === "unread" && styles.filterTabTextActive]}>Unread</Text>
        </TouchableOpacity>
      </View>
      {loading && list.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ padding: contentPadding, paddingTop: 8, paddingBottom: 48, ...constraint }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />}
          ListEmptyComponent={
            <View style={{ paddingVertical: 64, alignItems: "center" }}>
              <Text style={{ color: Colors.gray[500] }}>
                {filter === "unread" ? "No unread notifications" : "No notifications"}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onPress(item)}
              style={{
                paddingVertical: 16,
                borderBottomWidth: 1,
                borderBottomColor: Colors.gray[100],
                backgroundColor: !item.is_read ? Colors.primaryLight : undefined,
              }}
            >
              <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>{item.title}</Text>
              <Text style={{ color: Colors.gray[600], marginTop: 4 }}>{item.message}</Text>
              <Text style={{ fontSize: 12, color: Colors.gray[400], marginTop: 8 }}>{formatTime(item.created_at)}</Text>
            </Pressable>
          )}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
    backgroundColor: Colors.white,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.gray[100],
  },
  filterTabActive: {
    backgroundColor: Colors.primary,
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.gray[600],
  },
  filterTabTextActive: {
    color: "#fff",
  },
});

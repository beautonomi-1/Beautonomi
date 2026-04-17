import { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  Platform,
  StyleSheet,
  Alert,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Stack } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { useNotifications } from "@/providers/NotificationsContext";
import { api } from "@/lib/api-client";
import { supabase } from "@/lib/supabase/client";
import { Colors } from "@/constants/colors";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";
import {
  type Notification,
  formatNotificationTime,
  navigateFromNotification,
} from "@/lib/notifications";

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
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!user?.id) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setLoadError(false);
      try {
        const unreadOnly = filter === "unread";
        const url = unreadOnly ? "/api/me/notifications?unread_only=true" : "/api/me/notifications";
        const res = await api.get<{ notifications?: Notification[]; data?: { notifications?: Notification[] } }>(url);
        if (res.error) {
          setLoadError(true);
          return;
        }
        const body = res.data as any;
        const items = body?.notifications ?? body?.data?.notifications ?? [];
        setList(Array.isArray(items) ? items : []);
        if (isRefresh) await refetchUnreadCount();
      } catch {
        setLoadError(true);
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

  const markRead = useCallback(async (id: string) => {
    try {
      const res = await api.post(`/api/me/notifications/${id}/read`);
      if (res.error) {
        Alert.alert("Error", res.error.message || "Could not mark as read.");
        return;
      }
      setList((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
      await refetchUnreadCount();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not mark as read.");
    }
  }, [refetchUnreadCount]);

  const markAllRead = async () => {
    try {
      const res = await api.post("/api/me/notifications/mark-all-read");
      if (res.error) {
        Alert.alert("Error", res.error.message || "Could not mark all as read.");
        return;
      }
      setList((prev) => prev.map((n) => ({ ...n, is_read: true })));
      await refetchUnreadCount();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not mark all as read.");
    }
  };

  const onPress = useCallback((n: Notification) => {
    if (!n.is_read) markRead(n.id);
    navigateFromNotification(n);
  }, [markRead]);

  const notifKeyExtractor = useCallback((n: Notification) => n.id, []);

  const renderNotificationItem = useCallback(
    ({ item }: { item: Notification }) => (
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
        <Text style={{ fontSize: 12, color: Colors.gray[400], marginTop: 8 }}>{formatNotificationTime(item.created_at)}</Text>
      </Pressable>
    ),
    [onPress],
  );

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
        <FlashList
          data={list}
          keyExtractor={notifKeyExtractor}
          renderItem={renderNotificationItem}
          contentContainerStyle={{ padding: contentPadding, paddingTop: 8, paddingBottom: 48, ...constraint }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />}
          ListEmptyComponent={
            <View style={{ paddingVertical: 64, alignItems: "center" }}>
              <Text style={{ color: loadError ? "#B91C1C" : Colors.gray[500] }}>
                {loadError ? "Failed to load notifications" : filter === "unread" ? "No unread notifications" : "No notifications"}
              </Text>
              {loadError && (
                <TouchableOpacity onPress={() => load()} style={{ marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: Colors.primary, borderRadius: 8 }}>
                  <Text style={{ color: Colors.white, fontWeight: "500" }}>Retry</Text>
                </TouchableOpacity>
              )}
            </View>
          }
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

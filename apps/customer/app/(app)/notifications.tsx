import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  Platform,
} from "react-native";
import { Stack, router } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
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
  data?: { conversation_id?: string; booking_id?: string };
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

export default function NotificationsScreen() {
  useScreenTracking("Notifications");
  const { user } = useAuth();
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const constraint = (isTablet || Platform.OS === "web") ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const } : {};
  const [list, setList] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!user?.id) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await api.get<{ notifications?: Notification[]; data?: { notifications?: Notification[] } }>("/api/me/notifications");
      const body = res.data as any;
      const items = body?.notifications ?? body?.data?.notifications ?? [];
      setList(items);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) load();
    else setLoading(false);
  }, [user?.id, load]);

  const markRead = async (id: string) => {
    try {
      await api.post(`/api/me/notifications/${id}/read`);
      setList((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    } catch {
      // ignore
    }
  };

  const markAllRead = async () => {
    try {
      await api.post("/api/me/notifications/mark-all-read");
      setList((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {
      // ignore
    }
  };

  const onPress = (n: Notification) => {
    if (!n.is_read) markRead(n.id);
    if (n.data?.conversation_id) {
      router.push({ pathname: "/(app)/chat", params: { id: n.data.conversation_id } });
    } else if (n.data?.booking_id) {
      router.push({ pathname: "/(app)/booking-detail", params: { id: n.data.booking_id } });
    }
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
      {loading && list.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ padding: contentPadding, paddingBottom: 48, ...constraint }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />}
          ListEmptyComponent={
            <View style={{ paddingVertical: 64, alignItems: "center" }}>
              <Text style={{ color: Colors.gray[500] }}>No notifications</Text>
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

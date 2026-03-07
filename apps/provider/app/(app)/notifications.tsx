import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { useNotificationsCount } from "@/providers/NotificationsCountContext";
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
  timestamp?: string;
  link?: string;
};

type NotificationsResponse = {
  notifications?: Notification[];
  total_unread?: number;
};

export default function NotificationsScreen() {
  const router = useRouter();
  const { refresh: refreshCount } = useNotificationsCount();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<NotificationsResponse>(
    "/api/provider/notifications?limit=50"
  );
  const { execute: markAllRead, loading: markingRead } = useApiMutation("post");

  const notifications: Notification[] = (data as NotificationsResponse)?.notifications ?? [];
  const unreadCount = (data as NotificationsResponse)?.total_unread ?? 0;
  const hasUnread = unreadCount > 0;

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
      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {notifications.length === 0 ? (
          <View style={twStyle("py-12 px-4 items-center")}>
            <Ionicons name="notifications-outline" size={48} color="#9ca3af" />
            <Text style={twStyle("mt-4 text-center text-gray-600")}>No notifications</Text>
            <Text style={twStyle("mt-2 text-center text-sm text-gray-500")}>
              You&apos;re all caught up
            </Text>
          </View>
        ) : (
          <View style={twStyle("pb-4")}>
            {notifications.map((n) => (
              <View
                key={n.id}
                style={twStyle(`mb-3 rounded-xl border p-4 ${n.read ? "border-gray-200 bg-white" : "border-indigo-100 bg-indigo-50/50"}`)}
              >
                <View style={twStyle("flex-row items-start justify-between")}>
                  <View style={twStyle("flex-1")}>
                    <Text
                      style={twStyle(`font-medium ${n.read ? "text-gray-700" : "text-gray-900"}`)}
                      numberOfLines={1}
                    >
                      {n.title ?? "Notification"}
                    </Text>
                    {n.message ? (
                      <Text
                        style={twStyle("mt-1 text-sm text-gray-600")}
                        numberOfLines={2}
                      >
                        {n.message}
                      </Text>
                    ) : null}
                    {n.timestamp && (
                      <Text style={twStyle("mt-2 text-xs text-gray-400")}>
                        {new Date(n.timestamp).toLocaleString()}
                      </Text>
                    )}
                  </View>
                  {!n.read && (
                    <View style={twStyle("ml-2 h-2 w-2 rounded-full bg-indigo-500")} />
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

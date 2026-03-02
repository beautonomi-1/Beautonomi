import { useCallback, useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

interface Conversation {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_avatar: string | null;
  last_message_preview: string;
  last_message_at: string;
  unread_count: number;
  booking_number: string | null;
}

export default function MessagingListScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ customerId?: string }>();
  const customerId = typeof params.customerId === "string" ? params.customerId : undefined;
  const hasRedirected = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<Conversation[]>("/api/provider/conversations");

  const conversations = useMemo(
    () => (Array.isArray(data) ? data : []) as Conversation[],
    [data]
  );

  useEffect(() => {
    if (!customerId || loading || hasRedirected.current || conversations.length === 0) return;
    const conv = conversations.find((c) => c.customer_id === customerId);
    if (conv) {
      hasRedirected.current = true;
      router.replace(`/(app)/(tabs)/more/messaging/${conv.id}` as never);
    }
  }, [customerId, loading, conversations, router]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Messages" showBack />
        <View className="flex-1 items-center justify-center py-12">
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Messages" showBack />
        <View className="flex-1 justify-center px-4">
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Messages"
        showBack
        subtitle={`${conversations.length} conversation${conversations.length === 1 ? "" : "s"}`}
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {conversations.length === 0 ? (
          <EmptyState
            icon="chatbubbles-outline"
            title="No conversations yet"
            description="When clients message you (e.g. from a booking or custom request), conversations will appear here."
          />
        ) : (
          conversations.map((conv) => (
            <TouchableOpacity
              key={conv.id}
              onPress={() =>
                router.push(`/(app)/(tabs)/more/messaging/${conv.id}` as never)
              }
              className="mb-2 flex-row items-center rounded-2xl border border-gray-100 bg-white p-4"
              activeOpacity={0.7}
            >
              <Avatar
                name={conv.customer_name}
                imageUrl={conv.customer_avatar}
                size="md"
              />
              <View className="ml-3 flex-1">
                <View className="flex-row items-center justify-between">
                  <Text className="text-base font-semibold text-gray-900" numberOfLines={1}>
                    {conv.customer_name}
                  </Text>
                  {conv.unread_count > 0 && (
                    <View className="rounded-full bg-indigo-600 px-2 py-0.5">
                      <Text className="text-xs font-medium text-white">
                        {conv.unread_count}
                      </Text>
                    </View>
                  )}
                </View>
                <Text className="mt-0.5 text-sm text-gray-500" numberOfLines={1}>
                  {conv.last_message_preview || "No messages yet"}
                </Text>
                <Text className="mt-0.5 text-xs text-gray-400">
                  {new Date(conv.last_message_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

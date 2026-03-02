import { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Pressable,
} from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { Colors } from "@/constants/colors";
import { ConversationSkeleton } from "@/components/Skeleton";

interface Conversation {
  id: string;
  provider?: { business_name?: string; thumbnail_url?: string | null };
  last_message_preview?: string | null;
  last_message_at?: string | null;
  unread_count_customer?: number;
}

function formatTime(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000) return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ChatsScreen() {
  useScreenTracking("Chats");
  const { user, loading: authLoading, refreshSession } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const didRefreshSession = useRef(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await api.get<Conversation[] | { data?: Conversation[] }>("/api/me/conversations");
      if (res.error) {
        setError(res.error.message || "Failed to load conversations");
        setConversations([]);
      } else {
        const data = res.data;
        const list = Array.isArray(data)
          ? data
          : ((data as { data?: Conversation[] })?.data ?? []);
        setConversations(list);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Re-sync session when opening chats (e.g. after tab switch or navigation) so we don't show "Log in" if session exists
  useEffect(() => {
    if (authLoading || user || didRefreshSession.current) return;
    didRefreshSession.current = true;
    refreshSession();
  }, [authLoading, user, refreshSession]);

  const renderItem = useCallback(
    ({ item }: { item: Conversation }) => (
      <Pressable
        onPress={() => router.push({ pathname: "/(app)/chat", params: { id: item.id } })}
        className="flex-row items-center py-4 border-b border-gray-100"
        accessibilityRole="button"
        accessibilityLabel={`Chat with ${item.provider?.business_name || "Provider"}${item.last_message_preview ? `, last message: ${item.last_message_preview}` : ""}`}
        accessibilityHint="Open conversation"
      >
        <View className="w-12 h-12 rounded-full bg-gray-200 overflow-hidden mr-4">{
          item.provider?.thumbnail_url ? (
            <Image
              source={{ uri: item.provider.thumbnail_url }}
              style={{ width: 48, height: 48 }}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View className="flex-1 items-center justify-center">
              <Text className="text-gray-500 font-medium">{(item.provider?.business_name || "?").charAt(0)}</Text>
            </View>
          )
        }</View>
        <View className="flex-1">
          <Text className="font-semibold text-gray-900">{item.provider?.business_name || "Provider"}</Text>
          <Text className="text-sm text-gray-500 mt-0.5" numberOfLines={1}>{item.last_message_preview || "No messages"}</Text>
        </View>
        <View className="items-end">
          <Text className="text-xs text-gray-400">{formatTime(item.last_message_at)}</Text>{
            (item.unread_count_customer || 0) > 0 ? (
              <View className="mt-1 bg-primary min-w-[20px] h-5 rounded-full items-center justify-center px-2">
                <Text className="text-white text-xs font-medium">{item.unread_count_customer}</Text>
              </View>
            ) : null
          }
        </View>
      </Pressable>
    ),
    []
  );

  if (authLoading) {
    return (
      <View className="flex-1 bg-white items-center justify-center p-8">
        <ConversationSkeleton />
        <Text className="text-gray-600 mt-4">Loading…</Text>
      </View>
    );
  }
  if (!user) {
    return (
      <View className="flex-1 bg-white items-center justify-center p-8">
        <Text className="text-xl font-semibold text-gray-900 mb-2 text-center">Messages</Text>
        <Text className="text-gray-600 text-center mb-6">Log in to view your conversations</Text>
        <TouchableOpacity
          onPress={() => router.replace("/(auth)/login")}
          className="bg-primary px-8 py-4 rounded-xl"
          accessibilityRole="button"
          accessibilityLabel="Log in"
          accessibilityHint="Navigate to the login screen to view your messages"
        >
          <Text className="text-white font-semibold">Log in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading && conversations.length === 0) {
    return (
      <View className="flex-1 bg-white">
        <View className="px-4 pt-4 pb-2 border-b border-gray-100">
          <Text className="text-2xl font-bold text-gray-900">Messages</Text>
        </View>
        <ConversationSkeleton />
        <ConversationSkeleton />
        <ConversationSkeleton />
        <ConversationSkeleton />
        <ConversationSkeleton />
      </View>
    );
  }

  if (error && conversations.length === 0) {
    return (
      <View className="flex-1 bg-white items-center justify-center p-6">
        <Text className="text-center text-gray-700 mb-4">{error}</Text>
        <TouchableOpacity
          onPress={() => load(true)}
          className="bg-primary px-6 py-3 rounded-xl"
          accessibilityRole="button"
          accessibilityLabel="Retry loading conversations"
          accessibilityHint="Attempts to reload your conversations"
        >
          <Text className="text-white font-semibold">Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      <View className="px-4 pt-4 pb-2 border-b border-gray-100">
        <Text className="text-2xl font-bold text-gray-900">Messages</Text>
      </View>
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />
        }
        accessibilityRole="list"
        accessibilityLabel="Conversations list"
        ListEmptyComponent={
          <View className="py-16 items-center">
            <Text className="text-gray-500 text-center">No conversations yet</Text>
            <Text className="text-gray-400 text-sm text-center mt-2">
              Start a chat from a provider profile or booking
            </Text>
          </View>
        }
      />
    </View>
  );
}

import { useEffect, useState, useCallback, useRef } from "react";
import { useFocusEffect, router } from "expo-router";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors } from "@/constants/colors";
import { TAB_CONTENT_PADDING_BOTTOM } from "@/constants/layout";
import { ConversationSkeleton } from "@/components/Skeleton";

interface Conversation {
  id: string;
  provider_id?: string | null;
  booking_id?: string | null;
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
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const { user, loading: authLoading, refreshSession } = useAuth();
  const contentContainerStyle = isTablet
    ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const }
    : {};
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
        setError(getApiErrorMessage(res.error, "Failed to load conversations"));
        setConversations([]);
      } else {
        const data = res.data;
        const list = Array.isArray(data)
          ? data
          : ((data as { data?: Conversation[] })?.data ?? []);
        // One thread per provider: group by provider_id, show general thread (booking_id === null) or latest by message
        const byProvider = new Map<string, Conversation[]>();
        for (const c of list as Conversation[]) {
          const pid = c.provider_id ?? c.provider?.business_name ?? c.id;
          if (!byProvider.has(pid)) byProvider.set(pid, []);
          byProvider.get(pid)!.push(c);
        }
        const onePerProvider: Conversation[] = [];
        byProvider.forEach((threads) => {
          const general = threads.find((t) => t.booking_id == null);
          const latest = threads.sort(
            (a, b) => new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime()
          )[0];
          const display = general ?? latest;
          const unreadTotal = threads.reduce((s, t) => s + (t.unread_count_customer ?? 0), 0);
          onePerProvider.push({
            ...display,
            id: display.id,
            unread_count_customer: unreadTotal,
          });
        });
        // Sort by last message time (most recent first)
        onePerProvider.sort(
          (a, b) => new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime()
        );
        setConversations(onePerProvider);
      }
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to load"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (user) load(true);
    }, [user, load])
  );

  // Re-sync session when opening chats (e.g. after tab switch or navigation) so we don't show "Log in" if session exists
  useEffect(() => {
    if (authLoading || user || didRefreshSession.current) return;
    didRefreshSession.current = true;
    refreshSession();
  }, [authLoading, user, refreshSession]);

  const renderItem = useCallback(
    ({ item }: { item: Conversation }) => {
      const openChat = () => {
        const name = item.provider?.business_name || "Provider";
        if (item.provider_id) {
          router.push({ pathname: "/(app)/chat", params: { provider_id: item.provider_id, provider_name: name } });
        } else {
          router.push({ pathname: "/(app)/chat", params: { id: item.id } });
        }
      };
      return (
      <Pressable
        onPress={openChat}
        style={{ flexDirection: "row", alignItems: "center", paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] }}
        accessibilityRole="button"
        accessibilityLabel={`Chat with ${item.provider?.business_name || "Provider"}${item.last_message_preview ? `, last message: ${item.last_message_preview}` : ""}`}
        accessibilityHint="Open conversation"
      >
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.gray[200], overflow: "hidden", marginRight: 16 }}>
          {item.provider?.thumbnail_url ? (
            <Image
              source={{ uri: item.provider.thumbnail_url }}
              style={{ width: 48, height: 48 }}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", width: 48, height: 48 }}>
              <Text style={{ color: Colors.gray[500], fontWeight: "500" }}>{(item.provider?.business_name || "?").charAt(0)}</Text>
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>{item.provider?.business_name || "Provider"}</Text>
          <Text style={{ fontSize: 14, color: Colors.gray[500], marginTop: 2 }} numberOfLines={1}>{item.last_message_preview || "No messages"}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 12, color: Colors.gray[400] }}>{formatTime(item.last_message_at)}</Text>
          {(item.unread_count_customer || 0) > 0 ? (
            <View style={{ marginTop: 4, backgroundColor: Colors.primary, minWidth: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 }}>
              <Text style={{ color: Colors.white, fontSize: 12, fontWeight: "500" }}>{item.unread_count_customer}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
      );
    },
    []
  );

  if (authLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <ConversationSkeleton />
        <Text style={{ color: Colors.gray[600], marginTop: 16 }}>Loading…</Text>
      </View>
    );
  }
  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <Text style={{ fontSize: 20, fontWeight: "600", color: Colors.gray[900], marginBottom: 8, textAlign: "center" }}>Messages</Text>
        <Text style={{ color: Colors.gray[600], textAlign: "center", marginBottom: 24 }}>Log in to view your conversations</Text>
        <TouchableOpacity
          onPress={() => router.replace("/(auth)/login")}
          style={{ backgroundColor: Colors.primary, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Log in"
          accessibilityHint="Navigate to the login screen to view your messages"
        >
          <Text style={{ color: Colors.white, fontWeight: "600" }}>Log in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading && conversations.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white }}>
        <SafeAreaView edges={["top"]} style={{ backgroundColor: Colors.white }} />
        <View style={[contentContainerStyle, { paddingHorizontal: contentPadding, paddingTop: contentPadding, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] }]}>
          <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900] }}>Messages</Text>
        </View>
        <View style={{ flex: 1, ...contentContainerStyle }}>
          <ConversationSkeleton />
          <ConversationSkeleton />
          <ConversationSkeleton />
          <ConversationSkeleton />
          <ConversationSkeleton />
        </View>
      </View>
    );
  }

  if (error && conversations.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white }}>
        <SafeAreaView edges={["top"]} style={{ backgroundColor: Colors.white }} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ textAlign: "center", color: Colors.gray[700], marginBottom: 16 }}>{error}</Text>
        <TouchableOpacity
          onPress={() => load(true)}
          style={{ backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Retry loading conversations"
          accessibilityHint="Attempts to reload your conversations"
        >
          <Text style={{ color: Colors.white, fontWeight: "600" }}>Retry</Text>
        </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.white }}>
      <SafeAreaView edges={["top"]} style={{ backgroundColor: Colors.white }} />
      <View style={[contentContainerStyle, { paddingHorizontal: contentPadding, paddingTop: contentPadding, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] }]}>
        <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900] }}>Messages</Text>
      </View>
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        renderItem={renderItem}
        style={{ flex: 1, ...contentContainerStyle }}
        contentContainerStyle={{
          paddingHorizontal: contentPadding,
          paddingTop: contentPadding,
          paddingBottom: TAB_CONTENT_PADDING_BOTTOM,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />
        }
        accessibilityRole="list"
        accessibilityLabel="Conversations list"
        ListEmptyComponent={
          <View style={{ paddingVertical: 64, alignItems: "center" }}>
            <Text style={{ color: Colors.gray[500], textAlign: "center" }}>No conversations yet</Text>
            <Text style={{ color: Colors.gray[400], fontSize: 14, textAlign: "center", marginTop: 8 }}>
              Start a chat from a provider profile or booking
            </Text>
          </View>
        }
      />
    </View>
  );
}

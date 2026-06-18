import { useEffect, useState, useCallback, useRef } from "react";
import { useFocusEffect, router } from "expo-router";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Pressable,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { supabase } from "@/lib/supabase/client";
import { nextRealtimeTopic } from "@/lib/supabase/realtime-topic";
import { getApiErrorMessage } from "@/lib/api-error";
import { emitChatBadgeRefresh } from "@/lib/notification-badge-events";
import { useNotifications } from "@/providers/NotificationsContext";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors } from "@/constants/colors";
import { useTabContentPaddingBottom } from "@/hooks/useTabContentPaddingBottom";
import { ConversationSkeleton } from "@/components/Skeleton";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";
import { useTranslation } from "@beautonomi/i18n";

interface Conversation {
  id: string;
  provider_id?: string | null;
  booking_id?: string | null;
  provider?: { business_name?: string; thumbnail_url?: string | null };
  provider_slug?: string | null;
  last_message_preview?: string | null;
  last_message_at?: string | null;
  unread_count_customer?: number;
  is_pinned?: boolean;
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
  const { t } = useTranslation();
  const tc = useCallback(
    (key: string) => t(`customer.mobile.tabs.chats.${key}`),
    [t],
  );
  const tabScrollPaddingBottom = useTabContentPaddingBottom();
  useScreenTracking("Chats");
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const { user, loading: authLoading, refreshSession } = useAuth();
  const { adjustChatUnreadCount } = useNotifications();
  const contentContainerStyle = isTablet
    ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const }
    : {};
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const didRefreshSession = useRef(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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
          const pinned = threads.find((t) => t.is_pinned);
          const general = threads.find((t) => t.booking_id == null);
          const latest = threads.sort(
            (a, b) => new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime()
          )[0];
          const display = pinned ?? general ?? latest;
          const unreadTotal = threads.reduce((s, t) => s + (t.unread_count_customer ?? 0), 0);
          onePerProvider.push({
            ...display,
            id: display.id,
            unread_count_customer: unreadTotal,
            is_pinned: threads.some((t) => t.is_pinned),
          });
        });
        onePerProvider.sort((a, b) => {
          const pinDiff = (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0);
          if (pinDiff !== 0) return pinDiff;
          return (
            new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime()
          );
        });
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
    if (user) load();
  }, [load, user]);

  useFocusEffect(
    useCallback(() => {
      if (user) load(true);
    }, [user, load])
  );

  // Realtime: refresh the conversation list when any of the customer's
  // conversations change (new message, unread count, etc.).
  // Mirrors the provider conversations subscription in apps/provider messaging/index.tsx.
  useEffect(() => {
    if (!user?.id) return;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void load(true);
      }, 400);
    };
    const channel = supabase
      .channel(nextRealtimeTopic(`customer-conversations:${user.id}`))
      .on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `customer_id=eq.${user.id}`,
        },
        () => scheduleRefresh(),
      )
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      try {
        supabase.removeChannel(channel);
      } catch {
        // Ignore when channel is still connecting
      }
    };
  }, [user?.id, load]);

  // Re-sync session when opening chats (e.g. after tab switch or navigation) so we don't show "Log in" if session exists
  useEffect(() => {
    if (authLoading || user || didRefreshSession.current) return;
    didRefreshSession.current = true;
    refreshSession();
  }, [authLoading, user, refreshSession]);

  const filteredConversations = conversations.filter((item) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const providerName = (item.provider?.business_name || "").toLowerCase();
    const preview = (item.last_message_preview || "").toLowerCase();
    return providerName.includes(q) || preview.includes(q);
  });

  const markConversationRead = useCallback(async (conversationId: string) => {
    const unread = conversations.find((c) => c.id === conversationId)?.unread_count_customer ?? 0;
    if (unread > 0) {
      adjustChatUnreadCount(-unread);
    }
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId ? { ...c, unread_count_customer: 0 } : c
      )
    );
    const res = await api.post(`/api/me/conversations/${conversationId}/read`, {});
    if (res.error) {
      setError(getApiErrorMessage(res.error, "Failed to mark conversation as read"));
      void load(true);
    } else {
      emitChatBadgeRefresh();
    }
  }, [adjustChatUnreadCount, conversations, load]);

  const togglePinConversation = useCallback(
    async (conversationId: string, pinned: boolean) => {
      const res = await api.patch<{ is_pinned?: boolean }>(
        `/api/me/conversations/${conversationId}/pin`,
        { pinned },
      );
      if (res.error) {
        setError(getApiErrorMessage(res.error, "Failed to update pin"));
        return;
      }
      setConversations((prev) =>
        prev
          .map((c) => (c.id === conversationId ? { ...c, is_pinned: pinned } : c))
          .sort((a, b) => {
            const pinDiff = (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0);
            if (pinDiff !== 0) return pinDiff;
            return (
              new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime()
            );
          }),
      );
    },
    [],
  );

  const deleteConversation = useCallback(async (conversationId: string) => {
    const previous = conversations;
    setConversations((prev) => prev.filter((c) => c.id !== conversationId));
    const res = await api.fetch<{ deleted?: boolean }>(`/api/me/conversations/${conversationId}`, {
      method: "DELETE",
    });
    if (res.error) {
      setConversations(previous);
      setError(getApiErrorMessage(res.error, "Failed to delete conversation"));
    }
  }, [conversations]);

  const renderItem = useCallback(
    ({ item }: { item: Conversation }) => {
      const openChat = () => {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === item.id ? { ...c, unread_count_customer: 0 } : c
          )
        );
        const name = item.provider?.business_name || tc("providerFallback");
        // Prefer navigating by conversation id — avoids a redundant get-or-create round-trip.
        // Fall back to provider_id (triggers get-or-create) only when id is missing.
        if (item.id) {
          router.push({ pathname: "/(app)/chat", params: { id: item.id, provider_name: name } });
        } else if (item.provider_id) {
          router.push({ pathname: "/(app)/chat", params: { provider_id: item.provider_id, provider_name: name } });
        }
      };
      const openActions = () => {
        const unread = item.unread_count_customer || 0;
        Alert.alert(tc("conversationActionsTitle"), tc("conversationActionsMessage"), [
          ...(unread > 0
            ? [{ text: tc("markAsRead"), onPress: () => void markConversationRead(item.id) }]
            : []),
          {
            text: item.is_pinned ? tc("unpinConversation") : tc("pinConversation"),
            onPress: () => void togglePinConversation(item.id, !item.is_pinned),
          },
          {
            text: tc("deleteConversation"),
            style: "destructive",
            onPress: () =>
              Alert.alert(tc("deleteConfirmTitle"), tc("deleteConfirmBody"), [
                { text: tc("cancel"), style: "cancel" },
                { text: tc("delete"), style: "destructive", onPress: () => void deleteConversation(item.id) },
              ]),
          },
          { text: tc("cancel"), style: "cancel" },
        ]);
      };
      return (
      <Pressable
        onPress={openChat}
        onLongPress={openActions}
        style={{ flexDirection: "row", alignItems: "center", paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] }}
        accessibilityRole="button"
        accessibilityLabel={`Chat with ${item.provider?.business_name || tc("providerFallback")}${item.last_message_preview ? `, last message: ${item.last_message_preview}` : ""}`}
        accessibilityHint={tc("openConversationHint")}
      >
        <TouchableOpacity
          onPress={() => {
            if (item.provider_slug) {
              router.push({
                pathname: "/(app)/partner-profile",
                params: { slug: item.provider_slug, provider_id: item.provider_id || undefined },
              });
            } else {
              openChat();
            }
          }}
          activeOpacity={0.8}
          style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.gray[200], overflow: "hidden", marginRight: 16 }}
        >
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
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {item.is_pinned ? (
              <Ionicons name="pin" size={14} color={Colors.primary} style={{ transform: [{ rotate: "45deg" }] }} />
            ) : null}
            <Text style={{ fontWeight: "600", color: Colors.gray[900], flex: 1 }} numberOfLines={1}>
              {item.provider?.business_name || tc("providerFallback")}
            </Text>
          </View>
          <Text style={{ fontSize: 14, color: Colors.gray[500], marginTop: 2 }} numberOfLines={1}>
            {item.last_message_preview || tc("noMessages")}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 12, color: Colors.gray[400] }}>{formatTime(item.last_message_at)}</Text>
          {(item.unread_count_customer || 0) > 0 ? (
            <View style={{ marginTop: 4, backgroundColor: Colors.primary, minWidth: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 }}>
              <Text style={{ color: Colors.white, fontSize: 12, fontWeight: "500" }}>{item.unread_count_customer}</Text>
            </View>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={openActions}
          accessibilityRole="button"
          accessibilityLabel={tc("conversationActionsA11y")}
          style={{ marginLeft: 10, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: Colors.gray[50], borderWidth: 1, borderColor: Colors.gray[100] }}
        >
          <Ionicons name="ellipsis-vertical" size={16} color={Colors.gray[600]} />
        </TouchableOpacity>
      </Pressable>
      );
    },
    [deleteConversation, markConversationRead, togglePinConversation, tc]
  );

  if (authLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <ConversationSkeleton />
        <Text style={{ color: Colors.gray[600], marginTop: 16 }}>{tc("loading")}</Text>
      </View>
    );
  }
  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <Text style={{ fontSize: 20, fontWeight: "600", color: Colors.gray[900], marginBottom: 8, textAlign: "center" }}>
          {tc("messagesTitle")}
        </Text>
        <Text style={{ color: Colors.gray[600], textAlign: "center", marginBottom: 24 }}>{tc("loginToViewConversations")}</Text>
        <TouchableOpacity
          onPress={() => router.replace("/(auth)/login")}
          style={{ backgroundColor: Colors.primary, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 12 }}
          accessibilityRole="button"
          accessibilityLabel={tc("logInA11y")}
          accessibilityHint={tc("logInHint")}
        >
          <Text style={{ color: Colors.white, fontWeight: "600" }}>{tc("logIn")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading && conversations.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white }}>
        <SafeAreaView edges={["top"]} style={{ backgroundColor: Colors.white }} />
        <View style={[contentContainerStyle, { paddingHorizontal: contentPadding, paddingTop: contentPadding, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] }]}>
          <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900] }}>{tc("messagesTitle")}</Text>
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
          accessibilityLabel={tc("retryLoadingA11y")}
          accessibilityHint={tc("retryLoadingHint")}
        >
          <Text style={{ color: Colors.white, fontWeight: "600" }}>{tc("retryLabel")}</Text>
        </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.white }}>
      <SafeAreaView edges={["top"]} style={{ backgroundColor: Colors.white }} />
      <View style={[contentContainerStyle, { paddingHorizontal: contentPadding, paddingTop: contentPadding, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] }]}>
        <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900] }}>{tc("messagesTitle")}</Text>
        <View
          style={{
            marginTop: 10,
            flexDirection: "row",
            alignItems: "center",
            borderWidth: 1,
            borderColor: Colors.gray[200],
            backgroundColor: Colors.gray[50],
            borderRadius: 12,
            paddingHorizontal: 10,
            paddingVertical: 8,
          }}
        >
          <Text style={{ color: Colors.gray[400], marginRight: 6 }}>🔎</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={tc("searchPlaceholder")}
            placeholderTextColor={Colors.gray[400]}
            style={{ flex: 1, fontSize: 14, color: Colors.gray[900] }}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {search.length > 0 ? (
            <TouchableOpacity onPress={() => setSearch("")} accessibilityRole="button" accessibilityLabel={tc("clearSearchA11y")}>
              <Text style={{ color: Colors.gray[500], fontSize: 14 }}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      <FlatList
        {...verticalFlatListPerf}
        data={filteredConversations}
        keyExtractor={(c) => c.id}
        renderItem={renderItem}
        style={{ flex: 1, ...contentContainerStyle }}
        contentContainerStyle={{
          paddingHorizontal: contentPadding,
          paddingTop: contentPadding,
          paddingBottom: tabScrollPaddingBottom,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />
        }
        accessibilityRole="list"
        accessibilityLabel={tc("conversationsListA11y")}
        ListEmptyComponent={
          <View style={{ paddingVertical: 64, alignItems: "center" }}>
            <Text style={{ color: Colors.gray[500], textAlign: "center" }}>
              {search.trim() ? tc("noMatchingConversations") : tc("noConversations")}
            </Text>
            <Text style={{ color: Colors.gray[400], fontSize: 14, textAlign: "center", marginTop: 8 }}>
              {tc("emptyConversationsHint")}
            </Text>
          </View>
        }
      />
    </View>
  );
}

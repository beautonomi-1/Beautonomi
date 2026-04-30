import { useCallback, useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  TextInput,
} from "react-native";
import { useRouter, useLocalSearchParams, useNavigation, useFocusEffect, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { supabase } from "@/lib/supabase/client";
import { useProvider } from "@/providers/ProviderContext";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Colors } from "@/constants/colors";
import { providerMessagingBaseFromPathname } from "@/lib/provider-messaging-routes";

interface Conversation {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_avatar: string | null;
  last_message_preview: string;
  last_message_at: string;
  unread_count: number;
  booking_number: string | null;
  booking_id?: string | null;
}

function formatDateTimeSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MessagingListScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const threadBase = providerMessagingBaseFromPathname(pathname);
  const navigation = useNavigation();
  const canGoBack = navigation.canGoBack();
  const { screenPadding } = useResponsive();
  const { provider } = useProvider();
  const params = useLocalSearchParams<{ customerId?: string }>();
  const customerId = typeof params.customerId === "string" ? params.customerId : undefined;
  const hasRedirected = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const { data, loading, error, refresh } = useApi<Conversation[]>("/api/provider/conversations", {
    staleTimeMs: 0,
  });

  // Keep a stable ref so the channel effect doesn't need refresh in its deps
  // (changing refresh identity causes subscribe/re-subscribe races).
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);
  const conversationsRealtimeGenRef = useRef(0);

  useEffect(() => {
    if (!provider?.id) return;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void refreshRef.current();
      }, 400);
    };

    // Supabase may return an existing channel when the same topic is reused
    // during fast remounts. Give every subscription a unique topic so all
    // postgres_changes handlers are attached before subscribe().
    const topic = `provider-conversations:${provider.id}:${++conversationsRealtimeGenRef.current}`;
    const channel = supabase
      .channel(topic)
      .on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `provider_id=eq.${provider.id}`,
        },
        () => scheduleRefresh(),
      )
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      try {
        supabase.removeChannel(channel);
      } catch {
        // Ignore
      }
    };
  }, [provider?.id]);

  /** One row per client (API may still return multiple rows for legacy data; DB unique enforces one going forward). */
  const conversations = useMemo(() => {
    const list = (Array.isArray(data) ? data : []) as Conversation[];
    const byCustomer = new Map<string, Conversation[]>();
    for (const c of list) {
      const k = c.customer_id || c.id;
      if (!byCustomer.has(k)) byCustomer.set(k, []);
      byCustomer.get(k)!.push(c);
    }
    const onePer: Conversation[] = [];
    byCustomer.forEach((threads) => {
      const general = threads.find((t) => t.booking_id == null);
      const latest = threads
        .slice()
        .sort(
          (a, b) =>
            new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime()
        )[0];
      const display = general ?? latest;
      const unreadTotal = threads.reduce((s, t) => s + (t.unread_count ?? 0), 0);
      onePer.push({
        ...display,
        id: display.id,
        unread_count: unreadTotal,
      });
    });
    onePer.sort(
      (a, b) => new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime()
    );
    return onePer;
  }, [data]);

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        (c.customer_name || "").toLowerCase().includes(q) ||
        (c.last_message_preview || "").toLowerCase().includes(q) ||
        (c.booking_number || "").toLowerCase().includes(q)
    );
  }, [conversations, search]);

  useEffect(() => {
    if (!customerId || loading || hasRedirected.current || conversations.length === 0) return;
    const conv = conversations.find((c) => c.customer_id === customerId);
    if (conv) {
      hasRedirected.current = true;
      router.replace(`${threadBase}/${conv.id}` as never);
    }
  }, [customerId, loading, conversations, router, threadBase]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Messages" showBack={canGoBack} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Messages" showBack={canGoBack} />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Messages"
        showBack={canGoBack}
        subtitle={`${filteredConversations.length} conversation${filteredConversations.length === 1 ? "" : "s"}`}
      />
      <View
        style={{
          paddingHorizontal: screenPadding,
          paddingTop: 8,
          paddingBottom: 4,
        }}
      >
        <View
          style={{
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
          <Ionicons name="search" size={18} color={Colors.gray[400]} style={{ marginRight: 6 }} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name, message, or booking #"
            placeholderTextColor={Colors.gray[400]}
            style={{ flex: 1, fontSize: 14, color: Colors.gray[900] }}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {search.length > 0 ? (
            <TouchableOpacity
              onPress={() => setSearch("")}
              accessibilityLabel="Clear search"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={20} color={Colors.gray[400]} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {filteredConversations.length === 0 ? (
          <EmptyState
            icon="chatbubbles-outline"
            title={conversations.length === 0 ? "No conversations yet" : "No matches"}
            description={
              conversations.length === 0
                ? "When clients message you (e.g. from a booking or custom request), conversations will appear here."
                : "Try a different search."
            }
          />
        ) : (
          filteredConversations.map((conv) => (
            <TouchableOpacity
              key={conv.id}
              onPress={() =>
                router.push(`${threadBase}/${conv.id}` as never)
              }
              style={{ marginBottom: 8, flexDirection: "row", alignItems: "center", borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 16 }}
              activeOpacity={0.7}
            >
              <Avatar
                name={conv.customer_name}
                imageUrl={conv.customer_avatar}
                size="md"
              />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }} numberOfLines={1}>
                    {conv.customer_name}
                  </Text>
                  {conv.unread_count > 0 && (
                    <View style={{ borderRadius: 9999, backgroundColor: "#4f46e5", paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 12, fontWeight: "500", color: Colors.white }}>
                        {conv.unread_count}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={{ marginTop: 2, fontSize: 14, color: Colors.gray[500] }} numberOfLines={1}>
                  {conv.last_message_preview || "No messages yet"}
                </Text>
                <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[400] }}>
                  {formatDateTimeSafe(conv.last_message_at)}
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

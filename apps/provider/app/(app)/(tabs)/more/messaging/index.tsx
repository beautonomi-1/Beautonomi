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
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Colors } from "@/constants/colors";

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
  const { screenPadding } = useResponsive();
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
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Messages" showBack />
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
        showBack
        subtitle={`${conversations.length} conversation${conversations.length === 1 ? "" : "s"}`}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
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

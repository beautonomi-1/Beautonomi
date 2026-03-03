import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

type Ticket = {
  id: string;
  ticket_number: string;
  subject: string;
  status: string;
  priority: string;
  category: string | null;
  created_at: string;
  updated_at: string;
};

type TicketsResponse = { tickets?: Ticket[]; total?: number };

function statusColor(status: string): string {
  switch (status) {
    case "open":
      return "bg-blue-100";
    case "in_progress":
      return "bg-amber-100";
    case "resolved":
      return "bg-green-100";
    case "closed":
      return "bg-gray-100";
    default:
      return "bg-gray-100";
  }
}

export default function SupportTicketsListScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<TicketsResponse>("/api/me/support-tickets");

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const tickets: Ticket[] = data?.tickets ?? [];

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="My support tickets" onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center py-12">
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="My support tickets" onBack={() => router.back()} />
        <View className="flex-1 justify-center px-4">
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader title="My support tickets" onBack={() => router.back()} />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {tickets.length === 0 ? (
          <View className="py-12 px-4 items-center">
            <Ionicons name="chatbubbles-outline" size={48} color="#9ca3af" />
            <Text className="mt-4 text-center text-gray-600">No support tickets yet</Text>
            <Text className="mt-2 text-center text-sm text-gray-500">
              Tap Contact support in Settings to submit a ticket
            </Text>
          </View>
        ) : (
          <View className="px-2 pb-4">
            {tickets.map((t) => (
              <TouchableOpacity
                key={t.id}
                onPress={() => router.push(`/(app)/(tabs)/more/support-tickets/${t.id}` as never)}
                activeOpacity={0.7}
                className="mb-3 rounded-xl border border-gray-200 bg-white p-4"
                accessibilityLabel={`Support ticket ${t.ticket_number}, ${t.subject}, ${t.status.replace("_", " ")}`}
                accessibilityRole="button"
              >
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="font-mono text-xs text-gray-500">{t.ticket_number}</Text>
                  <View className={`rounded-full px-2 py-0.5 ${statusColor(t.status)}`}>
                    <Text className="text-xs font-medium text-gray-800">
                      {t.status.replace("_", " ")}
                    </Text>
                  </View>
                </View>
                <Text className="font-semibold text-gray-900" numberOfLines={2}>
                  {t.subject}
                </Text>
                <Text className="mt-1 text-xs text-gray-500">
                  Updated {new Date(t.updated_at).toLocaleDateString()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

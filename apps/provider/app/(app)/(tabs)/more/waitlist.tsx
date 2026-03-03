import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

type WaitlistEntry = {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  preferred_date: string | null;
  preferred_time_start: string | null;
  preferred_time_end: string | null;
  notes: string | null;
  status: string;
  priority: number | null;
  created_at: string;
  service?: { id: string; title: string } | null;
  staff?: { id: string; name: string } | null;
};

type WaitlistResponse = { entries: WaitlistEntry[]; total?: number };

function statusColor(status: string): string {
  switch (status) {
    case "waiting":
      return "bg-amber-100";
    case "contacted":
      return "bg-blue-100";
    case "booked":
      return "bg-green-100";
    default:
      return "bg-gray-100";
  }
}

export default function WaitlistScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<WaitlistResponse>("/api/provider/waitlist");

  const entries: WaitlistEntry[] = data?.entries ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Waitlist" onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center py-12">
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Waitlist" onBack={() => router.back()} />
        <View className="flex-1 justify-center px-4">
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader title="Waitlist" subtitle="Appointments, waitlist & schedule" onBack={() => router.back()} />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {entries.length === 0 ? (
          <View className="py-12 px-4 items-center">
            <Ionicons name="people-outline" size={48} color="#9ca3af" />
            <Text className="mt-4 text-center text-gray-600">No waitlist entries</Text>
            <Text className="mt-2 text-center text-sm text-gray-500">
              Entries will appear here when customers join the waitlist
            </Text>
          </View>
        ) : (
          <View className="pb-4">
            {entries.map((entry) => (
              <View
                key={entry.id}
                className="mb-3 rounded-xl border border-gray-200 bg-white p-4"
              >
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="font-semibold text-gray-900" numberOfLines={1}>
                    {entry.customer_name || "No name"}
                  </Text>
                  <View className={`rounded-full px-2 py-0.5 ${statusColor(entry.status)}`}>
                    <Text className="text-xs font-medium text-gray-800">{entry.status}</Text>
                  </View>
                </View>
                {entry.service && (
                  <Text className="text-sm text-gray-600">{entry.service.title}</Text>
                )}
                {(entry.preferred_date || entry.customer_phone) && (
                  <Text className="mt-1 text-xs text-gray-500">
                    {entry.preferred_date
                      ? new Date(entry.preferred_date).toLocaleDateString()
                      : ""}
                    {entry.preferred_date && entry.customer_phone ? " · " : ""}
                    {entry.customer_phone ?? ""}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

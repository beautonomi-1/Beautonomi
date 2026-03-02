import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

function todayISO(): string {
  const d = new Date();
  return d.toISOString().split("T")[0];
}

type Segment = {
  id: string;
  segment_order?: number;
  to_booking?: {
    ref_number?: string;
    scheduled_at?: string;
    customer?: { full_name?: string } | null;
  } | null;
};

type RoutesResponse = {
  route?: { id: string } | null;
  segments?: Segment[];
};

export default function RoutesScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const date = todayISO();
  const { data, loading, error, refresh } = useApi<RoutesResponse>(
    `/api/provider/routes?date=${date}`
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Routes" onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center py-12">
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Routes" onBack={() => router.back()} />
        <View className="flex-1 justify-center px-4">
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  const res = data as RoutesResponse;
  const segments = res?.segments ?? [];

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Routes"
        subtitle="Optimize at-home trips"
        onBack={() => router.back()}
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
          <Text className="text-sm text-gray-600">
            Route for {new Date(date).toLocaleDateString()}
          </Text>
        </View>
        {segments.length === 0 ? (
          <View className="py-12 px-4 items-center">
            <Ionicons name="navigate-outline" size={48} color="#9ca3af" />
            <Text className="mt-4 text-center text-gray-600">No route for today</Text>
            <Text className="mt-2 text-center text-sm text-gray-500">
              Plan and optimize routes in the web portal
            </Text>
          </View>
        ) : (
          <View className="pb-4">
            {segments.map((seg, i) => (
              <View
                key={seg.id}
                className="mb-3 flex-row rounded-xl border border-gray-200 bg-white p-4"
              >
                <View className="mr-3 h-8 w-8 items-center justify-center rounded-full bg-indigo-100">
                  <Text className="text-sm font-semibold text-indigo-800">{i + 1}</Text>
                </View>
                <View className="flex-1">
                  <Text className="font-medium text-gray-900">
                    {seg.to_booking?.customer?.full_name ?? "Stop"}
                  </Text>
                  {seg.to_booking?.ref_number && (
                    <Text className="text-xs text-gray-500">{seg.to_booking.ref_number}</Text>
                  )}
                  {seg.to_booking?.scheduled_at && (
                    <Text className="mt-1 text-sm text-gray-600">
                      {new Date(seg.to_booking.scheduled_at).toLocaleTimeString()}
                    </Text>
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

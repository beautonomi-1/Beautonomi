import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

type Review = {
  id: string;
  rating: number;
  comment?: string | null;
  created_at: string;
  provider_response?: string | null;
  customer?: { full_name?: string | null } | null;
};

type ReviewsResponse = { reviews?: Review[] };

export default function EngagementHubScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<ReviewsResponse>(
    "/api/provider/reviews?limit=50"
  );

  const reviews: Review[] = (data as ReviewsResponse)?.reviews ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Engagement" onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center py-12">
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Engagement" onBack={() => router.back()} />
        <View className="flex-1 justify-center px-4">
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Engagement"
        subtitle="Reviews, messaging & marketing"
        onBack={() => router.back()}
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {reviews.length === 0 ? (
          <View className="py-12 px-4 items-center">
            <Ionicons name="chatbubbles-outline" size={48} color="#9ca3af" />
            <Text className="mt-4 text-center text-gray-600">No reviews yet</Text>
            <Text className="mt-2 text-center text-sm text-gray-500">
              Customer reviews will appear here
            </Text>
          </View>
        ) : (
          <View className="pb-4">
            {reviews.map((r) => (
              <View
                key={r.id}
                className="mb-3 rounded-xl border border-gray-200 bg-white p-4"
              >
                <View className="flex-row items-center justify-between">
                  <Text className="font-semibold text-gray-900">
                    {r.customer?.full_name ?? "Customer"}
                  </Text>
                  <View className="flex-row items-center gap-1">
                    <Ionicons name="star" size={14} color="#eab308" />
                    <Text className="text-sm font-medium text-gray-700">{r.rating}</Text>
                  </View>
                </View>
                {r.comment ? (
                  <Text className="mt-2 text-sm text-gray-600" numberOfLines={3}>
                    {r.comment}
                  </Text>
                ) : null}
                <Text className="mt-2 text-xs text-gray-400">
                  {new Date(r.created_at).toLocaleDateString()}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { useProvider } from "@/providers/ProviderContext";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Colors } from "@/constants/colors";

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
  const { selectedLocationId } = useProvider();
  const [refreshing, setRefreshing] = useState(false);
  const reviewsUrl = selectedLocationId
    ? `/api/provider/reviews?limit=50&location_id=${encodeURIComponent(selectedLocationId)}`
    : "/api/provider/reviews?limit=50";
  const { data, loading, error, refresh } = useApi<ReviewsResponse>(reviewsUrl);

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
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Engagement" onBack={() => router.back()} />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
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
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {reviews.length === 0 ? (
          <View style={{ paddingVertical: 48, paddingHorizontal: 16, alignItems: "center" }}>
            <Ionicons name="chatbubbles-outline" size={48} color="#9ca3af" />
            <Text style={{ marginTop: 16, textAlign: "center", color: Colors.gray[600] }}>No reviews yet</Text>
            <Text style={{ marginTop: 8, textAlign: "center", fontSize: 14, color: Colors.gray[500] }}>
              Customer reviews will appear here
            </Text>
          </View>
        ) : (
          <View style={{ paddingBottom: 16 }}>
            {reviews.map((r) => (
              <View
                key={r.id}
                style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>
                    {r.customer?.full_name ?? "Customer"}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Ionicons name="star" size={14} color="#eab308" style={{ marginRight: 4 }} />
                    <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{r.rating}</Text>
                  </View>
                </View>
                {r.comment ? (
                  <Text style={{ marginTop: 8, fontSize: 14, color: Colors.gray[600] }} numberOfLines={3}>
                    {r.comment}
                  </Text>
                ) : null}
                <Text style={{ marginTop: 8, fontSize: 12, color: Colors.gray[400] }}>
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

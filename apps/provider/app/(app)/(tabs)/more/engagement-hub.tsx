import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
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

function formatDateSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleDateString();
}

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
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
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
        {/* Quick actions */}
        <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingTop: 16, gap: 12 }}>
          <TouchableOpacity
            onPress={() => router.push("/(app)/(tabs)/more/messaging" as never)}
            style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 14 }}
            accessibilityLabel="Messages"
            accessibilityRole="button"
          >
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={Colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>Messages</Text>
              <Text style={{ fontSize: 12, color: Colors.gray[500] }}>Client conversations</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.gray[400]} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push("/(app)/(tabs)/more/marketing-hub" as never)}
            style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 14 }}
            accessibilityLabel="Marketing"
            accessibilityRole="button"
          >
            <Ionicons name="megaphone-outline" size={20} color={Colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>Marketing</Text>
              <Text style={{ fontSize: 12, color: Colors.gray[500] }}>Campaigns & promos</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.gray[400]} />
          </TouchableOpacity>
        </View>

        {/* Reviews section header */}
        <View style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }}>Reviews</Text>
          <Text style={{ fontSize: 13, color: Colors.gray[500], marginTop: 2 }}>
            {reviews.length > 0 ? `${reviews.length} review${reviews.length !== 1 ? "s" : ""}` : "No reviews yet"}
          </Text>
        </View>

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
                  {formatDateSafe(r.created_at)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

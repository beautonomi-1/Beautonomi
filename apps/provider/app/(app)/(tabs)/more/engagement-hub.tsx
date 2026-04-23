import { useCallback, useRef, useState } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
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
  provider_response_at?: string | null;
  /** Provider’s rating of the customer (same row as the customer’s review of you). */
  customer_rating?: number | null;
  customer_comment?: string | null;
  customer?: { full_name?: string | null } | null;
  booking?: { booking_number?: string | null; scheduled_at?: string | null } | null;
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
  const { data, loading, error, refresh } = useApi<ReviewsResponse>(reviewsUrl, { staleTimeMs: 0 });
  const engagementHubInitialFocusRef = useRef(true);

  const reviews: Review[] = (data as ReviewsResponse)?.reviews ?? [];

  useFocusEffect(
    useCallback(() => {
      if (engagementHubInitialFocusRef.current) {
        engagementHubInitialFocusRef.current = false;
        return;
      }
      void refresh();
    }, [refresh]),
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

        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <TouchableOpacity
            onPress={() => router.push("/(app)/(tabs)/more/support-tickets" as never)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: Colors.gray[200],
              backgroundColor: Colors.white,
              padding: 14,
            }}
            accessibilityLabel="Support tickets"
            accessibilityRole="button"
          >
            <Ionicons name="ticket-outline" size={20} color="#0284c7" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>Support tickets</Text>
              <Text style={{ fontSize: 12, color: Colors.gray[500] }}>View all tickets and replies</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.gray[400]} />
          </TouchableOpacity>
        </View>

        {/* Reviews section header */}
        <View style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }}>Reviews</Text>
            <Text style={{ fontSize: 13, color: Colors.gray[500], marginTop: 2 }}>
              {reviews.length > 0 ? `${reviews.length} review${reviews.length !== 1 ? "s" : ""}` : "No reviews yet"}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push("/(app)/(tabs)/more/reviews" as never)}
            style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6, paddingHorizontal: 10, borderRadius: 9999, backgroundColor: Colors.gray[100] }}
            accessibilityLabel="Open full reviews list"
            accessibilityRole="button"
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.gray[800] }}>Manage</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.gray[500]} style={{ marginLeft: 2 }} />
          </TouchableOpacity>
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
          <View style={{ paddingBottom: 16, paddingHorizontal: 16 }}>
            {reviews.map((r) => (
              <View
                key={r.id}
                style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ fontWeight: "600", color: Colors.gray[900], flex: 1 }} numberOfLines={1}>
                    {r.customer?.full_name ?? "Customer"}
                  </Text>
                  {!r.provider_response ? (
                    <View style={{ marginLeft: 8, borderRadius: 9999, backgroundColor: "#fef3c2", paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 11, fontWeight: "600", color: "#92400e" }}>Reply pending</Text>
                    </View>
                  ) : null}
                </View>
                {r.booking?.booking_number ? (
                  <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>Booking #{r.booking.booking_number}</Text>
                ) : null}

                <Text style={{ marginTop: 10, fontSize: 11, fontWeight: "700", color: Colors.gray[500], letterSpacing: 0.4 }}>CUSTOMER RATED YOU</Text>
                <View style={{ marginTop: 4, flexDirection: "row", alignItems: "center" }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Ionicons
                      key={star}
                      name={star <= (r.rating ?? 0) ? "star" : "star-outline"}
                      size={16}
                      color="#f59e0b"
                      style={{ marginRight: 2 }}
                    />
                  ))}
                  <Text style={{ marginLeft: 6, fontSize: 14, fontWeight: "600", color: Colors.gray[800] }}>{r.rating}/5</Text>
                </View>
                {r.comment ? (
                  <Text style={{ marginTop: 8, fontSize: 14, color: Colors.gray[700] }}>{r.comment}</Text>
                ) : (
                  <Text style={{ marginTop: 6, fontSize: 13, color: Colors.gray[400], fontStyle: "italic" }}>No written comment</Text>
                )}

                {r.customer_rating != null && r.customer_rating > 0 ? (
                  <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.gray[100] }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: Colors.gray[500], letterSpacing: 0.4 }}>YOUR RATING OF CUSTOMER</Text>
                    <View style={{ marginTop: 4, flexDirection: "row", alignItems: "center" }}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Ionicons
                          key={star}
                          name={star <= (r.customer_rating ?? 0) ? "star" : "star-outline"}
                          size={15}
                          color="#6366f1"
                          style={{ marginRight: 2 }}
                        />
                      ))}
                      <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: "600", color: Colors.gray[800] }}>{r.customer_rating}/5</Text>
                    </View>
                    {r.customer_comment ? (
                      <Text style={{ marginTop: 6, fontSize: 13, color: Colors.gray[600] }}>{r.customer_comment}</Text>
                    ) : null}
                  </View>
                ) : null}

                {r.provider_response ? (
                  <View style={{ marginTop: 12, borderRadius: 10, backgroundColor: Colors.gray[50], padding: 12, borderLeftWidth: 3, borderLeftColor: Colors.primary }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: Colors.gray[500], letterSpacing: 0.4 }}>YOUR PUBLIC REPLY</Text>
                    <Text style={{ marginTop: 6, fontSize: 14, color: Colors.gray[800] }}>{r.provider_response}</Text>
                    {r.provider_response_at ? (
                      <Text style={{ marginTop: 6, fontSize: 11, color: Colors.gray[400] }}>{formatDateSafe(r.provider_response_at)}</Text>
                    ) : null}
                  </View>
                ) : null}

                <Text style={{ marginTop: 10, fontSize: 12, color: Colors.gray[400] }}>
                  Review · {formatDateSafe(r.created_at)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

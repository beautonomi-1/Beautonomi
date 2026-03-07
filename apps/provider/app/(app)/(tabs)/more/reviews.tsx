import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  TextInput,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { Colors } from "@/constants/colors";

interface Review {
  id: string;
  provider_id: string;
  customer_id: string;
  booking_id: string | null;
  rating: number;
  comment: string | null;
  provider_response: string | null;
  created_at: string;
  customer?: { id: string; full_name: string | null; email: string | null };
  booking?: { id: string; booking_number: string | null; scheduled_at: string | null };
}

interface ReviewsResponse {
  reviews: Review[];
  pagination?: { page: number; limit: number; total: number };
}

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "pending_response", label: "To respond" },
  { value: "responded", label: "Responded" },
];

export default function ReviewsScreen() {
  const { screenPadding } = useResponsive();
  const [status, setStatus] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const [respondReview, setRespondReview] = useState<Review | null>(null);
  const [responseText, setResponseText] = useState("");
  const url = `/api/provider/reviews?status=${status}&limit=50`;
  const { data, loading, error, refresh } = useApi<ReviewsResponse>(url);
  const { execute: postRespond, loading: responding } = useApiMutation("post");

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const openRespond = (review: Review) => {
    setRespondReview(review);
    setResponseText("");
  };

  const handleSubmitResponse = async () => {
    if (!respondReview) return;
    const trimmed = responseText.trim();
    if (!trimmed) {
      Alert.alert("Required", "Enter your response to the review.");
      return;
    }
    if (trimmed.length > 1000) {
      Alert.alert("Too long", "Response must be under 1000 characters.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { error: err } = await postRespond(
      `/api/provider/reviews/${respondReview.id}/respond`,
      { response: trimmed }
    );
    if (err) {
      Alert.alert("Error", err);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setRespondReview(null);
    setResponseText("");
    refresh();
  };

  const reviews: Review[] = data?.reviews ?? [];

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Reviews" showBack />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Reviews" showBack />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Reviews"
        showBack
        subtitle={`${reviews.length} review${reviews.length === 1 ? "" : "s"}`}
      />
      <View style={{ marginBottom: 12, flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16 }}>
        {STATUS_FILTERS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            onPress={() => setStatus(opt.value)}
            style={{ marginRight: 8, marginBottom: 8, borderRadius: 9999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: status === opt.value ? "#f59e0b" : Colors.gray[100] }}
          >
            <Text
              style={{ fontSize: 14, fontWeight: "500", color: status === opt.value ? Colors.white : Colors.gray[700] }}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {reviews.length === 0 ? (
          <EmptyState
            icon="star-outline"
            title="No reviews yet"
            description={
              status === "all"
                ? "Customer reviews will appear here after they rate their experience."
                : `No reviews with status "${status === "pending_response" ? "To respond" : "Responded"}".`
            }
          />
        ) : (
          reviews.map((review) => (
            <View
              key={review.id}
              style={{ marginBottom: 12, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
            >
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Ionicons
                      key={star}
                      name={star <= (review.rating ?? 0) ? "star" : "star-outline"}
                      size={16}
                      color="#f59e0b"
                    />
                  ))}
                </View>
                {!review.provider_response && (
                  <View style={{ borderRadius: 9999, backgroundColor: "#fef3c2", paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 12, fontWeight: "500", color: "#92400e" }}>To respond</Text>
                  </View>
                )}
              </View>
              <Text style={{ marginTop: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[900] }}>
                {review.customer?.full_name || "Customer"}
              </Text>
              <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }}>
                {review.booking?.scheduled_at
                  ? new Date(review.booking.scheduled_at).toLocaleDateString()
                  : new Date(review.created_at).toLocaleDateString()}
              </Text>
              {review.comment ? (
                <Text style={{ marginTop: 8, fontSize: 14, color: Colors.gray[700] }} numberOfLines={3}>
                  {review.comment}
                </Text>
              ) : null}
              {review.provider_response ? (
                <View style={{ marginTop: 8, borderRadius: 8, backgroundColor: Colors.gray[50], padding: 8 }}>
                  <Text style={{ fontSize: 12, fontWeight: "500", color: Colors.gray[500] }}>Your response</Text>
                  <Text style={{ marginTop: 2, fontSize: 14, color: Colors.gray[700] }} numberOfLines={2}>
                    {review.provider_response}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => openRespond(review)}
                  style={{ marginTop: 8, flexDirection: "row", alignItems: "center", borderRadius: 8, backgroundColor: "#fffbeb", paddingHorizontal: 12, paddingVertical: 8 }}
                >
                  <Ionicons name="chatbubble-outline" size={14} color="#f59e0b" />
                  <Text style={{ marginLeft: 4, fontSize: 14, fontWeight: "500", color: "#b45309" }}>
                    Respond
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
      </ScrollView>

      <BottomSheet
        visible={respondReview !== null}
        onClose={() => { setRespondReview(null); setResponseText(""); }}
        title="Respond to review"
        subtitle={respondReview ? (respondReview.customer?.full_name || "Customer") : ""}
      >
        {respondReview?.comment ? (
          <View style={{ marginBottom: 16, borderRadius: 12, backgroundColor: Colors.gray[50], padding: 12 }}>
            <Text style={{ fontSize: 12, fontWeight: "500", color: Colors.gray[500] }}>Their review</Text>
            <Text style={{ marginTop: 4, fontSize: 14, color: Colors.gray[800] }}>{respondReview.comment}</Text>
          </View>
        ) : null}
        <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Your response *</Text>
        <TextInput
          style={{ marginBottom: 16, minHeight: 100, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
          placeholder="Thank you for your feedback..."
          placeholderTextColor="#9ca3af"
          value={responseText}
          onChangeText={setResponseText}
          multiline
          maxLength={1000}
        />
        <Text style={{ marginBottom: 16, fontSize: 12, color: Colors.gray[500] }}>{responseText.length}/1000</Text>
        <ActionButton
          label={responding ? "Sending…" : "Send response"}
          onPress={handleSubmitResponse}
          loading={responding}
          fullWidth
        />
      </BottomSheet>
    </ScreenContainer>
  );
}

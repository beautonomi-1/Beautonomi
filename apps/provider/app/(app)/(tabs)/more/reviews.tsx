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
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";

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
        <View className="flex-1 items-center justify-center py-12">
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Reviews" showBack />
        <View className="flex-1 justify-center px-4">
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
      <View className="mb-3 flex-row flex-wrap gap-2 px-4">
        {STATUS_FILTERS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            onPress={() => setStatus(opt.value)}
            className={`rounded-full px-3.5 py-2 ${status === opt.value ? "bg-amber-500" : "bg-gray-100"}`}
          >
            <Text
              className={`text-sm font-medium ${status === opt.value ? "text-white" : "text-gray-700"}`}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
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
              className="mb-3 rounded-2xl border border-gray-200 bg-white p-4"
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-row items-center">
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
                  <View className="rounded-full bg-amber-100 px-2 py-0.5">
                    <Text className="text-xs font-medium text-amber-800">To respond</Text>
                  </View>
                )}
              </View>
              <Text className="mt-1 text-sm font-medium text-gray-900">
                {review.customer?.full_name || "Customer"}
              </Text>
              <Text className="mt-0.5 text-xs text-gray-500">
                {review.booking?.scheduled_at
                  ? new Date(review.booking.scheduled_at).toLocaleDateString()
                  : new Date(review.created_at).toLocaleDateString()}
              </Text>
              {review.comment ? (
                <Text className="mt-2 text-sm text-gray-700" numberOfLines={3}>
                  {review.comment}
                </Text>
              ) : null}
              {review.provider_response ? (
                <View className="mt-2 rounded-lg bg-gray-50 p-2">
                  <Text className="text-xs font-medium text-gray-500">Your response</Text>
                  <Text className="mt-0.5 text-sm text-gray-700" numberOfLines={2}>
                    {review.provider_response}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => openRespond(review)}
                  className="mt-2 flex-row items-center rounded-lg bg-amber-50 px-3 py-2"
                >
                  <Ionicons name="chatbubble-outline" size={14} color="#f59e0b" />
                  <Text className="ml-1 text-sm font-medium text-amber-700">
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
          <View className="mb-4 rounded-xl bg-gray-50 p-3">
            <Text className="text-xs font-medium text-gray-500">Their review</Text>
            <Text className="mt-1 text-sm text-gray-800">{respondReview.comment}</Text>
          </View>
        ) : null}
        <Text className="mb-2 text-sm font-medium text-gray-700">Your response *</Text>
        <TextInput
          className="mb-4 min-h-[100px] rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
          placeholder="Thank you for your feedback..."
          placeholderTextColor="#9ca3af"
          value={responseText}
          onChangeText={setResponseText}
          multiline
          maxLength={1000}
        />
        <Text className="mb-4 text-xs text-gray-500">{responseText.length}/1000</Text>
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

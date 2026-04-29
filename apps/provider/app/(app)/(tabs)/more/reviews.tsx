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
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { useProvider } from "@/providers/ProviderContext";
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
  provider_response_at?: string | null;
  /** Stars you gave the customer on this booking review row */
  customer_rating?: number | null;
  customer_comment?: string | null;
  created_at: string;
  customer?: { id: string; full_name: string | null; email: string | null };
  booking?: { id: string; booking_number: string | null; scheduled_at: string | null };
}

interface ReviewsResponse {
  reviews: Review[];
  pagination?: { page: number; limit: number; total: number };
}

function formatDateSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleDateString();
}

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "pending_response", label: "To respond" },
  { value: "responded", label: "Responded" },
];

export default function ReviewsScreen() {
  const { screenPadding } = useResponsive();
  const { selectedLocationId } = useProvider();
  const [status, setStatus] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const [respondReview, setRespondReview] = useState<Review | null>(null);
  const [responseText, setResponseText] = useState("");
  const [savingReply, setSavingReply] = useState(false);
  const url = `/api/provider/reviews?status=${status}&limit=50${selectedLocationId ? `&location_id=${encodeURIComponent(selectedLocationId)}` : ""}`;
  const { data, loading, error, refresh, mutate } = useApi<ReviewsResponse>(url, { staleTimeMs: 0 });
  const { execute: postRespond, loading: responding } = useApiMutation<{ review?: Review; message?: string }>(
    "post",
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const openRespond = (review: Review, options?: { edit?: boolean }) => {
    setRespondReview(review);
    setResponseText(options?.edit && review.provider_response ? review.provider_response : "");
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
    const path = `/api/provider/reviews/${respondReview.id}/respond`;
    const isEdit = Boolean(respondReview.provider_response);
    setSavingReply(true);
    try {
      if (isEdit) {
        const res = await api.patch<{ review?: Review; message?: string }>(path, { response: trimmed });
        if (res.error) {
          Alert.alert("Error", getApiErrorMessage(res.error, "Could not update reply."));
          return;
        }
        if (data && res.data?.review) {
          const row = res.data.review as Partial<Review>;
          mutate({
            ...data,
            reviews: data.reviews.map((r) => (r.id === respondReview.id ? { ...r, ...row } : r)),
          });
        }
      } else {
        const { data: wrote, error: err } = await postRespond(path, { response: trimmed });
        if (err) {
          Alert.alert("Error", err);
          return;
        }
        if (data && wrote?.review) {
          const row = wrote.review as Partial<Review>;
          const rid = respondReview.id;
          if (status === "pending_response") {
            mutate({ ...data, reviews: data.reviews.filter((r) => r.id !== rid) });
          } else {
            mutate({
              ...data,
              reviews: data.reviews.map((r) => (r.id === rid ? { ...r, ...row } : r)),
            });
          }
        }
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setRespondReview(null);
      setResponseText("");
      await refresh();
    } finally {
      setSavingReply(false);
    }
  };

  const reviews: Review[] = data?.reviews ?? [];
  const reviewTotalCount = data?.pagination?.total ?? reviews.length;

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
        subtitle={`${reviewTotalCount} review${reviewTotalCount === 1 ? "" : "s"}`}
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
                  ? formatDateSafe(review.booking.scheduled_at)
                  : formatDateSafe(review.created_at)}
              </Text>
              {review.comment ? (
                <Text style={{ marginTop: 8, fontSize: 14, color: Colors.gray[700] }}>{review.comment}</Text>
              ) : null}

              {review.customer_rating != null && review.customer_rating > 0 ? (
                <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.gray[100] }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: Colors.gray[500], letterSpacing: 0.4 }}>YOUR RATING OF CUSTOMER</Text>
                  <View style={{ marginTop: 4, flexDirection: "row", alignItems: "center" }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Ionicons
                        key={star}
                        name={star <= (review.customer_rating ?? 0) ? "star" : "star-outline"}
                        size={15}
                        color="#6366f1"
                        style={{ marginRight: 2 }}
                      />
                    ))}
                    <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: "600", color: Colors.gray[800] }}>{review.customer_rating}/5</Text>
                  </View>
                  {review.customer_comment ? (
                    <Text style={{ marginTop: 6, fontSize: 13, color: Colors.gray[600] }}>{review.customer_comment}</Text>
                  ) : null}
                </View>
              ) : null}

              {review.provider_response ? (
                <View style={{ marginTop: 10 }}>
                  <View style={{ borderRadius: 8, backgroundColor: Colors.gray[50], padding: 10 }}>
                    <Text style={{ fontSize: 12, fontWeight: "500", color: Colors.gray[500] }}>Your public reply</Text>
                    <Text style={{ marginTop: 4, fontSize: 14, color: Colors.gray[800] }}>{review.provider_response}</Text>
                    {review.provider_response_at ? (
                      <Text style={{ marginTop: 6, fontSize: 11, color: Colors.gray[400] }}>{formatDateSafe(review.provider_response_at)}</Text>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    onPress={() => openRespond(review, { edit: true })}
                    style={{ marginTop: 8, flexDirection: "row", alignItems: "center", alignSelf: "flex-start" }}
                    accessibilityLabel="Edit your reply to this review"
                    accessibilityRole="button"
                  >
                    <Ionicons name="create-outline" size={16} color="#b45309" />
                    <Text style={{ marginLeft: 4, fontSize: 14, fontWeight: "600", color: "#b45309" }}>Edit reply</Text>
                  </TouchableOpacity>
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
        title={respondReview?.provider_response ? "Edit your reply" : "Respond to review"}
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
          label={responding || savingReply ? "Saving…" : respondReview?.provider_response ? "Save changes" : "Send response"}
          onPress={handleSubmitResponse}
          loading={responding || savingReply}
          fullWidth
        />
      </BottomSheet>
    </ScreenContainer>
  );
}

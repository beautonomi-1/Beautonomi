"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, Text, TextInput, TouchableOpacity, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTranslation } from "@beautonomi/i18n";
import { Colors } from "@/constants/colors";
import { api } from "@/lib/api-client";
import { useAuth } from "@/providers/AuthProvider";
import { LoveTheAppSheet } from "@/components/LoveTheAppSheet";
import {
  shouldPromptStoreReview,
  recordStoreReviewAccepted,
  recordStoreReviewNotNow,
  recordStoreReviewDontAsk,
  requestAppStoreReview,
  trackStoreReviewEvent,
} from "@/lib/store-review-prompt";

export type PostCompletionStep = "idle" | "choose" | "photo" | "rate" | "done";

type PostCompletionSheetProps = {
  visible: boolean;
  bookingId: string;
  providerPointsEarned?: number | null;
  primaryServiceName: string;
  primaryOfferingId?: string;
  hasExistingRating: boolean;
  /** When returning from Explore (`step=rate`), open on the rating step. */
  initialStep?: PostCompletionStep;
  onDismiss: (markSeen: boolean) => void;
  onRated: () => void;
};

const STORAGE_PREFIX = "provider_booking_completion_modal_seen_";

export function PostCompletionSheet({
  visible,
  bookingId,
  providerPointsEarned,
  primaryServiceName,
  primaryOfferingId,
  hasExistingRating,
  initialStep = "choose",
  onDismiss,
  onRated,
}: PostCompletionSheetProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const { user } = useAuth();
  const [step, setStep] = useState<PostCompletionStep>(initialStep);
  const [rateStars, setRateStars] = useState(0);
  const [rateComment, setRateComment] = useState("");
  const [submittingRate, setSubmittingRate] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);
  const [storeReviewOpen, setStoreReviewOpen] = useState(false);
  const seenRef = useRef(false);
  const submittedStarsRef = useRef(0);

  useEffect(() => {
    if (visible) {
      setStep(initialStep === "rate" && !hasExistingRating ? "rate" : "choose");
      setRateError(null);
    }
  }, [visible, hasExistingRating, initialStep]);

  const markSeen = useCallback(() => {
    seenRef.current = true;
    void AsyncStorage.setItem(STORAGE_PREFIX + bookingId, "1").catch(() => {});
    onDismiss(true);
  }, [bookingId, onDismiss]);

  const goToExplorePhoto = () => {
    onDismiss(false);
    const qs = new URLSearchParams({
      create: "1",
      addToGallery: "1",
      caption: `Fresh ${primaryServiceName}`,
      ...(primaryOfferingId ? { offeringId: primaryOfferingId } : {}),
      bookingId,
      returnTo: "booking",
      step: "rate",
    }).toString();
    router.push(`/(app)/(tabs)/more/explore-posts?${qs}` as never);
  };

  const submitRating = async () => {
    if (rateStars < 1) {
      setRateError("Select a rating (1–5 stars).");
      return;
    }
    setSubmittingRate(true);
    setRateError(null);
    try {
      const res = await api.post("/api/provider/ratings", {
        booking_id: bookingId,
        rating: rateStars,
        comment: rateComment.trim() || undefined,
      });
      if (res.error) {
        setRateError(res.error.message || "Failed to submit rating.");
        return;
      }
      submittedStarsRef.current = rateStars;
      setStep("done");
      onRated();
      if (rateStars >= 4) {
        const prompt = await shouldPromptStoreReview({
          userId: user?.id,
          stars: rateStars,
          isEdit: false,
        });
        if (prompt) {
          setTimeout(() => {
            trackStoreReviewEvent("store_review_prompt_shown", "client_rating", { rating: rateStars });
            setStoreReviewOpen(true);
          }, 800);
          return;
        }
      } else if (rateStars >= 1) {
        setTimeout(() => {
          trackStoreReviewEvent("low_score_feedback", "client_rating", { rating: rateStars });
          Alert.alert(
            t("common.storeReview.lowScoreTitle"),
            t("common.storeReview.lowScoreBody"),
            [
              { text: t("common.cancel"), style: "cancel", onPress: markSeen },
              {
                text: t("common.storeReview.lowScoreAction"),
                onPress: () => {
                  markSeen();
                  router.push("/(app)/(tabs)/more/support-tickets/new" as never);
                },
              },
            ],
          );
        }, 800);
        return;
      }
      setTimeout(() => markSeen(), 800);
    } catch (e: unknown) {
      setRateError(e instanceof Error ? e.message : "Failed to submit rating.");
    } finally {
      setSubmittingRate(false);
    }
  };

  if (!visible) return null;

  return (
    <>
    <Modal visible={visible} animationType="fade" transparent onRequestClose={markSeen}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 }}
        onPress={markSeen}
      >
        <Pressable
          style={{ backgroundColor: "#fff", borderRadius: 20, padding: 24, width: "100%", maxWidth: 360 }}
          onPress={(e) => e.stopPropagation()}
        >
          {step === "choose" ? (
            <>
              <Text style={{ fontSize: 20, fontWeight: "700", textAlign: "center", marginBottom: 8 }}>Booking complete</Text>
              {providerPointsEarned && providerPointsEarned > 0 ? (
                <Text style={{ fontSize: 15, fontWeight: "600", color: Colors.primary, textAlign: "center", marginBottom: 16 }}>
                  You earned {providerPointsEarned} points.
                </Text>
              ) : null}
              <TouchableOpacity
                onPress={() => setStep("photo")}
                style={{ backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 14, alignItems: "center", marginBottom: 10 }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>Add a photo of your work</Text>
              </TouchableOpacity>
              {!hasExistingRating ? (
                <TouchableOpacity
                  onPress={() => setStep("rate")}
                  style={{ borderWidth: 1.5, borderColor: Colors.primary, paddingVertical: 13, borderRadius: 12, alignItems: "center", marginBottom: 10 }}
                >
                  <Text style={{ color: Colors.primary, fontWeight: "600" }}>Rate this client</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={markSeen} style={{ paddingVertical: 12, alignItems: "center" }}>
                <Text style={{ color: Colors.gray[500] }}>Done for now</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {step === "photo" ? (
            <>
              <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 12 }}>Show off your work</Text>
              <Text style={{ color: Colors.gray[600], marginBottom: 16 }}>
                Post to Explore to reach new clients. You can also add it to your gallery.
              </Text>
              <TouchableOpacity
                onPress={goToExplorePhoto}
                style={{ backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 14, alignItems: "center", marginBottom: 10 }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>Open Explore</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setStep(hasExistingRating ? "choose" : "rate")} style={{ paddingVertical: 12, alignItems: "center" }}>
                <Text style={{ color: Colors.primary }}>{hasExistingRating ? "Back" : "Skip to rate client"}</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {step === "rate" ? (
            <>
              <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 12 }}>Rate this client</Text>
              <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 12 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <TouchableOpacity key={n} onPress={() => setRateStars(n)}>
                    <Ionicons name={rateStars >= n ? "star" : "star-outline"} size={28} color={Colors.primary} />
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                value={rateComment}
                onChangeText={setRateComment}
                placeholder="Optional comment"
                multiline
                style={{ borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 10, padding: 10, minHeight: 72, marginBottom: 12 }}
              />
              {rateError ? <Text style={{ color: "#DC2626", marginBottom: 8 }}>{rateError}</Text> : null}
              <TouchableOpacity
                onPress={() => void submitRating()}
                disabled={submittingRate}
                style={{ backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 14, alignItems: "center" }}
              >
                {submittingRate ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "700" }}>Submit rating</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setStep("choose")} style={{ paddingVertical: 12, alignItems: "center" }}>
                <Text style={{ color: Colors.gray[500] }}>Back</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {step === "done" ? (
            <View style={{ alignItems: "center", paddingVertical: 16 }}>
              <Ionicons name="checkmark-circle" size={48} color={Colors.primary} />
              <Text style={{ marginTop: 12, fontSize: 16, fontWeight: "600" }}>Thanks!</Text>
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
    <LoveTheAppSheet
      visible={storeReviewOpen}
      stars={submittedStarsRef.current}
      onRate={() => {
        void (async () => {
          if (user?.id) await recordStoreReviewAccepted(user.id);
          trackStoreReviewEvent("accepted", "client_rating", { rating: submittedStarsRef.current });
          await requestAppStoreReview();
          setStoreReviewOpen(false);
          markSeen();
        })();
      }}
      onNotNow={() => {
        void (async () => {
          if (user?.id) await recordStoreReviewNotNow(user.id);
          trackStoreReviewEvent("not_now", "client_rating", { rating: submittedStarsRef.current });
          setStoreReviewOpen(false);
          markSeen();
        })();
      }}
      onDontAsk={() => {
        void (async () => {
          if (user?.id) await recordStoreReviewDontAsk(user.id);
          trackStoreReviewEvent("dont_ask", "client_rating", { rating: submittedStarsRef.current });
          setStoreReviewOpen(false);
          markSeen();
        })();
      }}
    />
    </>
  );
}

export { STORAGE_PREFIX as POST_COMPLETION_STORAGE_PREFIX };

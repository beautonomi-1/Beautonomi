import { useCallback, useRef, useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "@beautonomi/i18n";
import { useAuth } from "@/providers/AuthProvider";
import {
  shouldPromptStoreReview,
  recordStoreReviewAccepted,
  recordStoreReviewNotNow,
  recordStoreReviewDontAsk,
  requestAppStoreReview,
  trackStoreReviewEvent,
  type StoreReviewSource,
} from "@/lib/store-review-prompt";

export function useStoreReviewAfterRating(source: StoreReviewSource = "client_rating") {
  const router = useRouter();
  const { t } = useTranslation();
  const { user } = useAuth();
  const [storeReviewOpen, setStoreReviewOpen] = useState(false);
  const submittedStarsRef = useRef(0);
  const completeRef = useRef<() => void>(() => {});

  const afterRatingSubmitted = useCallback(
    async (stars: number, onComplete?: () => void) => {
      submittedStarsRef.current = stars;
      completeRef.current = onComplete ?? (() => {});
      if (stars >= 4) {
        const prompt = await shouldPromptStoreReview({
          userId: user?.id,
          stars,
          isEdit: false,
        });
        if (prompt) {
          setTimeout(() => {
            trackStoreReviewEvent("store_review_prompt_shown", source, { rating: stars });
            setStoreReviewOpen(true);
          }, 800);
          return;
        }
      } else if (stars >= 1) {
        setTimeout(() => {
          trackStoreReviewEvent("low_score_feedback", source, { rating: stars });
          Alert.alert(
            t("common.storeReview.lowScoreTitle"),
            t("common.storeReview.lowScoreBody"),
            [
              { text: t("common.cancel"), style: "cancel", onPress: () => completeRef.current() },
              {
                text: t("common.storeReview.lowScoreAction"),
                onPress: () => {
                  completeRef.current();
                  router.push("/(app)/(tabs)/more/support-tickets/new" as never);
                },
              },
            ],
          );
        }, 800);
        return;
      }
      completeRef.current();
    },
    [router, source, t, user?.id],
  );

  const finishSheet = useCallback(() => {
    setStoreReviewOpen(false);
    completeRef.current();
  }, []);

  const sheetProps = {
    visible: storeReviewOpen,
    stars: submittedStarsRef.current,
    onRate: () => {
      void (async () => {
        if (user?.id) await recordStoreReviewAccepted(user.id);
        trackStoreReviewEvent("accepted", source, { rating: submittedStarsRef.current });
        await requestAppStoreReview();
        finishSheet();
      })();
    },
    onNotNow: () => {
      void (async () => {
        if (user?.id) await recordStoreReviewNotNow(user.id);
        trackStoreReviewEvent("not_now", source, { rating: submittedStarsRef.current });
        finishSheet();
      })();
    },
    onDontAsk: () => {
      void (async () => {
        if (user?.id) await recordStoreReviewDontAsk(user.id);
        trackStoreReviewEvent("dont_ask", source, { rating: submittedStarsRef.current });
        finishSheet();
      })();
    },
  };

  return { afterRatingSubmitted, storeReviewOpen, setStoreReviewOpen, sheetProps, submittedStarsRef };
}

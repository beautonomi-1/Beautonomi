"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { useTranslation } from "@beautonomi/i18n";

export type PostCompletionStep = "choose" | "photo" | "rate" | "done";

type PostCompletionSheetProps = {
  open: boolean;
  bookingId: string;
  providerPointsEarned?: number | null;
  primaryServiceName: string;
  primaryOfferingId?: string;
  customerName: string;
  onDismiss: (markSeen: boolean) => void;
  onRated?: () => void;
};

export const PROVIDER_COMPLETION_MODAL_STORAGE_KEY = "provider_booking_completion_modal_seen_";

export function PostCompletionSheet({
  open,
  bookingId,
  providerPointsEarned,
  primaryServiceName,
  primaryOfferingId,
  customerName,
  onDismiss,
  onRated,
}: PostCompletionSheetProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [step, setStep] = useState<PostCompletionStep>("choose");
  const [hasExistingRating, setHasExistingRating] = useState(false);
  const [rateStars, setRateStars] = useState(0);
  const [rateComment, setRateComment] = useState("");
  const [submittingRate, setSubmittingRate] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);
  const seenRef = useRef(false);

  useEffect(() => {
    if (!open || !bookingId) return;
    setStep("choose");
    setRateError(null);
    setRateStars(0);
    setRateComment("");
    fetcher
      .get<{ data?: { has_rating?: boolean }; has_rating?: boolean }>(
        `/api/provider/ratings?booking_id=${encodeURIComponent(bookingId)}`,
      )
      .then((res) => setHasExistingRating(Boolean(res.data?.has_rating ?? res.has_rating)))
      .catch(() => setHasExistingRating(false));
  }, [open, bookingId]);

  const markSeen = useCallback(() => {
    seenRef.current = true;
    onDismiss(true);
  }, [onDismiss]);

  const goToExplorePhoto = () => {
    markSeen();
    const qs = new URLSearchParams({
      caption: t("web.provider.postCompletion.freshCaption", { service: primaryServiceName }),
      addToGallery: "1",
      bookingId,
      returnTo: "booking",
      step: "rate",
      ...(primaryOfferingId ? { offeringId: primaryOfferingId } : {}),
    }).toString();
    router.push(`/provider/explore/new?${qs}`);
  };

  const submitRating = async () => {
    if (rateStars < 1) {
      setRateError(t("web.provider.postCompletion.selectRating"));
      return;
    }
    setSubmittingRate(true);
    setRateError(null);
    try {
      await fetcher.post("/api/provider/ratings", {
        booking_id: bookingId,
        rating: rateStars,
        comment: rateComment.trim() || undefined,
      });
      setStep("done");
      onRated?.();
      toast.success(t("web.provider.postCompletion.ratingSaved"));
      window.setTimeout(() => markSeen(), 800);
    } catch (error) {
      setRateError(error instanceof Error ? error.message : t("web.provider.postCompletion.submitFailed"));
    } finally {
      setSubmittingRate(false);
    }
  };

  const pointsNum =
    typeof providerPointsEarned === "number" && Number.isFinite(providerPointsEarned) && providerPointsEarned > 0
      ? providerPointsEarned
      : 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && markSeen()}>
      <DialogContent className="sm:max-w-md" hideClose={false}>
        {step === "choose" ? (
          <>
            <DialogHeader>
              <div className="mb-3 flex justify-center">
                <div className="rounded-full bg-primary/10 p-4">
                  <Trophy className="h-10 w-10 text-primary" aria-hidden />
                </div>
              </div>
              <DialogTitle className="text-center text-xl">{t("web.provider.postCompletion.title")}</DialogTitle>
              <DialogDescription className="space-y-2 text-center">
                {pointsNum > 0 ? (
                  <span className="block font-medium text-primary">
                    {t("web.provider.postCompletion.pointsEarned", { count: pointsNum })}
                  </span>
                ) : (
                  <span className="block text-sm text-muted-foreground">
                    {t("web.provider.postCompletion.pointsHint")}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-start">
              <div className="mb-1 flex items-center gap-2">
                <Camera className="h-4 w-4 text-primary" aria-hidden />
                <span className="text-sm font-semibold text-gray-900">{t("web.provider.postCompletion.showWork")}</span>
              </div>
              <p className="mb-3 text-xs leading-5 text-gray-600">
                {t("web.provider.postCompletion.showWorkHint")}
              </p>
              <Button onClick={() => setStep("photo")} className="w-full">
                <Camera className="me-2 h-4 w-4" aria-hidden />
                {t("web.provider.postCompletion.addPhoto")}
              </Button>
            </div>
            <DialogFooter className="mt-2 flex-col-reverse gap-2 sm:flex-col">
              {!hasExistingRating ? (
                <Button variant="outline" onClick={() => setStep("rate")} className="w-full">
                  {t("web.provider.postCompletion.rateCustomer", { name: customerName })}
                </Button>
              ) : null}
              <Button variant="ghost" onClick={markSeen} className="w-full">
                {t("web.provider.postCompletion.doneForNow")}
              </Button>
            </DialogFooter>
          </>
        ) : null}

        {step === "photo" ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("web.provider.postCompletion.photoTitle")}</DialogTitle>
              <DialogDescription>
                {t("web.provider.postCompletion.photoDescription")}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button onClick={goToExplorePhoto} className="w-full">
                {t("web.provider.postCompletion.openExplore")}
              </Button>
              <Button
                variant="outline"
                onClick={() => setStep(hasExistingRating ? "choose" : "rate")}
                className="w-full"
              >
                {hasExistingRating ? t("web.provider.postCompletion.back") : t("web.provider.postCompletion.skipToRate")}
              </Button>
            </DialogFooter>
          </>
        ) : null}

        {step === "rate" ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("web.provider.postCompletion.rateCustomer", { name: customerName })}</DialogTitle>
              <DialogDescription>{t("web.provider.postCompletion.howWasClient")}</DialogDescription>
            </DialogHeader>
            <div className="flex justify-center gap-2 py-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRateStars(n)}
                  className={`text-2xl ${rateStars >= n ? "text-amber-500" : "text-gray-300"}`}
                  aria-label={t("web.provider.postCompletion.starA11y", { count: n })}
                >
                  ★
                </button>
              ))}
            </div>
            <Textarea
              value={rateComment}
              onChange={(e) => setRateComment(e.target.value)}
              placeholder={t("web.provider.postCompletion.commentPlaceholder")}
            />
            {rateError ? <p className="text-sm text-red-600">{rateError}</p> : null}
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button onClick={() => void submitRating()} disabled={submittingRate} className="w-full">
                {submittingRate ? t("web.provider.postCompletion.saving") : t("web.provider.postCompletion.submitRating")}
              </Button>
              <Button variant="ghost" onClick={() => setStep("choose")} className="w-full">
                {t("web.provider.postCompletion.back")}
              </Button>
            </DialogFooter>
          </>
        ) : null}

        {step === "done" ? (
          <div className="py-6 text-center">
            <DialogTitle className="mb-2">{t("web.provider.postCompletion.thanks")}</DialogTitle>
            <DialogDescription>{t("web.provider.postCompletion.ratingSavedBody")}</DialogDescription>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

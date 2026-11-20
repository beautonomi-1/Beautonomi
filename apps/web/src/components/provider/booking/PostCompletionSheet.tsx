"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Share2, Trophy } from "lucide-react";
import {
  buildWebNavigatorSharePayload,
  ensureSingleLinkInMessage,
} from "@beautonomi/utils";
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
  /** When false, client already paid online — share copy only nudges rebook. */
  walkInOrUnpaidComplete?: boolean;
  onDismiss: (markSeen: boolean) => void;
  onRated?: () => void;
};

export const PROVIDER_COMPLETION_MODAL_STORAGE_KEY = "provider_booking_completion_modal_seen_";

type JsonRecord = Record<string, unknown>;
type RebookOfferResponse = { data?: JsonRecord } & JsonRecord;

export function PostCompletionSheet({
  open,
  bookingId,
  providerPointsEarned,
  primaryServiceName,
  primaryOfferingId,
  customerName,
  walkInOrUnpaidComplete = true,
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
  const [rebookLoading, setRebookLoading] = useState(false);
  const [rebookPreview, setRebookPreview] = useState<{
    clientFirstName: string;
    providerHint: string;
    messageBody: string;
    link: string;
    channel: string;
    channelReason: string | null;
    maskedDestination: string | null;
    canWhatsAppHandoff: boolean;
    canEditClientPhone: boolean;
    customerUserId?: string;
    existingOffer?: {
      id: string;
      status: string;
      openedAt: string | null;
      sentAt: string | null;
      bookedAt: string | null;
    } | null;
  } | null>(null);
  const [rebookMessage, setRebookMessage] = useState("");
  const [rebookStatus, setRebookStatus] = useState<string | null>(null);
  const [editMessageOpen, setEditMessageOpen] = useState(false);
  const [clientPhoneDraft, setClientPhoneDraft] = useState("");
  const seenRef = useRef(false);
  const dismissTimerRef = useRef<number | null>(null);

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

  useEffect(() => {
    if (!open || !bookingId) return;
    setRebookLoading(true);
    setRebookStatus(null);
    fetcher
      .get<RebookOfferResponse>(
        `/api/provider/bookings/${encodeURIComponent(bookingId)}/rebook-offer`,
      )
      .then((res) => {
        const row = (res.data ?? res) as Record<string, unknown>;
        setRebookPreview(row as typeof rebookPreview);
        setRebookMessage(String(row.messageBody ?? ""));
      })
      .catch(() => setRebookPreview(null))
      .finally(() => setRebookLoading(false));
  }, [open, bookingId]);

  const shareRebookYourself = async () => {
    if (!rebookPreview) return;
    setRebookLoading(true);
    try {
      const res = await fetcher.post<{
        data?: { message_body?: string; channel?: string };
      }>(`/api/provider/bookings/${encodeURIComponent(bookingId)}/rebook-offer`, {
        message: rebookMessage,
        deliver: "self",
        ...(clientPhoneDraft.trim() ? { client_phone: clientPhoneDraft.trim() } : {}),
      });
      const data = (res.data ?? res) as { message_body?: string; link?: string };
      const link = data.link || rebookPreview.link;
      const msg = data.message_body || ensureSingleLinkInMessage(rebookMessage, link);
      setRebookMessage(msg);
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share(buildWebNavigatorSharePayload(link, msg));
        return;
      }
      await navigator.clipboard.writeText(msg);
      toast.success(t("web.provider.postCompletion.linkCopied"));
    } catch {
      toast.error(t("web.provider.postCompletion.shareFailed"));
    } finally {
      setRebookLoading(false);
    }
  };

  const sendRebook = async () => {
    if (!rebookPreview) return;
    setRebookLoading(true);
    try {
      const res = await fetcher.post<{ data?: { whatsapp_url?: string | null; channel?: string } }>(
        `/api/provider/bookings/${encodeURIComponent(bookingId)}/rebook-offer`,
        {
          message: rebookMessage,
          ...(clientPhoneDraft.trim() ? { client_phone: clientPhoneDraft.trim() } : {}),
        },
      );
      const data = res.data ?? (res as { whatsapp_url?: string; channel?: string });
      const wa = (data as { whatsapp_url?: string | null }).whatsapp_url;
      const channel = String((data as { channel?: string }).channel ?? "");
      if (wa) {
        const opened = window.open(wa, "_blank", "noopener,noreferrer");
        if (!opened) {
          toast.error(t("web.provider.postCompletion.whatsAppOpenFailed"));
          return;
        }
        setRebookStatus(
          rebookPreview.maskedDestination
            ? t("web.provider.postCompletion.rebookOpenedWhatsAppTo", {
                destination: rebookPreview.maskedDestination,
              })
            : t("web.provider.postCompletion.rebookOpenedWhatsAppDevice"),
        );
      } else if (channel === "sms" || channel === "email" || channel === "push") {
        setRebookStatus(t("web.provider.postCompletion.rebookStatusSent"));
        toast.success(t("web.provider.postCompletion.rebookLinkSent"));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("web.provider.postCompletion.shareFailed"));
    } finally {
      setRebookLoading(false);
    }
  };

  const primaryChannelLabel = () => {
    if (!rebookPreview) return t("web.provider.postCompletion.lockNextVisit");
    const name = rebookPreview.clientFirstName || customerName;
    if (rebookPreview.canWhatsAppHandoff) return t("web.provider.postCompletion.sendRebookWhatsApp", { name });
    if (rebookPreview.channel === "sms") return t("web.provider.postCompletion.sendRebookSms", { name });
    if (rebookPreview.channel === "email") return t("web.provider.postCompletion.sendRebookEmail", { name });
    if (rebookPreview.channel === "push") return t("web.provider.postCompletion.sendRebookPush", { name });
    return t("web.provider.postCompletion.lockNextVisit");
  };

  const markSeen = useCallback(() => {
    if (dismissTimerRef.current != null) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
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
      dismissTimerRef.current = window.setTimeout(() => {
        dismissTimerRef.current = null;
        markSeen();
      }, 800);
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
            {rebookPreview ? (
              <div className="space-y-3 text-start">
                <p className="text-xs leading-5 text-muted-foreground">{rebookPreview.providerHint}</p>
                <p className="rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed whitespace-pre-wrap">
                  {rebookMessage}
                </p>
                <button
                  type="button"
                  className="text-xs text-primary underline"
                  onClick={() => setEditMessageOpen((v) => !v)}
                >
                  Edit message
                </button>
                {editMessageOpen ? (
                  <Textarea
                    value={rebookMessage}
                    onChange={(e) => setRebookMessage(e.target.value)}
                    rows={4}
                    className="text-sm"
                  />
                ) : null}
                {rebookPreview.channel !== "none" ||
                rebookPreview.canWhatsAppHandoff ||
                (rebookPreview.canEditClientPhone && clientPhoneDraft.trim().length > 0) ? (
                  <Button onClick={() => void sendRebook()} className="w-full" disabled={rebookLoading}>
                    <Share2 className="me-2 h-4 w-4" aria-hidden />
                    {primaryChannelLabel()}
                  </Button>
                ) : null}
                {rebookPreview.maskedDestination ? (
                  <p className="text-center text-xs text-muted-foreground">{rebookPreview.maskedDestination}</p>
                ) : null}
                {rebookPreview.channel === "none" && rebookPreview.channelReason ? (
                  <p className="text-xs text-amber-700">{rebookPreview.channelReason}</p>
                ) : null}
                {rebookPreview.canEditClientPhone &&
                rebookPreview.channel === "none" &&
                !rebookPreview.canWhatsAppHandoff ? (
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground" htmlFor="rebook-client-phone">
                      {t("web.provider.postCompletion.clientPhoneForRebook", {
                        name: rebookPreview.clientFirstName || customerName,
                      })}
                    </label>
                    <Textarea
                      id="rebook-client-phone"
                      value={clientPhoneDraft}
                      onChange={(e) => setClientPhoneDraft(e.target.value)}
                      rows={1}
                      className="text-sm min-h-9"
                    />
                  </div>
                ) : null}
                {rebookPreview.existingOffer?.status &&
                !["pending", "cancelled"].includes(rebookPreview.existingOffer.status) ? (
                  <p className="text-xs text-muted-foreground">
                    {t("web.provider.postCompletion.rebookStatusTitle")}:{" "}
                    {rebookPreview.existingOffer.status === "handed_to_whatsapp"
                      ? t("web.provider.postCompletion.rebookStatusWhatsApp")
                      : rebookPreview.existingOffer.status === "sent"
                        ? t("web.provider.postCompletion.rebookStatusSent")
                        : rebookPreview.existingOffer.status === "opened"
                          ? t("web.provider.postCompletion.rebookStatusOpened")
                          : rebookPreview.existingOffer.status === "booked"
                            ? t("web.provider.postCompletion.rebookStatusBooked")
                            : rebookPreview.existingOffer.status}
                  </p>
                ) : null}
                {rebookStatus ? <p className="text-xs font-medium text-primary">{rebookStatus}</p> : null}
                {rebookPreview.existingOffer &&
                ["handed_to_whatsapp", "sent", "opened"].includes(rebookPreview.existingOffer.status) ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={async () => {
                      try {
                        await fetcher.delete(
                          `/api/provider/bookings/${encodeURIComponent(bookingId)}/rebook-offer`,
                        );
                        toast.success(t("web.provider.postCompletion.rebookReleased"));
                        setRebookStatus(null);
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : t("web.provider.postCompletion.shareFailed"));
                      }
                    }}
                  >
                    {t("web.provider.postCompletion.rebookRelease")}
                  </Button>
                ) : null}
                <Button variant="ghost" onClick={() => void shareRebookYourself()} className="w-full">
                  {t("web.provider.postCompletion.shareRebookYourself")}
                </Button>
              </div>
            ) : rebookLoading ? (
              <p className="text-center text-xs text-muted-foreground">{t("web.provider.postCompletion.rebookLoading")}</p>
            ) : null}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-start">
              <div className="mb-1 flex items-center gap-2">
                <Camera className="h-4 w-4 text-primary" aria-hidden />
                <span className="text-sm font-semibold text-gray-900">{t("web.provider.postCompletion.showWork")}</span>
              </div>
              <p className="mb-3 text-xs leading-5 text-gray-600">
                {t("web.provider.postCompletion.showWorkHint")}
              </p>
              <Button variant="outline" onClick={() => setStep("photo")} className="w-full">
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
          <>
            <div className="py-4 text-center">
              <DialogTitle className="mb-2">{t("web.provider.postCompletion.thanks")}</DialogTitle>
              <DialogDescription>{t("web.provider.postCompletion.ratingSavedBody")}</DialogDescription>
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button onClick={markSeen} className="w-full">
                {t("web.provider.postCompletion.doneForNow")}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

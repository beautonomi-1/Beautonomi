"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { buildShareBookingLinkPayload, ensureSingleLinkInMessage } from "@beautonomi/utils";
import { api } from "@/lib/api-client";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTranslation } from "@beautonomi/i18n";
import { Colors } from "@/constants/colors";
import { submitProviderClientRating } from "@/lib/provider-client-rating";
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

export type PostCompletionStep = "idle" | "choose" | "photo" | "rate" | "done" | "continue_draft";

type PostCompletionSheetProps = {
  visible: boolean;
  bookingId: string;
  providerPointsEarned?: number | null;
  primaryServiceName: string;
  primaryOfferingId?: string;
  hasExistingRating: boolean;
  /** When false, client already paid online — share copy only nudges rebook. */
  walkInOrUnpaidComplete?: boolean;
  providerPublicBookUrl?: string | null;
  clientDisplayName?: string | null;
  initialStep?: PostCompletionStep;
  /** Hide "Add a photo" when this booking already has a published Explore post. */
  hideAddPhoto?: boolean;
  draftPostId?: string | null;
  onDismiss: (markSeen: boolean) => void;
  onRated: () => void;
  onContinueDraft?: (postId: string) => void;
};

const STORAGE_PREFIX = "provider_booking_completion_modal_seen_";

type RebookPreview = {
  clientFirstName: string;
  providerHint: string;
  messageBody: string;
  link: string;
  channel: string;
  channelReason: string | null;
  maskedDestination: string | null;
  canWhatsAppHandoff: boolean;
  canEditClientPhone: boolean;
  hasClientPhone?: boolean;
  existingOffer?: { id?: string; status: string } | null;
};

function clientMessagePreview(message: string, link: string): string {
  const without = link ? message.split(link).join(" ") : message;
  return without.replace(/\s+/g, " ").replace(/\s+([:.])/g, "$1").replace(/:\s*$/, "").trim();
}

export function PostCompletionSheet({
  visible,
  bookingId,
  providerPointsEarned,
  primaryServiceName,
  primaryOfferingId,
  hasExistingRating,
  walkInOrUnpaidComplete = true,
  providerPublicBookUrl,
  clientDisplayName,
  initialStep = "choose",
  hideAddPhoto = false,
  draftPostId,
  onDismiss,
  onRated,
  onContinueDraft,
}: PostCompletionSheetProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const pc = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t("provider.mobile.screens.postCompletion." + key, opts) as string,
    [t],
  );
  const { user } = useAuth();
  const [step, setStep] = useState<PostCompletionStep>(initialStep);
  const [rateStars, setRateStars] = useState(0);
  const [rateComment, setRateComment] = useState("");
  const [submittingRate, setSubmittingRate] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);
  const [storeReviewOpen, setStoreReviewOpen] = useState(false);
  const [rebookLoading, setRebookLoading] = useState(false);
  const [rebookPreview, setRebookPreview] = useState<RebookPreview | null>(null);
  const [rebookMessage, setRebookMessage] = useState("");
  const [rebookStatus, setRebookStatus] = useState<string | null>(null);
  const [editMessageOpen, setEditMessageOpen] = useState(false);
  const [clientPhoneDraft, setClientPhoneDraft] = useState("");
  const seenRef = useRef(false);
  const followUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittedStarsRef = useRef(0);

  const wasVisibleRef = useRef(false);
  useEffect(() => {
    const opened = visible && !wasVisibleRef.current;
    wasVisibleRef.current = visible;
    if (opened) {
      if (initialStep === "continue_draft" && draftPostId) {
        setStep("continue_draft");
      } else if (initialStep === "rate" && !hasExistingRating) {
        setStep("rate");
      } else if (hideAddPhoto && !hasExistingRating) {
        setStep("rate");
      } else {
        setStep("choose");
      }
      setRateError(null);
    }
  }, [visible, hasExistingRating, initialStep, hideAddPhoto, draftPostId]);

  useEffect(() => {
    if (!visible || !bookingId) return;
    setRebookLoading(true);
    void api
      .get<Record<string, unknown>>(`/api/provider/bookings/${encodeURIComponent(bookingId)}/rebook-offer`)
      .then((res) => {
        const row = ((res as { data?: Record<string, unknown> }).data ?? res) as Record<string, unknown>;
        setRebookPreview(row as RebookPreview);
        setRebookMessage(String(row.messageBody ?? ""));
      })
      .catch(() => setRebookPreview(null))
      .finally(() => setRebookLoading(false));
  }, [visible, bookingId]);

  const refreshRebookPreview = async (sent?: { message?: string; link?: string }) => {
    const fresh = await api.get<Record<string, unknown>>(
      `/api/provider/bookings/${encodeURIComponent(bookingId)}/rebook-offer`,
    );
    const row = ((fresh as { data?: Record<string, unknown> }).data ?? fresh) as Record<string, unknown>;
    const next: RebookPreview = { ...(row as RebookPreview) };
    if (sent?.link) next.link = sent.link;
    setRebookPreview(next);
    if (sent?.message) setRebookMessage(sent.message);
    else if (!editMessageOpen) setRebookMessage(String(row.messageBody ?? ""));
  };

  const shareRebookYourself = async () => {
    if (!rebookPreview?.link) return;
    setRebookLoading(true);
    let msg = ensureSingleLinkInMessage(rebookMessage, rebookPreview.link);
    try {
      const res = await api.post<{
        message_body?: string;
        link?: string;
        data?: { message_body?: string; link?: string };
      }>(`/api/provider/bookings/${encodeURIComponent(bookingId)}/rebook-offer`, {
        message: rebookMessage,
        deliver: "self",
        ...(clientPhoneDraft.trim() ? { client_phone: clientPhoneDraft.trim() } : {}),
      });
      const data = (res.data ?? res) as { message_body?: string; link?: string };
      const link = data.link || rebookPreview.link;
      msg = data.message_body || ensureSingleLinkInMessage(rebookMessage, link);
      setRebookMessage(msg);
      try {
        const payload = buildShareBookingLinkPayload(Platform.OS, link, msg);
        await Share.share(payload);
      } catch {
        await Clipboard.setStringAsync(msg);
      }
      try {
        await refreshRebookPreview({ message: msg, link });
      } catch {
        // The link was already prepared.
      }
    } catch {
      setRebookStatus(pc("sendFailed"));
    } finally {
      setRebookLoading(false);
    }
  };

  const sendRebook = async () => {
    if (!rebookPreview) return;
    setRebookLoading(true);
    try {
      const res = await api.post<{
        whatsapp_url?: string | null;
        channel?: string;
        data?: { whatsapp_url?: string | null; channel?: string };
      }>(`/api/provider/bookings/${encodeURIComponent(bookingId)}/rebook-offer`, {
        message: rebookMessage,
        ...(clientPhoneDraft.trim() ? { client_phone: clientPhoneDraft.trim() } : {}),
      });
      const data = res.data ?? res;
      const wa = (data as { whatsapp_url?: string | null }).whatsapp_url;
      const channel = String((data as { channel?: string }).channel ?? "");
      const sentMessage = (data as { message_body?: string }).message_body;
      const sentLink = (data as { link?: string }).link;
      if (wa) {
        try {
          await Linking.openURL(wa);
          setRebookStatus(
            rebookPreview.maskedDestination
              ? `Opened WhatsApp to ${rebookPreview.maskedDestination}`
              : pc("rebookOpenedWhatsAppDevice"),
          );
        } catch {
          setRebookStatus(pc("shareFailed"));
        }
      } else if (channel === "sms" || channel === "email" || channel === "push") {
        setRebookStatus(pc("rebookStatusSent"));
      } else {
        setRebookStatus(pc("notDelivered"));
      }
      try {
        await refreshRebookPreview({ message: sentMessage, link: sentLink });
      } catch {
        // The send already finished.
      }
    } catch {
      setRebookStatus(pc("sendFailed"));
    } finally {
      setRebookLoading(false);
    }
  };

  const primaryChannelLabel = () => {
    if (!rebookPreview) return pc("lockNextVisit");
    const name = rebookPreview.clientFirstName || clientDisplayName || "";
    if (rebookPreview.canWhatsAppHandoff || (rebookPreview.channel === "none" && clientPhoneDraft.trim().length > 0)) {
      return `WhatsApp ${name}`;
    }
    if (rebookPreview.channel === "sms") return `Text ${name}`;
    if (rebookPreview.channel === "email") return `Email ${name}`;
    if (rebookPreview.channel === "push") return `Notify ${name}`;
    return pc("lockNextVisit");
  };

  const markSeen = useCallback(() => {
    if (followUpTimerRef.current) {
      clearTimeout(followUpTimerRef.current);
      followUpTimerRef.current = null;
    }
    seenRef.current = true;
    void AsyncStorage.setItem(STORAGE_PREFIX + bookingId, "1").catch(() => {});
    onDismiss(true);
  }, [bookingId, onDismiss]);

  const goToExplorePhoto = () => {
    onDismiss(false);
    const qs = new URLSearchParams({
      create: "1",
      addToGallery: "1",
      caption: pc("freshCaption", { name: primaryServiceName }),
      ...(primaryOfferingId ? { offeringId: primaryOfferingId } : {}),
      bookingId,
      returnTo: "booking",
    }).toString();
    router.push(`/(app)/(tabs)/more/explore-posts?${qs}` as never);
  };

  const submitRating = async () => {
    if (rateStars < 1) {
      setRateError(pc("selectRating"));
      return;
    }
    setSubmittingRate(true);
    setRateError(null);
    try {
      const res = await submitProviderClientRating({
        bookingId,
        rating: rateStars,
        comment: rateComment,
      });
      if (!res.ok) {
        setRateError(res.error.message || pc("submitFailed"));
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
          followUpTimerRef.current = setTimeout(() => {
            followUpTimerRef.current = null;
            trackStoreReviewEvent("store_review_prompt_shown", "client_rating", { rating: rateStars });
            setStoreReviewOpen(true);
          }, 800);
          return;
        }
      } else if (rateStars >= 1) {
        followUpTimerRef.current = setTimeout(() => {
          followUpTimerRef.current = null;
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
                  router.push({
                    pathname: "/(app)/(tabs)/more/support-tickets/new",
                    params: { category: "client_conduct" },
                  } as never);
                },
              },
            ],
          );
        }, 800);
        return;
      }
      followUpTimerRef.current = setTimeout(() => {
        followUpTimerRef.current = null;
        markSeen();
      }, 800);
    } catch (e: unknown) {
      setRateError(e instanceof Error ? e.message : pc("submitFailed"));
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
            <ScrollView style={{ maxHeight: 560 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={{ alignItems: "center", marginBottom: 16 }}>
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "#ECFDF3", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                  <Ionicons name="checkmark" size={26} color="#15803d" />
                </View>
                <Text style={{ fontSize: 20, fontWeight: "700", textAlign: "center" }}>{pc("completeTitle")}</Text>
                <Text style={{ fontSize: 14, color: Colors.gray[600], textAlign: "center", marginTop: 6 }}>
                  {Number.isFinite(Number(providerPointsEarned)) && Number(providerPointsEarned) > 0
                    ? pc("pointsEarned", { count: Number(providerPointsEarned) })
                    : pc("pointsHint")}
                </Text>
              </View>
              {!hideAddPhoto ? (
                <View style={{ borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 16, padding: 14, marginBottom: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                    <Ionicons name="camera-outline" size={16} color={Colors.gray[900]} style={{ marginEnd: 6 }} />
                    <Text style={{ fontSize: 14, fontWeight: "700", color: Colors.gray[900] }}>{pc("showOffTitle")}</Text>
                  </View>
                  <Text style={{ fontSize: 13, lineHeight: 18, color: Colors.gray[600], marginBottom: 12 }}>{pc("showOffBody")}</Text>
                  <TouchableOpacity
                    onPress={() => setStep("photo")}
                    style={{ borderWidth: 1, borderColor: Colors.gray[300], paddingVertical: 12, borderRadius: 12, alignItems: "center" }}
                  >
                    <Text style={{ color: Colors.gray[900], fontWeight: "600" }}>{pc("addPhoto")}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              {!hasExistingRating ? (
                <View style={{ borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 16, padding: 14, marginBottom: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                    <Ionicons name="star-outline" size={16} color={Colors.gray[900]} style={{ marginEnd: 6 }} />
                    <Text style={{ fontSize: 14, fontWeight: "700", color: Colors.gray[900] }}>{pc("howWasClient")}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setStep("rate")}
                    style={{ borderWidth: 1, borderColor: Colors.gray[300], paddingVertical: 12, borderRadius: 12, alignItems: "center", marginTop: 8 }}
                  >
                    <Text style={{ color: Colors.gray[900], fontWeight: "600" }}>{pc("rateClient")}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              {rebookPreview ? (
                <View style={{ borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 16, padding: 14, marginBottom: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                    <Ionicons name="chatbubble-outline" size={16} color={Colors.gray[900]} style={{ marginEnd: 6 }} />
                    <Text style={{ fontSize: 14, fontWeight: "700", color: Colors.gray[900] }}>{pc("nextVisit")}</Text>
                  </View>
                  <Text style={{ fontSize: 13, lineHeight: 18, color: Colors.gray[600] }}>{rebookPreview.providerHint}</Text>
                  <Text style={{ marginTop: 10, backgroundColor: Colors.gray[50], borderRadius: 12, padding: 10, fontSize: 13, lineHeight: 18, color: Colors.gray[800] }}>
                    {clientMessagePreview(rebookMessage, rebookPreview.link)}
                  </Text>
                  <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 8 }}>{pc("linkIncluded")}</Text>
                  {editMessageOpen ? (
                    <TextInput
                      value={rebookMessage}
                      onChangeText={setRebookMessage}
                      multiline
                      style={{ borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 10, padding: 10, minHeight: 88, marginTop: 10, fontSize: 13 }}
                    />
                  ) : null}
                  {rebookPreview.canEditClientPhone &&
                  rebookPreview.hasClientPhone === false &&
                  rebookPreview.channel === "none" &&
                  !rebookPreview.canWhatsAppHandoff ? (
                    <TextInput
                      value={clientPhoneDraft}
                      onChangeText={setClientPhoneDraft}
                      keyboardType="phone-pad"
                      placeholder={pc("clientPhoneForRebook", {
                        name: rebookPreview.clientFirstName || clientDisplayName || "",
                      })}
                      style={{ borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 10, padding: 10, marginTop: 10, fontSize: 13 }}
                    />
                  ) : null}
                  {rebookPreview.channel === "none" && rebookPreview.channelReason ? (
                    <Text style={{ fontSize: 12, color: "#92400e", marginTop: 8 }}>{rebookPreview.channelReason}</Text>
                  ) : null}
                  {(rebookPreview.channel !== "none" ||
                    rebookPreview.canWhatsAppHandoff ||
                    clientPhoneDraft.trim().length > 0) && (
                    <TouchableOpacity
                      disabled={rebookLoading}
                      onPress={() => void sendRebook()}
                      style={{
                        borderWidth: 1,
                        borderColor: Colors.gray[300],
                        paddingVertical: 12,
                        borderRadius: 12,
                        alignItems: "center",
                        marginTop: 12,
                      }}
                    >
                      {rebookLoading ? (
                        <ActivityIndicator color={Colors.gray[900]} />
                      ) : (
                        <Text style={{ color: Colors.gray[900], fontWeight: "600" }}>{primaryChannelLabel()}</Text>
                      )}
                    </TouchableOpacity>
                  )}
                  {rebookPreview.maskedDestination ? (
                    <Text style={{ fontSize: 12, color: Colors.gray[500], textAlign: "center", marginTop: 8 }}>
                      {rebookPreview.maskedDestination}
                    </Text>
                  ) : null}
                  {rebookStatus ? (
                    <Text style={{ fontSize: 12, color: "#15803d", marginTop: 8, textAlign: "center" }}>{rebookStatus}</Text>
                  ) : null}
                  {rebookPreview.existingOffer?.status &&
                  !["pending", "cancelled"].includes(rebookPreview.existingOffer.status) ? (
                    <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 8, textAlign: "center" }}>
                      {rebookPreview.existingOffer.status === "handed_to_whatsapp"
                        ? pc("rebookStatusWhatsApp")
                        : rebookPreview.existingOffer.status === "sent"
                          ? pc("rebookStatusSent")
                          : rebookPreview.existingOffer.status === "opened"
                            ? pc("rebookStatusOpened")
                            : rebookPreview.existingOffer.status === "booked"
                              ? pc("rebookStatusBooked")
                              : rebookPreview.existingOffer.status}
                    </Text>
                  ) : null}
                  {rebookPreview.existingOffer &&
                  ["handed_to_whatsapp", "sent", "opened"].includes(rebookPreview.existingOffer.status) ? (
                    <TouchableOpacity
                      onPress={() => {
                        void api
                          .delete(`/api/provider/bookings/${encodeURIComponent(bookingId)}/rebook-offer`)
                          .then(async () => {
                            setRebookStatus(pc("rebookReleased"));
                            try {
                              await refreshRebookPreview();
                            } catch {
                              // The hold is already released.
                            }
                          })
                          .catch(() => setRebookStatus(pc("sendFailed")));
                      }}
                      style={{ marginTop: 8, alignItems: "center" }}
                    >
                      <Text style={{ color: Colors.gray[700], fontWeight: "600", fontSize: 13 }}>{pc("rebookRelease")}</Text>
                    </TouchableOpacity>
                  ) : null}
                  <View style={{ flexDirection: "row", justifyContent: "center", marginTop: 12 }}>
                    <TouchableOpacity onPress={() => setEditMessageOpen((open) => !open)} style={{ marginEnd: 16 }}>
                      <Text style={{ color: Colors.gray[800], fontWeight: "600", fontSize: 13 }}>{pc("editRebookMessage")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => void shareRebookYourself()} disabled={rebookLoading}>
                      <Text style={{ color: Colors.gray[800], fontWeight: "600", fontSize: 13 }}>{pc("shareRebookYourself")}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : rebookLoading ? (
                <ActivityIndicator style={{ marginBottom: 12 }} color={Colors.primary} />
              ) : null}
              <TouchableOpacity onPress={markSeen} style={{ paddingVertical: 12, alignItems: "center" }}>
                <Text style={{ color: Colors.gray[500] }}>{pc("doneForNow")}</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : null}

          {step === "photo" ? (
            <>
              <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 12 }}>{pc("showOffTitle")}</Text>
              <Text style={{ color: Colors.gray[600], marginBottom: 16 }}>
                {pc("showOffBody")}
              </Text>
              <TouchableOpacity
                onPress={goToExplorePhoto}
                style={{ backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 14, alignItems: "center", marginBottom: 10 }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>{pc("openExplore")}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setStep(hasExistingRating ? "choose" : "rate")} style={{ paddingVertical: 12, alignItems: "center" }}>
                <Text style={{ color: Colors.primary }}>{hasExistingRating ? (t("common.back") as string) : pc("skipToRate")}</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {step === "rate" ? (
            <>
              <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 12 }}>{pc("rateClient")}</Text>
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
                placeholder={pc("optionalComment")}
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
                  <Text style={{ color: "#fff", fontWeight: "700" }}>{pc("submitRating")}</Text>
                )}
              </TouchableOpacity>
              {draftPostId ? (
                <TouchableOpacity onPress={() => setStep("continue_draft")} style={{ paddingVertical: 12, alignItems: "center" }}>
                  <Text style={{ color: Colors.gray[500] }}>{t("common.back") as string}</Text>
                </TouchableOpacity>
              ) : hideAddPhoto ? (
                <TouchableOpacity onPress={markSeen} style={{ paddingVertical: 12, alignItems: "center" }}>
                  <Text style={{ color: Colors.gray[500] }}>{pc("doneForNow")}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => setStep("choose")} style={{ paddingVertical: 12, alignItems: "center" }}>
                  <Text style={{ color: Colors.gray[500] }}>{t("common.back") as string}</Text>
                </TouchableOpacity>
              )}
            </>
          ) : null}

          {step === "continue_draft" && draftPostId ? (
            <>
              <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 12 }}>{pc("continueDraftTitle")}</Text>
              <Text style={{ color: Colors.gray[600], marginBottom: 16 }}>{pc("continueDraftBody")}</Text>
              <TouchableOpacity
                onPress={() => {
                  markSeen();
                  onContinueDraft?.(draftPostId);
                }}
                style={{ backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 14, alignItems: "center", marginBottom: 10 }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>{pc("continueDraftCta")}</Text>
              </TouchableOpacity>
              {!hasExistingRating ? (
                <TouchableOpacity
                  onPress={() => setStep("rate")}
                  style={{ borderWidth: 1.5, borderColor: Colors.primary, paddingVertical: 13, borderRadius: 12, alignItems: "center", marginBottom: 10 }}
                >
                  <Text style={{ color: Colors.primary, fontWeight: "600" }}>{pc("rateClient")}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={markSeen} style={{ paddingVertical: 12, alignItems: "center" }}>
                <Text style={{ color: Colors.gray[500] }}>{pc("doneForNow")}</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {step === "done" ? (
            <View style={{ alignItems: "center", paddingVertical: 8 }}>
              <Ionicons name="checkmark-circle" size={48} color={Colors.primary} />
              <Text style={{ marginTop: 12, fontSize: 16, fontWeight: "600" }}>{pc("thanks")}</Text>
              <Text style={{ marginTop: 6, fontSize: 13, color: Colors.gray[600], textAlign: "center" }}>
                {pc("ratingSavedBody")}
              </Text>
              {!storeReviewOpen ? (
                <TouchableOpacity
                  onPress={markSeen}
                  style={{
                    marginTop: 20,
                    backgroundColor: Colors.primary,
                    paddingVertical: 14,
                    paddingHorizontal: 24,
                    borderRadius: 14,
                    alignItems: "center",
                    alignSelf: "stretch",
                  }}
                  accessibilityRole="button"
                >
                  <Text style={{ color: "#fff", fontWeight: "700" }}>{pc("doneForNow")}</Text>
                </TouchableOpacity>
              ) : null}
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

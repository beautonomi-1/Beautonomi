import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { View, Text, TextInput, Linking, TouchableOpacity, ScrollView, ActivityIndicator, Pressable, Alert, Share, Platform, Modal, type ViewStyle } from "react-native";
import { AppKeyboardAvoidingView as KeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, Stack, router, useFocusEffect } from "expo-router";
import * as ExpoLinking from "expo-linking";
import { useAuth } from "@/providers/AuthProvider";
import { useModuleConfig } from "@/providers/ConfigBundleProvider";
import { APP_URL, getBackendUrl, withWebApiTenantHeaders } from "@/config/public-env";
import { api } from "@/lib/api-client";
import { emitNotificationBadgeRefresh } from "@/lib/notification-badge-events";
import { setActiveBookingId } from "@/lib/active-screen-context";
import { Colors } from "@/constants/colors";
import { usePaystackPayment } from "@/hooks/usePaystackPayment";
import { useInAppPaystackCheckout } from "@/hooks/useInAppPaystackCheckout";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";
import { StaticMapImage, openInMaps } from "@/components/StaticMapImage";
import { BookingLiveSyncIndicator } from "@/components/bookings/BookingLiveSyncIndicator";
import { formatBookingLiveStageLabel } from "@/lib/booking-live-stage";
import { SafetyPanicButton } from "@/components/SafetyPanicButton";
import { haptic } from "@/lib/haptics";
import { getApiErrorMessage } from "@/lib/api-error";
import { supabase } from "@/lib/supabase/client";
import { nextRealtimeTopic } from "@/lib/supabase/realtime-topic";
import { downloadPdf } from "@/lib/pdf-file";
import * as FileSystem from "expo-file-system/legacy";
import * as Clipboard from "expo-clipboard";
import * as Calendar from "expo-calendar";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { formatMoney } from "@beautonomi/utils";
import { showPermissionRecoveryAlert } from "@/lib/native-permissions";
import {
  ARRIVAL_PIN_CUSTOMER_HEADING,
  ARRIVAL_PIN_CUSTOMER_SUBTITLE,
  ARRIVAL_PIN_CUSTOMER_SUBTITLE_WITH_QR,
  ARRIVAL_QR_CUSTOMER_SUBTITLE_WITH_PIN,
  ARRIVAL_PIN_FALLBACK_LABEL,
  ARRIVAL_PIN_LENGTH_HINT,
  ARRIVAL_PIN_PLACEHOLDER,
  getBookingLifecycleDisplay,
  getBookingPaymentDisplay,
  getCustomerEtaUiParts,
  normalizeProviderTimezone,
} from "@beautonomi/utils";
import QRCode from "react-native-qrcode-svg";
import { useTranslation } from "@beautonomi/i18n";
import {
  matchesExpoReturnUrl,
  isCancelledPaystackUrl,
  extractPaystackReferenceFromUrl,
} from "@/lib/paystack-webview-utils";
import { markReferenceProcessing } from "@/lib/paystack-verify-guard";
import { verifyPaystackWithRetry } from "@/lib/payments/verifyPaystackWithRetry";
import { useSavedCards } from "@/hooks/useSavedCards";

const DEFAULT_TZ = "Africa/Johannesburg";

/**
 * §Launch-audit 2026-04-18: canonicalise legacy offset-style zones
 * (e.g. "GMT+2") before handing to `toLocaleDateString`/`toLocaleTimeString`.
 * Without this the RN JS engine's `Intl` throws and we fall back to the
 * device's own clock, which was showing customers confusingly-shifted
 * times for providers with non-IANA zone values. See supabase
 * migration 511 for the database-side fix-up.
 */
function resolveBookingTimezone(tz?: string | null): string {
  return normalizeProviderTimezone(tz) ?? DEFAULT_TZ;
}

function formatDate(s: string, tz?: string | null) {
  const parsed = parseValidDate(s);
  if (!parsed) return "—";
  try {
    return parsed.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: resolveBookingTimezone(tz),
    });
  } catch {
    return parsed.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }
}
function formatTime(s: string, tz?: string | null) {
  const parsed = parseValidDate(s);
  if (!parsed) return "—";
  try {
    return parsed.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: resolveBookingTimezone(tz),
    });
  } catch {
    return parsed.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }
}

function parseValidDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

/** UTC `YYYYMMDDTHHmmss` with trailing `Z` — matches `apps/web/src/lib/calendar/ics.ts` and server `.ics` generation. */
function formatInstantForGoogleCalendar(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function getGoogleCalendarUrl(params: { title: string; description: string; location: string; start: Date; end: Date }): string {
  const startSeg = formatInstantForGoogleCalendar(params.start).replace("Z", "");
  const endSeg = formatInstantForGoogleCalendar(params.end).replace("Z", "");
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: params.title,
    dates: `${startSeg}/${endSeg}`,
    location: params.location,
    ...(params.description ? { details: params.description } : {}),
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** Outlook on the web — same deep-link pattern as `apps/web` checkout & account booking pages. */
function getOutlookCalendarUrl(params: { title: string; description: string; location: string; start: Date; end: Date }): string {
  const q = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: params.title,
    startdt: params.start.toISOString(),
    enddt: params.end.toISOString(),
    body: params.description,
    location: params.location,
  });
  return `https://outlook.live.com/owa/0/?${q.toString()}`;
}

const COMPLETION_MODAL_STORAGE_KEY = "booking_completion_modal_seen_";
type BookingReviewSummary = {
  id: string;
  booking_id?: string;
  rating?: number;
  comment?: string | null;
};

export default function BookingDetailScreen() {
  useScreenTracking("Booking Detail");
  const bookingParams = useLocalSearchParams<{ id?: string | string[]; charge_id?: string; focus?: string }>();
  /** Expo Router may pass `id` as a string[]; cancel/PDF must use the real UUID. */
  const id = useMemo(() => {
    const raw = bookingParams.id;
    const v = Array.isArray(raw) ? raw[0] : raw;
    return typeof v === "string" ? v.trim() : "";
  }, [bookingParams.id]);
  /** charge_id forwarded by notification deep-link to focus a specific charge */
  const chargeIdParam = useMemo(() => {
    const raw = bookingParams.charge_id;
    const v = Array.isArray(raw) ? raw[0] : raw;
    return typeof v === "string" ? v.trim() : "";
  }, [bookingParams.charge_id]);
  /** focus=additional_charge forwarded by notification deep-link */
  const focusParam = useMemo(() => {
    const raw = bookingParams.focus;
    const v = Array.isArray(raw) ? raw[0] : raw;
    return typeof v === "string" ? v.trim() : "";
  }, [bookingParams.focus]);
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const constraint = (isTablet || Platform.OS === "web") ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const } : {};
  const { user } = useAuth();
  const { defaultCard: defaultSavedCard } = useSavedCards();
  const { t } = useTranslation();
  const errTitle = t("customer.mobile.screens.authLogin.errorTitle");
  const bd = useCallback(
    (key: string, options?: Record<string, string | number>) => {
      const fullKey = `customer.mobile.screens.bookingDetail.${key}`;
      return (options != null ? t(fullKey, options as never) : t(fullKey)) as string;
    },
    [t],
  );
  const onDemandConfig = useModuleConfig("on_demand");
  const { pay, loading: payLoading, error: payError, paystackModal } = usePaystackPayment();
  const payRemainingCheckout = useInAppPaystackCheckout();
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [icsLoading, setIcsLoading] = useState(false);
  const [nativeCalLoading, setNativeCalLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"tracking" | "receipt" | "details">("tracking");
  const [cancelReasonModalOpen, setCancelReasonModalOpen] = useState(false);
  const [cancelReasonText, setCancelReasonText] = useState("");
  const cancelPendingRef = useRef<{ version?: number } | null>(null);
  const [resendCooldownUntil, setResendCooldownUntil] = useState<number | null>(null);
  const [showFallbackInput, setShowFallbackInput] = useState(false);
  const [fallbackOtp, setFallbackOtp] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [pinSecondsLeft, setPinSecondsLeft] = useState<number | null>(null);
  const [qrSecondsLeft, setQrSecondsLeft] = useState<number | null>(null);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [payRemainingLoading, setPayRemainingLoading] = useState(false);
  const [payRemainingUseWallet, setPayRemainingUseWallet] = useState(false);
  const [payRemainingGiftCode, setPayRemainingGiftCode] = useState("");
  // Stable per-mount key so a double-tap or client retry of "Pay remaining
  // balance" can't create two Paystack sessions / wallet-gift debits for the
  // same booking. The server only caches successful responses, so a genuine
  // retry after an error still proceeds normally.
  const payRemainingIdempotencyKeyRef = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `pay-remaining-${Date.now()}`,
  );
  const [walletBalance, setWalletBalance] = useState(0);
  const [additionalChargePayLoadingId, setAdditionalChargePayLoadingId] = useState<string | null>(
    null,
  );
  const [additionalChargeApproveLoadingId, setAdditionalChargeApproveLoadingId] = useState<string | null>(null);
  const [additionalChargeCardLoadingId, setAdditionalChargeCardLoadingId] = useState<string | null>(null);
  const [additionalPayUseWallet, setAdditionalPayUseWallet] = useState(false);
  const [additionalPayGiftCode, setAdditionalPayGiftCode] = useState("");
  const [myReview, setMyReview] = useState<BookingReviewSummary | null>(null);
  const hasLoadedOnce = useRef(false);
  const [lastLiveUpdateAt, setLastLiveUpdateAt] = useState<number | null>(null);
  const referralPostedBookingIds = useRef<Set<string>>(new Set());
  const scrollViewRef = useRef<ScrollView>(null);
  const chargesSectionYRef = useRef(0);
  const focusAppliedRef = useRef(false);
  const chargeFetchAttemptedRef = useRef(false);
  const [chargeFocusFetchStatus, setChargeFocusFetchStatus] = useState<"idle" | "loading" | "done">("idle");
  const [shouldScrollToCharges, setShouldScrollToCharges] = useState(false);
  const [highlightedChargeId, setHighlightedChargeId] = useState<string | null>(null);
  const [groupPaymentSummary, setGroupPaymentSummary] = useState<{
    amount_paid: number;
    currency: string;
  } | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!id) {
      if (!opts?.silent) {
        setLoading(false);
        setError(bd("loadBookingNotFound"));
        setBooking(null);
      }
      return;
    }
    if (!opts?.silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await api.get<any>(`/api/me/bookings/${id}`);
      if (res.error) {
        if (!opts?.silent) {
          setError(getApiErrorMessage(res.error, bd("loadFailed")));
          setBooking(null);
        }
      } else {
        const raw = res.data as Record<string, unknown> | null | undefined;
        const row =
          raw && typeof raw === "object" && "booking" in raw && (raw as { booking?: unknown }).booking
            ? (raw as { booking: unknown }).booking
            : raw && typeof raw === "object" && "data" in raw && (raw as { data?: unknown }).data
              ? (raw as { data: unknown }).data
              : raw;
        if (row) {
          setBooking(row);
          setError(null);
          setLastLiveUpdateAt(Date.now());
        } else if (!opts?.silent) {
          setBooking(null);
          setError(bd("loadBookingNotFound"));
        }
        hasLoadedOnce.current = true;
      }
    } catch (e) {
      if (!opts?.silent) {
        setError(getApiErrorMessage(e as Error, bd("loadFailed")));
        setBooking(null);
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [id, bd]);

  useEffect(() => {
    load();
  }, [id, load]);

  useEffect(() => {
    const groupId = booking?.group_booking_id;
    if (!booking?.is_group_booking || !groupId) {
      setGroupPaymentSummary(null);
      return;
    }
    let cancelled = false;
    api
      .get<{ amount_paid?: number; currency?: string | null }>(`/api/me/group-bookings/${encodeURIComponent(groupId)}`)
      .then((res) => {
        if (cancelled || res.error || !res.data) {
          if (!cancelled) setGroupPaymentSummary(null);
          return;
        }
        setGroupPaymentSummary({
          amount_paid: Number(res.data.amount_paid ?? 0),
          currency: res.data.currency?.trim() || booking.currency || getTenantDefaultCurrency(),
        });
      })
      .catch(() => {
        if (!cancelled) setGroupPaymentSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [booking?.group_booking_id, booking?.is_group_booking, booking?.currency]);

  useEffect(() => {
    if (!id || !booking || booking.status !== "completed") {
      setMyReview(null);
      return;
    }
    let cancelled = false;
    api
      .get<{
        review?: BookingReviewSummary | null;
        reviews?: BookingReviewSummary[];
      }>(`/api/me/reviews?booking_id=${encodeURIComponent(id)}`)
      .then((res) => {
        if (cancelled) return;
        if (res.error) {
          setMyReview(null);
          return;
        }
        const row = res.data?.review ?? (Array.isArray(res.data?.reviews) ? res.data.reviews[0] : null) ?? null;
        setMyReview(row);
      })
      .catch(() => {
        if (!cancelled) setMyReview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [id, booking]);

  // Referral conversion (same as web confirmation): once per booking id per session; ignore expected 400/404.
  useEffect(() => {
    if (!id || !booking) return;
    if (referralPostedBookingIds.current.has(id)) return;
    void api.post("/api/me/referrals/track", { booking_id: id }).then((res) => {
      if (!res.error) {
        referralPostedBookingIds.current.add(id);
        return;
      }
      const st = (res.error as { status?: number }).status;
      // Expected when no referrer, program off, booking not paid yet, or already converted — do not
      // mark posted so we can retry after payment or when rules apply.
      if (st === 400 || st === 404) return;
      // Transient wallet failure — row rolled back; safe to retry on next open
      if (st === 503) return;
    });
  }, [id, booking]);

  useEffect(() => {
    if (!user?.id) return;
    void api
      .get<{ wallet?: { balance: number }; data?: { wallet?: { balance: number } } }>("/api/me/wallet")
      .then((res) => {
        const raw = res.data as { wallet?: { balance: number }; data?: { wallet?: { balance: number } } } | null;
        const wallet = raw?.data?.wallet ?? raw?.wallet;
        if (wallet?.balance != null) setWalletBalance(Number(wallet.balance) || 0);
      })
      .catch(() => {});
  }, [user?.id]);

  // Refetch when screen gains focus after initial load (e.g. return from in-app browser after paying additional charge)
  useFocusEffect(
    useCallback(() => {
      if (id && hasLoadedOnce.current) load();
    }, [id, load])
  );

  // Clear bell-badge rows for this booking when opened directly (not via notifications list)
  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      void api
        .post("/api/me/notifications/mark-related-read", { booking_id: id })
        .then(() => emitNotificationBadgeRefresh())
        .catch(() => {});
    }, [id]),
  );

  // Track active booking so NotificationBannerListener suppresses redundant banners.
  useFocusEffect(
    useCallback(() => {
      if (id) setActiveBookingId(id);
      return () => setActiveBookingId(null);
    }, [id]),
  );

  // Reset notification focus when deep-link params change (repeat taps, new charge, etc.).
  useEffect(() => {
    focusAppliedRef.current = false;
    chargeFetchAttemptedRef.current = false;
    setChargeFocusFetchStatus("idle");
    setShouldScrollToCharges(false);
    setHighlightedChargeId(null);
  }, [id, focusParam, chargeIdParam]);

  // Tracking / arrival notifications should land on the Tracking tab (PIN, QR, ETA).
  useEffect(() => {
    if (focusParam === "tracking" || focusParam === "arrival") {
      setActiveTab("tracking");
    }
  }, [focusParam, id, chargeIdParam]);

  const mergeAdditionalCharges = useCallback((incoming: any[]) => {
    if (!incoming.length) return;
    setBooking((prev: any) => {
      if (!prev) return prev;
      const existing: any[] = prev.additional_charges ?? [];
      const byId = new Map(existing.map((c) => [String(c.id), c]));
      for (const row of incoming) {
        if (row?.id) byId.set(String(row.id), row);
      }
      return { ...prev, additional_charges: Array.from(byId.values()) };
    });
  }, []);

  // Fallback fetch when deep-link charge_id is not yet in the booking payload.
  // Kept in its own effect (no chargeFocusFetchStatus in deps) so setting "loading"
  // does not re-run cleanup and cancel the in-flight request.
  useEffect(() => {
    if (!id) return;

    // focus=additional_charge without a specific charge_id: nothing to fetch,
    // resolve immediately so the receipt tab UI (spinner / unavailable block) settles.
    if (!chargeIdParam) {
      if (focusParam === "additional_charge") {
        setChargeFocusFetchStatus("done");
      }
      return;
    }

    const charges: any[] = booking?.additional_charges ?? [];
    if (charges.some((c) => String(c.id) === chargeIdParam)) {
      setChargeFocusFetchStatus("done");
      return;
    }

    if (chargeFetchAttemptedRef.current) return;
    chargeFetchAttemptedRef.current = true;
    setChargeFocusFetchStatus("loading");

    const safetyTimer = setTimeout(() => {
      setChargeFocusFetchStatus("done");
    }, 8000);

    void api
      .get<{ charges?: any[]; data?: { charges?: any[] } }>(
        `/api/me/bookings/${encodeURIComponent(id)}/additional-charges`,
      )
      .then((res) => {
        const raw = res.data as { charges?: any[]; data?: { charges?: any[] } } | null | undefined;
        const rows = raw?.data?.charges ?? raw?.charges ?? [];
        if (Array.isArray(rows) && rows.length > 0) {
          mergeAdditionalCharges(rows);
        }
      })
      .catch(() => {})
      .finally(() => {
        clearTimeout(safetyTimer);
        setChargeFocusFetchStatus("done");
      });

    return () => {
      clearTimeout(safetyTimer);
    };
  }, [id, chargeIdParam, focusParam, booking?.additional_charges, mergeAdditionalCharges]);

  // When arriving from an additional-charge notification deep-link, auto-switch to the
  // receipt tab so the customer sees the full payment options immediately.
  useEffect(() => {
    if (!booking || !id) return;
    const wantsChargeFocus = focusParam === "additional_charge" || chargeIdParam !== "";
    if (!wantsChargeFocus) return;

    setActiveTab("receipt");

    if (chargeIdParam && chargeFocusFetchStatus !== "done") {
      return;
    }

    if (focusAppliedRef.current) return;
    focusAppliedRef.current = true;
    setShouldScrollToCharges(true);

    const charges: any[] = booking.additional_charges ?? [];
    const targetCharge =
      chargeIdParam !== "" ? charges.find((c) => String(c.id) === chargeIdParam) : null;
    const highlightId = chargeIdParam || (targetCharge ? String(targetCharge.id) : "");
    const rowToHighlight =
      highlightId !== ""
        ? charges.find((c: any) => String(c.id) === highlightId)
        : null;
    if (
      rowToHighlight &&
      (rowToHighlight.status === "pending" || rowToHighlight.status === "approved")
    ) {
      setHighlightedChargeId(String(rowToHighlight.id));
      const clearTimer = setTimeout(() => setHighlightedChargeId(null), 2500);
      return () => clearTimeout(clearTimer);
    }
  }, [booking, focusParam, chargeIdParam, chargeFocusFetchStatus, id]);

  // Highlight + scroll when a charge_id target appears after async fallback fetch.
  useEffect(() => {
    if (!chargeIdParam || !booking) return;
    const row = (booking.additional_charges ?? []).find(
      (c: any) => String(c.id) === chargeIdParam,
    );
    if (!row || (row.status !== "pending" && row.status !== "approved")) return;
    setActiveTab("receipt");
    setShouldScrollToCharges(true);
    setHighlightedChargeId(chargeIdParam);
    const clearTimer = setTimeout(() => setHighlightedChargeId(null), 2500);
    return () => clearTimeout(clearTimer);
  }, [booking?.additional_charges, chargeIdParam, booking]);

  // Scroll to the charges section once the receipt tab has rendered its layout.
  useEffect(() => {
    if (activeTab !== "receipt" || !shouldScrollToCharges) return;
    const timer = setTimeout(() => {
      setShouldScrollToCharges(false);
      if (chargesSectionYRef.current > 0) {
        scrollViewRef.current?.scrollTo({
          y: Math.max(0, chargesSectionYRef.current - 20),
          animated: true,
        });
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [activeTab, shouldScrollToCharges]);

  // While provider is en route, poll for ETA + live location (realtime may omit JSONB-heavy columns in some setups)
  useEffect(() => {
    if (!id || !booking) return;
    const locType = booking.location_type;
    const stage = booking.current_stage;
    // Stage is source of truth — `provider_en_route_at` stays set after the visit (historical), so it must not imply "still en route".
    const enRoute = stage === "provider_on_way";
    const arrived = stage === "provider_arrived" || !!(booking as { provider_arrived_at?: string }).provider_arrived_at;
    const terminal = booking.status === "cancelled" || booking.status === "completed";
    if (locType !== "at_home" || !enRoute || arrived || terminal) return;
    const interval = setInterval(() => {
      load({ silent: true });
    }, 15000);
    return () => clearInterval(interval);
  }, [id, load, booking]);

  // After arrival, provider confirms via OTP (their app) or QR scan; poll until verified so we
  // are not solely dependent on Realtime for clearing PIN/QR UI when verification completes.
  useEffect(() => {
    if (!id || !booking) return;
    const locType = booking.location_type;
    const stage = booking.current_stage;
    const arrived =
      stage === "provider_arrived" || !!(booking as { provider_arrived_at?: string }).provider_arrived_at;
    const terminal = booking.status === "cancelled" || booking.status === "completed";
    const verified = Boolean((booking as { arrival_otp_verified?: boolean }).arrival_otp_verified);
    if (locType !== "at_home" || !arrived || verified || terminal) return;
    const interval = setInterval(() => {
      load({ silent: true });
    }, 15000);
    return () => clearInterval(interval);
  }, [id, load, booking]);

  // Show post-completion modal once per booking when opening a completed booking
  useEffect(() => {
    if (!id || !booking || booking.status !== "completed") return;
    let mounted = true;
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(COMPLETION_MODAL_STORAGE_KEY + id);
        if (mounted && !seen) setShowCompletionModal(true);
      } catch {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, [id, booking]);

  const dismissCompletionModal = useCallback((markSeen: boolean) => {
    if (markSeen && id) {
      AsyncStorage.setItem(COMPLETION_MODAL_STORAGE_KEY + id, "1").catch(() => {});
    }
    setShowCompletionModal(false);
  }, [id]);

  const handleCompletionWriteReview = useCallback(() => {
    dismissCompletionModal(true);
    haptic.light();
    router.push({ pathname: "/(app)/review-write", params: { bookingId: booking?.id ?? id } });
  }, [dismissCompletionModal, booking?.id, id]);

  // Countdown for arrival PIN expiry
  const pinExpiresAt = booking?.arrival_otp_expires_at;
  const needsPinDisplay =
    booking &&
    booking.location_type === "at_home" &&
    !["completed", "cancelled", "no_show"].includes(booking.status) &&
    (booking.current_stage === "provider_arrived" || (booking as any).provider_arrived_at) &&
    !booking.arrival_otp_verified &&
    !!booking.arrival_otp;

  const qrPayloadForDisplay = (() => {
    if (!booking) return null;
    const raw = (booking as { qr_code_data?: unknown }).qr_code_data;
    if (raw == null) return null;
    if (typeof raw === "string") return raw.trim() || null;
    if (typeof raw === "object") {
      try {
        return JSON.stringify(raw);
      } catch {
        return null;
      }
    }
    return null;
  })();
  const needsQrDisplay =
    !!booking &&
    booking.location_type === "at_home" &&
    !["completed", "cancelled", "no_show"].includes(booking.status) &&
    (booking.current_stage === "provider_arrived" || !!(booking as any).provider_arrived_at) &&
    !booking.arrival_otp_verified &&
    !(booking as { qr_code_verified?: boolean }).qr_code_verified &&
    !!qrPayloadForDisplay;

  /** Default platform mode: OTP + QR both enabled — customer may use either; provider confirms once. */
  const bothArrivalMethodsVisible = Boolean(needsPinDisplay && needsQrDisplay);

  const qrExpiresAt = (booking as { qr_code_expires_at?: string })?.qr_code_expires_at;
  const qrVerificationCode = (() => {
    if (!booking) return null;
    const raw = (booking as { qr_code_data?: unknown }).qr_code_data;
    if (raw && typeof raw === "object" && raw !== null && "verification_code" in raw) {
      const v = (raw as { verification_code?: unknown }).verification_code;
      return typeof v === "string" ? v : null;
    }
    return null;
  })();
  useEffect(() => {
    if (!needsQrDisplay || !qrExpiresAt) {
      setQrSecondsLeft(null);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((new Date(qrExpiresAt).getTime() - Date.now()) / 1000));
      setQrSecondsLeft(left);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [needsQrDisplay, qrExpiresAt]);

  useEffect(() => {
    if (!needsPinDisplay || !pinExpiresAt) {
      setPinSecondsLeft(null);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((new Date(pinExpiresAt).getTime() - Date.now()) / 1000));
      setPinSecondsLeft(left);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [needsPinDisplay, pinExpiresAt]);

  // Realtime booking + additional-charge updates — silent reload keeps joined fields consistent.
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!id) return;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        loadRef.current({ silent: true });
        setLastLiveUpdateAt(Date.now());
        haptic.success();
      }, 400);
    };
    const channel = supabase
      .channel(nextRealtimeTopic(`booking-detail-${id}`))
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bookings",
          filter: `id=eq.${id}`,
        },
        scheduleReload,
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "additional_charges",
          filter: `booking_id=eq.${id}`,
        },
        scheduleReload,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "additional_charges",
          filter: `booking_id=eq.${id}`,
        },
        scheduleReload,
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [id]);

  // Poll fallback while receipt tab is open and charges are pending or focus is resolving.
  useEffect(() => {
    if (!id || !booking || activeTab !== "receipt") return;
    const charges: any[] = booking.additional_charges ?? [];
    const hasUnpaid = charges.some(
      (c) => c.status === "pending" || c.status === "approved",
    );
    const resolvingFocus = chargeIdParam !== "" && chargeFocusFetchStatus === "loading";
    if (!hasUnpaid && !resolvingFocus) return;
    const interval = setInterval(() => {
      load({ silent: true });
    }, 15000);
    return () => clearInterval(interval);
  }, [id, load, booking, activeTab, chargeIdParam, chargeFocusFetchStatus]);

  const handleCancel = useCallback(async () => {
    if (!booking) return;
    let message = bd("cancelDefaultConfirm");
    try {
      const preview = await api.get<{
        allowed?: boolean;
        reason?: string;
        currency?: string;
        expected_cancellation_fee?: number;
        expected_wallet_refund?: number;
        is_late_cancellation?: boolean;
        refund_capped_by_paid_amount?: boolean;
      }>(`/api/me/bookings/${id}/cancel-preview`);
      const p = preview.data;
      if (preview.error || !p?.allowed) {
        Alert.alert(bd("cannotCancelTitle"), preview.error?.message || p?.reason || bd("cancellationNotAllowed"));
        return;
      }
      const cur = p.currency || booking.currency || getTenantDefaultCurrency();
      const fee = Number(p.expected_cancellation_fee ?? 0);
      const refund = Number(p.expected_wallet_refund ?? 0);
      const capBlock =
        p.refund_capped_by_paid_amount === true ? "\n\n" + bd("cancelPreviewCapNote") : "";
      const windowLine = p.is_late_cancellation ? bd("cancelPreviewLate") : bd("cancelPreviewNormal");
      message = bd("cancelPreviewMessage", {
        currency: cur,
        fee: fee.toFixed(2),
        refund: refund.toFixed(2),
        capBlock,
        windowLine,
      });
    } catch {
      message += bd("cancelPreviewEstimateSuffix");
    }

    Alert.alert(bd("cancelBookingTitle"), message, [
      { text: bd("keepBookingCta"), style: "cancel" },
      {
        text: bd("cancelBookingCta"),
        style: "destructive",
        onPress: () => {
          const version = typeof booking.version === "number" ? booking.version : undefined;
          cancelPendingRef.current = { version };
          setCancelReasonText("");
          setCancelReasonModalOpen(true);
        },
      },
    ]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking, id, load, bd]);

  const submitCancellation = useCallback(async (reason: string) => {
    setCancelReasonModalOpen(false);
    setCancelling(true);
    haptic.medium();
    try {
      const cancelBookingId = String(booking?.id ?? id).trim();
      if (!cancelBookingId) {
        Alert.alert(errTitle, bd("missingBookingRefBody"));
        setCancelling(false);
        return;
      }
      const pending = cancelPendingRef.current;
      const res = await api.post<{ booking?: unknown }>(
        `/api/me/bookings/${encodeURIComponent(cancelBookingId)}/cancel`,
        {
        reason: reason.trim() || "Customer request",
        ...(pending?.version !== undefined ? { version: pending.version } : {}),
        },
      );
      if (res.error) {
        const st = (res.error as { status?: number }).status;
        if (st === 409) {
          Alert.alert(bd("cancelConflictTitle"), bd("cancelConflictBody"));
          load();
        } else {
          Alert.alert(errTitle, res.error.message || bd("failedToCancel"));
        }
      } else {
        haptic.success();
        load();
      }
    } catch (e) {
      Alert.alert(errTitle, getApiErrorMessage(e as Error, bd("failedToCancel")));
    } finally {
      setCancelling(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load is stable
  }, [booking, id, bd, errTitle]);

  const openInBrowser = useCallback(() => {
    router.push("/(app)/(tabs)/home" as never);
  }, []);

  const handleReschedule = useCallback(() => {
    if (!booking) return;
    haptic.light();
    const provider = booking.provider;
    if (provider?.slug) {
      const serviceIds = (booking.services ?? [])
        .map((s: any) => s.offering_id)
        .filter(Boolean)
        .join(",");
      const staffId = (booking.services ?? []).find((s: any) => s.staff_id)?.staff_id;
      const rescheduleParams: Record<string, string> = {
        slug: provider.slug,
        reschedule_booking_id: booking.id,
      };
      if (serviceIds) rescheduleParams.service_ids = serviceIds;
      else if (booking.services?.[0]?.offering_id) rescheduleParams.service_id = booking.services[0].offering_id;
      if (staffId) rescheduleParams.staff_id = staffId;
      if ((booking as any).location_type) rescheduleParams.location_type = (booking as any).location_type;
      if ((booking as any).location_id) rescheduleParams.location_id = (booking as any).location_id;
      router.push({
        pathname: "/(app)/book",
        params: rescheduleParams,
      });
    } else {
      openInBrowser();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- openInBrowser stable
  }, [booking]);

  const isCashBooking = (booking as any)?.payment_provider === "cash";
  const needsPayment =
    booking &&
    !isCashBooking &&
    booking.status === "pending" &&
    booking.payment_status === "pending" &&
    booking.total_amount > 0;

  // Outstanding amount the customer can still pay online. Prefer the server's
  // computed `outstanding_balance`; fall back to total − total_paid for a freshly
  // created card booking that never completed payment (status `pending_payment`).
  const outstandingForPay = (() => {
    const ob = (booking as any)?.outstanding_balance;
    if (typeof ob === "number" && ob > 0) return ob;
    const total = Number((booking as any)?.total_amount ?? 0);
    const paid = Number((booking as any)?.total_paid ?? 0);
    return Math.max(0, total - paid);
  })();

  // World-class retry: any non-cash, non-terminal booking with money still owed
  // can be paid in-app. This includes the bug state where card checkout was
  // declined/abandoned and the booking is stuck at `pending_payment` /
  // `payment_status: pending` with no completed payment. Mirrors the web
  // `canPayOutstandingOnline` rule. Routed through `pay-remaining`, which the
  // server already accepts for `pending`, `partially_paid`, and
  // `partially_refunded` payment states.
  const canPayOnline =
    !!booking &&
    !isCashBooking &&
    booking.status !== "cancelled" &&
    booking.status !== "completed" &&
    booking.status !== "no_show" &&
    (booking.payment_status === "pending" ||
      booking.payment_status === "partially_paid" ||
      booking.payment_status === "partially_refunded") &&
    outstandingForPay > 0;

  const handlePay = async () => {
    if (!booking) return;
    if (!user?.email) {
      Alert.alert(bd("emailRequiredTitle"), bd("emailRequiredBody"));
      return;
    }
    const result = await pay({
      booking_id: booking.id,
      amount: booking.total_amount,
      email: user.email,
      currency: booking.currency || getTenantDefaultCurrency(),
    });
    if (result.success || result.dismissed) {
      await load();
    }
  };

  // Show the pay-remaining flow for every payable booking except the strict
  // `pending`/`pending` case still served by the legacy "Pay Now" button
  // (`needsPayment`), so we never render two pay buttons at once.
  const showPayRemaining = canPayOnline && !needsPayment;
  const isFullyUnpaid = booking?.payment_status === "pending";

  const handlePayRemaining = async () => {
    if (!id || !booking) return;
    haptic.light();
    setPayRemainingLoading(true);
    try {
      const res = await api.post<{
        authorization_url?: string;
        fully_settled?: boolean;
        paystack_amount?: number;
        wallet_amount_applied?: number;
        gift_card_amount_applied?: number;
        reference?: string;
      }>(`/api/me/bookings/${id}/pay-remaining`, {
        callback_url: Platform.OS === "web" ? undefined : ExpoLinking.createURL("book/paystack"),
        use_wallet: payRemainingUseWallet,
        ...(payRemainingGiftCode.trim()
          ? { gift_card_code: payRemainingGiftCode.trim().toUpperCase() }
          : {}),
        idempotency_key: payRemainingIdempotencyKeyRef.current,
      }, {
        headers: { "Idempotency-Key": payRemainingIdempotencyKeyRef.current },
      });
      if (res.error) {
        Alert.alert(
          errTitle,
          getApiErrorMessage(res.error, bd("payRemainingBalanceFallback")),
        );
        return;
      }
      if (res.data?.fully_settled) {
        haptic.success();
        await load();
        return;
      }
      const url = res.data?.authorization_url;
      if (!url) {
        Alert.alert(
          errTitle,
          getApiErrorMessage({ message: bd("couldNotStartPayment") }, bd("payRemainingBalanceFallback")),
        );
        return;
      }

      // Native: open Paystack in an in-app browser; intercept the deep-link return.
      if (Platform.OS === "web") {
        try {
          window.open(url, "_blank", "noopener,noreferrer");
        } catch {
          Linking.openURL(url).catch(() => {});
        }
      } else {
        const returnUrl = ExpoLinking.createURL("book/paystack");
        if (res.data?.reference) {
          markReferenceProcessing(res.data.reference);
        }
        await payRemainingCheckout.waitForCheckout(url, {
          title: "Pay remaining balance",
          returnUrl,
          matchSuccess: (rawUrl) =>
            matchesExpoReturnUrl(rawUrl, returnUrl) && !isCancelledPaystackUrl(rawUrl),
          matchCancel: (rawUrl) => isCancelledPaystackUrl(rawUrl),
        });
      }

      const MAX_ATTEMPTS = 10;
      const POLL_INTERVAL_MS = 2000;
      let cleared = false;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          const check = await api.get<{
            payment_status?: string;
            outstanding_balance?: number;
          }>(`/api/me/bookings/${encodeURIComponent(id)}`);
          const checkData = (check.data ?? null) as
            | { payment_status?: string; outstanding_balance?: number }
            | null;
          if (
            checkData?.payment_status === "paid" ||
            (typeof checkData?.outstanding_balance === "number" &&
              checkData.outstanding_balance <= 0)
          ) {
            cleared = true;
            break;
          }
        } catch {
          // ignore poll errors
        }
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        }
      }

      if (cleared) {
        haptic.success();
        await load();
      } else {
        Alert.alert(bd("paymentPendingTitle"), bd("paymentPendingBody"));
      }
    } catch (e) {
      Alert.alert(errTitle, getApiErrorMessage(e as Error, bd("payRemainingBalanceFallback")));
    } finally {
      setPayRemainingLoading(false);
    }
  };

  const downloadReceiptNative = useCallback(async () => {
    const bid = booking?.id;
    if (!bid) return;
    haptic.light();
    try {
      await downloadPdf({
        router,
        pdfPath: `/api/bookings/${encodeURIComponent(bid)}/receipt/pdf`,
        signedUrlPath: `/api/bookings/${encodeURIComponent(bid)}/receipt/signed-url`,
        filename: `booking-${booking.booking_number ?? bid}.pdf`,
        title: bd("downloadReceiptTitle"),
        label: bd("downloadReceiptTitle"),
      });
    } catch (e) {
      Alert.alert(bd("downloadReceiptTitle"), e instanceof Error ? e.message : bd("downloadReceiptGenericError"));
    }
  }, [booking, bd]);

  const handleAddToCalendarIcs = useCallback(async () => {
    if (!id) return;
    haptic.light();
    setIcsLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        Alert.alert(bd("signInForCalendarTitle"), bd("signInForCalendarBody"));
        return;
      }
      const icsBookingId = encodeURIComponent(String(booking?.id ?? id).trim());
      const url = `${getBackendUrl().replace(/\/$/, "")}/api/me/bookings/${icsBookingId}/calendar.ics`;
      if (!url.startsWith("http")) {
        Alert.alert(errTitle, bd("failedToLoadCalendarFile"));
        return;
      }
      const response = await fetch(
        url,
        withWebApiTenantHeaders({
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
          credentials: "omit",
        }),
      );
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        const msg = text
          ? getApiErrorMessage({ message: text, status: response.status }, bd("failedToLoadCalendarFile"))
          : bd("failedToLoadCalendarFile");
        Alert.alert(errTitle, msg);
        return;
      }
      const icsText = await response.text();
      const filename = `booking-${booking?.booking_number ?? id}.ics`;
      if (!FileSystem.cacheDirectory) {
        Alert.alert(errTitle, bd("failedToLoadCalendarFile"));
        return;
      }
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, icsText, { encoding: FileSystem.EncodingType.UTF8 });
      await Share.share({
        url: fileUri,
        title: bd("calendarIcsCta"),
        message: Platform.OS === "android" ? icsText : undefined,
      });
    } catch (e) {
      Alert.alert(errTitle, e instanceof Error ? e.message : bd("failedToLoadCalendarFile"));
    } finally {
      setIcsLoading(false);
    }
  }, [id, booking?.id, booking?.booking_number, bd, errTitle]);

  const handleSaveToDeviceCalendar = useCallback(
    async (params: { title: string; description: string; location: string; start: Date; end: Date }) => {
      if (Platform.OS === "web") {
        Alert.alert(bd("notAvailableOnWebTitle"), bd("notAvailableOnWebBody"));
        return;
      }
      haptic.light();
      setNativeCalLoading(true);
      try {
        const { status } = await Calendar.requestCalendarPermissionsAsync();
        let calendarAllowed = status === "granted";
        if (!calendarAllowed) {
          calendarAllowed = await showPermissionRecoveryAlert(
            {
              title: bd("calendarAccessTitle"),
              message: bd("calendarAccessBody"),
            },
            {
              canAskAgain: true,
              retry: async () => {
                const retry = await Calendar.requestCalendarPermissionsAsync();
                return retry.status === "granted";
              },
            },
          );
        }
        if (!calendarAllowed) {
          return;
        }
        let calendarId: string | null = null;
        const defaultCal = await Calendar.getDefaultCalendarAsync();
        if (defaultCal?.id && defaultCal.allowsModifications) {
          calendarId = defaultCal.id;
        } else {
          const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
          const writable = calendars.find((c) => c.allowsModifications);
          calendarId = writable?.id ?? null;
        }
        if (!calendarId) {
          Alert.alert(bd("noCalendarTitle"), bd("noCalendarBody"));
          return;
        }
        const tz = resolveBookingTimezone((booking as { display_time_zone?: string | null })?.display_time_zone);
        await Calendar.createEventAsync(calendarId, {
          title: params.title,
          startDate: params.start,
          endDate: params.end,
          location: params.location,
          notes: params.description,
          timeZone: tz,
        });
        haptic.success();
        Alert.alert(bd("savedToCalendarTitle"), bd("savedToCalendarBody"));
      } catch (e) {
        Alert.alert(bd("couldNotSaveCalendarTitle"), getApiErrorMessage(e as Error, bd("couldNotSaveCalendarBody")));
      } finally {
        setNativeCalLoading(false);
      }
    },
    [booking, bd],
  );

  const handleRefreshArrivalVerification = async () => {
    if (!id || isResending || (resendCooldownUntil != null && Date.now() < resendCooldownUntil)) return;
    setIsResending(true);
    try {
      const res = await api.post<{ data?: { arrival_otp_expires_at?: string }; error?: { message?: string; code?: string } }>(
        `/api/me/bookings/${id}/resend-arrival-otp`,
        {}
      );
      if (res.error) {
        const msg = res.error.message || bd("resendFailed");
        const retryAfter = res.error.code === "RATE_LIMITED" ? bd("rateLimitPleaseWait") : "";
        Alert.alert(errTitle, msg + retryAfter);
        if (res.error.code === "RATE_LIMITED") setResendCooldownUntil(Date.now() + 90000);
      } else {
        haptic.success();
        setResendCooldownUntil(Date.now() + 90000);
        await load();
      }
    } catch (e) {
      Alert.alert(errTitle, getApiErrorMessage(e as Error, bd("failedToResendCode")));
    } finally {
      setIsResending(false);
    }
  };

  const handleVerifyFallback = async () => {
    const code = fallbackOtp.replace(/\D/g, "");
    if (!id || isVerifying) return;
    if (code.length !== 4 && code.length !== 6) {
      Alert.alert(t("common.required"), bd("arrivalPinIncompleteBody"));
      return;
    }
    setIsVerifying(true);
    try {
      const res = await api.post<{ data?: { booking: any }; error?: { message?: string } }>(
        `/api/me/bookings/${id}/verify-arrival`,
        { otp: code }
      );
      if (res.error) {
        Alert.alert(errTitle, res.error.message || bd("verificationFailed"));
      } else {
        setFallbackOtp("");
        setShowFallbackInput(false);
        await load();
      }
    } catch (e) {
      Alert.alert(errTitle, getApiErrorMessage(e as Error, bd("failedToVerify")));
    } finally {
      setIsVerifying(false);
    }
  };

  if (loading && !booking) {
    return (
      <>
        <Stack.Screen options={{ title: "Booking", headerBackTitle: "Back" }} />
        <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </>
    );
  }

  if (error && !booking) {
    return (
      <>
        <Stack.Screen options={{ title: "Booking", headerBackTitle: "Back" }} />
        <View style={{ flex: 1, backgroundColor: Colors.white, padding: 24, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: Colors.gray[600], marginBottom: 16 }}>{error}</Text>
          <TouchableOpacity onPress={() => load()} style={{ backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}>
            <Text style={{ color: Colors.white, fontWeight: "600" }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  if (!booking) return null;

  const provider = booking.provider;
  // Effective lifecycle: if payment has actually settled, treat a stuck
  // `pending_payment` row as `pending` for all UI rules on this screen.
  const _bookingOutstanding = (booking as any).outstanding_balance;
  const _effectiveStatus =
    booking.status === "pending_payment" &&
    ((booking.payment_status === "paid" || booking.payment_status === "partially_paid") ||
      (typeof _bookingOutstanding === "number" && _bookingOutstanding <= 0.005))
      ? "pending"
      : booking.status;
  const lifecycleDisplay = getBookingLifecycleDisplay({
    status: booking.status,
    providerName: provider?.business_name,
    paymentStatus: booking.payment_status,
    outstandingBalance: _bookingOutstanding,
  });
  const paymentDisplay = getBookingPaymentDisplay({
    paymentStatus: booking.payment_status,
    paymentProvider: (booking as any).payment_provider,
    outstandingBalance: _bookingOutstanding,
    paymentOption: (booking as any).payment_option,
    depositRequired: (booking as any).deposit_required,
  });
  const location = booking.location;
  const services = booking.services ?? booking.booking_services ?? [];
  const isActive = ["pending", "confirmed", "started", "in_progress", "waiting", "checked_in"].includes(_effectiveStatus);
  const canCancel = isActive && !["started", "in_progress", "waiting", "checked_in"].includes(_effectiveStatus);
  const bookingRef = booking.booking_number || (booking.id ? booking.id.slice(0, 8).toUpperCase() : "");
  const helpUrl = (onDemandConfig?.ui_copy as Record<string, string> | undefined)?.waiting_help_url?.trim();

  const isAtHome = booking.location_type === "at_home";
  /** House-call journey is over — do not treat historical timestamps as "still en route". */
  const isHouseCallJourneyClosed = ["completed", "cancelled", "no_show"].includes(_effectiveStatus);
  const isProviderEnRoute =
    isAtHome &&
    !isHouseCallJourneyClosed &&
    booking.current_stage === "provider_on_way";
  const isProviderArrived =
    isAtHome &&
    !isHouseCallJourneyClosed &&
    (booking.current_stage === "provider_arrived" ||
      !!(booking as { provider_arrived_at?: string | null }).provider_arrived_at);
  const estimatedArrival = parseValidDate((booking as any).estimated_arrival);

  const detailAddonRows = Array.isArray((booking as any).addons)
    ? ((booking as any).addons as Record<string, unknown>[])
    : Array.isArray((booking as any).booking_addons)
      ? ((booking as any).booking_addons as Record<string, unknown>[])
      : [];
  const platformFeeAmount = Number((booking as any).platform_fee_amount ?? (booking as any).service_fee_amount ?? 0);
  const rawPlatformFeePercentage = Number(
    (booking as any).platform_fee_percentage ?? (booking as any).service_fee_percentage ?? 0,
  );
  const platformFeePercentage =
    Number.isFinite(rawPlatformFeePercentage) && rawPlatformFeePercentage > 0
      ? rawPlatformFeePercentage <= 1
        ? rawPlatformFeePercentage * 100
        : rawPlatformFeePercentage
      : 0;
  const packageName = (booking as { package_name?: string | null }).package_name;
  const promotionDiscountAmount = Number((booking as any).promotion_discount_amount || 0);
  const loyaltyDiscountAmount = Number((booking as any).loyalty_discount_amount || 0);
  const membershipDiscountAmount = Number((booking as any).membership_discount_amount || 0);
  const genericDiscountAmount =
    packageName ||
    promotionDiscountAmount > 0 ||
    loyaltyDiscountAmount > 0 ||
    membershipDiscountAmount > 0
      ? 0
      : Math.max(0, Number(booking.discount_amount || 0));

  /** Subtotal / tax / fees / total — same figures as Receipt (Details tab parity). */
  const renderPaymentBreakdownCore = () => (
    <>
      {packageName ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
          <Text style={{ fontSize: 14, color: Colors.gray[500] }}>Package</Text>
          <Text
            style={{ fontSize: 14, color: Colors.gray[700], flex: 1, textAlign: "right", marginLeft: 12 }}
            numberOfLines={2}
          >
            {packageName}
          </Text>
        </View>
      ) : null}
      {booking.subtotal != null && (
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
          <Text style={{ fontSize: 14, color: Colors.gray[500] }}>Subtotal</Text>
          <Text style={{ fontSize: 14, color: Colors.gray[700] }}>
            {booking.currency}{" "}
            {(Number(booking.subtotal) || 0).toFixed(2)}
          </Text>
        </View>
      )}
      {booking.tax_amount > 0 && (
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
          <Text style={{ fontSize: 14, color: Colors.gray[500] }}>
            Tax{Number((booking as any).tax_rate || 0) > 0 ? ` (${Number((booking as any).tax_rate)}%)` : ""}
          </Text>
          <Text style={{ fontSize: 14, color: Colors.gray[700] }}>{booking.currency} {Number(booking.tax_amount).toFixed(2)}</Text>
        </View>
      )}
      {genericDiscountAmount > 0 && (
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
          <Text style={{ fontSize: 14, color: Colors.gray[500] }}>Discount</Text>
          <Text style={{ fontSize: 14, color: "#16a34a" }}>-{booking.currency} {genericDiscountAmount.toFixed(2)}</Text>
        </View>
      )}
      {loyaltyDiscountAmount > 0 && (
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
          <Text style={{ fontSize: 14, color: Colors.gray[500] }}>
            Loyalty
            {Number((booking as any).loyalty_points_used || 0) > 0
              ? ` (${Number((booking as any).loyalty_points_used).toLocaleString()} pts)`
              : ""}
          </Text>
          <Text style={{ fontSize: 14, color: "#16a34a" }}>-{booking.currency} {loyaltyDiscountAmount.toFixed(2)}</Text>
        </View>
      )}
      {membershipDiscountAmount > 0 && (
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
          <Text style={{ fontSize: 14, color: Colors.gray[500] }}>Membership</Text>
          <Text style={{ fontSize: 14, color: "#16a34a" }}>-{booking.currency} {membershipDiscountAmount.toFixed(2)}</Text>
        </View>
      )}
      {promotionDiscountAmount > 0 && (
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
          <Text style={{ fontSize: 14, color: Colors.gray[500] }}>Promotion</Text>
          <Text style={{ fontSize: 14, color: "#16a34a" }}>-{booking.currency} {promotionDiscountAmount.toFixed(2)}</Text>
        </View>
      )}
      {Number((booking as any).travel_fee) > 0 && (
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
          <Text style={{ fontSize: 14, color: Colors.gray[500] }}>Travel fee</Text>
          <Text style={{ fontSize: 14, color: Colors.gray[700] }}>{booking.currency} {Number((booking as any).travel_fee).toFixed(2)}</Text>
        </View>
      )}
      {platformFeeAmount > 0 && (
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
          <Text style={{ fontSize: 14, color: Colors.gray[500] }}>
            Platform fee{platformFeePercentage > 0 ? ` (${platformFeePercentage.toFixed(platformFeePercentage % 1 === 0 ? 0 : 1)}%)` : ""}
          </Text>
          <Text style={{ fontSize: 14, color: Colors.gray[700] }}>{booking.currency} {platformFeeAmount.toFixed(2)}</Text>
        </View>
      )}
      {Number((booking as any).tip_amount) > 0 && (
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
          <Text style={{ fontSize: 14, color: Colors.gray[500] }}>Tip</Text>
          <Text style={{ fontSize: 14, color: Colors.gray[700] }}>{booking.currency} {Number((booking as any).tip_amount).toFixed(2)}</Text>
        </View>
      )}
      {Number((booking as any).cancellation_fee) > 0 && (
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
          <Text style={{ fontSize: 14, color: Colors.gray[500] }}>Cancellation fee</Text>
          <Text style={{ fontSize: 14, color: Colors.gray[700] }}>{booking.currency} {Number((booking as any).cancellation_fee).toFixed(2)}</Text>
        </View>
      )}
      <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: Colors.gray[200], paddingTop: 8, marginTop: 4 }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>Total</Text>
        <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>{booking.currency} {Number(booking.total_amount || 0).toFixed(2)}</Text>
      </View>
      {(booking as any).deposit_required && (booking as any).payment_option === "deposit" && Number((booking as any).deposit_amount || 0) > 0 && (
        <View style={{ marginTop: 6, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 13, color: Colors.gray[600] }}>
            Deposit{(booking as any).deposit_percentage ? ` (${(booking as any).deposit_percentage}%)` : ""}
          </Text>
          <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.gray[700] }}>
            {booking.currency} {Number((booking as any).deposit_amount).toFixed(2)}
          </Text>
        </View>
      )}
      {/* §Finance-truth 2026-05: payments breakdown — wallet/gift are payment
          methods, not discounts. Migration 582 makes `total_paid` include
          wallet/gift settlement amounts, so we show the canonical breakdown
          (wallet → gift card → card/online → total paid) rather than treating
          wallet/gift as deductions from total. */}
      {(() => {
        const walletPaid = Number((booking as any).wallet_amount || 0);
        const giftPaid = Number((booking as any).gift_card_amount || 0);
        const totalPaid = Number((booking as any).total_paid || 0);
        const otherPaid = Math.max(0, totalPaid - walletPaid - giftPaid);
        if (walletPaid <= 0 && giftPaid <= 0 && totalPaid <= 0) return null;
        return (
          <View style={{ marginTop: 8 }}>
            {walletPaid > 0 && (
              <View style={{ marginTop: 4, flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 13, color: Colors.gray[600] }}>Paid (wallet)</Text>
                <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.gray[700] }}>
                  {booking.currency} {walletPaid.toFixed(2)}
                </Text>
              </View>
            )}
            {giftPaid > 0 && (
              <View style={{ marginTop: 4, flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 13, color: Colors.gray[600] }}>Paid (gift card)</Text>
                <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.gray[700] }}>
                  {booking.currency} {giftPaid.toFixed(2)}
                </Text>
              </View>
            )}
            {otherPaid > 0 && (
              <View style={{ marginTop: 4, flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 13, color: Colors.gray[600] }}>Paid (card / other)</Text>
                <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.gray[700] }}>
                  {booking.currency} {otherPaid.toFixed(2)}
                </Text>
              </View>
            )}
            {totalPaid > 0 && (
              <View
                style={{
                  marginTop: 6,
                  paddingTop: 6,
                  borderTopWidth: 1,
                  borderTopColor: Colors.gray[100],
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ fontSize: 13, color: Colors.gray[600], fontWeight: "600" }}>Total paid</Text>
                <Text style={{ fontSize: 13, fontWeight: "700", color: Colors.gray[700] }}>
                  {booking.currency} {totalPaid.toFixed(2)}
                </Text>
              </View>
            )}
          </View>
        );
      })()}
      {booking.payment_status && (
        <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center" }}>
          <View
            style={{
              height: 8,
              width: 8,
              borderRadius: 4,
              marginRight: 8,
              backgroundColor:
                booking.payment_status === "paid" ? "#22C55E" : booking.payment_status === "partially_paid" ? "#F59E0B" : "#9CA3AF",
            }}
          />
          <Text style={{ fontSize: 12, color: Colors.gray[500], textTransform: "capitalize" }}>
            {booking.payment_status === "paid"
              ? "Paid in full"
              : booking.payment_status === "partially_paid"
                ? "Partially paid"
                : booking.payment_status}
          </Text>
        </View>
      )}
      {typeof booking.outstanding_balance === "number" && booking.outstanding_balance > 0 && (
        <View style={{ marginTop: 6, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 13, color: Colors.gray[600] }}>Outstanding balance</Text>
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#B45309" }}>
            {booking.currency} {Number(booking.outstanding_balance).toFixed(2)}
          </Text>
        </View>
      )}
      {isCashBooking && typeof booking.outstanding_balance === "number" && booking.outstanding_balance > 0 && (
        <View style={{ marginTop: 8, backgroundColor: "#FEF3C7", borderRadius: 8, padding: 10 }}>
          <Text style={{ fontSize: 13, color: "#92400E" }}>
            {booking.location_type === "at_home"
              ? "You will pay cash when your provider arrives."
              : "You will pay cash at the salon."}
          </Text>
        </View>
      )}
    </>
  );

  const handlePayAdditionalCharge = async (chargeId: string, chargeAmount: number) => {
    if (!id || !booking) return;
    haptic.light();
    setAdditionalChargePayLoadingId(chargeId);
    try {
      const res = await api.post<{
        authorization_url?: string;
        fully_settled?: boolean;
        reference?: string;
      }>(`/api/me/bookings/${id}/additional-charges/${chargeId}/pay`, {
        callback_url: Platform.OS === "web" ? undefined : ExpoLinking.createURL("book/paystack"),
        use_wallet: additionalPayUseWallet,
        ...(additionalPayGiftCode.trim()
          ? { gift_card_code: additionalPayGiftCode.trim().toUpperCase() }
          : {}),
      });
      if (res.error) {
        Alert.alert(errTitle, getApiErrorMessage(res.error, "Could not start payment for this charge."));
        return;
      }
      if (res.data?.fully_settled) {
        haptic.success();
        await load();
        return;
      }
      const url = res.data?.authorization_url;
      if (!url) {
        Alert.alert(errTitle, "Payment link was not received. Please try again.");
        return;
      }
      if (Platform.OS === "web") {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        const returnUrl = ExpoLinking.createURL("book/paystack");
        let paymentReference = res.data?.reference ?? null;
        if (paymentReference) {
          markReferenceProcessing(paymentReference);
        }
        const checkoutResult = await payRemainingCheckout.waitForCheckout(url, {
          title: "Pay additional charge",
          returnUrl,
          matchSuccess: (rawUrl) =>
            matchesExpoReturnUrl(rawUrl, returnUrl) && !isCancelledPaystackUrl(rawUrl),
          matchCancel: (rawUrl) => isCancelledPaystackUrl(rawUrl),
        });
        if (checkoutResult.outcome === "cancel") {
          Alert.alert(
            bd("paymentPendingTitle"),
            "Payment was cancelled. You can retry when ready.",
          );
          return;
        }
        if (checkoutResult.outcome === "success" && checkoutResult.url) {
          const extracted = extractPaystackReferenceFromUrl(checkoutResult.url);
          if (extracted) paymentReference = extracted;
        }
        if (paymentReference) {
          await verifyPaystackWithRetry(paymentReference);
        }
      }

      const MAX_ATTEMPTS = 10;
      const POLL_INTERVAL_MS = 2000;
      let chargePaid = false;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          const check = await api.get<{ additional_charges?: Array<{ id?: string; status?: string }> }>(
            `/api/me/bookings/${encodeURIComponent(id)}`,
          );
          const row = (check.data?.additional_charges ?? []).find((c) => c.id === chargeId);
          if (String(row?.status ?? "").toLowerCase() === "paid") {
            chargePaid = true;
            break;
          }
        } catch {
          /* ignore poll errors */
        }
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        }
      }

      if (chargePaid) {
        haptic.success();
        await load();
      } else {
        Alert.alert(bd("paymentPendingTitle"), bd("paymentPendingBody"));
        await load({ silent: true });
      }
    } catch (e) {
      Alert.alert(errTitle, getApiErrorMessage(e as Error, "Could not pay additional charge."));
    } finally {
      setAdditionalChargePayLoadingId(null);
    }
  };

  const handleApproveRejectCharge = async (chargeId: string, approved: boolean) => {
    if (!id || !booking) return;
    haptic.light();
    setAdditionalChargeApproveLoadingId(chargeId);
    try {
      const res = await api.post<{ message?: string }>(
        `/api/me/bookings/${id}/approve-payment`,
        { charge_id: chargeId, approved }
      );
      if (res.error) {
        Alert.alert(errTitle, getApiErrorMessage(res.error, `Could not ${approved ? "approve" : "reject"} this charge.`));
        return;
      }
      haptic.success();
      await load({ silent: true });
    } catch (e) {
      Alert.alert(errTitle, getApiErrorMessage(e as Error, `Could not ${approved ? "approve" : "reject"} this charge.`));
    } finally {
      setAdditionalChargeApproveLoadingId(null);
    }
  };

  const handlePayAdditionalChargeWithCardOnFile = async (chargeId: string, savedPaymentMethodId: string, email: string) => {
    if (!id || !booking) return;
    haptic.light();
    setAdditionalChargeCardLoadingId(chargeId);
    try {
      const res = await api.post<{ reference?: string; status?: string }>(
        `/api/payments/charge-saved-card`,
        {
          payment_method_id: savedPaymentMethodId,
          email,
          metadata: {
            booking_id: id,
            additional_charge_id: chargeId,
            payment_type: "additional_charge",
          },
        }
      );
      if (res.error) {
        Alert.alert(errTitle, getApiErrorMessage(res.error, "Could not charge your saved card."));
        return;
      }
      const txStatus = String(
        (res.data as { status?: string; transaction?: { status?: string } } | null)?.status ??
          (res.data as { transaction?: { status?: string } } | null)?.transaction?.status ??
          "",
      ).toLowerCase();
      if (txStatus && txStatus !== "success") {
        Alert.alert(bd("paymentPendingTitle"), bd("paymentPendingBody"));
        await load({ silent: true });
        return;
      }

      const MAX_ATTEMPTS = 10;
      const POLL_INTERVAL_MS = 2000;
      let chargePaid = false;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          const check = await api.get<{ additional_charges?: Array<{ id?: string; status?: string }> }>(
            `/api/me/bookings/${encodeURIComponent(id)}`,
          );
          const row = (check.data?.additional_charges ?? []).find((c) => c.id === chargeId);
          if (String(row?.status ?? "").toLowerCase() === "paid") {
            chargePaid = true;
            break;
          }
        } catch {
          /* ignore poll errors */
        }
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        }
      }

      if (chargePaid) {
        haptic.success();
        Alert.alert("Payment Successful", "Your additional charge was paid with your saved card.");
      } else {
        Alert.alert(bd("paymentPendingTitle"), bd("paymentPendingBody"));
      }
      await load({ silent: true });
    } catch (e) {
      Alert.alert(errTitle, getApiErrorMessage(e as Error, "Could not charge your saved card."));
    } finally {
      setAdditionalChargeCardLoadingId(null);
    }
  };

  const renderSplitTenderOptions = (opts: {
    useWallet: boolean;
    onUseWallet: (v: boolean) => void;
    giftCode: string;
    onGiftCode: (v: string) => void;
  }) => {
    return (
      <View style={{ marginBottom: 12 }}>
        {walletBalance > 0 ? (
          <Pressable
            onPress={() => opts.onUseWallet(!opts.useWallet)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: opts.useWallet ? Colors.primary : Colors.gray[200],
              backgroundColor: opts.useWallet ? "rgba(255,0,119,0.06)" : "#fff",
              marginBottom: 8,
            }}
          >
            <Ionicons
              name={opts.useWallet ? "checkbox" : "square-outline"}
              size={20}
              color={opts.useWallet ? Colors.primary : Colors.gray[400]}
              style={{ marginRight: 8 }}
            />
            <Text style={{ fontSize: 14, color: Colors.gray[800], flex: 1 }}>
              Use wallet ({booking?.currency || "ZAR"} {walletBalance.toFixed(2)} available)
            </Text>
          </Pressable>
        ) : null}
        <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 4 }}>Gift card (optional)</Text>
        <TextInput
          value={opts.giftCode}
          onChangeText={opts.onGiftCode}
          placeholder="Gift card code"
          autoCapitalize="characters"
          style={{
            borderWidth: 1,
            borderColor: Colors.gray[200],
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 14,
            backgroundColor: "#fff",
          }}
        />
      </View>
    );
  };

  const renderAdditionalChargesSection = () => {
    const charges = booking?.additional_charges ?? [];
    if (charges.length === 0) return null;
    const hasUnpaid = charges.some(
      (c: { status?: string }) => c.status === "pending" || c.status === "approved",
    );
    return (
      <View style={{ marginBottom: 16, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], padding: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>Additional charges</Text>
        {hasUnpaid
          ? renderSplitTenderOptions({
              useWallet: additionalPayUseWallet,
              onUseWallet: setAdditionalPayUseWallet,
              giftCode: additionalPayGiftCode,
              onGiftCode: setAdditionalPayGiftCode,
            })
          : null}
        {charges.map((c: any, idx: number) => {
          const isPending = c.status === "pending";
          const isApproved = c.status === "approved";
          const unpaid = isPending || isApproved;
          const cur = (c.currency as string | undefined) || booking.currency;
          const statusRaw = typeof c.status === "string" ? c.status : "";
          const statusLabel = statusRaw.replace(/_/g, " ");
          const chargeLoadingThis = additionalChargePayLoadingId === String(c.id);
          const approveLoadingThis = additionalChargeApproveLoadingId === String(c.id);
          const cardLoadingThis = additionalChargeCardLoadingId === String(c.id);
          const anyLoading = chargeLoadingThis || approveLoadingThis || cardLoadingThis;
          return (
            <View
              key={String(c.id ?? idx)}
              style={{
                paddingVertical: 8,
                borderBottomWidth: idx < charges.length - 1 ? 1 : 0,
                borderBottomColor: Colors.gray[100],
                ...(highlightedChargeId === String(c.id)
                  ? { backgroundColor: "#FFF7ED", borderRadius: 8, paddingHorizontal: 6, marginHorizontal: -6 }
                  : {}),
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={{ fontSize: 14, color: Colors.gray[800] }}>{c.description || "Additional charge"}</Text>
                  <Text style={{ fontSize: 13, color: Colors.gray[500] }}>
                    {cur} {Number(c.amount || 0).toFixed(2)}
                  </Text>
                  {c.paid_at ? (
                    <Text style={{ fontSize: 12, color: Colors.gray[400], marginTop: 2 }}>Paid on {new Date(c.paid_at).toLocaleDateString()}</Text>
                  ) : null}
                </View>
                {!unpaid && (
                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 8,
                      backgroundColor: c.status === "paid" ? "#DCFCE7" : c.status === "rejected" ? "#FEE2E2" : Colors.gray[100],
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        textTransform: "capitalize",
                        color: c.status === "paid" ? "#15803d" : c.status === "rejected" ? "#B91C1C" : Colors.gray[700],
                      }}
                    >
                      {statusLabel || "—"}
                    </Text>
                  </View>
                )}
              </View>
              {unpaid && (
                <View style={{ marginTop: 8, gap: 6 }}>
                  {isPending && (
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => void handleApproveRejectCharge(String(c.id), true)}
                        disabled={anyLoading}
                        style={{ flex: 1, borderWidth: 1, borderColor: Colors.primary, borderRadius: 8, paddingVertical: 8, alignItems: "center" }}
                        accessibilityRole="button"
                        accessibilityLabel="Approve additional charge"
                      >
                        {approveLoadingThis ? (
                          <ActivityIndicator size="small" color={Colors.primary} />
                        ) : (
                          <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.primary }}>Approve</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => void handleApproveRejectCharge(String(c.id), false)}
                        disabled={anyLoading}
                        style={{ flex: 1, borderWidth: 1, borderColor: Colors.gray[300], borderRadius: 8, paddingVertical: 8, alignItems: "center", opacity: anyLoading ? 0.4 : 1 }}
                        accessibilityRole="button"
                        accessibilityLabel="Reject additional charge"
                      >
                        <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.gray[600] }}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={() => void handlePayAdditionalCharge(String(c.id), Number(c.amount || 0))}
                    disabled={anyLoading}
                    style={{ backgroundColor: Colors.primary, paddingVertical: 10, borderRadius: 8, alignItems: "center" }}
                    accessibilityRole="button"
                    accessibilityLabel="Pay additional charge"
                  >
                    {chargeLoadingThis ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.white }}>
                        {isPending ? "Pay now (skips approval)" : "Pay now"}
                      </Text>
                    )}
                  </TouchableOpacity>
                  {isApproved && defaultSavedCard && user?.email && (
                    <TouchableOpacity
                      onPress={() => void handlePayAdditionalChargeWithCardOnFile(String(c.id), defaultSavedCard.id, user.email!)}
                      disabled={anyLoading}
                      style={{ borderWidth: 1, borderColor: Colors.gray[300], borderRadius: 8, paddingVertical: 10, alignItems: "center" }}
                      accessibilityRole="button"
                      accessibilityLabel="Pay with saved card"
                    >
                      {cardLoadingThis ? (
                        <ActivityIndicator size="small" color={Colors.primary} />
                      ) : (
                        <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.gray[700] }}>
                          Pay with saved card ···· {defaultSavedCard.last4 ?? ""}
                        </Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: bookingRef ? `Booking #${bookingRef}` : "Booking Details",
          headerBackTitle: "Back",
        }}
      />
      <ScrollView ref={scrollViewRef} style={{ flex: 1, backgroundColor: Colors.white }} contentContainerStyle={{ padding: contentPadding, paddingBottom: 48, ...constraint }} accessibilityLabel="Booking details" accessibilityRole="none">
        {/* Acceptance / confirmation strip (for confirmed/pending/started) */}
        {isActive && (
          <View
            style={{
              marginBottom: 16,
              borderRadius: 16,
              backgroundColor: lifecycleDisplay.isAwaitingProviderConfirmation ? "#FFFBEB" : "#F0FDF4",
              borderWidth: 1,
              borderColor: lifecycleDisplay.isAwaitingProviderConfirmation ? "#FDE68A" : "#BBF7D0",
              padding: 16,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: lifecycleDisplay.isAwaitingProviderConfirmation ? "#FEF3C7" : "#DCFCE7",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 12,
                }}
              >
                <Ionicons
                  name={lifecycleDisplay.isAwaitingProviderConfirmation ? "time-outline" : "checkmark-circle"}
                  size={24}
                  color={lifecycleDisplay.isAwaitingProviderConfirmation ? "#D97706" : "#16a34a"}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>
                  {lifecycleDisplay.title} {formatTime(booking.selected_datetime, booking.display_time_zone)}
                </Text>
                <Text style={{ fontSize: 14, color: Colors.gray[600], marginTop: 2 }}>
                  {booking.status === "waiting"
                    ? "The provider will be with you shortly."
                    : booking.status === "checked_in"
                      ? "You've arrived. The provider knows you're here."
                      : `${lifecycleDisplay.description}${paymentDisplay.isPaymentSettled || paymentDisplay.isDepositPaid ? ` ${paymentDisplay.label}.` : ""}`}
                </Text>
              </View>
            </View>
            {helpUrl ? (
              <TouchableOpacity
                onPress={() => Linking.openURL(helpUrl)}
                style={{ marginTop: 12, flexDirection: "row", alignItems: "center" }}
                accessibilityRole="link"
                accessibilityLabel="Help"
              >
                <Ionicons name="help-circle-outline" size={18} color="#16a34a" />
                <Text style={{ marginLeft: 8, fontSize: 14, fontWeight: "500", color: "#15803d" }}>Help</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {/* ───── Additional Charge Action Banner ─────
            Shown on EVERY tab so the customer can never miss a payment request.
            Reuses existing approve/reject/pay handlers; "More options" switches
            to the Receipt tab where wallet, gift card and saved-card paths live. */}
        {(() => {
          const allCharges: any[] = booking?.additional_charges ?? [];
          const unpaid = allCharges.filter(
            (c) => c.status === "pending" || c.status === "approved",
          );
          if (unpaid.length === 0) return null;
          const single = unpaid.length === 1 ? unpaid[0] : null;
          const currency: string = single?.currency || booking?.currency || "ZAR";
          const total = unpaid.reduce((s: number, c: any) => s + Number(c.amount || 0), 0);
          const singlePayLoading = single && additionalChargePayLoadingId === String(single.id);
          const singleApproveLoading =
            single && additionalChargeApproveLoadingId === String(single.id);
          const singleAnyLoading = !!(singlePayLoading || singleApproveLoading);

          const goToReceiptCharges = () => {
            haptic.light();
            setActiveTab("receipt");
            setShouldScrollToCharges(true);
          };

          return (
            <View
              style={{
                marginBottom: 12,
                borderRadius: 16,
                backgroundColor: "#FFF7ED",
                borderWidth: 1.5,
                borderColor: "#FB923C",
                padding: 14,
              }}
              accessible={false}
            >
              {/* Header row */}
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: "#FED7AA",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 10,
                  }}
                >
                  <Ionicons name="card-outline" size={20} color="#EA580C" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "700", fontSize: 14, color: "#9A3412" }}>
                    Payment Required
                  </Text>
                  {single ? (
                    <>
                      <Text
                        style={{ fontSize: 13, color: "#C2410C", marginTop: 1 }}
                        numberOfLines={1}
                      >
                        {single.description || "Additional charge"} —{" "}
                        {formatMoney(Number(single.amount || 0), currency)}
                      </Text>
                      {single.status === "pending" && (
                        <Text style={{ fontSize: 11, color: "#92400E", marginTop: 1 }}>
                          Awaiting your approval to pay
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text style={{ fontSize: 13, color: "#C2410C", marginTop: 1 }}>
                      {unpaid.length} outstanding charges · {formatMoney(total, currency)} total
                    </Text>
                  )}
                </View>
              </View>

              {/* CTAs */}
              {single ? (
                <View style={{ gap: 8 }}>
                  {/* Approve / Reject row for pending charges */}
                  {single.status === "pending" && (
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => void handleApproveRejectCharge(String(single.id), true)}
                        disabled={singleAnyLoading}
                        style={{
                          flex: 1,
                          borderWidth: 1.5,
                          borderColor: "#EA580C",
                          borderRadius: 10,
                          paddingVertical: 9,
                          alignItems: "center",
                          opacity: singleAnyLoading ? 0.4 : 1,
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Approve additional charge"
                      >
                        {singleApproveLoading ? (
                          <ActivityIndicator size="small" color="#EA580C" />
                        ) : (
                          <Text style={{ fontSize: 13, fontWeight: "600", color: "#EA580C" }}>
                            Approve
                          </Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => void handleApproveRejectCharge(String(single.id), false)}
                        disabled={singleAnyLoading}
                        style={{
                          flex: 1,
                          borderWidth: 1,
                          borderColor: Colors.gray[300],
                          borderRadius: 10,
                          paddingVertical: 9,
                          alignItems: "center",
                          opacity: singleAnyLoading ? 0.4 : 1,
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Reject additional charge"
                      >
                        <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.gray[600] }}>
                          Reject
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Primary Pay Now button */}
                  <TouchableOpacity
                    onPress={() =>
                      void handlePayAdditionalCharge(
                        String(single.id),
                        Number(single.amount || 0),
                      )
                    }
                    disabled={singleAnyLoading}
                    style={{
                      backgroundColor: singleAnyLoading ? "#FB923C" : "#EA580C",
                      paddingVertical: 13,
                      borderRadius: 10,
                      alignItems: "center",
                      opacity: singleAnyLoading ? 0.6 : 1,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={
                      single.status === "pending"
                        ? "Pay now, skips approval step"
                        : "Pay now"
                    }
                  >
                    {singlePayLoading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={{ fontSize: 14, fontWeight: "700", color: "#fff" }}>
                        {single.status === "pending" ? "Pay Now · Skips Approval" : "Pay Now"}
                        {"  "}{formatMoney(Number(single.amount || 0), currency)}
                      </Text>
                    )}
                  </TouchableOpacity>

                  {/* More options link */}
                  <TouchableOpacity
                    onPress={goToReceiptCharges}
                    accessibilityRole="button"
                    accessibilityLabel="More payment options"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        color: "#EA580C",
                        textAlign: "center",
                        textDecorationLine: "underline",
                      }}
                    >
                      More options: wallet · gift card · saved card
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                /* Multiple unpaid charges — jump to receipt tab for individual management */
                <TouchableOpacity
                  onPress={goToReceiptCharges}
                  style={{
                    backgroundColor: "#EA580C",
                    paddingVertical: 13,
                    borderRadius: 10,
                    alignItems: "center",
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`View and pay ${unpaid.length} charges`}
                >
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#fff" }}>
                    View &amp; Pay {unpaid.length} Charges —{" "}
                    {formatMoney(total, currency)} total
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })()}

        {/* Tabs: Tracking | Receipt | Details */}
        <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: Colors.gray[200], marginBottom: 16 }}>
          {(["tracking", "receipt", "details"] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => { haptic.light(); setActiveTab(tab); }}
              style={{ flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2, borderBottomColor: activeTab === tab ? Colors.primary : "transparent" }}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === tab }}
              accessibilityLabel={tab === "tracking" ? "Tracking" : tab === "receipt" ? "Receipt" : "Details"}
            >
              <Text style={{ fontSize: 14, fontWeight: "500", color: activeTab === tab ? Colors.primary : Colors.gray[500] }}>
                {tab === "tracking" ? "Tracking" : tab === "receipt" ? "Receipt" : "Details"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === "tracking" && (
          <>
            {/* Status block */}
            <View style={{ marginBottom: 16, borderRadius: 16, backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0", padding: 20 }}>
              <Text style={{ fontSize: 18, fontWeight: "600", color: Colors.gray[900] }}>
                {booking.status === "completed"
                  ? "Service completed"
                  : booking.status === "started" || booking.status === "in_progress"
                    ? "Service in progress"
                    : booking.status === "cancelled"
                      ? "Booking cancelled"
                      : booking.status === "no_show"
                        ? "Marked as no-show"
                        : booking.status === "pending"
                          ? "Awaiting provider confirmation"
                          : isProviderArrived
                          ? "Provider has arrived"
                          : isProviderEnRoute
                            ? "Provider on the way"
                            : "Your visit is confirmed"}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primaryLight, alignItems: "center", justifyContent: "center", marginRight: 12, marginBottom: 12 }}>
                  <Ionicons name="cut-outline" size={20} color={Colors.primary} />
                </View>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primaryLight, alignItems: "center", justifyContent: "center", marginRight: 12, marginBottom: 12 }}>
                  <Ionicons name="brush-outline" size={20} color={Colors.primary} />
                </View>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primaryLight, alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                  <Ionicons name="sparkles-outline" size={20} color={Colors.primary} />
                </View>
              </View>
            </View>
            <BookingLiveSyncIndicator lastUpdatedAt={lastLiveUpdateAt} />
            {(isProviderEnRoute || isProviderArrived) && formatBookingLiveStageLabel(booking.current_stage) ? (
              <View style={{ marginBottom: 12, borderRadius: 12, backgroundColor: "#ecfdf5", borderWidth: 1, borderColor: "#a7f3d0", padding: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#065f46" }}>
                  {formatBookingLiveStageLabel(booking.current_stage)}
                </Text>
              </View>
            ) : null}
            {/* ETA (at-home, when provider en route and backend provides it) */}
            {isAtHome && isProviderEnRoute && estimatedArrival && (() => {
              const eta = getCustomerEtaUiParts((booking as { estimated_arrival?: string }).estimated_arrival);
              if (!eta.show) return null;
              return (
                <View style={{ marginBottom: 16, borderRadius: 16, backgroundColor: "#EFF6FF", borderWidth: 1, borderColor: "#BFDBFE", padding: 16 }}>
                  <Text style={{ fontSize: 14, fontWeight: "500", color: "#1E3A8A" }}>Estimated arrival</Text>
                  <Text style={{ fontSize: 16, color: "#1E40AF", marginTop: 2 }}>
                    {eta.timeLabel}
                    {" · "}
                    {eta.minutesLabel}
                  </Text>
                  <Text style={{ fontSize: 12, color: "#3B82F6", marginTop: 6 }}>
                    We refresh this as your provider moves.
                  </Text>
                </View>
              );
            })()}
            {isAtHome && isProviderEnRoute && !isProviderArrived && (() => {
              const pl = (booking as { provider_location?: { latitude?: unknown; longitude?: unknown } }).provider_location;
              const pLat = pl && typeof pl === "object" ? Number(pl.latitude) : NaN;
              const pLng = pl && typeof pl === "object" ? Number(pl.longitude) : NaN;
              const b = booking as Record<string, unknown>;
              const nested = b.address as Record<string, unknown> | undefined;
              const cLat = Number(nested?.latitude ?? b.address_latitude);
              const cLng = Number(nested?.longitude ?? b.address_longitude);
              const hasProviderPin = Number.isFinite(pLat) && Number.isFinite(pLng);
              const hasCustomerPin = Number.isFinite(cLat) && Number.isFinite(cLng);
              if (!hasProviderPin) {
                return (
                  <View style={{ marginBottom: 16, paddingVertical: 8 }}>
                    <Text style={{ fontSize: 13, color: Colors.gray[600] }}>
                      Live map appears when your provider shares their location.
                    </Text>
                  </View>
                );
              }
              return (
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900], marginBottom: 4 }}>Live tracking</Text>
                  {hasCustomerPin ? (
                    <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 8 }}>Pink = provider · Blue = your address</Text>
                  ) : null}
                  <View style={{ overflow: "hidden", borderRadius: 12 }}>
                    <StaticMapImage
                      latitude={pLat}
                      longitude={pLng}
                      {...(hasCustomerPin ? { secondaryLatitude: cLat, secondaryLongitude: cLng } : {})}
                      fallbackQuery={
                        hasCustomerPin
                          ? `${cLat.toFixed(5)},${cLng.toFixed(5)}`
                          : ""
                      }
                      width={400}
                      height={180}
                      zoom={12}
                      style={{ borderRadius: 12 }}
                    />
                  </View>
                </View>
              );
            })()}
            {/* Customer-holds-PIN: show code for provider to enter */}
            {needsPinDisplay && (
              <View style={{ marginBottom: 16, borderRadius: 16, backgroundColor: "#EFF6FF", borderWidth: 1, borderColor: "#BFDBFE", padding: 20 }} accessibilityLabel={ARRIVAL_PIN_CUSTOMER_HEADING}>
                <Text style={{ fontSize: 16, fontWeight: "600", color: "#1E3A8A", marginBottom: 4 }}>{ARRIVAL_PIN_CUSTOMER_HEADING}</Text>
                <Text style={{ fontSize: 14, color: "#1E40AF", marginBottom: 12 }}>
                  {bothArrivalMethodsVisible ? ARRIVAL_PIN_CUSTOMER_SUBTITLE_WITH_QR : ARRIVAL_PIN_CUSTOMER_SUBTITLE}
                </Text>
                <View style={{ alignItems: "center", marginVertical: 12 }}>
                  <Text style={{ fontSize: 32, fontWeight: "700", letterSpacing: 6, color: "#1E3A8A" }}>
                    {(booking.arrival_otp?.length === 4
                      ? `${(booking.arrival_otp as string).slice(0, 2)} ${(booking.arrival_otp as string).slice(2)}`
                      : booking.arrival_otp?.length === 6
                        ? `${(booking.arrival_otp as string).slice(0, 3)} ${(booking.arrival_otp as string).slice(3)}`
                        : booking.arrival_otp) ?? "—"}
                  </Text>
                </View>
                {pinSecondsLeft != null && (
                  <Text style={{ fontSize: 13, color: "#1E40AF", marginBottom: 12 }}>
                    {pinSecondsLeft > 0 ? `Code expires in ${Math.floor(pinSecondsLeft / 60)}:${String(pinSecondsLeft % 60).padStart(2, "0")}` : "Code expired — get a new code below (your QR refreshes too if you use it)."}
                  </Text>
                )}
                <TouchableOpacity
                  onPress={handleRefreshArrivalVerification}
                  disabled={isResending || (resendCooldownUntil != null && Date.now() < resendCooldownUntil)}
                  style={{
                    backgroundColor:
                      isResending || (resendCooldownUntil != null && Date.now() < resendCooldownUntil)
                        ? Colors.gray[300]
                        : Colors.primary,
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: 12,
                    alignSelf: "flex-start",
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={pinSecondsLeft === 0 ? "Get new verification code" : "Resend verification code"}
                >
                  <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>
                    {isResending
                      ? "Sending…"
                      : resendCooldownUntil != null && Date.now() < resendCooldownUntil
                        ? "Resend (wait)"
                        : pinSecondsLeft === 0
                          ? "Get new code & QR"
                          : "Resend code"}
                  </Text>
                </TouchableOpacity>
                {!showFallbackInput ? (
                  <TouchableOpacity onPress={() => setShowFallbackInput(true)} style={{ marginTop: 12 }}>
                    <Text style={{ fontSize: 13, color: "#1E40AF", textDecorationLine: "underline" }}>Having trouble? Enter code here</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: "#BFDBFE" }}>
                    <Text style={{ fontSize: 13, color: "#1E3A8A", marginBottom: 8 }}>{ARRIVAL_PIN_FALLBACK_LABEL}</Text>
                    <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 6 }}>{ARRIVAL_PIN_LENGTH_HINT}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <TextInput
                        value={fallbackOtp}
                        onChangeText={(t) => setFallbackOtp(t.replace(/\D/g, "").slice(0, 6))}
                        placeholder={ARRIVAL_PIN_PLACEHOLDER}
                        keyboardType="number-pad"
                        maxLength={6}
                        style={{ flex: 1, borderWidth: 1, borderColor: Colors.gray[300], borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, fontSize: 18 }}
                        accessibilityLabel="Verification code"
                      />
                      <TouchableOpacity
                        onPress={handleVerifyFallback}
                        disabled={
                          isVerifying ||
                          ![4, 6].includes(fallbackOtp.replace(/\D/g, "").length)
                        }
                        style={{ backgroundColor: Colors.primary, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 }}
                      >
                        {isVerifying ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "600" }}>Verify</Text>}
                      </TouchableOpacity>
                    </View>
                    <Pressable onPress={() => { setShowFallbackInput(false); setFallbackOtp(""); }}>
                      <Text style={{ fontSize: 13, color: "#1E40AF" }}>Cancel</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}
            {/* Customer-holds-QR: provider scans to verify arrival */}
            {needsQrDisplay && qrPayloadForDisplay && (
              <View
                style={{ marginBottom: 16, borderRadius: 16, backgroundColor: "#FAF5FF", borderWidth: 1, borderColor: "#E9D5FF", padding: 20 }}
                accessibilityLabel="Your arrival verification QR code"
              >
                <Text style={{ fontSize: 16, fontWeight: "600", color: "#581C87", marginBottom: 4 }}>Show this QR to your provider</Text>
                <Text style={{ fontSize: 14, color: "#6B21A8", marginBottom: 16 }}>
                  {bothArrivalMethodsVisible
                    ? ARRIVAL_QR_CUSTOMER_SUBTITLE_WITH_PIN
                    : "They will scan it or enter the code on their device to confirm they've arrived."}
                </Text>
                {qrSecondsLeft != null && qrSecondsLeft <= 0 ? (
                  <View style={{ alignItems: "center", paddingVertical: 12 }}>
                    <Text style={{ fontSize: 14, color: "#6B21A8", textAlign: "center", marginBottom: 12 }}>
                      This QR is no longer valid. Refresh to show a new code for your provider.
                    </Text>
                  </View>
                ) : (
                  <View style={{ alignItems: "center", backgroundColor: "#fff", borderRadius: 16, padding: 16, alignSelf: "center" }}>
                    <QRCode value={qrPayloadForDisplay} size={200} backgroundColor="#FFFFFF" color="#000000" />
                  </View>
                )}
                {qrSecondsLeft != null && (
                  <Text style={{ fontSize: 13, color: "#6B21A8", marginTop: 12, textAlign: "center" }}>
                    {qrSecondsLeft > 0
                      ? `QR expires in ${Math.floor(qrSecondsLeft / 60)}:${String(qrSecondsLeft % 60).padStart(2, "0")}`
                      : "QR expired"}
                  </Text>
                )}
                {qrSecondsLeft != null && qrSecondsLeft <= 0 && !needsPinDisplay ? (
                  <TouchableOpacity
                    onPress={handleRefreshArrivalVerification}
                    disabled={isResending || (resendCooldownUntil != null && Date.now() < resendCooldownUntil)}
                    style={{
                      marginTop: 8,
                      alignSelf: "center",
                      backgroundColor:
                        isResending || (resendCooldownUntil != null && Date.now() < resendCooldownUntil)
                          ? Colors.gray[300]
                          : Colors.primary,
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      borderRadius: 12,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Refresh verification QR"
                  >
                    <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>
                      {isResending
                        ? "Refreshing…"
                        : resendCooldownUntil != null && Date.now() < resendCooldownUntil
                          ? "Refresh (wait)"
                          : "Refresh QR & code"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {qrSecondsLeft != null && qrSecondsLeft <= 0 && needsPinDisplay ? (
                  <Text style={{ fontSize: 13, color: "#6B21A8", marginTop: 10, textAlign: "center" }}>
                    Tap “Get new code & QR” above to refresh your PIN and this QR.
                  </Text>
                ) : null}
                {qrVerificationCode && (qrSecondsLeft == null || qrSecondsLeft > 0) ? (
                  <TouchableOpacity
                    onPress={async () => {
                      haptic.light();
                      await Clipboard.setStringAsync(qrVerificationCode);
                      Alert.alert(bd("copyCodeTitle"), bd("copyCodeBody"));
                    }}
                    style={{
                      marginTop: 14,
                      alignSelf: "center",
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      borderRadius: 12,
                      backgroundColor: "#EDE9FE",
                      borderWidth: 1,
                      borderColor: "#DDD6FE",
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Copy verification code"
                  >
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#5B21B6" }}>
                      Copy code: <Text style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>{qrVerificationCode}</Text>
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
            {/* Milestones (at-home: en route / arrived; at-salon: preparing / in progress) */}
            <View style={{ marginBottom: 16 }}>
              {(
                booking.status === "cancelled"
                  ? [
                      { key: "confirmed", label: "Booking confirmed", done: true },
                      { key: "cancelled", label: "Booking cancelled", done: true },
                    ]
                  : isAtHome
                    ? [
                        { key: "received", label: "Request received", done: true },
                        { key: "confirmed", label: "Confirmed by provider", done: ["confirmed", "started", "completed", "in_progress"].includes(booking.status) || isProviderEnRoute || isProviderArrived },
                        { key: "en_route", label: "Provider en route", done: isProviderEnRoute || isProviderArrived || ["started", "completed", "in_progress"].includes(booking.status) },
                        { key: "arrived", label: "Provider arrived", done: isProviderArrived || ["started", "completed", "in_progress"].includes(booking.status) },
                        { key: "in_progress", label: "Service in progress", done: ["started", "completed", "in_progress"].includes(booking.status) },
                        { key: "completed", label: "Completed", done: booking.status === "completed" },
                      ]
                    : [
                        { key: "received", label: "Request received", done: true },
                        { key: "confirmed", label: "Confirmed by provider", done: ["confirmed", "started", "completed", "in_progress"].includes(booking.status) },
                        { key: "preparing", label: "Preparing for your visit", done: ["confirmed", "started", "completed", "in_progress"].includes(booking.status) },
                        { key: "in_progress", label: "Service in progress", done: ["started", "completed", "in_progress"].includes(booking.status) },
                        { key: "completed", label: "Completed", done: booking.status === "completed" },
                      ]
              ).map((step: { key: string; label: string; done: boolean }) => (
                <View key={step.key} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", marginRight: 12, backgroundColor: step.done ? "#DCFCE7" : Colors.gray[100] }}>
                    {step.done ? (
                      <Ionicons name="checkmark" size={14} color="#16a34a" />
                    ) : (
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.gray[300] }} />
                    )}
                  </View>
                  <Text style={{ color: step.done ? Colors.gray[900] : Colors.gray[400], fontWeight: step.done ? "500" : "400" }}>{step.label}</Text>
                </View>
              ))}
            </View>
            {/* Scheduled time */}
            <View style={{ borderRadius: 16, backgroundColor: Colors.gray[50], padding: 16, marginBottom: 16 }}>
              <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 4 }}>Scheduled for</Text>
              <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }}>{formatDate(booking.selected_datetime, booking.display_time_zone)}</Text>
              <Text style={{ fontSize: 14, color: Colors.gray[600], marginTop: 2 }}>{formatTime(booking.selected_datetime, booking.display_time_zone)}</Text>
              {provider?.business_name ? (
                <>
                  <Text style={{ fontSize: 14, color: Colors.gray[500], marginTop: 8 }}>at {provider.business_name}</Text>
                  {typeof provider.rating_average === "number" && provider.rating_average > 0 ? (
                    <Text style={{ fontSize: 13, color: "#b45309", marginTop: 4 }}>
                      {`${provider.rating_average.toFixed(1)}★${provider.review_count ? ` · ${provider.review_count} reviews` : ""}`}
                    </Text>
                  ) : null}
                </>
              ) : null}
            </View>
          </>
        )}

        {activeTab === "receipt" && (
          <>
            <View style={{ marginBottom: 16, borderRadius: 16, backgroundColor: Colors.gray[50], padding: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>Payment</Text>
              {renderPaymentBreakdownCore()}
            </View>
            {payError && (
              <View style={{ backgroundColor: "#FEF2F2", borderRadius: 12, padding: 12, marginBottom: 16 }}>
                <Text style={{ color: "#B91C1C" }}>{payError}</Text>
              </View>
            )}
            {needsPayment && (
              <Pressable onPress={handlePay} disabled={payLoading} style={{ backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: "center", marginBottom: 12 }} accessibilityRole="button" accessibilityLabel="Pay now">
                {payLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 16 }}>Pay Now</Text>}
              </Pressable>
            )}
            {showPayRemaining && (
              <>
                {renderSplitTenderOptions({
                  useWallet: payRemainingUseWallet,
                  onUseWallet: setPayRemainingUseWallet,
                  giftCode: payRemainingGiftCode,
                  onGiftCode: setPayRemainingGiftCode,
                })}
                <Pressable
                  onPress={handlePayRemaining}
                  disabled={payRemainingLoading}
                  style={{ backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: "center", marginBottom: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel={isFullyUnpaid ? "Pay now" : "Pay remaining balance"}
                >
                  {payRemainingLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 16 }}>
                      {isFullyUnpaid ? "Pay now" : "Pay remaining balance"}
                    </Text>
                  )}
                </Pressable>
              </>
            )}
            {(focusParam === "additional_charge" || chargeIdParam !== "") &&
            chargeFocusFetchStatus === "loading" ? (
              <View style={{ marginBottom: 16, padding: 16, alignItems: "center" }}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={{ marginTop: 8, fontSize: 13, color: Colors.gray[600] }}>
                  Loading payment request…
                </Text>
              </View>
            ) : null}
            {(focusParam === "additional_charge" || chargeIdParam !== "") &&
            chargeFocusFetchStatus === "done" &&
            !(booking?.additional_charges ?? []).some(
              (c: { status?: string }) => c.status === "pending" || c.status === "approved",
            ) &&
            (chargeIdParam === "" ||
              !(booking?.additional_charges ?? []).some(
                (c: { id?: string }) => String(c.id) === chargeIdParam,
              )) ? (
              <View
                style={{
                  marginBottom: 16,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#FED7AA",
                  backgroundColor: "#FFF7ED",
                  padding: 16,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#9A3412", marginBottom: 6 }}>
                  Payment request unavailable
                </Text>
                <Text style={{ fontSize: 13, color: "#C2410C", marginBottom: 12 }}>
                  This charge may already be paid or removed. Refresh to see the latest balance, or contact your
                  provider if you still owe an amount.
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    haptic.light();
                    focusAppliedRef.current = false;
                    chargeFetchAttemptedRef.current = false;
                    setChargeFocusFetchStatus("idle");
                    void load();
                  }}
                  style={{
                    alignSelf: "flex-start",
                    backgroundColor: Colors.primary,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 8,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Refresh booking"
                >
                  <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 14 }}>Refresh</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <View
              onLayout={(e) => { chargesSectionYRef.current = e.nativeEvent.layout.y; }}
              collapsable={false}
            >
              {renderAdditionalChargesSection()}
            </View>
            <View style={{ flexDirection: "row" }}>
              <TouchableOpacity
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], marginRight: 12 }}
                onPress={() => {
                  haptic.light();
                  const cur = booking.currency || "ZAR";
                  const paymentExtras: string[] = [];
                  if (booking.is_group_booking && booking.group_booking_ref) {
                    paymentExtras.push(`Group reference: ${booking.group_booking_ref}`);
                  }
                  if (Number(booking.tax_amount) > 0) {
                    paymentExtras.push(`Tax: ${cur} ${Number(booking.tax_amount).toFixed(2)}`);
                  }
                  if (platformFeeAmount > 0) {
                    const pct = platformFeePercentage > 0
                      ? ` (${platformFeePercentage.toFixed(platformFeePercentage % 1 === 0 ? 0 : 1)}%)`
                      : "";
                    paymentExtras.push(`Platform fee${pct}: ${cur} ${platformFeeAmount.toFixed(2)}`);
                  }
                  if (Number((booking as any).tip_amount) > 0) {
                    paymentExtras.push(`Tip: ${cur} ${Number((booking as any).tip_amount).toFixed(2)}`);
                  }
                  if (Number((booking as any).loyalty_discount_amount) > 0) {
                    paymentExtras.push(`Loyalty: -${cur} ${Number((booking as any).loyalty_discount_amount).toFixed(2)}`);
                  }
                  // §Finance-truth 2026-05: wallet/gift are payment lines, not
                  // discounts — they go into a "Paid via" block below total.
                  const paidViaLines: string[] = [];
                  if (Number((booking as any).gift_card_amount) > 0) {
                    paidViaLines.push(`Gift card: ${cur} ${Number((booking as any).gift_card_amount).toFixed(2)}`);
                  }
                  if (Number((booking as any).wallet_amount) > 0) {
                    paidViaLines.push(`Wallet: ${cur} ${Number((booking as any).wallet_amount).toFixed(2)}`);
                  }
                  const cardPaidEstimate = Math.max(
                    0,
                    Number((booking as any).total_paid ?? 0) -
                      Number((booking as any).wallet_amount ?? 0) -
                      Number((booking as any).gift_card_amount ?? 0),
                  );
                  if (cardPaidEstimate > 0.005) {
                    paidViaLines.push(`Card / other: ${cur} ${cardPaidEstimate.toFixed(2)}`);
                  }
                  if (typeof booking.outstanding_balance === "number" && booking.outstanding_balance > 0) {
                    paymentExtras.push(`Outstanding: ${cur} ${Number(booking.outstanding_balance).toFixed(2)}`);
                  }
                  const lines = [
                    `Beautonomi Booking`,
                    `Booking #${booking.booking_number || booking.id?.slice(0, 8) || ""}`,
                    ``,
                    `Provider: ${provider?.business_name || "N/A"}`,
                    `Date: ${formatDate(booking.selected_datetime, booking.display_time_zone)}`,
                    `Time: ${formatTime(booking.selected_datetime, booking.display_time_zone)}`,
                    `Status: ${booking.status}`,
                    ``,
                    ...(services || []).map((svc: any) => {
                      const title = svc.offering_name || svc.service_name || "Service";
                      const guest = svc.guest_name ? ` (${String(svc.guest_name)})` : "";
                      return `• ${title}${guest} – ${cur} ${Number(svc.price || 0).toFixed(2)}`;
                    }),
                    ...(paymentExtras.length > 0 ? ["", ...paymentExtras] : []),
                    ``,
                    `Total: ${cur} ${Number(booking.total_amount || 0).toFixed(2)}`,
                    ...(paidViaLines.length > 0
                      ? ["", "Paid via:", ...paidViaLines.map((l) => `• ${l}`)]
                      : []),
                    ``,
                    `View: ${APP_URL}/account-settings/bookings/${booking.id}`,
                  ];
                  Share.share({ message: lines.join("\n"), title: "Booking" });
                }}
                accessibilityRole="button"
                accessibilityLabel="Share"
              >
                <Ionicons name="share-outline" size={16} color={Colors.gray[700]} />
                <Text style={{ marginLeft: 8, fontWeight: "500", color: Colors.gray[700] }}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={downloadReceiptNative}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200] }}
                accessibilityRole="button"
                accessibilityLabel="Download"
              >
                <Ionicons name="download-outline" size={16} color={Colors.gray[700]} />
                <Text style={{ marginLeft: 8, fontWeight: "500", color: Colors.gray[700] }}>Download</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {activeTab === "details" && (
          <>
        {/* Provider & Status */}
        <View style={{ marginBottom: 16, borderRadius: 16, backgroundColor: Colors.gray[50], padding: 16 }}>
          <View
            style={{
              marginBottom: 12,
              paddingBottom: 12,
              borderBottomWidth: 1,
              borderBottomColor: Colors.gray[200],
            }}
          >
            <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 4 }}>Visit type</Text>
            {isAtHome ? (
              <>
                <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }}>House call</Text>
                <Text style={{ fontSize: 13, color: Colors.gray[600], marginTop: 4 }}>
                  Your professional travels to the address below. Tracking and arrival verification (when your provider
                  arrives) appear on the Tracking tab.
                </Text>
                {Number((booking as any).travel_fee || 0) > 0 ? (
                  <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 6 }}>
                    A travel fee is included in your price breakdown below.
                  </Text>
                ) : null}
              </>
            ) : (
              <>
                <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }}>In-salon visit</Text>
                <Text style={{ fontSize: 13, color: Colors.gray[600], marginTop: 4 }}>
                  {"You go to the provider's salon or workspace. Use the address below for directions and parking."}
                </Text>
              </>
            )}
          </View>
          {booking.is_group_booking && booking.group_booking_ref && (
            <View style={{ marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: Colors.gray[200] }}>
              <Text style={{ fontSize: 12, color: Colors.gray[500] }}>Group booking</Text>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{booking.group_booking_ref}</Text>
              {groupPaymentSummary && groupPaymentSummary.amount_paid > 0 ? (
                <Text style={{ fontSize: 13, color: Colors.gray[600], marginTop: 6 }}>
                  {formatMoney(groupPaymentSummary.amount_paid, groupPaymentSummary.currency)} paid for the whole group
                </Text>
              ) : null}
              {booking.group_booking_id ? (
                <TouchableOpacity
                  onPress={() => router.push({ pathname: "/(app)/group-booking-detail", params: { id: booking.group_booking_id } })}
                  style={{ marginTop: 8, alignSelf: "flex-start", borderRadius: 10, borderWidth: 1, borderColor: Colors.gray[300], paddingHorizontal: 12, paddingVertical: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="View group booking details"
                >
                  <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.gray[900] }}>View group details</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: "600", color: Colors.gray[900] }}>{provider?.business_name || "Provider"}</Text>
              <Text style={{ color: Colors.gray[600], marginTop: 4 }}>{formatDate(booking.selected_datetime, booking.display_time_zone)}</Text>
              <Text style={{ color: Colors.gray[500], fontSize: 14 }}>{formatTime(booking.selected_datetime, booking.display_time_zone)}</Text>
            </View>
            <View
              style={{
                paddingHorizontal: 12,
                paddingVertical: 4,
                borderRadius: 9999,
                backgroundColor: booking.status === "confirmed" ? "#DCFCE7" : booking.status === "cancelled" || booking.status === "no_show" ? "#FEE2E2" : booking.status === "completed" ? "#DBEAFE" : booking.status === "in_progress" || booking.status === "started" ? "#EDE9FE" : booking.status === "waiting" || booking.status === "checked_in" ? "#E0F2FE" : "#FEF3C7",
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  textTransform: "capitalize",
                  color: booking.status === "confirmed" ? "#15803d" : booking.status === "cancelled" || booking.status === "no_show" ? "#B91C1C" : booking.status === "completed" ? "#1D4ED8" : booking.status === "in_progress" || booking.status === "started" ? "#7C3AED" : booking.status === "waiting" || booking.status === "checked_in" ? "#0369A1" : "#B45309",
                }}
              >
                {booking.status === "no_show" ? "No show" : booking.status === "in_progress" || booking.status === "started" ? "In progress" : booking.status === "checked_in" ? "Checked in" : booking.status === "pending_payment" ? "Payment pending" : booking.status === "pending" ? "Awaiting confirmation" : lifecycleDisplay.label}
              </Text>
            </View>
          </View>
        </View>

        {/* Services */}
        {services.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>Services</Text>
            {services.map((svc: Record<string, unknown>, i: number) => {
              const svcName = String(svc.offering_name ?? svc.service_name ?? svc.title ?? svc.name ?? `Service ${i + 1}`);
              const duration = svc.duration_minutes ? Number(svc.duration_minutes) : null;
              const staffName = svc.staff_name ? String(svc.staff_name) : null;
              const guestName = svc.guest_name ? String(svc.guest_name) : null;
              const price = Number(svc.price ?? 0);
              return (
                <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, color: Colors.gray[800] }}>{svcName}{guestName ? ` (${guestName})` : ""}</Text>
                    {duration != null && (
                      <Text style={{ fontSize: 12, color: Colors.gray[500] }}>{duration} min</Text>
                    )}
                    {staffName && (
                      <Text style={{ fontSize: 12, color: Colors.gray[400] }}>with {staffName}</Text>
                    )}
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900] }}>
                    {booking.currency} {price.toFixed(2)}
                  </Text>
                </View>
              );
            })}
            {booking.custom_offer && (
              <View style={{ marginTop: 8, padding: 12, backgroundColor: "#F8FAFC", borderRadius: 8, borderWidth: 1, borderColor: "#E2E8F0" }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#334155", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Custom Offer Details</Text>
                {booking.custom_offer.request?.description && (
                  <Text style={{ fontSize: 13, color: "#475569", marginBottom: booking.custom_offer.notes ? 8 : 0 }}>
                    <Text style={{ fontWeight: "600" }}>Your request:</Text> {booking.custom_offer.request.description}
                  </Text>
                )}
                {booking.custom_offer.notes && (
                  <Text style={{ fontSize: 13, color: "#475569" }}>
                    <Text style={{ fontWeight: "600" }}>Provider notes:</Text> {booking.custom_offer.notes}
                  </Text>
                )}
              </View>
            )}
          </View>
        )}

        {/* Add-ons */}
        {detailAddonRows.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>Add-ons</Text>
            {detailAddonRows.map((addon, i) => {
              const addonName = String(addon.offering_name ?? addon.addon_name ?? "Add-on");
              const qty = Number(addon.quantity ?? 1);
              const price = Number(addon.price ?? 0);
              return (
                <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] }}>
                  <Text style={{ fontSize: 14, color: Colors.gray[800], flex: 1 }}>{addonName}{qty > 1 ? ` x${qty}` : ""}</Text>
                  <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900] }}>
                    {booking.currency} {(price * qty).toFixed(2)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Products */}
        {Array.isArray((booking as any).products) && (booking as any).products.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>Products</Text>
            {((booking as any).products as Record<string, unknown>[]).map((prod, i) => {
              const prodName = String(prod.product_name ?? "Product");
              const qty = Number(prod.quantity ?? 1);
              const unitPrice = Number(prod.unit_price ?? 0);
              const totalPrice = Number(prod.total_price ?? unitPrice * qty);
              return (
                <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] }}>
                  <Text style={{ fontSize: 14, color: Colors.gray[800], flex: 1 }}>{prodName}{qty > 1 ? ` x${qty}` : ""}</Text>
                  <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900] }}>
                    {booking.currency} {totalPrice.toFixed(2)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Price & payment — same breakdown as Receipt for parity */}
        <View style={{ marginBottom: 16, borderRadius: 16, backgroundColor: Colors.gray[50], padding: 16 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>Price & payment</Text>
          {renderPaymentBreakdownCore()}
        </View>
        {renderAdditionalChargesSection()}

        {/* Location & Map */}
        {location && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>
              {isAtHome ? "Provider location" : "Salon location"}
            </Text>
            {(() => {
              const formattedSalonAddr =
                (location as { address?: string }).address ||
                [location.name, (location as { address_line1?: string }).address_line1, (location as { city?: string }).city]
                  .filter(Boolean)
                  .join(", ") ||
                "";
              return (
                <>
                  <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                    <Ionicons name="location-outline" size={16} color={Colors.gray[600]} style={{ marginTop: 2 }} />
                    <Text style={{ marginLeft: 8, fontSize: 14, color: Colors.gray[600], flex: 1 }}>
                      {formattedSalonAddr || "—"}
                    </Text>
                  </View>
                  {(location as { latitude?: number; longitude?: number }).latitude != null &&
                  (location as { longitude?: number }).longitude != null ? (
                    <View style={{ marginTop: 8, overflow: "hidden", borderRadius: 12 }}>
                      <StaticMapImage
                        latitude={Number((location as { latitude?: number }).latitude)}
                        longitude={Number((location as { longitude?: number }).longitude)}
                        fallbackQuery={formattedSalonAddr}
                        width={400}
                        height={150}
                        zoom={15}
                        style={{ borderRadius: 12 }}
                      />
                    </View>
                  ) : formattedSalonAddr.trim() ? (
                    <TouchableOpacity
                      style={{ marginTop: 10, alignSelf: "flex-start" }}
                      onPress={() => openInMaps({ query: formattedSalonAddr }).catch(() => {})}
                      accessibilityRole="button"
                      accessibilityLabel="Open address in Maps"
                    >
                      <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.primary }}>Open in Maps</Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              );
            })()}
          </View>
        )}

        {!isAtHome && !location ? (
          <View style={{ marginBottom: 16, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], padding: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900], marginBottom: 4 }}>Salon location</Text>
            <Text style={{ fontSize: 13, color: Colors.gray[600] }}>
              Salon address is not loaded in the app yet. Check your confirmation email or message your provider for the exact address.
            </Text>
          </View>
        ) : null}

        {isAtHome && !location && (() => {
          const b = booking as Record<string, unknown>;
          const nested = b.address as Record<string, unknown> | undefined;
          const line1 = nested?.line1 ?? b.address_line1;
          return Boolean(line1);
        })() ? (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>Service address</Text>
            {(() => {
              const b = booking as Record<string, unknown>;
              const nested = b.address as Record<string, unknown> | undefined;
              const a: Record<string, unknown> = nested?.line1
                ? nested
                : {
                    line1: b.address_line1,
                    line2: b.address_line2,
                    city: b.address_city,
                    country: b.address_country,
                    postal_code: b.address_postal_code,
                    latitude: b.address_latitude,
                    longitude: b.address_longitude,
                    apartment_unit: b.apartment_unit,
                    building_name: b.building_name,
                    floor_number: b.floor_number,
                    access_codes: b.access_codes,
                    parking_instructions: b.parking_instructions,
                    location_landmarks: b.location_landmarks,
                  };
              const line1 = String(a.line1 ?? "");
              const line2 = a.line2 ? String(a.line2) : "";
              const city = a.city ? String(a.city) : "";
              const country = a.country ? String(a.country) : "";
              const postal = a.postal_code ? String(a.postal_code) : "";
              const ac = a.access_codes as { gate?: string; buzzer?: string; door?: string } | null | undefined;
              const hasAc = ac && (Boolean(ac.gate?.trim()) || Boolean(ac.buzzer?.trim()) || Boolean(ac.door?.trim()));
              const lines = [line1, line2, [city, postal].filter(Boolean).join(" "), country].filter(Boolean);
              const addressSingleLine = lines.join(", ");
              return (
                <>
                  <Text style={{ fontSize: 14, color: Colors.gray[700], lineHeight: 22 }}>{lines.join("\n")}</Text>
                  {a.apartment_unit ? (
                    <Text style={{ fontSize: 13, color: Colors.gray[600], marginTop: 6 }}>Unit: {String(a.apartment_unit)}</Text>
                  ) : null}
                  {a.building_name ? (
                    <Text style={{ fontSize: 13, color: Colors.gray[600] }}>Building: {String(a.building_name)}</Text>
                  ) : null}
                  {a.floor_number ? (
                    <Text style={{ fontSize: 13, color: Colors.gray[600] }}>Floor: {String(a.floor_number)}</Text>
                  ) : null}
                  {hasAc && ac ? (
                    <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.gray[200] }}>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[700], marginBottom: 4 }}>Access</Text>
                      {ac.gate?.trim() ? <Text style={{ fontSize: 13, color: Colors.gray[600] }}>Gate: {ac.gate}</Text> : null}
                      {ac.buzzer?.trim() ? <Text style={{ fontSize: 13, color: Colors.gray[600] }}>Buzzer: {ac.buzzer}</Text> : null}
                      {ac.door?.trim() ? <Text style={{ fontSize: 13, color: Colors.gray[600] }}>Door: {ac.door}</Text> : null}
                    </View>
                  ) : null}
                  {a.parking_instructions ? (
                    <View style={{ marginTop: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[700] }}>Parking</Text>
                      <Text style={{ fontSize: 13, color: Colors.gray[600], marginTop: 2 }}>{String(a.parking_instructions)}</Text>
                    </View>
                  ) : null}
                  {a.location_landmarks ? (
                    <View style={{ marginTop: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[700] }}>Landmarks</Text>
                      <Text style={{ fontSize: 13, color: Colors.gray[600], marginTop: 2 }}>{String(a.location_landmarks)}</Text>
                    </View>
                  ) : null}
                  {(booking as { house_call_instructions?: string | null }).house_call_instructions?.trim() ? (
                    <View style={{ marginTop: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[700] }}>Visit instructions</Text>
                      <Text style={{ fontSize: 13, color: Colors.gray[600], marginTop: 2 }}>
                        {(booking as { house_call_instructions?: string | null }).house_call_instructions}
                      </Text>
                    </View>
                  ) : null}
                  {typeof a.latitude === "number" && typeof a.longitude === "number" ? (
                    <View style={{ marginTop: 8, overflow: "hidden", borderRadius: 12 }}>
                      <StaticMapImage
                        latitude={Number(a.latitude)}
                        longitude={Number(a.longitude)}
                        fallbackQuery={addressSingleLine}
                        width={400}
                        height={150}
                        zoom={15}
                        style={{ borderRadius: 12 }}
                      />
                    </View>
                  ) : addressSingleLine.trim().length > 0 ? (
                    <TouchableOpacity
                      style={{ marginTop: 10, alignSelf: "flex-start" }}
                      onPress={() => openInMaps({ query: addressSingleLine }).catch(() => {})}
                      accessibilityRole="button"
                      accessibilityLabel="Open address in Maps"
                    >
                      <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.primary }}>Open in Maps</Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              );
            })()}
          </View>
        ) : null}

        {isAtHome &&
        !location &&
        !((): boolean => {
          const b = booking as Record<string, unknown>;
          const nested = b.address as Record<string, unknown> | undefined;
          const line1 = nested?.line1 ?? b.address_line1;
          return Boolean(line1);
        })() ? (
          <View style={{ marginBottom: 16, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: "#FFFBEB", padding: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900], marginBottom: 4 }}>Service address</Text>
            <Text style={{ fontSize: 13, color: Colors.gray[600] }}>
              Your visit address will appear here once it is saved on the booking. If you are unsure, open this booking on the web or message your provider.
            </Text>
          </View>
        ) : null}

        {(booking as { special_requests?: string | null }).special_requests?.trim() ? (
          <View style={{ marginBottom: 16, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], padding: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900], marginBottom: 6 }}>Notes for your provider</Text>
            <Text style={{ fontSize: 14, color: Colors.gray[700], lineHeight: 22 }}>
              {(booking as { special_requests?: string }).special_requests}
            </Text>
          </View>
        ) : null}

        {booking.status !== "cancelled" && (() => {
          const totalMinutes = (services || []).reduce((sum: number, s: any) => sum + (s.duration_minutes ?? s.offering?.duration_minutes ?? 0), 0);
          const calStart = parseValidDate(booking.selected_datetime);
          const calEnd = calStart ? new Date(calStart.getTime() + totalMinutes * 60 * 1000) : null;
          const addressObj = (booking as any).address;
          const calLocation = location
            ? ((location as { address?: string }).address || [location.name, (location as { address_line1?: string }).address_line1, (location as { city?: string }).city].filter(Boolean).join(", ") || "—")
            : addressObj?.line1
              ? [addressObj.line1, addressObj.city, addressObj.country].filter(Boolean).join(", ")
              : (booking as any).address_line1
                ? [(booking as any).address_line1, (booking as any).address_city, (booking as any).address_country].filter(Boolean).join(", ")
                : "Address TBD";
          const calTitle = `Appointment with ${provider?.business_name ?? "Beautonomi"}`;
          const visitLine = isAtHome ? "House call" : "In-salon visit";
          const calDesc = `Booking #${booking.booking_number ?? ""}\n${visitLine}\n${(services || []).map((s: any) => `${s.offering_name ?? s.service_name ?? "Service"} (${s.duration_minutes ?? 0} min)`).join("\n")}`;
          if (!calStart || !calEnd) return null;
          const calPayload = { title: calTitle, description: calDesc, location: calLocation, start: calStart, end: calEnd };
          const chipRow: ViewStyle = {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: Colors.gray[200],
          };
          const chipPrimary: ViewStyle =
            Platform.OS !== "web"
              ? { borderColor: Colors.primary, backgroundColor: Colors.primaryLight }
              : { borderColor: Colors.gray[200], backgroundColor: "transparent" };
          return (
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900], marginBottom: 6 }}>
                {bd("calendarSectionTitle")}
              </Text>
              <Text style={{ fontSize: 13, color: Colors.gray[600], marginBottom: 12, lineHeight: 18 }}>
                {Platform.OS === "web" ? bd("calendarSectionSubtitleWeb") : bd("calendarSectionSubtitleNative")}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {Platform.OS !== "web" ? (
                  <TouchableOpacity
                    onPress={() => void handleSaveToDeviceCalendar(calPayload)}
                    disabled={nativeCalLoading}
                    style={[chipRow, chipPrimary]}
                    accessibilityRole="button"
                    accessibilityLabel={bd("calendarPhoneAppA11y")}
                  >
                    {nativeCalLoading ? (
                      <ActivityIndicator size="small" color={Colors.primary} style={{ marginRight: 6 }} />
                    ) : (
                      <Ionicons name="phone-portrait-outline" size={16} color={Colors.primary} style={{ marginRight: 6 }} />
                    )}
                    <Text style={{ fontWeight: "600", color: Colors.primary }}>{bd("calendarPhoneAppCta")}</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  onPress={() => {
                    haptic.light();
                    Linking.openURL(getGoogleCalendarUrl(calPayload));
                  }}
                  style={chipRow}
                  accessibilityRole="button"
                  accessibilityLabel={bd("calendarGoogleA11y")}
                >
                  <Ionicons name="logo-google" size={16} color={Colors.gray[700]} style={{ marginRight: 6 }} />
                  <Text style={{ fontWeight: "500", color: Colors.gray[700] }}>{bd("calendarGoogleCta")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    haptic.light();
                    Linking.openURL(getOutlookCalendarUrl(calPayload));
                  }}
                  style={chipRow}
                  accessibilityRole="button"
                  accessibilityLabel={bd("calendarOutlookA11y")}
                >
                  <Ionicons name="mail-outline" size={16} color={Colors.gray[700]} style={{ marginRight: 6 }} />
                  <Text style={{ fontWeight: "500", color: Colors.gray[700] }}>{bd("calendarOutlookCta")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleAddToCalendarIcs}
                  disabled={icsLoading}
                  style={chipRow}
                  accessibilityRole="button"
                  accessibilityLabel={bd("calendarIcsA11y")}
                >
                  {icsLoading ? (
                    <ActivityIndicator size="small" color={Colors.gray[700]} style={{ marginRight: 6 }} />
                  ) : (
                    <Ionicons name="share-outline" size={16} color={Colors.gray[700]} style={{ marginRight: 6 }} />
                  )}
                  <Text style={{ fontWeight: "500", color: Colors.gray[700] }}>{bd("calendarIcsCta")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })()}

        <SafetyPanicButton bookingId={id ?? null} />

        {canCancel && (
          <View style={{ flexDirection: "row", marginBottom: 12 }}>
            <TouchableOpacity
              onPress={handleReschedule}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], marginRight: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Reschedule booking"
            >
              <Ionicons name="calendar-outline" size={16} color={Colors.gray[700]} />
              <Text style={{ marginLeft: 8, fontWeight: "500", color: Colors.gray[700] }}>Reschedule</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleCancel}
              disabled={cancelling}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: "#FECACA" }}
              accessibilityRole="button"
              accessibilityLabel="Cancel booking"
              accessibilityHint="Double tap to cancel this appointment. Cancellation fees may apply."
            >
              {cancelling ? (
                <ActivityIndicator size="small" color="#ef4444" />
              ) : (
                <>
                  <Ionicons name="close-circle-outline" size={16} color="#ef4444" style={{ marginRight: 8 }} />
                  <Text style={{ fontWeight: "500", color: "#B91C1C" }}>Cancel</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {booking.status === "completed" && (
          <View style={{ marginBottom: 12 }}>
            {myReview ? (
              <View style={{ borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, padding: 12, marginBottom: 10 }}>
                <Text style={{ fontSize: 13, color: Colors.gray[500], marginBottom: 4 }}>Your review</Text>
                {Number.isFinite(Number(myReview.rating)) ? (
                  <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900], marginBottom: 4 }}>
                    {`${Number(myReview.rating).toFixed(1)}★`}
                  </Text>
                ) : null}
                {typeof myReview.comment === "string" && myReview.comment.trim().length > 0 ? (
                  <Text style={{ fontSize: 14, color: Colors.gray[700] }}>{myReview.comment.trim()}</Text>
                ) : (
                  <Text style={{ fontSize: 13, color: Colors.gray[500] }}>No written comment added.</Text>
                )}
              </View>
            ) : null}
            <TouchableOpacity
              onPress={() => {
                haptic.light();
                router.push({ pathname: "/(app)/review-write", params: { bookingId: booking.id } });
              }}
              style={{ paddingVertical: 16, borderWidth: 1, borderColor: Colors.primary, borderRadius: 12, alignItems: "center" }}
              accessibilityRole="button"
              accessibilityLabel={myReview ? "Edit your review" : "Write a review"}
            >
              <Text style={{ color: Colors.primary, fontWeight: "600" }}>
                {myReview ? "Edit Review" : "Write a Review"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {booking.status === "completed" && provider?.slug && (
          <TouchableOpacity
            onPress={() => {
              haptic.light();
              router.push({ pathname: "/(app)/book", params: { slug: provider.slug } });
            }}
            style={{ paddingVertical: 16, backgroundColor: Colors.gray[50], borderRadius: 12, alignItems: "center", marginBottom: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Book again with this provider"
          >
            <Text style={{ fontWeight: "500", color: Colors.gray[700] }}>Book Again</Text>
          </TouchableOpacity>
        )}

        {/*
          §Customer-launch (audit 2026-04): previously the only way to
          contact a provider from a booking was to back out to the
          partner profile or open the web site. Add a native CTA so
          customers can ask about confirmation, arrival, follow-up, etc.
          directly from the booking context (mirrors the "Message
          Provider" button we added on the web confirmation page).
        */}
        {provider?.id && booking.status !== "cancelled" && (
          <TouchableOpacity
            onPress={() => {
              haptic.light();
              router.push({
                pathname: "/(app)/chat",
                params: {
                  provider_id: provider.id,
                  provider_name: provider.business_name || "Provider",
                  booking_id: booking.id,
                },
              });
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 14,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: Colors.primary,
              backgroundColor: `${Colors.primary}0D`,
              marginBottom: 12,
            }}
            accessibilityRole="button"
            accessibilityLabel={`Message ${provider.business_name || "provider"}`}
            accessibilityHint="Start a chat with the provider about this booking"
          >
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={18}
              color={Colors.primary}
              style={{ marginRight: 8 }}
            />
            <Text style={{ fontWeight: "600", color: Colors.primary }}>
              Message Provider
            </Text>
          </TouchableOpacity>
        )}

        {/* Share / Download actions */}
        <View style={{ flexDirection: "row", marginBottom: 12 }}>
          <TouchableOpacity
            onPress={() => {
              haptic.light();
              const lines = [
                `Beautonomi Booking Confirmation`,
                `Booking #${booking.booking_number || booking.id.slice(0, 8)}`,
                ``,
                `Provider: ${provider?.business_name || "N/A"}`,
                `Date: ${formatDate(booking.selected_datetime, booking.display_time_zone)}`,
                `Time: ${formatTime(booking.selected_datetime, booking.display_time_zone)}`,
                `Status: ${booking.status}`,
                isAtHome ? "Visit: House call" : "Visit: In-salon",
                ``,
                ...services.map(
                  (svc: any) =>
                    `• ${svc.offering_name || svc.service_name || svc.title || svc.name || "Service"} – ${booking.currency} ${Number(svc.price || 0).toFixed(2)}`
                ),
                ...(platformFeeAmount > 0
                  ? [
                      ``,
                      `Platform fee${platformFeePercentage > 0 ? ` (${platformFeePercentage.toFixed(platformFeePercentage % 1 === 0 ? 0 : 1)}%)` : ""}: ${booking.currency} ${platformFeeAmount.toFixed(2)}`,
                    ]
                  : []),
                ``,
                `Total: ${booking.currency} ${Number(booking.total_amount || 0).toFixed(2)}`,
                ``,
                `View online: ${APP_URL}/account-settings/bookings/${booking.id}`,
              ];
              Share.share({
                message: lines.join("\n"),
                title: "Booking Confirmation",
              });
            }}
            style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], marginRight: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Share booking details"
          >
            <Ionicons name="share-outline" size={16} color={Colors.gray[700]} style={{ marginRight: 8 }} />
            <Text style={{ fontWeight: "500", color: Colors.gray[700] }}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={downloadReceiptNative}
            style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200] }}
            accessibilityRole="button"
            accessibilityLabel="Download booking receipt"
          >
            <Ionicons name="download-outline" size={16} color={Colors.gray[700]} style={{ marginRight: 8 }} />
            <Text style={{ fontWeight: "500", color: Colors.gray[700] }}>Download</Text>
          </TouchableOpacity>
        </View>

        {helpUrl ? (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12 }}>
            <TouchableOpacity
              onPress={() => Linking.openURL(helpUrl)}
              accessibilityRole="link"
              accessibilityLabel="Help"
            >
              <Text style={{ fontSize: 14, color: Colors.primary, fontWeight: "500" }}>Help</Text>
            </TouchableOpacity>
          </View>
        ) : null}
          </>
        )}
      </ScrollView>

      {/* Post-completion modal: once per booking when opening a completed booking */}
      <Modal
        visible={showCompletionModal}
        animationType="fade"
        transparent
        onRequestClose={() => dismissCompletionModal(true)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 }}
          onPress={() => dismissCompletionModal(true)}
        >
          <Pressable
            style={{ backgroundColor: "#fff", borderRadius: 20, padding: 24, width: "100%", maxWidth: 360 }}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ alignItems: "center", marginBottom: 16 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.primaryLight, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="trophy" size={32} color={Colors.primary} />
              </View>
            </View>
            <Text style={{ fontSize: 20, fontWeight: "700", color: Colors.gray[900], textAlign: "center", marginBottom: 8 }}>Booking complete</Text>
            <Text style={{ fontSize: 15, color: Colors.gray[600], textAlign: "center", marginBottom: (booking?.loyalty_points_earned ?? 0) > 0 ? 12 : 20 }}>
              You’re all set. Thanks for booking with us.
            </Text>
            {(booking?.loyalty_points_earned ?? 0) > 0 && (
              <Text style={{ fontSize: 15, fontWeight: "600", color: Colors.primary, textAlign: "center", marginBottom: 20 }}>
                You earned {booking.loyalty_points_earned} loyalty points. They’ve been added to your balance.
              </Text>
            )}
            <TouchableOpacity
              onPress={handleCompletionWriteReview}
              style={{ backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 12, alignItems: "center", marginBottom: 10 }}
              activeOpacity={0.8}
            >
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>Write a review</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => dismissCompletionModal(true)}
              style={{ paddingVertical: 14, alignItems: "center" }}
              activeOpacity={0.8}
            >
              <Text style={{ color: Colors.gray[600], fontWeight: "500", fontSize: 15 }}>Maybe later</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Cancel reason modal */}
      {/* §UI-audit 2026-04: wrapped in KeyboardAvoidingView so the
          multiline "Tell us why" textarea (and the destructive CTA
          below it) stay above the keyboard on iOS. Previously on
          smaller phones the keyboard covered the Cancel button. */}
      <Modal visible={cancelReasonModalOpen} transparent animationType="fade" onRequestClose={() => setCancelReasonModalOpen(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior="padding"
        >
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center" }} onPress={() => setCancelReasonModalOpen(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: "#fff", borderRadius: 16, padding: 20, marginHorizontal: 24, width: 320 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 12 }}>
              {t("customer.mobile.screens.bookingDetail.cancelReasonTitle")}
            </Text>
            {[
              t("customer.mobile.screens.bookingDetail.cancelReasonChangeOfPlans"),
              t("customer.mobile.screens.bookingDetail.cancelReasonFoundAnother"),
              t("customer.mobile.screens.bookingDetail.cancelReasonSchedulingConflict"),
              t("customer.mobile.screens.bookingDetail.cancelReasonOther"),
            ].map((reason) => (
              <TouchableOpacity
                key={reason}
                onPress={() => {
                  if (reason === t("customer.mobile.screens.bookingDetail.cancelReasonOther")) {
                    setCancelReasonText("");
                  } else {
                    setCancelReasonText(reason);
                  }
                }}
                style={{
                  paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, marginBottom: 6,
                  backgroundColor: cancelReasonText === reason ? Colors.primaryLight : "#F3F4F6",
                }}
              >
                <Text style={{ fontSize: 14, color: cancelReasonText === reason ? Colors.primary : "#374151" }}>{reason}</Text>
              </TouchableOpacity>
            ))}
            {![
              t("customer.mobile.screens.bookingDetail.cancelReasonChangeOfPlans"),
              t("customer.mobile.screens.bookingDetail.cancelReasonFoundAnother"),
              t("customer.mobile.screens.bookingDetail.cancelReasonSchedulingConflict"),
            ].includes(cancelReasonText) && (
              <TextInput
                value={cancelReasonText}
                onChangeText={setCancelReasonText}
                placeholder={t("customer.mobile.screens.bookingDetail.cancelReasonOtherPlaceholder")}
                multiline
                style={{ borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 10, padding: 12, fontSize: 14, minHeight: 64, textAlignVertical: "top", marginTop: 6, marginBottom: 16 }}
              />
            )}
            {[
              t("customer.mobile.screens.bookingDetail.cancelReasonChangeOfPlans"),
              t("customer.mobile.screens.bookingDetail.cancelReasonFoundAnother"),
              t("customer.mobile.screens.bookingDetail.cancelReasonSchedulingConflict"),
            ].includes(cancelReasonText) && (
              <View style={{ marginBottom: 16 }} />
            )}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity onPress={() => setCancelReasonModalOpen(false)} style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: "#D1D5DB", alignItems: "center" }}>
                <Text style={{ fontWeight: "600", color: "#374151" }}>{t("customer.mobile.screens.bookingDetail.cancelReasonBack")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => submitCancellation(cancelReasonText)}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: "#DC2626", alignItems: "center" }}
              >
                <Text style={{ fontWeight: "600", color: "#fff" }}>{t("customer.mobile.screens.bookingDetail.cancelBookingCta")}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>
      {paystackModal}
      {payRemainingCheckout.modal}
    </>
  );
}

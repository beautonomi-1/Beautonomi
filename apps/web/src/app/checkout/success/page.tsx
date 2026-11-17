"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  Bell,
  Calendar,
  Check,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Home,
  MapPin,
  Navigation,
  Plus,
  Scissors,
  Smartphone,
  Store,
  Clock,
  XCircle,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@beautonomi/i18n";
import { getGoogleCalendarUrl, getOutlookCalendarUrl } from "@/lib/calendar/ics";
import { clearBeautonomiHoldClientMarkers } from "@/lib/booking/clear-hold-client-markers";
import { getSupabaseClient } from "@/lib/supabase/client";
import { verifyWithRetry } from "@/lib/payments/verify-with-retry";
import { PaymentLoadingHero } from "@/components/ui/payment-loading-hero";
import { useAmplitude } from "@/hooks/useAmplitude";
import { EVENT_PAYMENT_SUCCESS } from "@/lib/analytics/amplitude/types";
import { pendingConfirmationSlaDisplay, slaSettingsFromHours } from "@/lib/bookings/pending-confirmation-sla-copy";
import { BookingEmbedBridge } from "@/components/booking/BookingEmbedBridge";
import { isLikelyFramed, postBookingEmbedMessage } from "@/lib/booking/embed-host";
import { isBookingEmbedEnabled } from "@beautonomi/utils";
import { formatMoney as formatMoneyUtil } from "@beautonomi/utils";
import { verifyEmbedReturnUrl } from "@/lib/booking/embed-return-url";
import { NativeAppCheckoutBounce } from "@/components/payments/NativeAppCheckoutBounce";
import { NATIVE_STORE } from "@/lib/store/native-app-store";

/** `--primary` is stored as bare HSL components (`330 100% 50%`), so it must be wrapped in `hsl()`. */
const ACCENT = "hsl(var(--primary, 330 100% 50%))";
function accentAlpha(alpha: number): string {
  return `hsl(var(--primary, 330 100% 50%) / ${alpha})`;
}
const BG = "#F3F4F6";
const TEXT_PRIMARY = "#111827";
const TEXT_SECONDARY = "#6B7280";

const POLL_INTERVAL_MS = 1500;
const POLL_MAX_ATTEMPTS = 20;

function customOfferCheckoutOutcome(data: { status?: string | null; booking_id?: string | null } | null | undefined): "booked" | "support" | "pending" {
  const status = String(data?.status ?? "").toLowerCase();
  const bookingId = typeof data?.booking_id === "string" ? data.booking_id.trim() : "";
  if (status === "finalize_failed" || (status === "paid" && !bookingId)) return "support";
  if ((status === "paid" || status === "accepted") && bookingId) return "booked";
  return "pending";
}

function formatMoney(amount: number, currency: string | undefined): string {
  const cur = (currency || "").trim();
  const value = Number.isFinite(amount) ? amount : 0;
  if (!cur) return value.toFixed(2);
  return formatMoneyUtil(value, cur);
}

/** Formats in the provider's timezone so the slot matches the salon clock; falls back to the browser zone on bad IANA ids. */
function formatInTimeZone(date: Date, options: Intl.DateTimeFormatOptions, timeZone?: string | null): string {
  if (timeZone) {
    try {
      return date.toLocaleString(undefined, { ...options, timeZone });
    } catch {
      // invalid timezone id
    }
  }
  return date.toLocaleString(undefined, options);
}

/** Deep link scheme for customer mobile app (opens app to a specific screen when installed) */
const CUSTOMER_APP_SCHEME = "customer";
function appDeepLink(path: string, params?: Record<string, string>): string {
  const q = params ? new URLSearchParams(params).toString() : "";
  return `${CUSTOMER_APP_SCHEME}://${path}${q ? `?${q}` : ""}`;
}

/**
 * §Provider-paystack-audit 2026-05: defensive branches for the rare case where
 * a provider Paystack payment falls through to the customer success page (e.g.
 * a stale Paystack default callback). When the verify result reveals a
 * provider order type, swap to provider copy + deep links so the screen never
 * shows "View bookings" / `customer://` to a provider.
 */
type ProviderPaymentBranch =
  | { kind: "ads_budget_order"; orderId?: string | null }
  | { kind: "provider_subscription_order"; orderId?: string | null };

function postProviderCheckoutMessage(branch: ProviderPaymentBranch | null) {
  if (!branch || typeof window === "undefined") return;
  const w = window as Window & { ReactNativeWebView?: { postMessage: (msg: string) => void } };
  if (!w.ReactNativeWebView?.postMessage) return;
  try {
    if (branch.kind === "ads_budget_order") {
      w.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: "BEAUTONOMI_ADS_PAYMENT_DONE",
          status: "success",
          order_id: branch.orderId ?? null,
        }),
      );
    } else {
      w.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: "subscription_success",
          order_id: branch.orderId ?? null,
        }),
      );
    }
  } catch {
    // ignore
  }
}

function isNativeAppContext(context: string | null): boolean {
  return context === "app";
}

function CheckoutSuccessContent() {
  const searchParams = useSearchParams();
  const nativeAppContext = isNativeAppContext(searchParams?.get("context") ?? null);
  const { t } = useTranslation();
  const { track } = useAmplitude();
  const paymentSuccessTracked = useRef(false);
  const bookingId = searchParams?.get("booking_id");
  const bookingNumber = searchParams?.get("booking_number");
  /** Paystack / Flutterwave append reference, trxref, or tx_ref on redirect */
  const paystackReference =
    searchParams?.get("reference") ||
    searchParams?.get("trxref") ||
    searchParams?.get("tx_ref");
  const flutterwaveTransactionId = searchParams?.get("transaction_id");
  const hostedCheckoutStatus = (searchParams?.get("status") ?? "").toLowerCase();
  const stripeCheckoutSessionId = searchParams?.get("session_id");
  const isWaitlist = searchParams?.get("waitlist") === "1" || searchParams?.get("source") === "waitlist";
  const isCustomOffer = searchParams?.get("payment_type") === "custom_offer";
  const offerId = searchParams?.get("offer_id");
  const embed = isBookingEmbedEnabled(searchParams);
  const embedReturnUrl = searchParams?.get("return")?.trim() || "";
  const embedReturnSig = searchParams?.get("return_sig");
  const embedBookedPosted = useRef(false);
  const embedReturnRedirectStarted = useRef(false);
  const [embedReturnCountdown, setEmbedReturnCountdown] = useState<number | null>(null);
  const [bookingNumberCopied, setBookingNumberCopied] = useState(false);
  const [sharing, setSharing] = useState(false);

  const [customOfferBookingId, setCustomOfferBookingId] = useState<string | null>(null);
  const [customOfferNeedsSupport, setCustomOfferNeedsSupport] = useState(false);
  const [customOfferPollingComplete, setCustomOfferPollingComplete] = useState(false);
  const [providerBranch, setProviderBranch] = useState<ProviderPaymentBranch | null>(null);

  /**
   * Paystack verify outcome for the booking/wallet/etc. branch.
   * - `verifying`: request in flight (or pending/unknown response, will keep polling booking)
   * - `success`: verify returned success; webhook will (or already has) finalized
   * - `failed`: verify came back failed; we will surface a recovery card
   * - `pending`: verify exhausted retries without a definitive answer; show
   *   "still confirming" copy with CTAs rather than spinning forever
   */
  const [verifyStatus, setVerifyStatus] = useState<"idle" | "verifying" | "success" | "failed" | "pending">(
    paystackReference ? "verifying" : "idle",
  );
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  /** True once booking polling has resolved or exhausted attempts so we can stop showing the spinner. */
  const [bookingPollComplete, setBookingPollComplete] = useState(false);

  /** Local dev / no webhook: finalize payment via Paystack verify (records booking_payments + confirms booking). */
  const paystackVerifyStarted = useRef(false);
  const customOfferVerifyStarted = useRef(false);

  useEffect(() => {
    clearBeautonomiHoldClientMarkers();
  }, []);

  useEffect(() => {
    if (nativeAppContext && typeof document !== "undefined") {
      document.title = "Payment";
    }
  }, [nativeAppContext]);

  useEffect(() => {
    if (isWaitlist || isCustomOffer) return;
    if (paystackVerifyStarted.current) return;
    const run = async () => {
      let ref = paystackReference?.trim() || "";
      if (!ref && bookingId) {
        try {
          const r = await fetch(`/api/me/bookings/${encodeURIComponent(bookingId)}`, {
            credentials: "include",
            headers: { Accept: "application/json" },
          });
          if (r.ok) {
            const json = await r.json();
            const data = json?.data;
            ref = typeof data?.payment_reference === "string" ? data.payment_reference : "";
          }
        } catch {
          // ignore
        }
      }
      if (!ref) return;
      paystackVerifyStarted.current = true;
      setVerifyStatus("verifying");
      try {
        const verifyResult = await verifyWithRetry<{ type?: string; ads_budget_order_id?: string; order_id?: string }>(
          ref,
          {
            maxAttempts: hostedCheckoutStatus === "failed" || hostedCheckoutStatus === "cancelled" ? 1 : 5,
            delayMs: 1500,
            sessionId: stripeCheckoutSessionId,
            transactionId: flutterwaveTransactionId,
            redirectStatus: hostedCheckoutStatus,
          },
        );
        const verifyType = typeof verifyResult.data?.type === "string" ? verifyResult.data.type : null;
        if (verifyType === "ads_budget_order") {
          const orderId =
            (verifyResult.data?.ads_budget_order_id as string | undefined) ??
            (verifyResult.data?.order_id as string | undefined) ??
            null;
          setProviderBranch({ kind: "ads_budget_order", orderId });
        } else if (verifyType === "provider_subscription_order") {
          const orderId = (verifyResult.data?.order_id as string | undefined) ?? null;
          setProviderBranch({ kind: "provider_subscription_order", orderId });
        }
        if (verifyResult.status === "success") {
          setVerifyStatus("success");
          const isProviderPayment =
            verifyType === "ads_budget_order" || verifyType === "provider_subscription_order";
          if (!paymentSuccessTracked.current && !isProviderPayment) {
            paymentSuccessTracked.current = true;
            track(EVENT_PAYMENT_SUCCESS, {
              portal: "web",
              booking_id: bookingId ?? undefined,
              transaction_id: ref,
              payment_provider: stripeCheckoutSessionId
                ? "stripe"
                : flutterwaveTransactionId
                  ? "flutterwave"
                  : "paystack",
            });
          }
        } else if (verifyResult.status === "failed") {
          setVerifyStatus("failed");
          setVerifyMessage(verifyResult.errorMessage ?? null);
        } else {
          setVerifyStatus("pending");
          setVerifyMessage(verifyResult.errorMessage ?? null);
        }
      } catch {
        paystackVerifyStarted.current = false;
        setVerifyStatus("pending");
      }
    };
    void run();
  }, [
    isWaitlist,
    isCustomOffer,
    paystackReference,
    stripeCheckoutSessionId,
    flutterwaveTransactionId,
    hostedCheckoutStatus,
    bookingId,
  ]);

  // §Provider-paystack-audit 2026-05: relay the provider success postMessage
  // for the in-app WebView once we know which provider type we're handling.
  useEffect(() => {
    if (providerBranch) postProviderCheckoutMessage(providerBranch);
  }, [providerBranch]);

  /** Custom-offer Paystack return: trigger verify so booking finalizes, then immediately probe for booking_id. */
  useEffect(() => {
    if (!isCustomOffer || !offerId) return;
    const ref = paystackReference?.trim();
    if (!ref || customOfferVerifyStarted.current) return;
    customOfferVerifyStarted.current = true;
    const run = async () => {
      try {
        await verifyWithRetry(ref, {
          maxAttempts: hostedCheckoutStatus === "failed" || hostedCheckoutStatus === "cancelled" ? 1 : 5,
          delayMs: 1500,
          sessionId: stripeCheckoutSessionId,
          transactionId: flutterwaveTransactionId,
          redirectStatus: hostedCheckoutStatus,
        });
        // Immediately probe offer after verify — the inline finalize means
        // booking_id may already be set by the time the fetch resolves.
        const offerRes = await fetch(`/api/me/custom-offers/${encodeURIComponent(offerId)}`, {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        if (offerRes.ok) {
          const json = await offerRes.json();
          const row = (json?.data ?? json) as { status?: string | null; booking_id?: string | null };
          const outcome = customOfferCheckoutOutcome(row);
          if (outcome === "booked") {
            setCustomOfferBookingId(row.booking_id ?? null);
            setCustomOfferPollingComplete(true);
          } else if (outcome === "support") {
            setCustomOfferNeedsSupport(true);
            setCustomOfferPollingComplete(true);
          }
        }
      } catch {
        customOfferVerifyStarted.current = false;
      }
    };
    void run();
  }, [
    isCustomOffer,
    offerId,
    paystackReference,
    stripeCheckoutSessionId,
    flutterwaveTransactionId,
    hostedCheckoutStatus,
  ]);

  /** Realtime: booking_id appears as soon as the webhook / verify path finishes. */
  useEffect(() => {
    if (!isCustomOffer || !offerId) return;
    const sb = getSupabaseClient();
    const channel = sb
      .channel(`custom-offer-checkout-success-${offerId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "custom_offers",
          filter: `id=eq.${offerId}`,
        },
        (payload) => {
          const row = payload.new as { status?: string | null; booking_id?: string | null };
          const outcome = customOfferCheckoutOutcome(row);
          if (outcome === "booked") {
            setCustomOfferBookingId(row.booking_id ?? null);
            setCustomOfferPollingComplete(true);
          } else if (outcome === "support") {
            setCustomOfferNeedsSupport(true);
            setCustomOfferPollingComplete(true);
          }
        },
      )
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [isCustomOffer, offerId]);

  useEffect(() => {
    if (!isCustomOffer || !offerId) {
      setCustomOfferPollingComplete(true);
      return;
    }
    setCustomOfferPollingComplete(false);
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/api/me/custom-offers/${encodeURIComponent(offerId)}`, {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return;
        const json = await res.json();
        const data = (json?.data ?? json) as { status?: string | null; booking_id?: string | null };
        const outcome = customOfferCheckoutOutcome(data);
        if (outcome === "booked") {
          setCustomOfferBookingId(data.booking_id ?? null);
          setCustomOfferPollingComplete(true);
          clearInterval(interval);
          return;
        }
        if (outcome === "support") {
          setCustomOfferNeedsSupport(true);
          setCustomOfferPollingComplete(true);
          clearInterval(interval);
          return;
        }
      } catch {
        // ignore
      }
      if (attempts >= POLL_MAX_ATTEMPTS) {
        setCustomOfferPollingComplete(true);
        clearInterval(interval);
      }
    }, POLL_INTERVAL_MS);
    return () => {
      clearInterval(interval);
    };
  }, [isCustomOffer, offerId]);

  const resolvedBookingId = bookingId ?? customOfferBookingId;
  const showBookingLink = !!(resolvedBookingId || bookingNumber);
  const paymentType = searchParams?.get("payment_type");
  const customOfferTimedOut =
    isCustomOffer && !!offerId && customOfferPollingComplete && !resolvedBookingId && !customOfferNeedsSupport;

  const [bookingData, setBookingData] = useState<{
    selected_datetime: string;
    created_at?: string;
    scheduled_at?: string;
    booking_number: string;
    status?: string;
    payment_status?: string;
    total_amount?: number;
    total_paid?: number;
    wallet_amount?: number;
    gift_card_amount?: number;
    outstanding_balance?: number;
    currency?: string;
    services: Array<{ offering_name?: string; title?: string; duration_minutes?: number; duration?: number }>;
    location?: { address?: string; name?: string; working_hours?: Record<string, unknown> | null };
    provider?: {
      business_name?: string;
      timezone?: string | null;
      confirmation_sla_hours?: number | null;
      unconfirmed_expire_hours_before_slot?: number | null;
    };
    pending_confirmation_sla?: { body?: string; overnight?: boolean; lastMinute?: boolean };
    recurring_series_id?: string | null;
    address?: { line1?: string; line2?: string; city?: string };
    location_type?: string;
    /** Pricing breakdown — same fields surfaced by /api/me/bookings/[id]; mirrors /booking/confirmation. */
    subtotal?: number;
    travel_fee?: number;
    tax_amount?: number;
    tax_rate?: number;
    service_fee_amount?: number;
    platform_fee_amount?: number;
    membership_discount_amount?: number;
    loyalty_discount_amount?: number;
    loyalty_points_used?: number;
    promotion_discount_amount?: number;
    discount_amount?: number;
    tip_amount?: number;
  } | null>(null);

  const bookingForCalendar = bookingData;

  useEffect(() => {
    if (!resolvedBookingId || isWaitlist) {
      // Non-booking Paystack returns (wallet top-up, etc.) must not wait on booking poll.
      setBookingPollComplete(true);
      return;
    }
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const loadBooking = async () => {
      attempts += 1;
      try {
        const response = await fetch(`/api/me/bookings/${resolvedBookingId}`, {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        const json = response.ok ? await response.json() : null;
        const data = json?.data;
        if (cancelled) return;
        if (data?.selected_datetime) {
          setBookingData(data);
        }
        const paymentStatus = typeof data?.payment_status === "string" ? data.payment_status : "";
        const settled = paymentStatus && paymentStatus !== "pending";
        const shouldKeepPolling =
          !!paystackReference && attempts < POLL_MAX_ATTEMPTS && !settled;
        if (shouldKeepPolling) {
          timer = setTimeout(loadBooking, POLL_INTERVAL_MS);
        } else {
          setBookingPollComplete(true);
        }
      } catch {
        if (!cancelled && paystackReference && attempts < POLL_MAX_ATTEMPTS) {
          timer = setTimeout(loadBooking, POLL_INTERVAL_MS);
        } else if (!cancelled) {
          setBookingPollComplete(true);
        }
      }
    };

    void loadBooking();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [resolvedBookingId, isWaitlist, paystackReference]);

  const isPendingApproval = bookingData?.status === "pending" && !isWaitlist;
  /**
   * Show the "Finalizing payment…" spinner only while either Paystack verify
   * is still running or the booking record has not been observed as paid yet
   * AND we have not exhausted the polling window. Once `bookingPollComplete`
   * is true, we switch to either confirmed copy (if `payment_status` settled)
   * or an explicit "still confirming" state with CTAs.
   */
  const isFinalizingPayment =
    !isWaitlist &&
    !isCustomOffer &&
    !!paystackReference &&
    verifyStatus !== "failed" &&
    !bookingPollComplete &&
    (!bookingData || bookingData.payment_status === "pending") &&
    (verifyStatus === "idle" || verifyStatus === "verifying" || verifyStatus === "success" || verifyStatus === "pending");
  /**
   * True when we have stopped polling but the booking payment never settled.
   * Surface a clear "Still confirming" message with the booking link so the
   * user can leave the page knowing what to expect.
   */
  const isStillConfirming =
    !isWaitlist &&
    !isCustomOffer &&
    !!paystackReference &&
    bookingPollComplete &&
    (!!bookingData ? bookingData.payment_status === "pending" : true) &&
    verifyStatus !== "failed";
  /** Verify came back hard-failed — show a recovery card. */
  const verifyFailed = !isWaitlist && verifyStatus === "failed";
  const walletAmountUsed = Number(bookingData?.wallet_amount ?? 0);
  const giftCardAmountUsed = Number(bookingData?.gift_card_amount ?? 0);
  const isSplitPayment = (walletAmountUsed > 0 || giftCardAmountUsed > 0) && Number(bookingData?.total_paid ?? 0) > 0;

  const totalDurationMinutes = bookingForCalendar?.services?.reduce(
    (sum, s) => sum + (s.duration_minutes ?? s.duration ?? 0),
    0
  ) ?? 0;
  const calendarStart = bookingForCalendar?.selected_datetime
    ? new Date(bookingForCalendar.selected_datetime)
    : null;
  const calendarEnd = calendarStart
    ? new Date(calendarStart.getTime() + totalDurationMinutes * 60 * 1000)
    : null;
  const locationStr = !bookingForCalendar
    ? ""
    : bookingForCalendar.location_type === "at_home" && bookingForCalendar.address
      ? [bookingForCalendar.address.line1, bookingForCalendar.address.line2, bookingForCalendar.address.city].filter(Boolean).join(", ")
      : bookingForCalendar.location?.address ?? bookingForCalendar.location?.name ?? "";
  const calendarEvent =
    calendarStart && calendarEnd
      ? {
          title: `Appointment with ${bookingForCalendar?.provider?.business_name ?? "Beautonomi"}`,
          description: `Booking #${bookingForCalendar?.booking_number ?? ""}\n${(bookingForCalendar?.services ?? []).map((s) => `${s.offering_name ?? s.title ?? "Service"} (${s.duration_minutes ?? s.duration ?? 0} min)`).join("\n")}`,
          location: locationStr || "Address TBD",
          start: calendarStart,
          end: calendarEnd,
        }
      : null;

  const providerTimeZone = bookingForCalendar?.provider?.timezone ?? null;
  const appointmentDateLabel = calendarStart
    ? formatInTimeZone(calendarStart, { weekday: "long", month: "long", day: "numeric", year: "numeric" }, providerTimeZone)
    : "";
  const timeOptions: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  const appointmentTimeLabel =
    calendarStart && calendarEnd
      ? totalDurationMinutes > 0
        ? `${formatInTimeZone(calendarStart, timeOptions, providerTimeZone)} – ${formatInTimeZone(calendarEnd, timeOptions, providerTimeZone)}`
        : formatInTimeZone(calendarStart, timeOptions, providerTimeZone)
      : "";
  const isAtHomeBooking = bookingForCalendar?.location_type === "at_home";
  const directionsUrl =
    locationStr && !isAtHomeBooking
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationStr)}`
      : null;
  const showNextSteps =
    !!bookingForCalendar &&
    !isWaitlist &&
    !verifyFailed &&
    !isFinalizingPayment &&
    !isStillConfirming &&
    !customOfferNeedsSupport;
  const bookingPaymentStatus = String(bookingForCalendar?.payment_status ?? "").toLowerCase();
  const paymentReceived = bookingPaymentStatus === "paid" || bookingPaymentStatus === "partially_paid";
  const calendarOptionCount = resolvedBookingId ? 3 : 2;

  const copyBookingNumber = async () => {
    if (!bookingNumber) return;
    try {
      await navigator.clipboard.writeText(bookingNumber);
      setBookingNumberCopied(true);
      window.setTimeout(() => setBookingNumberCopied(false), 2000);
    } catch {
      toast.error("Could not copy booking number");
    }
  };

  const isWalletTopup = paymentType === "wallet_topup";
  const openInAppUrl =
    resolvedBookingId
      ? appDeepLink("booking-detail", { id: resolvedBookingId })
      : isCustomOffer
        ? appDeepLink("account-settings/custom-requests")
        : isWalletTopup
          ? appDeepLink("account-settings/wallet")
          : appDeepLink("bookings");
  /**
   * Web-side primary destination: lands the user where they actually wanted
   * to go after their purchase resolves, instead of always bouncing to
   * bookings. Wallet top-ups go to wallet; custom offers go to custom
   * requests when the booking is not resolved; everything else uses bookings.
   */
  const webPrimaryHref =
    resolvedBookingId
      ? `/account-settings/bookings/${resolvedBookingId}`
      : isCustomOffer
        ? "/account-settings/custom-requests"
        : isWalletTopup
          ? "/account-settings/wallet"
          : "/account-settings/bookings";
  const webPrimaryLabel =
    resolvedBookingId
      ? "View my booking"
      : isCustomOffer
        ? "View custom requests"
        : isWalletTopup
          ? "Open my wallet"
          : "View bookings";
  const appCtaSubtext = resolvedBookingId
    ? "Best on mobile — jump straight to your appointment"
    : isWalletTopup
      ? "Best on mobile — jump straight to your wallet"
      : isCustomOffer
        ? "Best on mobile — jump straight to custom requests"
        : "Best on mobile — jump straight to your bookings";

  // When loaded in customer app WebView: tell the app to close WebView and
  // navigate. Only fire once the flow has reached a definitive resolution
  // (success, failed, pending-after-poll, or no Paystack reference at all) so
  // the host app doesn't dismiss the WebView while verification is still in
  // flight — which used to show "success" copy on the native side even after
  // a failed verify.
  useEffect(() => {
    const win = typeof window !== "undefined" ? window as Window & { ReactNativeWebView?: { postMessage: (data: string) => void } } : null;
    if (!win?.ReactNativeWebView?.postMessage) return;
    if (isCustomOffer && !customOfferPollingComplete) return;
    if (paystackReference) {
      if (verifyStatus === "idle" || verifyStatus === "verifying") return;
      if (verifyStatus === "success" && !bookingPollComplete && !isCustomOffer) return;
    }
    const status: "success" | "failed" | "pending" =
      verifyStatus === "failed"
        ? "failed"
        : verifyStatus === "pending" || isStillConfirming
          ? "pending"
          : "success";
    const t = setTimeout(() => {
      win.ReactNativeWebView?.postMessage(
        JSON.stringify({
          type:
            status === "failed"
              ? "checkout_failed"
              : status === "pending"
                ? "checkout_pending"
                : "checkout_success",
          status,
          payment_type: paymentType ?? "",
          booking_id: resolvedBookingId ?? undefined,
          reference: paystackReference ?? undefined,
        })
      );
    }, 1200);
    return () => clearTimeout(t);
  }, [
    customOfferPollingComplete,
    isCustomOffer,
    paymentType,
    resolvedBookingId,
    paystackReference,
    verifyStatus,
    bookingPollComplete,
    isStillConfirming,
  ]);

  useEffect(() => {
    if (providerBranch) return;
    if (verifyFailed) return;
    if (!resolvedBookingId) return;
    if (!embed && !isLikelyFramed()) return;
    if (paystackReference && (verifyStatus === "idle" || verifyStatus === "verifying")) return;
    if (paystackReference && verifyStatus === "success" && !bookingPollComplete && !isCustomOffer) return;
    if (embedBookedPosted.current) return;
    embedBookedPosted.current = true;
    postBookingEmbedMessage("booked", {
      bookingId: resolvedBookingId,
      bookingNumber: bookingNumber ?? undefined,
    });
  }, [
    embed,
    providerBranch,
    verifyFailed,
    resolvedBookingId,
    bookingNumber,
    paystackReference,
    verifyStatus,
    bookingPollComplete,
    isCustomOffer,
  ]);

  useEffect(() => {
    if (embedReturnRedirectStarted.current) return;
    if (!embedReturnUrl || !resolvedBookingId) return;
    if (!verifyEmbedReturnUrl(embedReturnUrl, resolvedBookingId, embedReturnSig)) return;
    if (paystackReference && verifyStatus === "idle") return;
    if (paystackReference && verifyStatus === "verifying") return;
    if (paystackReference && verifyStatus === "success" && !bookingPollComplete && !isCustomOffer) return;
    if (verifyFailed) return;

    embedReturnRedirectStarted.current = true;
    setEmbedReturnCountdown(3);
    const target = new URL(embedReturnUrl);
    if (bookingNumber) target.searchParams.set("beautonomi_booking", bookingNumber);

    const tick = window.setInterval(() => {
      setEmbedReturnCountdown((c) => (c != null && c > 1 ? c - 1 : c));
    }, 1000);
    const go = window.setTimeout(() => {
      window.location.href = target.href;
    }, 3000);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(go);
    };
  }, [
    embedReturnUrl,
    embedReturnSig,
    resolvedBookingId,
    bookingNumber,
    paystackReference,
    verifyStatus,
    bookingPollComplete,
    isCustomOffer,
    verifyFailed,
  ]);

  if (providerBranch) {
    /**
     * §Provider-paystack-audit 2026-05: provider Paystack payment landed here
     * by mistake — the new HTTPS callbacks should never route providers to
     * `/checkout/success`, but we keep this branch as a defensive net so they
     * never see customer-shaped CTAs (`View bookings`, `customer://` deep
     * links, etc.) if the merchant default ever fires.
     */
    const isAds = providerBranch.kind === "ads_budget_order";
    const providerHref = isAds ? "/provider/settings/ads" : "/provider/subscription";
    const providerHomeLabel = isAds ? "Back to Ads" : "Back to Subscription";
    const providerDeepLink = isAds ? "provider://settings/ads" : "provider://settings/subscription";
    return (
      <div
        className="relative overflow-hidden min-h-screen flex items-start justify-center px-4 py-10"
        style={{ backgroundColor: BG }}
      >
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
          <div
            className="absolute -top-24 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full opacity-30 blur-3xl"
            style={{ background: `radial-gradient(ellipse, ${accentAlpha(0.25)} 0%, transparent 70%)` }}
          />
        </div>
        <div className="relative w-full max-w-[430px] space-y-4">
          <div
            className="rounded-3xl p-8 text-center border shadow-[0_20px_60px_rgba(0,0,0,0.09)]"
            style={{
              background: "rgba(255,255,255,0.95)",
              backdropFilter: "blur(20px) saturate(180%)",
              borderColor: "rgba(0,0,0,0.05)",
            }}
          >
            <div className="relative mx-auto mb-6 w-24 h-24">
              <div
                className="absolute inset-0 rounded-full animate-ping opacity-20"
                style={{ backgroundColor: ACCENT }}
              />
              <div
                className="relative w-24 h-24 rounded-full flex items-center justify-center shadow-lg"
                style={{
                  background: `linear-gradient(135deg, ${accentAlpha(0.15)} 0%, ${accentAlpha(0.06)} 100%)`,
                  border: `2px solid ${accentAlpha(0.2)}`,
                }}
              >
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
            </div>
            <h1 className="text-2xl font-bold mb-2" style={{ color: TEXT_PRIMARY }}>
              {isAds ? "Ad payment confirmed" : "Plan payment confirmed"}
            </h1>
            <p className="text-sm leading-relaxed" style={{ color: TEXT_SECONDARY }}>
              {isAds
                ? "Your campaign is being funded and will go live shortly."
                : "Your plan is being activated. You'll see it active in your subscription settings momentarily."}
            </p>
          </div>
          <div
            className="rounded-3xl border p-5 space-y-3"
            style={{ background: "#fff", borderColor: "rgba(0,0,0,0.06)", boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}
          >
            <Link
              href={providerHref}
              className="flex items-center justify-center gap-2 w-full min-h-[50px] rounded-2xl font-bold text-white transition-all active:scale-[0.98] text-sm"
              style={{ backgroundColor: ACCENT, boxShadow: `0 8px 20px ${accentAlpha(0.25)}` }}
            >
              {providerHomeLabel}
            </Link>
            <a
              href={providerDeepLink}
              className="flex items-center justify-center gap-2 w-full min-h-[44px] rounded-2xl font-medium border transition-all active:scale-[0.98] text-sm"
              style={{ color: TEXT_SECONDARY, borderColor: "#E5E7EB" }}
            >
              <ExternalLink className="w-4 h-4" />
              Open in Beautonomi provider app
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden min-h-screen flex items-start justify-center px-4 py-10 sm:py-14"
      style={{ backgroundColor: BG }}
    >
      {/* Confetti-style radial gradient behind the card */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div
          className="absolute -top-24 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full opacity-30 blur-3xl"
          style={{ background: `radial-gradient(ellipse, ${accentAlpha(0.25)} 0%, transparent 70%)` }}
        />
      </div>

      <div className="relative w-full max-w-[480px] space-y-4">

        {/* ── SUCCESS HERO CARD ── */}
        <div
          className="rounded-3xl p-8 text-center border shadow-[0_20px_60px_rgba(0,0,0,0.09)] animate-in fade-in slide-in-from-bottom-4 duration-500"
          style={{
            background: "rgba(255,255,255,0.95)",
            backdropFilter: "blur(20px) saturate(180%)",
            borderColor: "rgba(0,0,0,0.05)",
          }}
        >
          {/* Animated state icon — switches per outcome so users see whether
              the page is still working, finished, soft-pending, or failed. */}
          <div className="relative mx-auto mb-6 w-24 h-24">
            {!verifyFailed && !isStillConfirming ? (
              <div
                className="absolute inset-0 rounded-full animate-ping opacity-20"
                style={{ backgroundColor: verifyFailed ? "#DC2626" : ACCENT }}
              />
            ) : null}
            <div
              className="relative w-24 h-24 rounded-full flex items-center justify-center shadow-lg"
              style={
                verifyFailed
                  ? { background: "linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)", border: "2px solid #FCA5A5" }
                  : isStillConfirming
                    ? { background: "linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)", border: "2px solid #FCD34D" }
                    : { background: `linear-gradient(135deg, ${accentAlpha(0.15)} 0%, ${accentAlpha(0.06)} 100%)`, border: `2px solid ${accentAlpha(0.2)}` }
              }
            >
              {verifyFailed ? (
                <XCircle className="w-11 h-11" style={{ color: "#DC2626" }} />
              ) : isStillConfirming ? (
                <Clock className="w-11 h-11" style={{ color: "#B45309" }} />
              ) : isWaitlist ? (
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              ) : isFinalizingPayment ? (
                <svg
                  width="44"
                  height="44"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={ACCENT}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="animate-spin"
                  style={{ animationDuration: "1.4s" }}
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              ) : (
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              )}
            </div>
          </div>

          {/* Title & subtitle */}
          {isWaitlist ? (
            <>
              <h1 className="text-2xl font-bold mb-2" style={{ color: TEXT_PRIMARY }}>You&apos;re on the list!</h1>
              <p className="text-sm leading-relaxed" style={{ color: TEXT_SECONDARY }}>
                We&apos;ll notify you as soon as a slot opens up. You&apos;ll receive an email or push notification.
              </p>
            </>
          ) : isCustomOffer ? (
            <>
              <h1 className="text-2xl font-bold mb-2" style={{ color: TEXT_PRIMARY }}>
                {showBookingLink ? "You\u2019re all set!" : "Payment received"}
              </h1>
              <p className="text-sm leading-relaxed" style={{ color: TEXT_SECONDARY }}>
                {showBookingLink
                  ? "Your custom service booking is confirmed. We\u2019ll send you a reminder before your visit."
                  : "Your payment is being processed. Your booking will appear in My Bookings shortly."}
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold mb-2" style={{ color: TEXT_PRIMARY }}>
                {verifyFailed
                  ? "Payment could not be confirmed"
                  : isFinalizingPayment
                    ? "Finalizing payment..."
                    : isStillConfirming
                      ? "Still confirming your payment"
                      : isPendingApproval
                        ? "Booking received!"
                        : showBookingLink
                          ? "Booking confirmed!"
                          : "Payment received"}
              </h1>
              {bookingNumber && (
                <button
                  type="button"
                  onClick={copyBookingNumber}
                  className="group inline-flex items-center gap-1.5 rounded-full px-3 py-1 mb-3 text-[11px] font-bold tracking-wider uppercase transition-colors hover:opacity-90"
                  style={{ color: ACCENT, background: accentAlpha(0.08) }}
                  aria-label={`Copy booking number ${bookingNumber}`}
                >
                  <span className="break-all">Booking #{bookingNumber}</span>
                  {bookingNumberCopied ? (
                    <Check className="w-3.5 h-3.5 shrink-0" aria-hidden />
                  ) : (
                    <Copy className="w-3.5 h-3.5 shrink-0 opacity-60 group-hover:opacity-100" aria-hidden />
                  )}
                </button>
              )}
              {embedReturnCountdown != null && embedReturnUrl ? (
                <p className="text-sm leading-relaxed mb-2" style={{ color: TEXT_SECONDARY }}>
                  {isPendingApproval ? "Booking received" : "Booking confirmed"} — returning to the salon in {embedReturnCountdown}s…
                </p>
              ) : null}
              {verifyFailed ? (
                <p className="text-sm leading-relaxed" style={{ color: TEXT_SECONDARY }}>
                  {verifyMessage ||
                    "We could not confirm this payment with Paystack. If your bank was debited, the booking will still be confirmed once the payment lands — you can also check your bookings or try again."}
                </p>
              ) : isFinalizingPayment ? (
                <p className="text-sm leading-relaxed" style={{ color: TEXT_SECONDARY }}>
                  We&apos;re confirming your payment with Paystack. This usually takes a few seconds.
                </p>
              ) : isStillConfirming ? (
                <p className="text-sm leading-relaxed" style={{ color: TEXT_SECONDARY }}>
                  Your bank is taking a little longer than usual. Your booking will appear in
                  &ldquo;My bookings&rdquo; as soon as the payment is confirmed — you don&apos;t need
                  to wait on this page.
                </p>
              ) : isPendingApproval ? (
                <>
                  <p className="text-sm leading-relaxed" style={{ color: TEXT_SECONDARY }}>
                    Your payment is received. The provider will confirm your appointment shortly.
                  </p>
                  {!bookingData.recurring_series_id && (
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium" style={{ background: "#FEF3C7", color: "#92400E" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    {bookingData.pending_confirmation_sla?.body ??
                      pendingConfirmationSlaDisplay({
                        scheduledAt: bookingData.selected_datetime ?? bookingData.scheduled_at,
                        createdAt: bookingData.created_at,
                        paymentStatus: bookingData.payment_status,
                        timezone: bookingData.provider?.timezone,
                        workingHours: (bookingData.location?.working_hours ?? null) as
                          | import("@/lib/bookings/lifecycle-deadlines").WorkingHoursJson
                          | null,
                        settings: slaSettingsFromHours(bookingData.provider),
                      }).body}
                  </div>
                  )}
                </>
              ) : (
                <p className="text-sm leading-relaxed" style={{ color: TEXT_SECONDARY }}>
                  {showBookingLink
                    ? "Your appointment is confirmed. You\u2019ll receive a reminder before your visit."
                    : "Thanks\u2014your payment is being processed. Check your bookings shortly."}
                </p>
              )}
              {isSplitPayment && (
                <div className="mt-3 rounded-xl px-4 py-3 text-start space-y-1.5" style={{ background: "#F5F3FF", border: "1px solid #DDD6FE" }}>
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#7C3AED" }}>Payment breakdown</p>
                  {walletAmountUsed > 0 && (
                    <div className="flex justify-between text-xs" style={{ color: "#5B21B6" }}>
                      <span>Wallet credit</span>
                      <span>{formatMoney(walletAmountUsed, bookingData?.currency)}</span>
                    </div>
                  )}
                  {giftCardAmountUsed > 0 && (
                    <div className="flex justify-between text-xs" style={{ color: "#5B21B6" }}>
                      <span>Gift card</span>
                      <span>{formatMoney(giftCardAmountUsed, bookingData?.currency)}</span>
                    </div>
                  )}
                  {Number(bookingData?.total_paid ?? 0) > 0 && (
                    <div className="flex justify-between text-xs" style={{ color: "#5B21B6" }}>
                      <span>Card payment</span>
                      <span>{formatMoney(Number(bookingData?.total_paid ?? 0), bookingData?.currency)}</span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── BOOKING SUMMARY CARD ── */}
        {bookingForCalendar && !isWaitlist && (
          <div
            className="rounded-3xl border overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100"
            style={{ background: "#fff", borderColor: "rgba(0,0,0,0.06)", boxShadow: "0 4px 20px rgba(0,0,0,0.05)" }}
          >
            <div className="px-6 py-4 border-b" style={{ borderColor: "rgba(0,0,0,0.06)", background: accentAlpha(0.04) }}>
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: ACCENT }}>
                Appointment details
              </p>
            </div>
            <div className="px-6 py-5 space-y-5">
              {bookingForCalendar.provider?.business_name && (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: accentAlpha(0.08) }}>
                    <Store className="w-[18px] h-[18px]" style={{ color: ACCENT }} aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: TEXT_SECONDARY }}>
                      Provider
                    </p>
                    <p className="text-sm font-semibold truncate" style={{ color: TEXT_PRIMARY }}>
                      {bookingForCalendar.provider.business_name}
                    </p>
                  </div>
                </div>
              )}

              {calendarStart && (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: accentAlpha(0.08) }}>
                    <Calendar className="w-[18px] h-[18px]" style={{ color: ACCENT }} aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>
                      {appointmentDateLabel}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: TEXT_SECONDARY }}>
                      {appointmentTimeLabel}
                      {totalDurationMinutes > 0 && ` · ${totalDurationMinutes} min`}
                    </p>
                  </div>
                </div>
              )}

              {(bookingForCalendar.services?.length ?? 0) > 0 && (
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: accentAlpha(0.08) }}>
                    <Scissors className="w-[18px] h-[18px]" style={{ color: ACCENT }} aria-hidden />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-wider mb-1" style={{ color: TEXT_SECONDARY }}>
                      {(bookingForCalendar.services?.length ?? 0) > 1 ? "Services" : "Service"}
                    </p>
                    <ul className="space-y-1.5">
                      {(bookingForCalendar.services ?? []).map((s, i) => {
                        const minutes = s.duration_minutes ?? s.duration;
                        return (
                          <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="font-medium min-w-0 break-words" style={{ color: TEXT_PRIMARY }}>
                              {s.offering_name ?? s.title ?? "Service"}
                            </span>
                            {minutes != null && minutes > 0 && (
                              <span className="shrink-0 text-xs tabular-nums" style={{ color: TEXT_SECONDARY }}>
                                {minutes} min
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              )}

              {locationStr && (
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: accentAlpha(0.08) }}>
                    {isAtHomeBooking ? (
                      <Home className="w-[18px] h-[18px]" style={{ color: ACCENT }} aria-hidden />
                    ) : (
                      <MapPin className="w-[18px] h-[18px]" style={{ color: ACCENT }} aria-hidden />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: TEXT_SECONDARY }}>
                      {isAtHomeBooking ? "At your address" : "At the salon"}
                    </p>
                    <p className="text-sm break-words" style={{ color: TEXT_PRIMARY }}>{locationStr}</p>
                    {directionsUrl && (
                      <a
                        href={directionsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                        style={{ color: ACCENT }}
                      >
                        <Navigation className="w-3.5 h-3.5" aria-hidden />
                        Get directions
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── WHAT HAPPENS NEXT ── */}
        {showNextSteps && (
          <div
            className="rounded-3xl border p-5 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100"
            style={{ background: "#fff", borderColor: "rgba(0,0,0,0.06)", boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}
          >
            <p className="text-sm font-bold mb-4" style={{ color: TEXT_PRIMARY }}>
              What happens next
            </p>
            <ol className="relative space-y-4">
              {(
                [
                  ...(paymentReceived
                    ? [
                        {
                          key: "paid",
                          icon: CreditCard,
                          title: "Payment received",
                          body: "Your payment has been processed successfully.",
                          state: "done",
                        } as const,
                      ]
                    : []),
                  isPendingApproval
                    ? {
                        key: "confirm",
                        icon: Clock,
                        title: `${bookingForCalendar?.provider?.business_name ?? "The provider"} confirms`,
                        body: "We\u2019ll notify you as soon as your appointment is accepted.",
                        state: "current",
                      }
                    : {
                        key: "confirm",
                        icon: Check,
                        title: "Appointment confirmed",
                        body: "Your time slot is reserved.",
                        state: "done",
                      },
                  {
                    key: "remind",
                    icon: Bell,
                    title: "Reminder before your visit",
                    body: "We\u2019ll send a reminder ahead of your appointment.",
                    state: "upcoming",
                  },
                ] as const
              ).map((step, idx, arr) => {
                const Icon = step.icon;
                const isDone = step.state === "done";
                const isCurrent = step.state === "current";
                return (
                  <li key={step.key} className="relative flex gap-3">
                    {idx < arr.length - 1 && (
                      <span
                        className="absolute left-[15px] top-8 bottom-[-16px] w-px"
                        style={{ background: isDone ? accentAlpha(0.35) : "#E5E7EB" }}
                        aria-hidden
                      />
                    )}
                    <span
                      className="relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                      style={
                        isDone
                          ? { background: ACCENT, color: "#fff" }
                          : isCurrent
                            ? { background: "#FEF3C7", color: "#B45309", boxShadow: "0 0 0 4px #FFFBEB" }
                            : { background: "#F3F4F6", color: "#9CA3AF" }
                      }
                    >
                      <Icon className="w-4 h-4" aria-hidden />
                    </span>
                    <div className="min-w-0 pt-1">
                      <p className="text-sm font-semibold leading-tight" style={{ color: isDone || isCurrent ? TEXT_PRIMARY : TEXT_SECONDARY }}>
                        {step.title}
                      </p>
                      <p className="text-xs mt-0.5 leading-relaxed" style={{ color: TEXT_SECONDARY }}>
                        {step.body}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {/* ── PRICING BREAKDOWN ──
            Mirrors /booking/confirmation so customers see Membership, Platform fee
            and other line items here too (this is the page that express-link / hold
            consume / Paystack callback all land on).
        */}
        {bookingForCalendar && !isWaitlist && (() => {
          const cur = bookingForCalendar.currency;
          const travel = Number(bookingForCalendar.travel_fee ?? 0);
          const sub = Math.max(0, Number(bookingForCalendar.subtotal ?? 0));
          const tax = Number(bookingForCalendar.tax_amount ?? 0);
          const taxRate = Number(bookingForCalendar.tax_rate ?? 0);
          // platform_fee_amount is the canonical name; service_fee_amount is the legacy alias
          // both come from /api/me/bookings/[id] for parity with provider/admin views.
          const platformFee = Number(
            bookingForCalendar.platform_fee_amount ?? bookingForCalendar.service_fee_amount ?? 0,
          );
          const loyalty = Number(bookingForCalendar.loyalty_discount_amount ?? 0);
          const loyaltyPts = Number(bookingForCalendar.loyalty_points_used ?? 0);
          const membership = Number(bookingForCalendar.membership_discount_amount ?? 0);
          const promo = Number(bookingForCalendar.promotion_discount_amount ?? 0);
          const coupon = Number(bookingForCalendar.discount_amount ?? 0);
          const tip = Number(bookingForCalendar.tip_amount ?? 0);
          const giftCard = Number(bookingForCalendar.gift_card_amount ?? 0);
          const total = Number(bookingForCalendar.total_amount ?? 0);
          const hasAnyLine =
            sub > 0 ||
            tax > 0 ||
            platformFee > 0 ||
            travel > 0 ||
            loyalty > 0 ||
            membership > 0 ||
            promo > 0 ||
            coupon > 0 ||
            tip > 0 ||
            giftCard > 0;
          if (!hasAnyLine && total <= 0) return null;
          // Show Subtotal whenever other breakdown lines are present — a 0-subtotal
          // with a positive total is confusing (customers paid something but the
          // summary looks empty). The fallback in /api/me/bookings/[id] already
          // recovers the correct value from line items, so this is a safety net.
          const showSubtotal = sub > 0 || hasAnyLine;
          return (
            <div
              className="rounded-3xl border overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 delay-125"
              style={{ background: "#fff", borderColor: "rgba(0,0,0,0.06)", boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}
            >
              <div className="px-6 py-4 border-b flex items-center justify-between gap-3" style={{ borderColor: "rgba(0,0,0,0.06)", background: accentAlpha(0.04) }}>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: ACCENT }}>
                  Payment summary
                </p>
                {paymentReceived && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                    style={{ background: "#ECFDF5", color: "#047857" }}
                  >
                    <Check className="w-3 h-3" aria-hidden />
                    {bookingPaymentStatus === "partially_paid" ? "Deposit paid" : "Paid"}
                  </span>
                )}
              </div>
              <div className="px-6 py-5 space-y-2 text-sm">
                {showSubtotal && (
                  <div className="flex justify-between" style={{ color: TEXT_SECONDARY }}>
                    <span>Subtotal</span>
                    <span>{formatMoney(sub, cur)}</span>
                  </div>
                )}
                {loyalty > 0 && (
                  <div className="flex justify-between" style={{ color: "#047857" }}>
                    <span>
                      Loyalty{loyaltyPts > 0 ? ` (${loyaltyPts.toLocaleString()} pts)` : ""}
                    </span>
                    <span>−{formatMoney(loyalty, cur)}</span>
                  </div>
                )}
                {membership > 0 && (
                  <div className="flex justify-between" style={{ color: "#047857" }}>
                    <span>Membership</span>
                    <span>−{formatMoney(membership, cur)}</span>
                  </div>
                )}
                {promo > 0 && (
                  <div className="flex justify-between" style={{ color: "#047857" }}>
                    <span>Promotion</span>
                    <span>−{formatMoney(promo, cur)}</span>
                  </div>
                )}
                {coupon > 0 && (
                  <div className="flex justify-between" style={{ color: "#047857" }}>
                    <span>Discount</span>
                    <span>−{formatMoney(coupon, cur)}</span>
                  </div>
                )}
                {giftCard > 0 && (
                  <div className="flex justify-between" style={{ color: "#047857" }}>
                    <span>Gift card</span>
                    <span>−{formatMoney(giftCard, cur)}</span>
                  </div>
                )}
                {travel > 0 && (
                  <div className="flex justify-between" style={{ color: TEXT_SECONDARY }}>
                    <span>Travel</span>
                    <span>{formatMoney(travel, cur)}</span>
                  </div>
                )}
                {tax > 0 && (
                  <div className="flex justify-between" style={{ color: TEXT_SECONDARY }}>
                    <span>Tax{taxRate > 0 ? ` (${taxRate}%)` : ""}</span>
                    <span>{formatMoney(tax, cur)}</span>
                  </div>
                )}
                {platformFee > 0 && (
                  <div className="flex justify-between" style={{ color: TEXT_SECONDARY }}>
                    <span>{t("checkout.platformFee")}</span>
                    <span>{formatMoney(platformFee, cur)}</span>
                  </div>
                )}
                {tip > 0 && (
                  <div className="flex justify-between" style={{ color: TEXT_SECONDARY }}>
                    <span>Tip</span>
                    <span>{formatMoney(tip, cur)}</span>
                  </div>
                )}
                {total > 0 && (
                  <div className="mt-3 pt-3 flex items-baseline justify-between" style={{ color: TEXT_PRIMARY, borderTop: "1px dashed rgba(0,0,0,0.12)" }}>
                    <span className="font-semibold">Total</span>
                    <span className="text-lg font-bold tabular-nums">{formatMoney(total, cur)}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── ADD TO CALENDAR ── */}
        {calendarEvent && !isWaitlist && (
          <div
            className="rounded-3xl border p-5 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150"
            style={{ background: "#fff", borderColor: "rgba(0,0,0,0.06)", boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}
          >
            <p className="text-sm font-bold mb-1" style={{ color: TEXT_PRIMARY }}>
              Save to your calendar
            </p>
            <p className="text-xs mb-4" style={{ color: TEXT_SECONDARY }}>
              Never miss your appointment — add it now.
            </p>
            <div className={`grid gap-2 ${calendarOptionCount === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
              <a
                href={getGoogleCalendarUrl(calendarEvent)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Add to Google Calendar"
                className="flex flex-col items-center justify-center gap-1.5 rounded-2xl py-3.5 border transition-all active:scale-[0.97] hover:shadow-sm hover:bg-[#F9FAFB]"
                style={{ borderColor: "#E5E7EB", color: TEXT_PRIMARY }}
              >
                <span className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#EEF4FF" }}>
                  <Plus className="w-4 h-4" style={{ color: "#4285F4" }} aria-hidden />
                </span>
                <span className="text-xs font-semibold">Google</span>
              </a>
              <a
                href={getOutlookCalendarUrl(calendarEvent)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Add to Outlook Calendar"
                className="flex flex-col items-center justify-center gap-1.5 rounded-2xl py-3.5 border transition-all active:scale-[0.97] hover:shadow-sm hover:bg-[#F9FAFB]"
                style={{ borderColor: "#E5E7EB", color: TEXT_PRIMARY }}
              >
                <span className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#E8F3FB" }}>
                  <Calendar className="w-4 h-4" style={{ color: "#0072C6" }} aria-hidden />
                </span>
                <span className="text-xs font-semibold">Outlook</span>
              </a>
              {resolvedBookingId && (
                <a
                  href={`/api/me/bookings/${resolvedBookingId}/calendar.ics`}
                  download
                  aria-label="Download for Apple Calendar"
                  className="flex flex-col items-center justify-center gap-1.5 rounded-2xl py-3.5 border transition-all active:scale-[0.97] hover:shadow-sm hover:bg-[#F9FAFB]"
                  style={{ borderColor: "#E5E7EB", color: TEXT_PRIMARY }}
                >
                  <span className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#F3F4F6" }}>
                    <Download className="w-4 h-4" style={{ color: "#374151" }} aria-hidden />
                  </span>
                  <span className="text-xs font-semibold">Apple</span>
                </a>
              )}
            </div>
          </div>
        )}

        {/* ── CTA BUTTONS ── */}
        <div
          className="rounded-3xl border p-5 space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200"
          style={{ background: "#fff", borderColor: "rgba(0,0,0,0.06)", boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}
        >
          {verifyFailed ? (
            <div
              className="rounded-2xl border px-4 py-3 text-sm leading-relaxed flex items-start gap-2"
              style={{
                borderColor: "rgba(220, 38, 38, 0.35)",
                background: "rgba(254, 226, 226, 0.7)",
                color: "#7F1D1D",
              }}
              role="alert"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                <strong>We could not confirm this payment.</strong>{" "}
                {verifyMessage ||
                  "If money was taken from your account it will either be refunded or your booking will be confirmed automatically once the charge lands."}{" "}
                You can check status in My bookings or contact support.
              </span>
            </div>
          ) : isStillConfirming ? (
            <div
              className="rounded-2xl border px-4 py-3 text-sm leading-relaxed flex items-start gap-2"
              style={{
                borderColor: "rgba(245, 158, 11, 0.45)",
                background: "rgba(254, 243, 199, 0.65)",
                color: "#92400e",
              }}
              role="status"
            >
              <Clock className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                <strong>Still confirming.</strong> Payments occasionally take a minute. You can leave
                this page — your booking will appear in <strong>My bookings</strong> as soon as your
                bank confirms.
              </span>
            </div>
          ) : customOfferNeedsSupport ? (
            <div
              className="rounded-2xl border px-4 py-3 text-sm leading-relaxed"
              style={{
                borderColor: "rgba(220, 38, 38, 0.35)",
                background: "rgba(254, 226, 226, 0.7)",
                color: "#991B1B",
              }}
              role="alert"
            >
              <strong>Payment needs support.</strong> We received the payment but could not create the booking. Contact support with your payment reference. Do not pay this offer again.
            </div>
          ) : customOfferTimedOut ? (
            <div
              className="rounded-2xl border px-4 py-3 text-sm leading-relaxed"
              style={{
                borderColor: "rgba(245, 158, 11, 0.45)",
                background: "rgba(254, 243, 199, 0.65)",
                color: "#92400e",
              }}
              role="status"
            >
              <strong>Still confirming.</strong> Payments sometimes take a minute. Open{" "}
              <strong>Custom requests</strong> from your account to check status, or pull to refresh in the app.
            </div>
          ) : null}
          {/* Desktop: custom-scheme deep links can't open, so the web destination is primary. */}
          <Link
            href={webPrimaryHref}
            target={embed ? "_top" : undefined}
            className="hidden md:flex items-center justify-center gap-2 w-full min-h-[52px] rounded-2xl font-bold text-white transition-all active:scale-[0.98] hover:opacity-95 text-sm"
            style={{ backgroundColor: ACCENT, boxShadow: `0 8px 24px ${accentAlpha(0.25)}` }}
          >
            {webPrimaryLabel}
          </Link>
          {/* Mobile: app deep link first — primary CTA for mobile WebView returns after Paystack */}
          <div className="md:hidden space-y-3">
            <a
              href={openInAppUrl}
              target={embed ? "_top" : undefined}
              className="flex items-center justify-center gap-2.5 w-full min-h-[52px] rounded-2xl font-bold text-white transition-all active:scale-[0.98] hover:opacity-95 text-sm"
              style={{ backgroundColor: ACCENT, boxShadow: `0 8px 24px ${accentAlpha(0.25)}` }}
            >
              <Smartphone className="w-5 h-5 shrink-0" strokeWidth={2.25} aria-hidden />
              Open in Beautonomi app
            </a>
            <p className="text-center text-[11px] leading-snug -mt-1 px-1" style={{ color: TEXT_SECONDARY }}>
              {appCtaSubtext}
            </p>
            <Link
              href={webPrimaryHref}
              target={embed ? "_top" : undefined}
              className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-2xl font-semibold border transition-all active:scale-[0.98] hover:bg-[#F9FAFB] text-sm"
              style={{ color: TEXT_PRIMARY, borderColor: "#E5E7EB", background: "#fff" }}
            >
              {webPrimaryLabel}
            </Link>
          </div>
          {resolvedBookingId && !isWaitlist && !verifyFailed && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Link
                href={`/account-settings/bookings/${resolvedBookingId}/receipt`}
                target={embed ? "_top" : undefined}
                className="flex items-center justify-center gap-2 min-h-[44px] rounded-2xl font-medium border text-sm transition-all active:scale-[0.98] hover:bg-[#F9FAFB]"
                style={{ color: TEXT_PRIMARY, borderColor: "#E5E7EB", background: "#fff" }}
              >
                <Download className="w-4 h-4 shrink-0" />
                {t("web.booking.confirmation.downloadReceipt")}
              </Link>
              <button
                type="button"
                disabled={sharing}
                aria-busy={sharing}
                className="flex items-center justify-center gap-2 min-h-[44px] rounded-2xl font-medium border text-sm transition-all active:scale-[0.98] hover:bg-[#F9FAFB] disabled:opacity-60 disabled:cursor-wait"
                style={{ color: TEXT_PRIMARY, borderColor: "#E5E7EB", background: "#fff" }}
                onClick={async () => {
                  if (sharing) return;
                  setSharing(true);
                  try {
                    const { shareCustomerBookingReceiptWeb } = await import(
                      "@/lib/receipts/share-receipt-client"
                    );
                    const result = await shareCustomerBookingReceiptWeb(resolvedBookingId);
                    if (result === "copied") {
                      toast.success(t("web.booking.confirmation.receiptCopied"));
                    } else if (result === null) {
                      toast.error(t("web.booking.confirmation.couldNotShare"));
                    }
                  } catch (e) {
                    toast.error(
                      e instanceof Error ? e.message : t("web.booking.confirmation.couldNotShare"),
                    );
                  } finally {
                    setSharing(false);
                  }
                }}
              >
                <Share2 className="w-4 h-4 shrink-0" />
                {t("web.booking.confirmation.share")}
              </button>
            </div>
          )}
          {isCustomOffer && resolvedBookingId ? (
            <Link
              href="/account-settings/custom-requests"
              target={embed ? "_top" : undefined}
              className="flex items-center justify-center gap-2 w-full min-h-[44px] rounded-2xl font-medium border transition-all active:scale-[0.98] hover:bg-[#F9FAFB] text-sm"
              style={{ color: TEXT_SECONDARY, borderColor: "#E5E7EB", background: "#fff" }}
            >
              View custom requests
            </Link>
          ) : null}
        </div>

        {/* ── APP DOWNLOAD BANNER ── */}
        {!nativeAppContext && (
        <div
          className="rounded-3xl border p-5 text-center animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300"
          style={{
            background: `linear-gradient(135deg, ${accentAlpha(0.06)} 0%, #fff 100%)`,
            borderColor: accentAlpha(0.15),
            boxShadow: "0 2px 12px rgba(0,0,0,0.04)"
          }}
        >
          <div
            className="mx-auto mb-3 w-11 h-11 rounded-2xl flex items-center justify-center"
            style={{ background: accentAlpha(0.1) }}
          >
            <Smartphone className="w-5 h-5" style={{ color: ACCENT }} aria-hidden />
          </div>
          <p className="text-sm font-bold mb-1" style={{ color: TEXT_PRIMARY }}>
            Get the Beautonomi app
          </p>
          <p className="text-xs mb-4" style={{ color: TEXT_SECONDARY }}>
            Manage bookings, track loyalty points, and book again in seconds.
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            <a
              href={NATIVE_STORE.customer.defaultAppStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-white transition-all active:scale-[0.97] hover:opacity-90"
              style={{ background: "#111827" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              App Store
            </a>
            <a
              href={NATIVE_STORE.customer.defaultPlayStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-white transition-all active:scale-[0.97] hover:opacity-90"
              style={{ background: "#111827" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#34a853" }} aria-hidden>
                <path d="m3 20.5v-17c0-.83 1.01-1.31 1.63-.78l14.84 8.5c.57.33.57 1.13 0 1.46L4.63 21.28C4.01 21.81 3 21.33 3 20.5z"/>
              </svg>
              Google Play
            </a>
          </div>
        </div>
        )}

      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense
      fallback={
        <PaymentLoadingHero
          title="Loading confirmation…"
          subtitle="Hang tight — we are checking your payment and booking."
        />
      }
    >
      <CheckoutSuccessWithBridge />
    </Suspense>
  );
}

function CheckoutSuccessWithBridge() {
  const searchParams = useSearchParams();
  return (
    <>
      <NativeAppCheckoutBounce />
      <BookingEmbedBridge active={isBookingEmbedEnabled(searchParams)} />
      <CheckoutSuccessContent />
    </>
  );
}

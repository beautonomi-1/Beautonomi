"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Calendar, Plus, MapPin, Clock, Download, ExternalLink, Smartphone } from "lucide-react";
import { getGoogleCalendarUrl, getOutlookCalendarUrl } from "@/lib/calendar/ics";
import { clearBeautonomiHoldClientMarkers } from "@/lib/booking/clear-hold-client-markers";
import { getSupabaseClient } from "@/lib/supabase/client";
import { PaymentLoadingHero } from "@/components/ui/payment-loading-hero";

/** Beautonomi primary (use CSS var in styles for single source) */
const ACCENT = "var(--primary, #FF0077)";
const BG = "#F3F4F6";
const TEXT_PRIMARY = "#111827";
const TEXT_SECONDARY = "#6B7280";

const POLL_INTERVAL_MS = 1500;
const POLL_MAX_ATTEMPTS = 20;

function formatMoney(amount: number, currency: string | undefined): string {
  const cur = (currency || "").trim();
  const value = Number.isFinite(amount) ? amount : 0;
  if (!cur) return value.toFixed(2);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: cur,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${cur} ${value.toFixed(2)}`;
  }
}

/** Deep link scheme for customer mobile app (opens app to a specific screen when installed) */
const CUSTOMER_APP_SCHEME = "customer";
function appDeepLink(path: string, params?: Record<string, string>): string {
  const q = params ? new URLSearchParams(params).toString() : "";
  return `${CUSTOMER_APP_SCHEME}://${path}${q ? `?${q}` : ""}`;
}

function CheckoutSuccessContent() {
  const searchParams = useSearchParams();
  const bookingId = searchParams?.get("booking_id");
  const bookingNumber = searchParams?.get("booking_number");
  /** Paystack appends reference (or trxref) when redirecting after card payment */
  const paystackReference =
    searchParams?.get("reference") || searchParams?.get("trxref");
  const isWaitlist = searchParams?.get("waitlist") === "1" || searchParams?.get("source") === "waitlist";
  const isCustomOffer = searchParams?.get("payment_type") === "custom_offer";
  const offerId = searchParams?.get("offer_id");

  const [customOfferBookingId, setCustomOfferBookingId] = useState<string | null>(null);
  const [customOfferPollingComplete, setCustomOfferPollingComplete] = useState(false);

  /** Local dev / no webhook: finalize payment via Paystack verify (records booking_payments + confirms booking). */
  const paystackVerifyStarted = useRef(false);
  const customOfferVerifyStarted = useRef(false);

  useEffect(() => {
    clearBeautonomiHoldClientMarkers();
  }, []);

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
      try {
        await fetch(
          `/api/paystack/verify?reference=${encodeURIComponent(ref)}`,
          { credentials: "include", headers: { Accept: "application/json" } },
        );
      } catch {
        paystackVerifyStarted.current = false;
      }
    };
    void run();
  }, [isWaitlist, isCustomOffer, paystackReference, bookingId]);

  /** Custom-offer Paystack return: trigger verify so booking finalizes without waiting only on webhooks. */
  useEffect(() => {
    if (!isCustomOffer || !offerId) return;
    const ref = paystackReference?.trim();
    if (!ref || customOfferVerifyStarted.current) return;
    customOfferVerifyStarted.current = true;
    void fetch(`/api/paystack/verify?reference=${encodeURIComponent(ref)}`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    }).catch(() => {
      customOfferVerifyStarted.current = false;
    });
  }, [isCustomOffer, offerId, paystackReference]);

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
          const bid = (payload.new as { booking_id?: string | null })?.booking_id;
          if (typeof bid === "string" && bid.length > 0) {
            setCustomOfferBookingId(bid);
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
        const data = json?.data ?? json;
        const bid = data?.booking_id;
        if (bid) {
          setCustomOfferBookingId(bid);
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
    isCustomOffer && !!offerId && customOfferPollingComplete && !resolvedBookingId;

  const [bookingData, setBookingData] = useState<{
    selected_datetime: string;
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
    provider?: { business_name?: string };
    location?: { address?: string; name?: string };
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
    if (!resolvedBookingId || isWaitlist) return;
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
        const shouldKeepPolling =
          !!paystackReference &&
          attempts < POLL_MAX_ATTEMPTS &&
          (!paymentStatus || paymentStatus === "pending");
        if (shouldKeepPolling) {
          timer = setTimeout(loadBooking, POLL_INTERVAL_MS);
        }
      } catch {
        if (!cancelled && paystackReference && attempts < POLL_MAX_ATTEMPTS) {
          timer = setTimeout(loadBooking, POLL_INTERVAL_MS);
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
  const isFinalizingPayment =
    !isWaitlist &&
    !isCustomOffer &&
    !!paystackReference &&
    (!bookingData || bookingData.payment_status === "pending");
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

  const openInAppUrl =
    resolvedBookingId
      ? appDeepLink("booking-detail", { id: resolvedBookingId })
      : isCustomOffer
        ? appDeepLink("account-settings/custom-requests")
        : paymentType === "wallet_topup"
          ? appDeepLink("profile")
          : appDeepLink("bookings");

  // When loaded in customer app WebView: tell the app to close WebView and navigate (automatic return)
  useEffect(() => {
    const win = typeof window !== "undefined" ? window as Window & { ReactNativeWebView?: { postMessage: (data: string) => void } } : null;
    if (!win?.ReactNativeWebView?.postMessage) return;
    if (isCustomOffer && !customOfferPollingComplete) return;
    const t = setTimeout(() => {
      win.ReactNativeWebView?.postMessage(
        JSON.stringify({
          type: "checkout_success",
          payment_type: paymentType ?? "",
          booking_id: resolvedBookingId ?? undefined,
        })
      );
    }, 1500);
    return () => clearTimeout(t);
  }, [customOfferPollingComplete, isCustomOffer, paymentType, resolvedBookingId]);

  return (
    <div
      className="min-h-screen flex items-start justify-center px-4 py-10"
      style={{ backgroundColor: BG }}
    >
      {/* Confetti-style radial gradient behind the card */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div
          className="absolute -top-24 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full opacity-30 blur-3xl"
          style={{ background: `radial-gradient(ellipse, ${ACCENT}40 0%, transparent 70%)` }}
        />
      </div>

      <div className="relative w-full max-w-[430px] space-y-4">

        {/* ── SUCCESS HERO CARD ── */}
        <div
          className="rounded-3xl p-8 text-center border shadow-[0_20px_60px_rgba(0,0,0,0.09)] animate-in fade-in slide-in-from-bottom-4 duration-500"
          style={{
            background: "rgba(255,255,255,0.95)",
            backdropFilter: "blur(20px) saturate(180%)",
            borderColor: "rgba(0,0,0,0.05)",
          }}
        >
          {/* Animated success icon */}
          <div className="relative mx-auto mb-6 w-24 h-24">
            {/* Outer pulse ring */}
            <div
              className="absolute inset-0 rounded-full animate-ping opacity-20"
              style={{ backgroundColor: ACCENT }}
            />
            {/* Inner circle */}
            <div
              className="relative w-24 h-24 rounded-full flex items-center justify-center shadow-lg"
              style={{ background: `linear-gradient(135deg, ${ACCENT}25 0%, ${ACCENT}10 100%)`, border: `2px solid ${ACCENT}30` }}
            >
              {isWaitlist ? (
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
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
                {showBookingLink ? "You&apos;re all set!" : "Payment received"}
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
                {isFinalizingPayment
                  ? "Finalizing payment..."
                  : isPendingApproval
                  ? "Booking received!"
                  : showBookingLink
                    ? "Booking confirmed!"
                    : "Payment received"}
              </h1>
              {bookingNumber && (
                <p className="text-xs font-bold tracking-wider uppercase mb-2" style={{ color: ACCENT }}>
                  Booking #{bookingNumber}
                </p>
              )}
              {isFinalizingPayment ? (
                <p className="text-sm leading-relaxed" style={{ color: TEXT_SECONDARY }}>
                  We&apos;re confirming your payment with Paystack. This usually takes a few seconds.
                </p>
              ) : isPendingApproval ? (
                <>
                  <p className="text-sm leading-relaxed" style={{ color: TEXT_SECONDARY }}>
                    Your payment is received. The provider will confirm your appointment shortly.
                  </p>
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium" style={{ background: "#FEF3C7", color: "#92400E" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    Providers typically confirm within 8 hours
                  </div>
                </>
              ) : (
                <p className="text-sm leading-relaxed" style={{ color: TEXT_SECONDARY }}>
                  {showBookingLink
                    ? "Your appointment is confirmed. You\u2019ll receive a reminder before your visit."
                    : "Thanks\u2014your payment is being processed. Check your bookings shortly."}
                </p>
              )}
              {isSplitPayment && (
                <div className="mt-3 rounded-xl px-4 py-3 text-left space-y-1.5" style={{ background: "#F5F3FF", border: "1px solid #DDD6FE" }}>
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#7C3AED" }}>Payment breakdown</p>
                  {walletAmountUsed > 0 && (
                    <div className="flex justify-between text-xs" style={{ color: "#5B21B6" }}>
                      <span>Wallet credit</span>
                      <span>{bookingData?.currency ?? ""} {walletAmountUsed.toFixed(2)}</span>
                    </div>
                  )}
                  {giftCardAmountUsed > 0 && (
                    <div className="flex justify-between text-xs" style={{ color: "#5B21B6" }}>
                      <span>Gift card</span>
                      <span>{bookingData?.currency ?? ""} {giftCardAmountUsed.toFixed(2)}</span>
                    </div>
                  )}
                  {Number(bookingData?.total_paid ?? 0) > 0 && (
                    <div className="flex justify-between text-xs" style={{ color: "#5B21B6" }}>
                      <span>Card payment</span>
                      <span>{bookingData?.currency ?? ""} {Number(bookingData?.total_paid ?? 0).toFixed(2)}</span>
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
            <div className="px-6 py-4 border-b" style={{ borderColor: "rgba(0,0,0,0.06)", background: `${ACCENT}06` }}>
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: ACCENT }}>
                Appointment details
              </p>
            </div>
            <div className="px-6 py-5 space-y-4">
              {bookingForCalendar.provider?.business_name && (
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${ACCENT}12` }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 7H4a2 2 0 0 0-2 2v6c0 1.1.9 2 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
                    </svg>
                  </div>
                  <p className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>
                    {bookingForCalendar.provider.business_name}
                  </p>
                </div>
              )}

              {calendarStart && (
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${ACCENT}12` }}>
                    <Clock className="w-4 h-4" style={{ color: ACCENT }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>
                      {calendarStart.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: TEXT_SECONDARY }}>
                      {calendarStart.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                      {totalDurationMinutes > 0 && ` · ${totalDurationMinutes} min`}
                    </p>
                  </div>
                </div>
              )}

              {(bookingForCalendar.services?.length ?? 0) > 0 && (
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ background: `${ACCENT}12` }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                    </svg>
                  </div>
                  <div className="space-y-1">
                    {(bookingForCalendar.services ?? []).map((s, i) => (
                      <p key={i} className="text-sm" style={{ color: TEXT_PRIMARY }}>
                        {s.offering_name ?? s.title ?? "Service"}
                        <span className="ml-1.5 text-xs" style={{ color: TEXT_SECONDARY }}>
                          {(s.duration_minutes ?? s.duration) != null && `${s.duration_minutes ?? s.duration} min`}
                        </span>
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {locationStr && (
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ background: `${ACCENT}12` }}>
                    <MapPin className="w-4 h-4" style={{ color: ACCENT }} />
                  </div>
                  <p className="text-sm" style={{ color: TEXT_PRIMARY }}>{locationStr}</p>
                </div>
              )}
            </div>
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
          return (
            <div
              className="rounded-3xl border overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 delay-125"
              style={{ background: "#fff", borderColor: "rgba(0,0,0,0.06)", boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}
            >
              <div className="px-6 py-4 border-b" style={{ borderColor: "rgba(0,0,0,0.06)", background: `${ACCENT}06` }}>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: ACCENT }}>
                  Payment summary
                </p>
              </div>
              <div className="px-6 py-5 space-y-1.5 text-sm">
                {sub > 0 && (
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
                    <span>Platform fee</span>
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
                  <div className="mt-2 pt-3 flex justify-between font-semibold" style={{ color: TEXT_PRIMARY, borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                    <span>Total</span>
                    <span>{formatMoney(total, cur)}</span>
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
            <div className="grid grid-cols-3 gap-2">
              <a
                href={getGoogleCalendarUrl(calendarEvent)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center justify-center gap-1.5 rounded-2xl py-3.5 border transition-all active:scale-[0.97] hover:shadow-sm"
                style={{ borderColor: "#E5E7EB", color: TEXT_PRIMARY }}
              >
                <Plus className="w-4 h-4" style={{ color: "#4285F4" }} />
                <span className="text-xs font-semibold">Google</span>
              </a>
              <a
                href={getOutlookCalendarUrl(calendarEvent)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center justify-center gap-1.5 rounded-2xl py-3.5 border transition-all active:scale-[0.97] hover:shadow-sm"
                style={{ borderColor: "#E5E7EB", color: TEXT_PRIMARY }}
              >
                <Calendar className="w-4 h-4" style={{ color: "#0072C6" }} />
                <span className="text-xs font-semibold">Outlook</span>
              </a>
              {resolvedBookingId && (
                <a
                  href={`/api/me/bookings/${resolvedBookingId}/calendar.ics`}
                  download
                  className="flex flex-col items-center justify-center gap-1.5 rounded-2xl py-3.5 border transition-all active:scale-[0.97] hover:shadow-sm"
                  style={{ borderColor: "#E5E7EB", color: TEXT_PRIMARY }}
                >
                  <Download className="w-4 h-4" style={{ color: "#6B7280" }} />
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
          {customOfferTimedOut ? (
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
          {showBookingLink && (
            <Link
              href="/account-settings/bookings"
              className="flex items-center justify-center gap-2 w-full min-h-[50px] rounded-2xl font-bold text-white transition-all active:scale-[0.98] text-sm"
              style={{ backgroundColor: ACCENT, boxShadow: `0 8px 20px ${ACCENT}40` }}
            >
              View my bookings
            </Link>
          )}
          {isCustomOffer && (
            <Link
              href="/account-settings/custom-requests"
              className="flex items-center justify-center gap-2 w-full min-h-[50px] rounded-2xl font-semibold border transition-all active:scale-[0.98] text-sm"
              style={{ color: TEXT_PRIMARY, borderColor: "#E5E7EB" }}
            >
              View custom requests
            </Link>
          )}
          {!showBookingLink && (
            <Link
              href="/account-settings/bookings"
              className="flex items-center justify-center gap-2 w-full min-h-[50px] rounded-2xl font-bold text-white transition-all active:scale-[0.98] text-sm"
              style={{ backgroundColor: ACCENT, boxShadow: `0 8px 20px ${ACCENT}40` }}
            >
              View bookings
            </Link>
          )}
          <a
            href={openInAppUrl}
            className="flex items-center justify-center gap-2 w-full min-h-[44px] rounded-2xl font-medium border transition-all active:scale-[0.98] text-sm"
            style={{ color: TEXT_SECONDARY, borderColor: "#E5E7EB" }}
          >
            <ExternalLink className="w-4 h-4" />
            Open in Beautonomi app
          </a>
        </div>

        {/* ── APP DOWNLOAD BANNER ── */}
        <div
          className="rounded-3xl border p-5 text-center animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300"
          style={{
            background: `linear-gradient(135deg, ${ACCENT}08 0%, transparent 100%)`,
            borderColor: `${ACCENT}20`,
            boxShadow: "0 2px 12px rgba(0,0,0,0.04)"
          }}
        >
          <div className="flex items-center justify-center gap-2 mb-2">
            <Smartphone className="w-5 h-5" style={{ color: ACCENT }} />
            <p className="text-sm font-bold" style={{ color: TEXT_PRIMARY }}>
              Get the Beautonomi app
            </p>
          </div>
          <p className="text-xs mb-4" style={{ color: TEXT_SECONDARY }}>
            Manage bookings, track loyalty points, and book again in seconds.
          </p>
          <div className="flex gap-2 justify-center">
            <a
              href="https://apps.apple.com/app/beautonomi"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold border transition-all active:scale-[0.97]"
              style={{ borderColor: "rgba(0,0,0,0.12)", color: TEXT_PRIMARY, background: "#fff" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ color: TEXT_PRIMARY }}>
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              App Store
            </a>
            <a
              href="https://play.google.com/store/apps/details?id=com.beautonomi"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold border transition-all active:scale-[0.97]"
              style={{ borderColor: "rgba(0,0,0,0.12)", color: TEXT_PRIMARY, background: "#fff" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#34a853" }}>
                <path d="m3 20.5v-17c0-.83 1.01-1.31 1.63-.78l14.84 8.5c.57.33.57 1.13 0 1.46L4.63 21.28C4.01 21.81 3 21.33 3 20.5z"/>
              </svg>
              Google Play
            </a>
          </div>
        </div>

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
      <CheckoutSuccessContent />
    </Suspense>
  );
}

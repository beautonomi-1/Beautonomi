"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Calendar, Plus, MapPin, Clock } from "lucide-react";
import { getGoogleCalendarUrl, getOutlookCalendarUrl } from "@/lib/calendar/ics";

/** Beautonomi primary (use CSS var in styles for single source) */
const ACCENT = "var(--primary, #FF0077)";
const BG = "#F7F7F7";
const TEXT_PRIMARY = "#222222";
const TEXT_SECONDARY = "#6B7280";

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 15;

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
  const isWaitlist = searchParams?.get("waitlist") === "1" || searchParams?.get("source") === "waitlist";
  const isCustomOffer = searchParams?.get("payment_type") === "custom_offer";
  const offerId = searchParams?.get("offer_id");

  const [customOfferBookingId, setCustomOfferBookingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isCustomOffer || !offerId) return;
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
          clearInterval(interval);
        }
      } catch {
        // ignore
      }
      if (attempts >= POLL_MAX_ATTEMPTS) clearInterval(interval);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isCustomOffer, offerId]);

  const resolvedBookingId = bookingId ?? customOfferBookingId;
  const showBookingLink = !!(resolvedBookingId || bookingNumber);
  const paymentType = searchParams?.get("payment_type");

  const [bookingForCalendar, setBookingForCalendar] = useState<{
    selected_datetime: string;
    booking_number: string;
    services: Array<{ offering_name?: string; title?: string; duration_minutes?: number; duration?: number }>;
    provider?: { business_name?: string };
    location?: { address?: string; name?: string };
    address?: { line1?: string; line2?: string; city?: string };
    location_type?: string;
  } | null>(null);

  useEffect(() => {
    if (!resolvedBookingId || isWaitlist) return;
    fetch(`/api/me/bookings/${resolvedBookingId}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((json) => {
        const data = json?.data;
        if (data?.selected_datetime) setBookingForCalendar(data);
      })
      .catch(() => {});
  }, [resolvedBookingId, isWaitlist]);

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
  }, [paymentType, resolvedBookingId]);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ backgroundColor: BG }}
    >
      <div
        className="w-full max-w-[430px] rounded-[2rem] p-8 text-center border shadow-[0_24px_64px_rgba(0,0,0,0.08)]"
        style={{
          background: "rgba(255,255,255,0.9)",
          backdropFilter: "blur(16px) saturate(180%)",
          borderColor: "rgba(0,0,0,0.05)",
        }}
      >
        {isWaitlist ? (
          <>
            <div
              className="mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-6 animate-pulse"
              style={{ backgroundColor: `${ACCENT}20`, border: `3px solid ${ACCENT}` }}
            >
              <span className="text-2xl font-black" style={{ color: ACCENT }}>
                ✓
              </span>
            </div>
            <h1 className="text-2xl font-semibold mb-2" style={{ color: TEXT_PRIMARY }}>
              You're on the list
            </h1>
            <p className="text-sm mb-6" style={{ color: TEXT_SECONDARY }}>
              We'll notify you when a slot becomes available.
            </p>
          </>
        ) : isCustomOffer ? (
          <>
            <div
              className="mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-6"
              style={{ backgroundColor: `${ACCENT}15`, color: ACCENT }}
            >
              <CheckCircle2 className="w-12 h-12" strokeWidth={2} />
            </div>
            <h1 className="text-2xl font-semibold mb-2" style={{ color: TEXT_PRIMARY }}>
              {showBookingLink ? "You're all set" : "Payment received"}
            </h1>
            <p className="text-sm mb-6" style={{ color: TEXT_SECONDARY }}>
              {showBookingLink
                ? "Your custom service booking is confirmed. We'll send you a reminder before your visit."
                : "Your custom service payment is being confirmed. Your booking will appear in My Bookings shortly."}
            </p>
          </>
        ) : (
          <>
            <div
              className="mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-6"
              style={{ backgroundColor: `${ACCENT}15`, color: ACCENT }}
            >
              <CheckCircle2 className="w-12 h-12" strokeWidth={2} />
            </div>
            <h1 className="text-2xl font-semibold mb-2" style={{ color: TEXT_PRIMARY }}>
              {showBookingLink ? "You're all set" : "Payment received"}
            </h1>
            {bookingNumber && (
              <p className="text-sm font-medium mb-2" style={{ color: ACCENT }}>
                Booking #{bookingNumber}
              </p>
            )}
            <p className="text-sm mb-4" style={{ color: TEXT_SECONDARY }}>
              {showBookingLink
                ? "Your appointment is confirmed. We'll send you a reminder before your visit."
                : "Thanks—your payment is being confirmed. You can check your bookings or payments below."}
            </p>

            {bookingForCalendar && !isWaitlist && (
              <div
                className="mb-6 rounded-xl border p-4 text-left"
                style={{ borderColor: "rgba(0,0,0,0.08)", backgroundColor: "rgba(249,250,251,0.8)" }}
              >
                <p className="text-sm font-semibold mb-3" style={{ color: TEXT_PRIMARY }}>
                  Booking summary
                </p>
                {bookingForCalendar.provider?.business_name && (
                  <p className="text-sm mb-1" style={{ color: TEXT_PRIMARY }}>
                    {bookingForCalendar.provider.business_name}
                  </p>
                )}
                {calendarStart && (
                  <p className="text-sm mb-2 flex items-center gap-2" style={{ color: TEXT_SECONDARY }}>
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    {calendarStart.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                    {" · "}
                    {calendarStart.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    {totalDurationMinutes > 0 && ` (${totalDurationMinutes} min)`}
                  </p>
                )}
                {(bookingForCalendar.services?.length ?? 0) > 0 && (
                  <ul className="text-sm mb-2 list-disc list-inside" style={{ color: TEXT_SECONDARY }}>
                    {(bookingForCalendar.services ?? []).map((s: { offering_name?: string; title?: string; duration_minutes?: number; duration?: number }, i: number) => (
                      <li key={i}>
                        {s.offering_name ?? s.title ?? "Service"}
                        {(s.duration_minutes ?? s.duration) != null && ` (${s.duration_minutes ?? s.duration} min)`}
                      </li>
                    ))}
                  </ul>
                )}
                {locationStr && (
                  <p className="text-sm flex items-start gap-2" style={{ color: TEXT_SECONDARY }}>
                    <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{locationStr}</span>
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {calendarEvent && !isWaitlist && (
          <div className="mb-6 text-left">
            <p className="text-sm font-medium mb-2" style={{ color: TEXT_PRIMARY }}>
              Add to calendar
            </p>
            <p className="text-xs mb-2" style={{ color: TEXT_SECONDARY }}>
              Save the appointment to Google Calendar, Outlook, or download an .ics file for Apple Calendar or other apps.
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={getGoogleCalendarUrl(calendarEvent)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center min-h-[40px] px-4 py-2 rounded-xl font-medium border transition-transform active:scale-[0.98]"
                style={{ color: TEXT_PRIMARY, borderColor: "#E5E7EB" }}
              >
                <Plus className="w-4 h-4 mr-1" />
                Google
              </a>
              <a
                href={getOutlookCalendarUrl(calendarEvent)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center min-h-[40px] px-4 py-2 rounded-xl font-medium border transition-transform active:scale-[0.98]"
                style={{ color: TEXT_PRIMARY, borderColor: "#E5E7EB" }}
              >
                Outlook
              </a>
              <a
                href={`/api/me/bookings/${resolvedBookingId}/calendar.ics`}
                download
                className="inline-flex items-center justify-center min-h-[40px] px-4 py-2 rounded-xl font-medium border transition-transform active:scale-[0.98]"
                style={{ color: TEXT_PRIMARY, borderColor: "#E5E7EB" }}
              >
                <Calendar className="w-4 h-4 mr-1" />
                .ICS file
              </a>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {showBookingLink && (
            <Link
              href="/account-settings/bookings"
              className="inline-flex items-center justify-center min-h-[44px] px-5 py-3 rounded-2xl font-semibold text-white transition-transform active:scale-[0.98]"
              style={{ backgroundColor: ACCENT }}
            >
              View my bookings
            </Link>
          )}
          <Link
            href={showBookingLink ? "/account-settings/payments" : "/account-settings/bookings"}
            className="inline-flex items-center justify-center min-h-[44px] px-5 py-3 rounded-2xl font-medium border transition-transform active:scale-[0.98]"
            style={{ color: TEXT_PRIMARY, borderColor: "#E5E7EB" }}
          >
            {showBookingLink ? "View payments" : "View bookings"}
          </Link>
          {isCustomOffer && (
            <Link
              href="/account-settings/custom-requests"
              className="inline-flex items-center justify-center min-h-[44px] px-5 py-3 rounded-2xl font-medium border transition-transform active:scale-[0.98]"
              style={{ color: TEXT_PRIMARY, borderColor: "#E5E7EB" }}
            >
              View custom requests
            </Link>
          )}
          <a
            href={openInAppUrl}
            className="inline-flex items-center justify-center min-h-[44px] px-5 py-3 rounded-2xl font-medium border transition-transform active:scale-[0.98]"
            style={{ color: TEXT_SECONDARY, borderColor: "#E5E7EB", fontSize: "0.875rem" }}
          >
            Open in app
          </a>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex items-center justify-center px-4"
          style={{ backgroundColor: BG }}
        >
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: ACCENT }} />
        </div>
      }
    >
      <CheckoutSuccessContent />
    </Suspense>
  );
}

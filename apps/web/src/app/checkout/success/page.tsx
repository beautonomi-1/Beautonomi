"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

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

  const openInAppUrl =
    resolvedBookingId
      ? appDeepLink("booking-detail", { id: resolvedBookingId })
      : isCustomOffer
        ? appDeepLink("account-settings/custom-requests")
        : paymentType === "wallet_topup"
          ? appDeepLink("profile")
          : appDeepLink("bookings");

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
            <p className="text-sm mb-6" style={{ color: TEXT_SECONDARY }}>
              {showBookingLink
                ? "Your appointment is confirmed. We'll send you a reminder before your visit."
                : "Thanks—your payment is being confirmed. You can check your bookings or payments below."}
            </p>
          </>
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

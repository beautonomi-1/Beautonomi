"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

/** Beautonomi pink (logo / home brand) */
const ACCENT = "#FF0077";
const BG = "#F7F7F7";
const TEXT_PRIMARY = "#222222";
const TEXT_SECONDARY = "#6B7280";

function CheckoutSuccessContent() {
  const searchParams = useSearchParams();
  const bookingId = searchParams?.get("booking_id");
  const bookingNumber = searchParams?.get("booking_number");
  const isWaitlist = searchParams?.get("waitlist") === "1" || searchParams?.get("source") === "waitlist";

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
        ) : (
          <>
            <div
              className="mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-6"
              style={{ backgroundColor: `${ACCENT}15`, color: ACCENT }}
            >
              <CheckCircle2 className="w-12 h-12" strokeWidth={2} />
            </div>
            <h1 className="text-2xl font-semibold mb-2" style={{ color: TEXT_PRIMARY }}>
              {bookingId || bookingNumber ? "You're all set" : "Payment received"}
            </h1>
            {bookingNumber && (
              <p className="text-sm font-medium mb-2" style={{ color: ACCENT }}>
                Booking #{bookingNumber}
              </p>
            )}
            <p className="text-sm mb-6" style={{ color: TEXT_SECONDARY }}>
              {bookingId || bookingNumber
                ? "Your appointment is confirmed. We'll send you a reminder before your visit."
                : "Thanks—your payment is being confirmed. You can check your bookings or payments below."}
            </p>
          </>
        )}

        <div className="flex flex-col gap-3">
          {(bookingId || bookingNumber) && (
            <Link
              href="/account-settings/bookings"
              className="inline-flex items-center justify-center min-h-[44px] px-5 py-3 rounded-2xl font-semibold text-white transition-transform active:scale-[0.98]"
              style={{ backgroundColor: ACCENT }}
            >
              View my bookings
            </Link>
          )}
          <Link
            href={bookingId || bookingNumber ? "/account-settings/payments" : "/account-settings/bookings"}
            className="inline-flex items-center justify-center min-h-[44px] px-5 py-3 rounded-2xl font-medium border transition-transform active:scale-[0.98]"
            style={{ color: TEXT_PRIMARY, borderColor: "#E5E7EB" }}
          >
            {bookingId || bookingNumber ? "View payments" : "View bookings"}
          </Link>
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

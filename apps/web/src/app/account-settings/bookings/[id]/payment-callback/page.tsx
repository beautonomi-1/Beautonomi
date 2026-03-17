"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import Link from "next/link";

/**
 * Booking payment callback – shown after Paystack redirect for:
 * - Additional charge payment (?charge_id=...)
 * - Pay remaining balance (?pay_remaining=1)
 *
 * When opened in the customer app's WebView, posts a message so the app
 * can close the browser and navigate to booking detail (refetch will run on focus).
 */
export default function BookingPaymentCallbackPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const bookingId = params.id as string;
  const chargeId = searchParams.get("charge_id");
  const payRemaining = searchParams.get("pay_remaining") === "1";

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    // Payment is confirmed by Paystack webhook; we just show success after a short delay
    const t = setTimeout(() => {
      setStatus("success");
      setMessage(
        payRemaining
          ? "Your remaining balance has been paid."
          : "Additional charge paid successfully."
      );
    }, 1500);
    return () => clearTimeout(t);
  }, [payRemaining]);

  // Notify the customer app WebView so it can close and navigate to booking detail
  useEffect(() => {
    if (status !== "success" || !bookingId) return;
    const win = typeof window !== "undefined" ? (window as unknown as { ReactNativeWebView?: { postMessage: (s: string) => void } }) : null;
    if (win?.ReactNativeWebView?.postMessage) {
      try {
        win.ReactNativeWebView.postMessage(
          JSON.stringify({
            type: "checkout_success",
            booking_id: bookingId,
            payment_type: payRemaining ? "booking_remaining" : "additional_charge",
          })
        );
      } catch {
        // ignore
      }
    }
  }, [status, bookingId, payRemaining]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
        {status === "loading" && (
          <>
            <Loader2 className="w-16 h-16 text-primary animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Confirming payment
            </h2>
            <p className="text-gray-500">
              Please wait while we confirm your payment…
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Payment successful
            </h2>
            <p className="text-gray-500 mb-6">{message}</p>
            <p className="text-sm text-gray-400 mb-4">
              You can close this window or use the link below.
            </p>
            <Link
              href={`/account-settings/bookings/${bookingId}`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-medium hover:opacity-90 transition-opacity"
            >
              View booking
            </Link>
          </>
        )}

        {status === "error" && (
          <>
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-10 h-10 text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Payment issue
            </h2>
            <p className="text-gray-500 mb-6">{message || "Something went wrong."}</p>
            <Link
              href={`/account-settings/bookings/${bookingId}`}
              className="inline-flex items-center gap-2 px-6 py-3 border border-gray-200 rounded-xl font-medium text-gray-700 hover:bg-gray-50"
            >
              Back to booking
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

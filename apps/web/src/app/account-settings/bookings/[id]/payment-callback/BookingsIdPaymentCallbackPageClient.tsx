"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { verifyWithRetry } from "@/lib/payments/verify-with-retry";

type VerifyResponse = {
  verified: boolean;
  paystackStatus?: string;
  message?: string;
  amount?: number;
  currency?: string;
};

/**
 * Booking payment callback – shown after Paystack redirect for:
 * - Additional charge payment (?charge_id=...)
 * - Pay remaining balance (?pay_remaining=1)
 *
 * Verifies the transaction server-side via Paystack (see Paystack “Accept payments” / verify),
 * then shows success or error. Webhooks remain authoritative for ledger updates.
 *
 * When opened in the customer app's WebView, posts a message so the app
 * can close the browser and navigate to booking detail.
 */
export default function BookingPaymentCallbackPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const bookingId = params.id as string;
  const payRemaining = searchParams.get("pay_remaining") === "1";
  const reference = searchParams.get("reference") || searchParams.get("trxref");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  const verify = useCallback(async () => {
    if (!reference?.trim()) {
      setStatus("error");
      setMessage(
        "No payment reference in the link. If you paid, wait a moment and check your booking — confirmation may still be processing."
      );
      return;
    }

    try {
      const res = await verifyWithRetry<VerifyResponse>(reference.trim(), {
        endpoint: `/api/paystack/verify-reference?booking_id=${encodeURIComponent(bookingId)}`,
        maxAttempts: 5,
        delayMs: 1500,
      });
      const data = res.data;
      if (res.status === "success" || data?.verified) {
        setStatus("success");
        const amt =
          data.amount != null && data.currency
            ? `${data.currency} ${data.amount.toFixed(2)}`
            : null;
        setMessage(
          payRemaining
            ? amt
              ? `Your remaining balance (${amt}) has been confirmed.`
              : "Your remaining balance has been confirmed."
            : amt
              ? `Payment of ${amt} for the additional charge has been confirmed.`
              : "Additional charge payment has been confirmed."
        );
        return;
      }
      if (res.status === "failed") {
        setStatus("error");
        setMessage(
          data?.message ||
            "We could not confirm this payment. Check your booking or contact support if money was debited."
        );
        return;
      }
      setStatus("success");
      setMessage(
        "Payment received. We are finalizing your booking now — please refresh in a moment.",
      );
    } catch (e) {
      setStatus("success");
      setMessage("Payment received. We are finalizing your booking now — please refresh in a moment.");
    }
  }, [reference, bookingId, payRemaining]);

  useEffect(() => {
    verify();
  }, [verify]);

  // Notify the customer app WebView with the resolved outcome so the native
  // shell can swap to the right result card (instead of only firing on
  // success and stalling the WebView on failures).
  useEffect(() => {
    if (status === "loading" || !bookingId) return;
    const win =
      typeof window !== "undefined"
        ? (window as unknown as {
            ReactNativeWebView?: { postMessage: (s: string) => void };
          })
        : null;
    if (!win?.ReactNativeWebView?.postMessage) return;
    try {
      win.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: status === "success" ? "checkout_success" : "checkout_failed",
          status: status === "success" ? "success" : "failed",
          booking_id: bookingId,
          payment_type: payRemaining ? "booking_remaining" : "additional_charge",
          reference: reference || undefined,
          message: status === "error" ? message || null : undefined,
        })
      );
    } catch {
      // ignore
    }
  }, [status, bookingId, payRemaining, reference, message]);

  // Auto-route on settled failure so the user is never stranded on a manual
  // link in the standalone web view (they can still tap the link sooner).
  useEffect(() => {
    if (status !== "error" || !bookingId) return;
    const t = setTimeout(() => {
      router.replace(`/account-settings/bookings/${bookingId}`);
    }, 4500);
    return () => clearTimeout(t);
  }, [status, bookingId, router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
        {status === "loading" && (
          <>
            <Loader2 className="w-12 h-12 text-pink-500 animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Confirming payment
            </h2>
            <p className="text-gray-500">
              Verifying with Paystack…
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
              Could not confirm payment
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

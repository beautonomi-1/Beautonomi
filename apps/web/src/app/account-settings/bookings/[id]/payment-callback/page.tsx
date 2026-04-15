"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CheckCircle, XCircle } from "lucide-react";
import Link from "next/link";
import { fetcher, FetchError } from "@/lib/http/fetcher";

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
  const searchParams = useSearchParams();
  const bookingId = params.id as string;
  const payRemaining = searchParams.get("pay_remaining") === "1";
  const reference = searchParams.get("reference");

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
      const qs = new URLSearchParams({
        reference: reference.trim(),
        booking_id: bookingId,
      });
      const res = await fetcher.get<{ data: VerifyResponse; error: null }>(
        `/api/paystack/verify-reference?${qs.toString()}`,
        { timeoutMs: 30000 }
      );

      const data = res?.data;
      if (data?.verified) {
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

      setStatus("error");
      setMessage(
        data?.message ||
          "We could not confirm this payment. Check your booking or contact support if money was debited."
      );
    } catch (e) {
      setStatus("error");
      setMessage(
        e instanceof FetchError
          ? e.message
          : "Could not verify payment. Please check your booking in a few minutes."
      );
    }
  }, [reference, bookingId, payRemaining]);

  useEffect(() => {
    verify();
  }, [verify]);

  // Notify the customer app WebView so it can close and navigate to booking detail
  useEffect(() => {
    if (status !== "success" || !bookingId) return;
    const win =
      typeof window !== "undefined"
        ? (window as unknown as {
            ReactNativeWebView?: { postMessage: (s: string) => void };
          })
        : null;
    if (win?.ReactNativeWebView?.postMessage) {
      try {
        win.ReactNativeWebView.postMessage(
          JSON.stringify({
            type: "checkout_success",
            booking_id: bookingId,
            payment_type: payRemaining ? "booking_remaining" : "additional_charge",
            reference: reference || undefined,
          })
        );
      } catch {
        // ignore
      }
    }
  }, [status, bookingId, payRemaining, reference]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
        {status === "loading" && (
          <>
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

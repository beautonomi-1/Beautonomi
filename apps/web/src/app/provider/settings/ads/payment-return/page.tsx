"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

/**
 * Minimal return URL after Paystack when the provider pays from the **native app WebView**.
 * Posts to `ReactNativeWebView` so the shell can close the WebView and refresh campaigns.
 */
function AdsPaymentReturnInner() {
  const sp = useSearchParams();
  const success = sp.get("success") === "1";
  const orderId = sp.get("order_id") ?? "";

  useEffect(() => {
    if (!success) return;
    try {
      const w = window as Window & { ReactNativeWebView?: { postMessage: (msg: string) => void } };
      w.ReactNativeWebView?.postMessage(
        JSON.stringify({ type: "BEAUTONOMI_ADS_PAYMENT_DONE", order_id: orderId || null }),
      );
    } catch {
      // ignore
    }
  }, [success, orderId]);

  if (!success) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <p className="text-gray-700">This payment return link is invalid or incomplete.</p>
        <Link href="/provider/settings/ads" className="mt-6 inline-block text-pink-600 underline">
          Back to Ads
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="text-xl font-semibold text-gray-900">Payment received</h1>
      <p className="mt-3 text-sm text-gray-600">
        If you started this payment inside the Beautonomi Provider app, you can return to the app — the window should
        close automatically. Otherwise continue below.
      </p>
      <Link
        href="/provider/settings/ads"
        className="mt-8 inline-flex items-center justify-center rounded-lg bg-pink-600 px-5 py-3 text-sm font-semibold text-white hover:bg-pink-700"
      >
        Open Ads & campaigns
      </Link>
    </div>
  );
}

export default function AdsPaymentReturnPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md px-6 py-16 text-center text-sm text-gray-500">Loading…</div>
      }
    >
      <AdsPaymentReturnInner />
    </Suspense>
  );
}

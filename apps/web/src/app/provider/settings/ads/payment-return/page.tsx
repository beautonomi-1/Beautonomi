"use client";

import { useEffect, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";

/**
 * Minimal return URL after Paystack for provider ads.
 * Native app: posts to `ReactNativeWebView` so the shell can close the WebView.
 * Web: verifies the charge if Paystack returned a reference, then routes back to Ads.
 */
function AdsPaymentReturnInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const success = sp.get("success") === "1";
  const orderId = sp.get("order_id") ?? "";
  const context = sp.get("context") ?? "web";
  const reference = sp.get("reference") || sp.get("trxref") || "";
  const [message, setMessage] = useState("Confirming your ads payment...");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!success) return;
    let cancelled = false;

    const postNativeStatus = (status: "success" | "pending" | "failed", nextMessage: string) => {
      try {
        const w = window as Window & { ReactNativeWebView?: { postMessage: (msg: string) => void } };
        w.ReactNativeWebView?.postMessage(
          JSON.stringify({
            type: "BEAUTONOMI_ADS_PAYMENT_DONE",
            status,
            order_id: orderId || null,
            message: nextMessage,
          }),
        );
      } catch {
        // ignore
      }
    };

    const finish = (nextMessage: string, status: "success" | "pending" | "failed") => {
      if (cancelled) return;
      setMessage(nextMessage);
      setReady(true);
      postNativeStatus(status, nextMessage);
    };

    const run = async () => {
      try {
        if (reference) {
          const res = await fetch(`/api/paystack/verify?reference=${encodeURIComponent(reference)}`, {
            credentials: "include",
          });
          if (!res.ok) {
            throw new Error("Could not verify payment immediately.");
          }
        }
        finish("Payment received. Your campaign is being activated.", "success");
      } catch {
        finish("Payment received. We are still syncing confirmation from Paystack.", "pending");
      }
    };

    void run();

    if (context !== "app") {
      const timeout = window.setTimeout(() => {
        router.replace("/provider/settings/ads?payment_success=1");
      }, reference ? 1600 : 2400);
      return () => {
        cancelled = true;
        window.clearTimeout(timeout);
      };
    }

    return () => {
      cancelled = true;
    };
  }, [success, orderId, context, reference, router]);

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
        {message}
      </p>
      {!ready && <Loader2 className="mx-auto mt-6 h-5 w-5 animate-spin text-pink-600" />}
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

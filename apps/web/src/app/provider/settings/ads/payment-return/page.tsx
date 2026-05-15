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
  const cancelled = sp.get("cancelled") === "1";
  const orderId = sp.get("order_id") ?? "";
  const context = sp.get("context") ?? "web";
  const reference = sp.get("reference") || sp.get("trxref") || "";
  const [message, setMessage] = useState("Confirming your ads payment...");
  const [ready, setReady] = useState(false);
  const [headline, setHeadline] = useState("Thanks — confirming with Paystack");

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

    const finish = (nextMessage: string, status: "success" | "pending" | "failed", title?: string) => {
      if (cancelled) return;
      setMessage(nextMessage);
      setReady(true);
      if (title) setHeadline(title);
      postNativeStatus(status, nextMessage);
    };

    const run = async () => {
      try {
        if (!reference) {
          throw new Error(
            "MISSING_REFERENCE: Paystack did not return a transaction reference on this return URL. Open Ads and pull to refresh — your payment may still apply via webhook.",
          );
        }

        const res = await fetch(`/api/paystack/verify?reference=${encodeURIComponent(reference)}`, {
          credentials: "include",
        });
        const payload = (await res.json().catch(() => null)) as {
          data?: { status?: string; message?: string; type?: string };
          error?: { message?: string; code?: string };
        } | null;
        if (!res.ok) {
          throw new Error(
            payload?.error?.message ||
              (typeof payload?.data === "object" && payload?.data && "message" in payload.data
                ? String((payload.data as { message?: string }).message)
                : null) ||
              "Could not verify payment immediately.",
          );
        }
        if (payload?.error) {
          throw new Error(payload.error.message || "Payment verification failed.");
        }
        const inner = payload?.data;
        if (!inner || typeof inner !== "object") {
          throw new Error("Invalid verification response from server.");
        }
        if (inner.status === "error") {
          throw new Error(inner.message || "Payment could not be confirmed from Paystack metadata.");
        }
        // Verify returns { status: "failed" } when Paystack charge is not successful (not only "error").
        if (inner.status !== "success") {
          throw new Error(inner.message || "Payment verification was not successful.");
        }
        finish("Your ad budget is being activated. You can fund more boosts anytime from Ads.", "success", "Payment confirmed");
        if (context !== "app") {
          window.setTimeout(() => {
            if (!cancelled) router.replace("/provider/settings/ads?payment_success=1");
          }, 1400);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        // Definitive failures (wrong user, amount, tenant, missing ref, Paystack not success, etc.)
        const looksLikeHardFailure =
          msg.includes("MISSING_REFERENCE") ||
          msg.includes("Invalid verification") ||
          msg.includes("not successful") ||
          msg.includes("metadata") ||
          msg.includes("VERIFY") ||
          msg.includes("amount") ||
          msg.includes("mismatch") ||
          msg.includes("FORBIDDEN") ||
          msg.includes("not found") ||
          msg.includes("only confirm") ||
          msg.includes("different market");
        if (looksLikeHardFailure) {
          finish(
            msg.startsWith("MISSING_REFERENCE:")
              ? msg.replace(/^MISSING_REFERENCE:\s*/, "")
              : msg.includes("metadata") || msg.includes("not successful") || msg.includes("Invalid verification")
                ? "We could not confirm this payment against your ad order from the return page. Open Ads and pull to refresh, or contact support with your Paystack reference."
                : msg || "Payment could not be confirmed. Open Ads to check status or try again.",
            "failed",
            "We need one more step",
          );
        } else {
          finish(
            "Your bank may still be finalizing the charge. Open Ads in a moment and pull to refresh.",
            "pending",
            "Almost there",
          );
        }
        if (context !== "app") {
          window.setTimeout(() => {
            if (!cancelled) router.replace("/provider/settings/ads");
          }, 2200);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [success, orderId, context, reference, router]);

  if (!success) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        {cancelled ? (
          <>
            <h1 className="text-xl font-semibold text-gray-900">Payment cancelled</h1>
            <p className="mt-3 text-sm text-gray-600">
              You cancelled the payment. No charge was made. You can try again from your Ads dashboard.
            </p>
          </>
        ) : (
          <p className="text-gray-700">This payment return link is invalid or incomplete.</p>
        )}
        <Link href="/provider/settings/ads" className="mt-6 inline-block text-pink-600 underline">
          Back to Ads
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="text-xl font-semibold text-gray-900">{headline}</h1>
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

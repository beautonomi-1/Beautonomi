"use client";

import { useEffect, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { verifyWithRetry } from "@/lib/payments/verify-with-retry";

const PROVIDER_APP_SCHEME = "provider";

function appDeepLink(path: string, params?: Record<string, string>): string {
  const q = params ? new URLSearchParams(params).toString() : "";
  return `${PROVIDER_APP_SCHEME}://${path}${q ? `?${q}` : ""}`;
}

function isNativeAppContext(context: string): boolean {
  return context === "app" || context === "provider_inapp";
}

type VerifyOutcome = "success" | "pending" | "failed";

/**
 * Minimal return URL after Paystack for provider ads.
 * Native app: offers a `provider://` deep link so providers are never stranded
 * when the auth session does not auto-close (3DS / external browser edge cases).
 * Web: verifies the charge if Paystack returned a reference, then routes back to Ads.
 */
function AdsPaymentReturnInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const success = sp.get("success") === "1";
  const cancelled = sp.get("cancelled") === "1";
  const orderId = sp.get("order_id") ?? "";
  const campaignId = sp.get("campaign_id") ?? "";
  const context = sp.get("context") ?? "web";
  const reference = sp.get("reference") || sp.get("trxref") || "";
  const confirmed = sp.get("confirmed") === "1";
  const nativeContext = isNativeAppContext(context);

  const [message, setMessage] = useState("Confirming your ads payment...");
  const [ready, setReady] = useState(confirmed);
  const [headline, setHeadline] = useState("Thanks — confirming with Paystack");
  const [outcome, setOutcome] = useState<VerifyOutcome | "cancelled" | "idle">(
    cancelled ? "cancelled" : confirmed ? "success" : "idle",
  );

  useEffect(() => {
    if (success) return;

    let cancelledEffect = false;

    const run = async () => {
      if (cancelled && orderId) {
        try {
          await fetch("/api/provider/ads/budget-orders/" + encodeURIComponent(orderId) + "/abandon", {
            method: "POST",
            credentials: "include",
          });
        } catch {
          // Non-blocking — list GET also auto-expires stale pending orders.
        }
      }

      if (cancelledEffect) return;
      if (!nativeContext) return;
      if (typeof window === "undefined") return;
      try {
        const w = window as Window & { ReactNativeWebView?: { postMessage: (msg: string) => void } };
        if (!w.ReactNativeWebView?.postMessage) return;
        w.ReactNativeWebView.postMessage(
          JSON.stringify({
            type: "BEAUTONOMI_ADS_PAYMENT_DONE",
            status: cancelled ? "cancelled" : "failed",
            order_id: orderId || null,
            message: cancelled
              ? "You cancelled the payment. No charge was made. You can try again from your Ads dashboard."
              : "This payment return link is invalid or incomplete. Open Ads and pull to refresh.",
          }),
        );
      } catch {
        // ignore
      }
    };

    void run();

    return () => {
      cancelledEffect = true;
    };
  }, [success, cancelled, nativeContext, orderId]);

  useEffect(() => {
    if (!success || confirmed) return;
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

    const finish = (
      nextMessage: string,
      status: VerifyOutcome,
      title?: string,
    ) => {
      if (cancelled) return;
      setMessage(nextMessage);
      setOutcome(status);
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

        const verifyResult = await verifyWithRetry<{ status?: string; message?: string; type?: string }>(
          reference,
          { maxAttempts: 5, delayMs: 1500 },
        );
        if (verifyResult.status === "failed") {
          throw new Error(verifyResult.errorMessage || "Payment verification was not successful.");
        }
        if (verifyResult.status !== "success") {
          finish(
            "Your bank may still be finalizing the charge. Open Ads in a moment and pull to refresh.",
            "pending",
            "Almost there",
          );
          return;
        }
        finish(
          "Your campaign is being funded and will go live shortly.",
          "success",
          "Payment confirmed",
        );
        if (nativeContext) {
          const confirmedParams = new URLSearchParams();
          confirmedParams.set("success", "1");
          confirmedParams.set("confirmed", "1");
          if (orderId) confirmedParams.set("order_id", orderId);
          if (campaignId) confirmedParams.set("campaign_id", campaignId);
          if (reference) confirmedParams.set("reference", reference);
          confirmedParams.set("context", context);
          window.setTimeout(() => {
            if (!cancelled) {
              window.location.replace(`/provider/settings/ads/payment-return?${confirmedParams.toString()}`);
            }
          }, 300);
        } else {
          window.setTimeout(() => {
            if (!cancelled) router.replace("/provider/settings/ads?payment_success=1");
          }, 1400);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
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
        if (!nativeContext) {
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
  }, [success, orderId, campaignId, context, reference, router, confirmed, nativeContext]);

  const returnToAppHref = appDeepLink("settings/ads-payment-return", {
    ...(outcome === "success" ? { success: "1" } : {}),
    ...(outcome === "cancelled" ? { cancelled: "1" } : {}),
    ...(orderId ? { order_id: orderId } : {}),
    ...(campaignId ? { campaign_id: campaignId } : {}),
    ...(reference ? { reference } : {}),
  });

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
        {nativeContext ? (
          <a
            href={returnToAppHref}
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-pink-600 px-5 py-3 text-sm font-semibold text-white hover:bg-pink-700"
          >
            Return to app
          </a>
        ) : (
          <Link href="/provider/settings/ads" className="mt-6 inline-block text-pink-600 underline">
            Back to Ads
          </Link>
        )}
      </div>
    );
  }

  const showReturnToApp = nativeContext && ready;
  const returnCtaLabel =
    outcome === "success"
      ? "Return to app"
      : outcome === "pending"
        ? "Return to app"
        : "Back to app";

  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="text-xl font-semibold text-gray-900">{headline}</h1>
      <p className="mt-3 text-sm text-gray-600">{message}</p>
      {!ready && <Loader2 className="mx-auto mt-6 h-5 w-5 animate-spin text-pink-600" />}

      {orderId || reference ? (
        <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4 text-left text-sm">
          <p className="font-semibold text-gray-900">Payment summary</p>
          {orderId ? (
            <p className="mt-2 text-gray-600">
              <span className="font-medium text-gray-700">Order:</span> {orderId.slice(0, 8)}…
            </p>
          ) : null}
          {reference ? (
            <p className="mt-1 text-gray-600">
              <span className="font-medium text-gray-700">Reference:</span> {reference}
            </p>
          ) : null}
        </div>
      ) : null}

      {showReturnToApp ? (
        <div
          className={`mt-6 rounded-lg border p-4 text-sm ${
            outcome === "failed"
              ? "border-red-200 bg-red-50 text-red-800"
              : outcome === "pending"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-green-200 bg-green-50 text-green-800"
          }`}
        >
          <p className="font-medium">
            {outcome === "failed"
              ? "Payment not completed."
              : outcome === "pending"
                ? "Payment pending."
                : "Payment complete."}
          </p>
          <p className="mt-1">
            {outcome === "failed"
              ? "Return to the app and try again from your Ads dashboard."
              : outcome === "pending"
                ? "Return to the app and pull to refresh in a moment."
                : "Tap the button below to return to the app."}
          </p>
          <a
            href={returnToAppHref}
            className={`mt-3 inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-white ${
              outcome === "failed"
                ? "bg-red-600 hover:bg-red-700"
                : outcome === "pending"
                  ? "bg-amber-600 hover:bg-amber-700"
                  : "bg-green-600 hover:bg-green-700"
            }`}
          >
            {returnCtaLabel}
          </a>
        </div>
      ) : null}

      {!nativeContext ? (
        <Link
          href="/provider/settings/ads"
          className="mt-8 inline-flex items-center justify-center rounded-lg bg-pink-600 px-5 py-3 text-sm font-semibold text-white hover:bg-pink-700"
        >
          Open Ads & campaigns
        </Link>
      ) : null}
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

"use client";

import { Suspense, useEffect, useState } from "react";
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

function TerminalPaymentReturnInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const success = sp.get("payment_success") === "1";
  const cancelled = sp.get("payment_cancelled") === "1";
  const orderId = sp.get("order_id") ?? "";
  const context = sp.get("context") ?? "web";
  const reference = sp.get("reference") || sp.get("trxref") || "";
  const confirmed = sp.get("confirmed") === "1";
  const nativeContext = isNativeAppContext(context) || sp.get("in_app") === "1";

  const [message, setMessage] = useState("Confirming your terminal order payment...");
  const [ready, setReady] = useState(confirmed);
  const [headline, setHeadline] = useState("Thanks — confirming with Paystack");
  const [outcome, setOutcome] = useState<VerifyOutcome | "cancelled" | "idle">(
    cancelled ? "cancelled" : confirmed ? "success" : "idle",
  );

  useEffect(() => {
    if (success) return;

    if (!nativeContext || typeof window === "undefined") return;
    try {
      const w = window as Window & { ReactNativeWebView?: { postMessage: (msg: string) => void } };
      w.ReactNativeWebView?.postMessage(
        JSON.stringify({
          type: "BEAUTONOMI_TERMINAL_PAYMENT_DONE",
          status: cancelled ? "cancelled" : "failed",
          order_id: orderId || null,
          message: cancelled
            ? "You cancelled the payment. No charge was made."
            : "This payment return link is invalid or incomplete.",
        }),
      );
    } catch {
      // ignore
    }
  }, [success, cancelled, nativeContext, orderId]);

  useEffect(() => {
    if (!success || confirmed) return;
    let cancelledEffect = false;

    const postNativeStatus = (status: "success" | "pending" | "failed", nextMessage: string) => {
      try {
        const w = window as Window & { ReactNativeWebView?: { postMessage: (msg: string) => void } };
        w.ReactNativeWebView?.postMessage(
          JSON.stringify({
            type: "BEAUTONOMI_TERMINAL_PAYMENT_DONE",
            status,
            order_id: orderId || null,
            reference: reference || null,
            message: nextMessage,
          }),
        );
      } catch {
        // ignore
      }
    };

    const finish = (nextMessage: string, status: VerifyOutcome, title?: string) => {
      if (cancelledEffect) return;
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
            "MISSING_REFERENCE: Paystack did not return a transaction reference. Pull to refresh your orders — payment may still apply via webhook.",
          );
        }

        const verifyResult = await verifyWithRetry<{ status?: string; message?: string }>(
          reference,
          { maxAttempts: 5, delayMs: 1500 },
        );
        if (verifyResult.status === "failed") {
          throw new Error(verifyResult.errorMessage || "Payment verification was not successful.");
        }
        if (verifyResult.status !== "success") {
          finish(
            "Your bank may still be finalizing the charge. Return to the app and pull to refresh your orders.",
            "pending",
            "Almost there",
          );
          return;
        }
        finish(
          "Your terminal order is paid. Return to the app to track shipping and activation.",
          "success",
          "Payment confirmed",
        );
        if (nativeContext) {
          const confirmedParams = new URLSearchParams();
          confirmedParams.set("payment_success", "1");
          confirmedParams.set("confirmed", "1");
          if (orderId) confirmedParams.set("order_id", orderId);
          if (reference) confirmedParams.set("reference", reference);
          confirmedParams.set("context", context);
          window.setTimeout(() => {
            if (!cancelledEffect) {
              window.location.replace(
                `/provider/settings/sales/terminal-payment-return?${confirmedParams.toString()}`,
              );
            }
          }, 300);
        } else {
          window.setTimeout(() => {
            if (!cancelledEffect) {
              router.replace(
                `/provider/settings/sales/terminal-shop?payment_success=1&order_id=${orderId}`,
              );
            }
          }, 1400);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        const looksLikeHardFailure =
          msg.includes("MISSING_REFERENCE") ||
          msg.includes("not successful") ||
          msg.includes("Invalid verification");
        if (looksLikeHardFailure) {
          finish(
            msg.startsWith("MISSING_REFERENCE:")
              ? msg.replace(/^MISSING_REFERENCE:\s*/, "")
              : "We could not confirm this payment. Open Terminal shop and pull to refresh, or contact support with your Paystack reference.",
            "failed",
            "We need one more step",
          );
        } else {
          finish(
            "Your bank may still be finalizing the charge. Return to the app and pull to refresh your orders.",
            "pending",
            "Almost there",
          );
        }
      }
    };

    void run();
    return () => {
      cancelledEffect = true;
    };
  }, [success, orderId, context, reference, router, confirmed, nativeContext]);

  const returnToAppHref = appDeepLink("settings/terminal-payment-return", {
    ...(outcome === "success" ? { payment_success: "1" } : {}),
    ...(outcome === "cancelled" ? { payment_cancelled: "1" } : {}),
    ...(orderId ? { order_id: orderId } : {}),
    ...(reference ? { reference } : {}),
  });

  if (!success) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        {cancelled ? (
          <>
            <h1 className="text-xl font-semibold text-gray-900">Payment cancelled</h1>
            <p className="mt-3 text-sm text-gray-600">
              You cancelled the payment. No charge was made. You can try again from Terminal shop.
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
          <Link
            href="/provider/settings/sales/terminal-shop"
            className="mt-6 inline-block text-pink-600 underline"
          >
            Back to Terminal shop
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="text-xl font-semibold text-gray-900">{headline}</h1>
      <p className="mt-3 text-sm text-gray-600">{message}</p>
      {!ready && <Loader2 className="mx-auto mt-6 h-5 w-5 animate-spin text-pink-600" />}
      {nativeContext && ready ? (
        <a
          href={returnToAppHref}
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-green-600 px-5 py-3 text-sm font-semibold text-white hover:bg-green-700"
        >
          Return to app
        </a>
      ) : null}
      {!nativeContext ? (
        <Link
          href="/provider/settings/sales/terminal-shop"
          className="mt-8 inline-flex items-center justify-center rounded-lg bg-pink-600 px-5 py-3 text-sm font-semibold text-white hover:bg-pink-700"
        >
          Open Terminal shop
        </Link>
      ) : null}
    </div>
  );
}

export default function TerminalPaymentReturnPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md px-6 py-16 text-center text-sm text-gray-500">Loading…</div>
      }
    >
      <TerminalPaymentReturnInner />
    </Suspense>
  );
}

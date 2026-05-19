"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle, XCircle, Loader2, ShoppingBag, RotateCcw } from "lucide-react";
import { verifyWithRetry } from "@/lib/payments/verify-with-retry";
import Link from "next/link";

function ProductPaymentCallbackInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [orderNumber, setOrderNumber] = useState("");

  useEffect(() => {
    let cancelled = false;

    const notifyWebView = (payload: Record<string, unknown>) => {
      if (typeof window === "undefined") return;
      const win = window as unknown as {
        ReactNativeWebView?: { postMessage: (s: string) => void };
      };
      if (!win.ReactNativeWebView?.postMessage) return;
      try {
        win.ReactNativeWebView.postMessage(JSON.stringify(payload));
      } catch {
        // ignore
      }
    };

    const verifyPayment = async () => {
      const reference = searchParams.get("reference");
      if (!reference) {
        if (!cancelled) {
          setStatus("error");
          setMessage("Payment reference not found");
          notifyWebView({ type: "checkout_failed", payment_type: "product_order", status: "failed" });
          // Auto-route to the shop after a few seconds so users are never
          // stuck on an actionless error state if they arrived here without
          // a reference (e.g. opened the bare URL or copied the wrong link).
          setTimeout(() => {
            if (!cancelled) router.replace("/shop");
          }, 3500);
        }
        return;
      }

      try {
        const result = await verifyWithRetry<{
          status?: string;
          type?: string;
          productOrderId?: string;
          orderNumber?: string;
          message?: string;
        }>(reference, { maxAttempts: 5, delayMs: 1500 });

        if (cancelled) return;

        if (result.status === "success") {
          setStatus("success");
          setOrderNumber(result.data?.orderNumber ?? "");
          setMessage("Payment successful! Your order has been confirmed.");

          notifyWebView({
            type: "checkout_success",
            payment_type: "product_order",
            status: "success",
          });

          setTimeout(() => {
            if (!cancelled) router.push("/account-settings/orders");
          }, 4000);
        } else if (result.status === "failed") {
          setStatus("error");
          setMessage(result.errorMessage || "Payment could not be confirmed.");
          notifyWebView({
            type: "checkout_failed",
            payment_type: "product_order",
            status: "failed",
            message: result.errorMessage || null,
          });
          // Auto-route back to orders so a definitive failure does not
          // strand the user on a manual-link-only screen.
          setTimeout(() => {
            if (!cancelled) router.replace("/account-settings/orders");
          }, 4000);
        } else {
          setStatus("success");
          setMessage(
            "We received your payment. Your order will appear in your orders shortly.",
          );
          notifyWebView({
            type: "checkout_pending",
            payment_type: "product_order",
            status: "pending",
          });
          setTimeout(() => {
            if (!cancelled) router.replace("/account-settings/orders");
          }, 4000);
        }
      } catch (error: unknown) {
        if (cancelled) return;
        setStatus("success");
        setMessage(
          error instanceof Error
            ? `We received your payment. ${error.message}`
            : "We received your payment. Please check your orders in a few minutes.",
        );
        notifyWebView({
          type: "checkout_pending",
          payment_type: "product_order",
          status: "pending",
        });
        setTimeout(() => {
          if (!cancelled) router.replace("/account-settings/orders");
        }, 4000);
      }
    };

    void verifyPayment();
    return () => {
      cancelled = true;
    };
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
        {status === "loading" && (
          <>
            <Loader2 className="w-16 h-16 text-pink-500 animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Verifying Payment</h2>
            <p className="text-gray-500">
              Please wait while we confirm your payment
              …
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Payment Successful!</h2>
            {orderNumber && (
              <p className="text-lg font-semibold text-pink-600 mb-2">Order #{orderNumber}</p>
            )}
            <p className="text-gray-500 mb-6">{message}</p>
            <p className="text-sm text-gray-400 mb-4">Redirecting to your orders…</p>
            <Link
              href="/account-settings/orders"
              className="inline-flex items-center gap-2 px-6 py-3 bg-pink-600 text-white rounded-xl font-medium hover:bg-pink-700 transition-colors"
            >
              <ShoppingBag className="w-4 h-4" />
              View My Orders
            </Link>
          </>
        )}

        {status === "error" && (
          <>
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-10 h-10 text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Payment Not Confirmed</h2>
            <p className="text-gray-500 mb-6">{message}</p>
            <p className="text-xs text-gray-400 mb-6">
              If your bank was debited, your order will be confirmed automatically within a few
              minutes. Check your orders page for updates.
            </p>
            <div className="flex gap-3 justify-center">
              <Link
                href="/shop"
                className="px-5 py-2.5 border border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50"
              >
                Back to Shop
              </Link>
              <Link
                href="/account-settings/orders"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-pink-600 text-white rounded-xl font-medium hover:bg-pink-700"
              >
                <RotateCcw className="w-4 h-4" />
                View Orders
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function ProductPaymentCallback() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-pink-500" />
        </div>
      }
    >
      <ProductPaymentCallbackInner />
    </Suspense>
  );
}

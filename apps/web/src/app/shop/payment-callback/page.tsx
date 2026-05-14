"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle, XCircle, Loader2, ShoppingBag, RotateCcw } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import Link from "next/link";

const MAX_RETRIES = 4;
const RETRY_DELAY_MS = 2500;

function ProductPaymentCallbackInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const verifyPayment = async (attempt: number) => {
      const reference = searchParams.get("reference");
      if (!reference) {
        if (!cancelled) {
          setStatus("error");
          setMessage("Payment reference not found");
        }
        return;
      }

      try {
        const response = await fetcher.get<{
          data: {
            status: string;
            type?: string;
            productOrderId?: string;
            orderNumber?: string;
            message?: string;
          };
        }>(`/api/paystack/verify?reference=${reference}`);

        if (cancelled) return;

        if (response.data.status === "success") {
          setStatus("success");
          setOrderNumber(response.data.orderNumber ?? "");
          setMessage("Payment successful! Your order has been confirmed.");

          // Notify customer app WebView so it can close and navigate to orders
          const win =
            typeof window !== "undefined"
              ? (window as unknown as { ReactNativeWebView?: { postMessage: (s: string) => void } })
              : null;
          if (win?.ReactNativeWebView?.postMessage) {
            try {
              win.ReactNativeWebView.postMessage(
                JSON.stringify({ type: "checkout_success", payment_type: "product_order" }),
              );
            } catch {
              // ignore
            }
          }

          setTimeout(() => {
            if (!cancelled) router.push("/account-settings/orders");
          }, 4000);
        } else if (response.data.status === "pending" && attempt < MAX_RETRIES) {
          // Paystack may briefly return pending before settling; retry.
          setTimeout(() => {
            if (!cancelled) {
              setRetryCount(attempt + 1);
              void verifyPayment(attempt + 1);
            }
          }, RETRY_DELAY_MS);
        } else {
          setStatus("error");
          setMessage(response.data.message || "Payment could not be confirmed.");
        }
      } catch (error: unknown) {
        if (cancelled) return;
        if (attempt < MAX_RETRIES) {
          setTimeout(() => {
            if (!cancelled) {
              setRetryCount(attempt + 1);
              void verifyPayment(attempt + 1);
            }
          }, RETRY_DELAY_MS);
        } else {
          setStatus("error");
          setMessage(
            error instanceof Error ? error.message : "Payment verification failed. Please check your orders.",
          );
        }
      }
    };

    void verifyPayment(0);
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
              {retryCount > 0 ? ` (attempt ${retryCount + 1}/${MAX_RETRIES + 1})` : "…"}
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

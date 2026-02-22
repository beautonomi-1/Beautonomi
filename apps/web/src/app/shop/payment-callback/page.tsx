"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle, XCircle, Loader2, ShoppingBag } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import Link from "next/link";

export default function ProductPaymentCallback() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [orderNumber, setOrderNumber] = useState("");

  useEffect(() => {
    const verifyPayment = async () => {
      const reference = searchParams.get("reference");
      if (!reference) {
        setStatus("error");
        setMessage("Payment reference not found");
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

        if (response.data.status === "success") {
          setStatus("success");
          setOrderNumber(response.data.orderNumber ?? "");
          setMessage("Payment successful! Your order has been confirmed.");

          setTimeout(() => {
            router.push("/account-settings/orders");
          }, 4000);
        } else {
          setStatus("error");
          setMessage(response.data.message || "Payment verification failed");
        }
      } catch (error: any) {
        setStatus("error");
        setMessage(error.message || "Payment verification failed");
      }
    };

    verifyPayment();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
        {status === "loading" && (
          <>
            <Loader2 className="w-16 h-16 text-pink-500 animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Verifying Payment</h2>
            <p className="text-gray-500">Please wait while we confirm your payment...</p>
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
            <p className="text-sm text-gray-400 mb-4">Redirecting to your orders...</p>
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
            <h2 className="text-xl font-bold text-gray-900 mb-2">Payment Failed</h2>
            <p className="text-gray-500 mb-6">{message}</p>
            <div className="flex gap-3 justify-center">
              <Link
                href="/shop"
                className="px-5 py-2.5 border border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50"
              >
                Back to Shop
              </Link>
              <Link
                href="/account-settings/orders"
                className="px-5 py-2.5 bg-pink-600 text-white rounded-xl font-medium hover:bg-pink-700"
              >
                View Orders
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

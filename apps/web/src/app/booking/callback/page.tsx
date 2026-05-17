"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { verifyWithRetry } from "@/lib/payments/verify-with-retry";

export default function PaymentCallback() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const verifyPayment = async () => {
      const reference = searchParams.get("reference") || searchParams.get("trxref");
      
      if (!reference) {
        setStatus("error");
        setMessage("Payment reference not found");
        return;
      }

      try {
        const response = await verifyWithRetry<{ status?: string; bookingId?: string }>(
          reference,
          { maxAttempts: 5, delayMs: 1500 },
        );

        if (response.status === "success") {
          setStatus("success");
          setMessage("Payment successful! Your booking is confirmed.");
          
          // Redirect to booking confirmation after 3 seconds
          setTimeout(() => {
            if (response.data?.bookingId) {
              router.push(
                `/checkout/success?booking_id=${encodeURIComponent(response.data.bookingId)}&reference=${encodeURIComponent(reference)}`,
              );
            } else {
              router.push(`/checkout/success?reference=${encodeURIComponent(reference)}`);
            }
          }, 3000);
        } else if (response.status === "failed") {
          setStatus("error");
          setMessage(response.errorMessage || "Payment verification failed");
        } else {
          setStatus("success");
          setMessage("Payment received. We are finalizing your booking now.");
          setTimeout(() => {
            router.push(`/checkout/success?reference=${encodeURIComponent(reference)}`);
          }, 2500);
        }
      } catch (error: any) {
        setStatus("success");
        setMessage(error.message || "Payment received. We are finalizing your booking now.");
        setTimeout(() => {
          router.push(`/checkout/success?reference=${encodeURIComponent(reference)}`);
        }, 2500);
      }
    };

    verifyPayment();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center"
      >
        {status === "loading" && (
          <>
            <Loader2 className="w-16 h-16 text-primary mx-auto mb-4 animate-spin" />
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              Verifying Payment
            </h2>
            <p className="text-gray-600">Please wait...</p>
          </>
        )}

        {status === "success" && (
          <>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
            >
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            </motion.div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              Payment Successful!
            </h2>
            <p className="text-gray-600 mb-6">{message}</p>
            <p className="text-sm text-gray-500">
              Redirecting to confirmation...
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              Payment Failed
            </h2>
            <p className="text-gray-600 mb-6">{message}</p>
            <Button
              onClick={() => router.push("/booking")}
              className="bg-primary hover:bg-primary-hover"
            >
              Try Again
            </Button>
          </>
        )}
      </motion.div>
    </div>
  );
}

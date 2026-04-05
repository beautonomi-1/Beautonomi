"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import AuthGuard from "@/components/auth/auth-guard";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Loader2 } from "lucide-react";

/**
 * Public entry for “pay this booking” (email/SMS/push from send-payment-link).
 * Authenticated customer → POST /api/me/bookings/[id]/pay-remaining → redirect to Paystack.
 */
export default function BookingPayPage() {
  const params = useParams();
  const bookingId = params.id as string;
  const [phase, setPhase] = useState<"starting" | "error">("starting");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const redirectPath =
    typeof bookingId === "string" ? `/bookings/${bookingId}/pay` : "/bookings";

  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;

    async function startPay() {
      setPhase("starting");
      setErrorMsg(null);
      try {
        const res = await fetcher.post<{
          data?: { authorization_url?: string };
          error?: unknown;
        }>(`/api/me/bookings/${bookingId}/pay-remaining`, {}, { timeoutMs: 45000 });

        const url = res?.data?.authorization_url;
        if (!url || typeof url !== "string") {
          throw new Error("Payment could not be started. Please try again from your bookings list.");
        }
        if (!cancelled) {
          window.location.href = url;
        }
      } catch (e) {
        if (cancelled) return;
        setPhase("error");
        setErrorMsg(
          e instanceof FetchError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Could not start payment."
        );
      }
    }

    startPay();
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  return (
    <AuthGuard redirectTo={redirectPath}>
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-12">
        {phase === "starting" && (
          <div className="flex flex-col items-center gap-4 max-w-md text-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden />
            <p className="text-lg font-medium text-gray-900">Starting secure payment…</p>
            <p className="text-sm text-gray-600">
              You will be redirected to Paystack. If nothing happens, open your booking and use Pay
              from there.
            </p>
          </div>
        )}

        {phase === "error" && (
          <div className="max-w-md text-center space-y-4">
            <p className="text-red-600 font-medium">{errorMsg}</p>
            <p className="text-sm text-gray-600">
              You can also complete payment from your account bookings page.
            </p>
            <Button asChild>
              <Link href={`/account-settings/bookings/${bookingId}`}>View booking</Link>
            </Button>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}

"use client";

import { useParams } from "next/navigation";
import AuthGuard from "@/components/auth/auth-guard";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { PayRemainingCheckout } from "@/components/checkout/PayRemainingCheckout";

/**
 * Public entry for “pay this booking” (email/SMS/push from send-payment-link).
 */
export default function BookingPayPage() {
  const params = useParams();
  const bookingId = params.id as string;
  const paymentLinkEnabled = useFeatureFlag("payment_link");

  const redirectPath =
    typeof bookingId === "string" ? `/bookings/${bookingId}/pay` : "/bookings";

  if (!paymentLinkEnabled) {
    return (
      <AuthGuard redirectTo={redirectPath}>
        <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-12">
          <div className="max-w-md text-center space-y-4">
            <p className="text-lg font-medium text-gray-900">Payment link unavailable</p>
            <p className="text-sm text-gray-600">
              This payment method is currently unavailable. You can pay from your bookings page.
            </p>
            <Button asChild>
              <Link href={`/account-settings/bookings/${bookingId}`}>Pay from your booking</Link>
            </Button>
          </div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard redirectTo={redirectPath}>
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-8">
        <PayRemainingCheckout bookingId={bookingId} autoStart={false} />
        <Button variant="link" asChild className="mt-4">
          <Link href={`/account-settings/bookings/${bookingId}`}>View booking details</Link>
        </Button>
      </div>
    </AuthGuard>
  );
}

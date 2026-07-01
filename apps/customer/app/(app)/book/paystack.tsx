/**
 * Paystack redirect target for normal booking payments.
 * Deep-link URL: `ExpoLinking.createURL("book/paystack")`.
 *
 * All verify / state-machine / button logic lives in PaystackReturnScreen.
 * This file is a thin config wrapper so Expo Router registers the route.
 */
import { PaystackReturnScreen } from "@/components/payment/PaystackReturnScreen";
import type { RouteTarget } from "@/lib/payments/resolvePaystackVerifyRoute";

function resolveBookingTarget(verifyData: unknown): RouteTarget | null {
  let cur: unknown = verifyData;
  for (let depth = 0; depth < 5 && cur && typeof cur === "object"; depth++) {
    const o = cur as Record<string, unknown>;
    const bookingId =
      (typeof o.bookingId === "string" && o.bookingId.trim()) ||
      (typeof o.booking_id === "string" && o.booking_id.trim());
    if (bookingId) {
      return { pathname: "/(app)/booking-detail", params: { id: bookingId } };
    }
    cur = o.data;
  }
  return null;
}

const FALLBACK: RouteTarget = { pathname: "/(app)/(tabs)/bookings" };

export default function BookPaystackReturnScreen() {
  return (
    <PaystackReturnScreen
      resolveTarget={resolveBookingTarget}
      cancelledRoute={FALLBACK}
      fallbackRoute={FALLBACK}
      labels={{
        verifying: "Confirming your payment…",
        returning: "Returning to bookings…",
        fallbackCta: "Go to Bookings",
        continueCta: "View booking",
      }}
    />
  );
}

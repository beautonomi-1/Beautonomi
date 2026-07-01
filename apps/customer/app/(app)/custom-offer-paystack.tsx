/**
 * Paystack redirect target for custom-offer payments.
 * Deep-link URL: `ExpoLinking.createURL("custom-offer-paystack")`.
 *
 * Custom offers finalize into a booking, so we resolve to booking-detail
 * when a bookingId (or booking_id) is present in the verify payload.
 *
 * All verify / state-machine / button logic lives in PaystackReturnScreen.
 */
import { PaystackReturnScreen } from "@/components/payment/PaystackReturnScreen";
import type { RouteTarget } from "@/lib/payments/resolvePaystackVerifyRoute";

function resolveCustomOfferTarget(verifyData: unknown): RouteTarget | null {
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

export default function CustomOfferPaystackReturnScreen() {
  return (
    <PaystackReturnScreen
      resolveTarget={resolveCustomOfferTarget}
      cancelledRoute={FALLBACK}
      fallbackRoute={FALLBACK}
      labels={{
        verifying: "Confirming your payment…",
        returning: "Returning to bookings…",
        fallbackCta: "Go to Bookings",
        continueCta: "View booking",
      }}
      slowHint="This is taking a little longer than expected. You can keep using the app — we'll confirm with your bank and update your booking shortly."
    />
  );
}

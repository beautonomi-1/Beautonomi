/**
 * Generic / cold-start Paystack return target.
 *
 * Handles deep links that arrive when the app was killed during checkout
 * (e.g. gift-card, membership, wallet-top-up, ads-budget, or any payment
 * type not covered by a flow-specific route).
 *
 * `resolvePaystackVerifyRoute` maps the full verify payload to the right
 * in-app tab / detail screen for every known payment type.
 *
 * All verify / state-machine / button logic lives in PaystackReturnScreen.
 */
import { PaystackReturnScreen } from "@/components/payment/PaystackReturnScreen";
import { resolvePaystackVerifyRoute } from "@/lib/payments/resolvePaystackVerifyRoute";

const FALLBACK = { pathname: "/(app)/(tabs)/bookings" } as const;

export default function PaystackCallbackScreen() {
  return (
    <PaystackReturnScreen
      resolveTarget={resolvePaystackVerifyRoute}
      cancelledRoute={FALLBACK}
      fallbackRoute={FALLBACK}
      labels={{
        verifying: "Finalizing payment…",
        returning: "Back to app…",
        fallbackCta: "Back to app",
        continueCta: "Continue",
      }}
    />
  );
}

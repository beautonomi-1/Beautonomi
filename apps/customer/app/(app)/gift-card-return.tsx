/**
 * Paystack redirect target for gift-card purchases.
 * Deep-link URL: `ExpoLinking.createURL("gift-card-return")`.
 *
 * Cold-start safe — all verify / state-machine / button logic lives in
 * PaystackReturnScreen. Previous flow used account-settings/payments as
 * callback which had no cold-start handling.
 */
import { PaystackReturnScreen } from "@/components/payment/PaystackReturnScreen";
import type { RouteTarget } from "@/lib/payments/resolvePaystackVerifyRoute";

const FALLBACK: RouteTarget = { pathname: "/(app)/(tabs)/explore" };

export default function GiftCardPaystackReturnScreen() {
  return (
    <PaystackReturnScreen
      resolveTarget={() => ({ pathname: "/(app)/account-settings/payments" } as RouteTarget)}
      cancelledRoute={FALLBACK}
      fallbackRoute={FALLBACK}
      labels={{
        verifying: "Confirming your gift card purchase…",
        returning: "Returning to explore…",
        fallbackCta: "Go to Explore",
        continueCta: "View payments",
      }}
      pendingSubtext="Your gift card may take a moment to appear. Check Payments in your account."
      failedSubtext="Gift card payment did not complete. You can retry the purchase."
    />
  );
}

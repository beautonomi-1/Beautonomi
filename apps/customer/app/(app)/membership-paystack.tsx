/**
 * Paystack redirect target for membership purchases.
 * Deep-link URL: `ExpoLinking.createURL("membership-paystack")`.
 *
 * All verify / state-machine / button logic lives in PaystackReturnScreen.
 * This file is a thin config wrapper so Expo Router registers the route.
 */
import { PaystackReturnScreen } from "@/components/payment/PaystackReturnScreen";
import type { RouteTarget } from "@/lib/payments/resolvePaystackVerifyRoute";

const MEMBERSHIP_ROUTE: RouteTarget = {
  pathname: "/(app)/account-settings/membership",
};
const FALLBACK: RouteTarget = { pathname: "/(app)/(tabs)/explore" };

export default function MembershipPaystackReturnScreen() {
  return (
    <PaystackReturnScreen
      resolveTarget={() => MEMBERSHIP_ROUTE}
      cancelledRoute={FALLBACK}
      fallbackRoute={FALLBACK}
      labels={{
        verifying: "Confirming your membership…",
        returning: "Returning to explore…",
        fallbackCta: "Go to Explore",
        continueCta: "View membership",
      }}
      pendingSubtext="Your membership may take a moment to activate. Check Membership in your account."
      failedSubtext="Membership payment did not complete. You can retry from the provider profile."
    />
  );
}

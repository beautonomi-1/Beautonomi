/**
 * Paystack redirect target for payment-method card verification.
 * Deep-link URL: `ExpoLinking.createURL("payments-return")`.
 *
 * Cold-start safe — all verify / state-machine / button logic lives in
 * PaystackReturnScreen. Previous flow used account-settings/payments as
 * callback but that screen had no cold-start handling for reference params.
 */
import { PaystackReturnScreen } from "@/components/payment/PaystackReturnScreen";
import type { RouteTarget } from "@/lib/payments/resolvePaystackVerifyRoute";

const PAYMENTS_ROUTE: RouteTarget = { pathname: "/(app)/account-settings/payments" };
const FALLBACK: RouteTarget = { pathname: "/(app)/(tabs)/explore" };

export default function PaymentsPaystackReturnScreen() {
  return (
    <PaystackReturnScreen
      resolveTarget={() => PAYMENTS_ROUTE}
      cancelledRoute={PAYMENTS_ROUTE}
      fallbackRoute={FALLBACK}
      labels={{
        verifying: "Verifying your payment method…",
        returning: "Returning to payments…",
        fallbackCta: "Go to Payments",
        continueCta: "View payments",
      }}
    />
  );
}

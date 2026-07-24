/**
 * Paystack redirect target for wallet top-up payments.
 * Deep-link URL: `ExpoLinking.createURL("wallet-return")`.
 *
 * Cold-start safe — all verify / state-machine / button logic lives in
 * PaystackReturnScreen. Previous flow used account-settings/wallet as
 * callback but that screen had no cold-start handling for reference params.
 */
import { PaystackReturnScreen } from "@/components/payment/PaystackReturnScreen";
import type { RouteTarget } from "@/lib/payments/resolvePaystackVerifyRoute";

const WALLET_ROUTE: RouteTarget = { pathname: "/(app)/account-settings/wallet" };
const FALLBACK: RouteTarget = { pathname: "/(app)/(tabs)/explore" };

export default function WalletPaystackReturnScreen() {
  return (
    <PaystackReturnScreen
      resolveTarget={() => WALLET_ROUTE}
      cancelledRoute={WALLET_ROUTE}
      fallbackRoute={FALLBACK}
      labels={{
        verifying: "Confirming your wallet top-up…",
        returning: "Returning to wallet…",
        fallbackCta: "Go to Wallet",
        continueCta: "View wallet",
      }}
      pendingSubtext="Your wallet balance will update shortly. Check Wallet if it does not change in a minute."
      failedSubtext="No wallet credit was completed. You can retry from Wallet."
    />
  );
}

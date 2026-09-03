import { EVENT_APPLE_IAP_VERIFIED } from "./types";
import { trackMoneyEventServer } from "./track-money-event-server";

/**
 * Apple IAP receipt verified server-side. Reference = Apple `transactionId` so retries of the
 * verify endpoint (and App Store Server Notifications) collapse into one event.
 */
export async function trackAppleIapVerifiedServer(params: {
  transactionId: string;
  originalTransactionId?: string | null;
  productId: string;
  amount: number;
  currency?: string | null;
  userId?: string | null;
  portal?: "client" | "provider";
}): Promise<void> {
  await trackMoneyEventServer(EVENT_APPLE_IAP_VERIFIED, {
    reference: params.transactionId,
    amount: params.amount,
    currency: params.currency,
    userId: params.userId,
    portal: params.portal ?? "provider",
    paymentMethod: "apple_iap",
    paymentProvider: "apple",
    revenueType: "apple_iap",
    productId: params.productId,
    properties: {
      product_id: params.productId,
      original_transaction_id: params.originalTransactionId ?? undefined,
    },
  });
}

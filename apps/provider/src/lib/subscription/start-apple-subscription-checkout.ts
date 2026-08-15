import {
  eligibleSignedOfferIds,
  fetchAppleStoreProducts,
  purchaseAppleProduct,
} from "@/lib/iap/apple-iap";
import { shouldUseAppleIap } from "@/lib/iap/platform";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import type { BillingPeriod } from "@/lib/subscription/start-paid-checkout";

export type AppleSubscriptionCheckoutResult =
  | { ok: true; alreadyActive?: boolean }
  | { ok: false; cancelled?: boolean; error: string; errorCode?: string | null };

/**
 * Start paid subscription checkout via StoreKit on iOS.
 *
 * Does not call `/subscription/upgrade` — that path is Paystack and would
 * double-charge an Apple-billed account. Entitlement is written only after
 * `POST /api/provider/iap/verify` accepts the signed transaction.
 */
export async function startAppleSubscriptionCheckout(options: {
  subscriptionPlanId: string;
  billingPeriod: BillingPeriod;
  appleProductId: string;
  providerId: string;
  /** App Store Connect promotional offer id only. Intro applies automatically; win-back is presented by the App Store. */
  offerId?: string;
}): Promise<AppleSubscriptionCheckoutResult> {
  if (!shouldUseAppleIap()) {
    return { ok: false, error: "Apple IAP is only available on iOS." };
  }

  let withOffer:
    | {
        identifier: string;
        keyIdentifier: string;
        nonce: string;
        signature: string;
        timestamp: number;
      }
    | undefined;
  const products = await fetchAppleStoreProducts([options.appleProductId]);
  const promoIds = eligibleSignedOfferIds(products[0]);
  const requestedOfferId = options.offerId?.trim() || "";
  let offerId = "";
  if (requestedOfferId) {
    if (promoIds.includes(requestedOfferId)) {
      offerId = requestedOfferId;
    }
    // Intro and win-back must not be signed as promotional discounts.
  } else {
    offerId = promoIds[0] ?? "";
  }
  if (offerId) {
    const signed = await api.get<{
      offer?: {
        identifier: string;
        keyIdentifier: string;
        nonce: string;
        signature: string;
        timestamp: number;
      };
    }>(
      `/api/provider/iap/offer-signature?product_id=${encodeURIComponent(options.appleProductId)}&offer_id=${encodeURIComponent(offerId)}`,
    );
    if (signed.error || !signed.data?.offer) {
      if (options.offerId?.trim()) {
        return {
          ok: false,
          error: getApiErrorMessage(signed.error, "Could not sign this App Store offer"),
        };
      }
      // Eligible StoreKit offers are best-effort — still purchase the base product.
    } else {
      withOffer = signed.data.offer;
    }
  }

  const purchase = await purchaseAppleProduct({
    productId: options.appleProductId,
    appAccountToken: options.providerId,
    kind: "subscription",
    withOffer,
  });

  if (!purchase.ok) {
    return {
      ok: false,
      cancelled: purchase.cancelled,
      error: purchase.error,
    };
  }

  return { ok: true };
}

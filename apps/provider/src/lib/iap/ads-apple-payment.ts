import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  purchaseAppleProduct,
  type ApplePurchaseResult,
} from "@/lib/iap/apple-iap";
import { shouldUseAppleIap } from "@/lib/iap/platform";

type AdsAppleCreateBody = {
  campaign?: { id?: string };
  requires_payment?: boolean;
  payment_provider?: string;
  order_id?: string;
  apple_product_id?: string | null;
};

export async function createAdsCampaignWithApplePayment(
  payload: Record<string, unknown>,
): Promise<
  ApplePurchaseResult & { campaignId?: string; orderId?: string }
> {
  if (!shouldUseAppleIap()) {
    return { ok: false, error: "Apple IAP is only available on iOS." };
  }

  const res = await api.post<AdsAppleCreateBody>("/api/provider/ads/campaigns", {
    ...payload,
    payment_provider: "apple",
  });
  if (res.error) {
    return { ok: false, error: getApiErrorMessage(res.error, "Failed to create campaign") };
  }

  const data = res.data;
  const orderId = typeof data?.order_id === "string" ? data.order_id : null;
  const appleProductId =
    typeof data?.apple_product_id === "string" ? data.apple_product_id : null;
  const campaignId =
    typeof data?.campaign?.id === "string" ? data.campaign.id : undefined;

  if (!orderId || !appleProductId) {
    return { ok: false, error: "Server did not return Apple payment details." };
  }

  const purchase = await purchaseAppleProduct({
    productId: appleProductId,
    appAccountToken: orderId,
    kind: "inapp",
  });

  if (!purchase.ok) {
    return { ...purchase, campaignId, orderId };
  }
  return { ...purchase, campaignId, orderId };
}

/**
 * Re-opens StoreKit for an unpaid draft campaign. iOS must never fall back to
 * Paystack for digital ads packs (Guideline 3.1.1).
 */
export async function retryAdsCampaignWithApplePayment(
  campaignId: string,
): Promise<ApplePurchaseResult & { campaignId?: string; orderId?: string }> {
  if (!shouldUseAppleIap()) {
    return { ok: false, error: "Apple IAP is only available on iOS." };
  }

  const res = await api.post<AdsAppleCreateBody>(
    `/api/provider/ads/campaigns/${campaignId}/checkout`,
    { payment_provider: "apple" },
  );
  if (res.error) {
    return { ok: false, error: getApiErrorMessage(res.error, "Failed to restart App Store payment") };
  }

  const data = res.data;
  const orderId = typeof data?.order_id === "string" ? data.order_id : null;
  const appleProductId =
    typeof data?.apple_product_id === "string" ? data.apple_product_id : null;

  if (!orderId || !appleProductId) {
    return { ok: false, error: "This ads pack is not available as an App Store purchase." };
  }

  const purchase = await purchaseAppleProduct({
    productId: appleProductId,
    appAccountToken: orderId,
    kind: "inapp",
  });

  if (!purchase.ok) {
    return { ...purchase, campaignId, orderId };
  }
  return { ...purchase, campaignId, orderId };
}

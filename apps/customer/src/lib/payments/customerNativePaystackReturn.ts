import * as ExpoLinking from "expo-linking";

/** Expo deep link used as `WebBrowser.openAuthSessionAsync` returnUrl on native. */
export function getNativePaystackReturnUrl(expoPath: string): string {
  const path = expoPath.replace(/^\//, "");
  return ExpoLinking.createURL(path);
}

export const CUSTOMER_NATIVE_PAYSTACK_PATHS = {
  booking: "book/paystack",
  shop: "shop/paystack",
  membership: "membership-paystack",
  wallet: "wallet-return",
  giftCard: "gift-card-return",
  addCard: "payments-return",
  customOffer: "custom-offer-paystack",
  legacyCallback: "paystack-callback",
} as const;

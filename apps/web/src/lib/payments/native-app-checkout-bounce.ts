/**
 * HTTPS → native app scheme redirects after hosted checkout (Paystack / Stripe).
 * Paystack/Stripe always redirect to HTTPS; mobile auth sessions complete on `customer://` / `provider://`.
 */

const CUSTOMER_SCHEME = "customer";
const PROVIDER_SCHEME = "provider";

export function isCustomerNativeAppContext(context: string | null | undefined): boolean {
  return context === "app";
}

export function isProviderNativeAppContext(context: string | null | undefined): boolean {
  return context === "app" || context === "provider_inapp";
}

export function isProviderInAppQuery(params: URLSearchParams): boolean {
  return (
    params.get("in_app") === "1" ||
    isProviderNativeAppContext(params.get("context"))
  );
}

/** Copy query params for bounce (strip context flags that are only for the web bridge). */
export function searchParamsForNativeBounce(params: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams(params.toString());
  out.delete("context");
  return out;
}

function buildSchemeUrl(scheme: string, path: string, params: URLSearchParams): string {
  const normalized = path.replace(/^\/+/, "");
  const qs = params.toString();
  return `${scheme}://${normalized}${qs ? `?${qs}` : ""}`;
}

export function buildCustomerAppDeepLink(expoPath: string, params: URLSearchParams): string {
  return buildSchemeUrl(CUSTOMER_SCHEME, expoPath, params);
}

export function buildProviderAppDeepLink(path: string, params: URLSearchParams): string {
  return buildSchemeUrl(PROVIDER_SCHEME, path, params);
}

/**
 * Resolve customer HTTPS landing → `customer://` deep link, or null if browser-only visit.
 */
export function resolveCustomerNativeBouncePath(pathname: string, params: URLSearchParams): string | null {
  if (!isCustomerNativeAppContext(params.get("context"))) return null;

  const q = searchParamsForNativeBounce(params);
  const paymentType = params.get("payment_type");

  if (pathname.includes("/checkout/cancelled")) {
    if (paymentType === "custom_offer") return buildCustomerAppDeepLink("custom-offer-paystack", q);
    if (paymentType === "membership") return buildCustomerAppDeepLink("membership-paystack", q);
    if (paymentType === "wallet_topup") return buildCustomerAppDeepLink("wallet-return", q);
    return buildCustomerAppDeepLink("book/paystack", q);
  }

  if (pathname.includes("/checkout/success")) {
    if (paymentType === "custom_offer") return buildCustomerAppDeepLink("custom-offer-paystack", q);
    if (paymentType === "wallet_topup") return buildCustomerAppDeepLink("wallet-return", q);
    if (paymentType === "membership") return buildCustomerAppDeepLink("membership-paystack", q);
    return buildCustomerAppDeepLink("book/paystack", q);
  }

  if (pathname.includes("/shop/payment-callback") || pathname.includes("/shop/cancelled")) {
    return buildCustomerAppDeepLink("shop/paystack", q);
  }

  if (pathname.includes("/account-settings/wallet")) {
    return buildCustomerAppDeepLink("wallet-return", q);
  }

  if (pathname.includes("/gift-card/purchase/success")) {
    return buildCustomerAppDeepLink("gift-card-return", q);
  }

  if (pathname.includes("/account-settings/payments")) {
    return buildCustomerAppDeepLink("payments-return", q);
  }

  const bookingCallbackMatch = pathname.match(/\/account-settings\/bookings\/([^/]+)\/payment-callback/);
  if (bookingCallbackMatch) {
    if (!q.get("booking_id")) q.set("booking_id", bookingCallbackMatch[1]);
    return buildCustomerAppDeepLink("book/paystack", q);
  }

  return null;
}

/**
 * Resolve provider HTTPS landing → `provider://` deep link, or null if browser-only visit.
 */
export function resolveProviderNativeBouncePath(pathname: string, params: URLSearchParams): string | null {
  if (!isProviderInAppQuery(params)) return null;

  const q = searchParamsForNativeBounce(params);

  if (pathname.includes("/provider/settings/ads/payment-return")) {
    return buildProviderAppDeepLink("settings/ads-payment-return", q);
  }

  if (pathname.includes("/provider/settings/sales/terminal-payment-return")) {
    return buildProviderAppDeepLink("settings/terminal-payment-return", q);
  }

  if (pathname.endsWith("/provider/subscription") || pathname.includes("/provider/subscription")) {
    if (
      params.get("payment_success") === "true" ||
      params.get("payment_cancelled") === "1" ||
      params.get("order_id")
    ) {
      return buildProviderAppDeepLink("settings/subscription-payment-return", q);
    }
  }

  if (pathname.includes("/provider/settings/billing")) {
    return buildProviderAppDeepLink("settings/billing-payment-return", q);
  }

  if (pathname.includes("/provider/settings/marketing-integrations")) {
    if (params.get("topup") === "success" || params.get("payment_type") === "marketing_topup") {
      return buildProviderAppDeepLink("settings/marketing-integrations", q);
    }
  }

  return null;
}

export function tryNativeAppCheckoutBounce(pathname: string, search: string): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return (
    resolveCustomerNativeBouncePath(pathname, params) ??
    resolveProviderNativeBouncePath(pathname, params)
  );
}

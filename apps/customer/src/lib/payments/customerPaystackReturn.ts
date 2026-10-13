/**
 * HTTPS Paystack return URLs for customer mobile (auth-session prefix contract).
 * Server sends the same path on Paystack callback_url; mobile `returnUrl` must share that prefix.
 */
import { Platform } from "react-native";
import { getWebCustomerBaseUrl } from "@/lib/web-url";
import { CUSTOMER_NATIVE_PAYSTACK_PATHS } from "@/lib/payments/customerNativePaystackReturn";

const trimSlash = (s: string) => s.replace(/\/$/, "");

export const CHECKOUT_SUCCESS_PATH = "/checkout/success";
export const CHECKOUT_CANCELLED_PATH = "/checkout/cancelled";
export const SHOP_PAYMENT_CALLBACK_PATH = "/shop/payment-callback";
export const GIFT_CARD_SUCCESS_PATH = "/gift-card/purchase/success";
export const ACCOUNT_PAYMENTS_PATH = "/account-settings/payments";

export function getCustomerPaystackReturnBaseUrl(): string {
  return trimSlash(getWebCustomerBaseUrl());
}

/** Prefix URL for `WebBrowser.openAuthSessionAsync` (no volatile query params). */
export function paystackAuthSessionReturnPrefix(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${getCustomerPaystackReturnBaseUrl()}${p}`;
}

export function getCustomerPaystackAuthReturnUrl(
  path: string,
  query?: Record<string, string | undefined | null>,
): string {
  const base = paystackAuthSessionReturnPrefix(path);
  const params = new URLSearchParams();
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v != null && String(v).trim() !== "") params.set(k, String(v).trim());
    }
  }
  if (Platform.OS !== "web") {
    params.set("context", "app");
  }
  return `${base}?${params.toString()}`;
}

export { getNativePaystackReturnUrl, CUSTOMER_NATIVE_PAYSTACK_PATHS } from "@/lib/payments/customerNativePaystackReturn";

export function getBookingCheckoutPaystackAuthPrefix(): string {
  return paystackAuthSessionReturnPrefix(CHECKOUT_SUCCESS_PATH);
}

export function getShopProductPaystackAuthPrefix(): string {
  return paystackAuthSessionReturnPrefix(SHOP_PAYMENT_CALLBACK_PATH);
}

export function getWalletTopupPaystackAuthPrefix(): string {
  return paystackAuthSessionReturnPrefix(CHECKOUT_SUCCESS_PATH);
}

export function getGiftCardPurchasePaystackAuthPrefix(): string {
  return paystackAuthSessionReturnPrefix(GIFT_CARD_SUCCESS_PATH);
}

export function getCardVerificationPaystackAuthPrefix(): string {
  return paystackAuthSessionReturnPrefix(ACCOUNT_PAYMENTS_PATH);
}

export function getBookingPaymentCallbackAuthPrefix(bookingId: string): string {
  return paystackAuthSessionReturnPrefix(
    `/account-settings/bookings/${encodeURIComponent(bookingId)}/payment-callback`,
  );
}

function tryParseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function pathnameIncludes(url: URL, path: string): boolean {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return url.pathname === normalized || url.pathname.endsWith(normalized);
}

/** `customer://book/paystack` → route segment `book/paystack`. */
function customerAppRoutePath(url: URL): string | null {
  if (url.protocol !== "customer:") return null;
  const route = `${url.hostname}${url.pathname}`.replace(/\/+$/, "");
  return route || null;
}

function matchesCustomerNativeRoute(url: URL, routePath: string): boolean {
  const route = customerAppRoutePath(url);
  if (!route) return false;
  const expected = routePath.replace(/^\//, "");
  return route === expected || route.endsWith(`/${expected}`) || route.endsWith(expected);
}

export function matchesCheckoutSuccessReturnUrl(
  url: string,
  opts?: { bookingId?: string; paymentType?: string },
): boolean {
  const u = tryParseUrl(url);
  if (!u) return false;
  const nativeBooking =
    matchesCustomerNativeRoute(u, CUSTOMER_NATIVE_PAYSTACK_PATHS.booking) ||
    matchesCustomerNativeRoute(u, CUSTOMER_NATIVE_PAYSTACK_PATHS.membership) ||
    matchesCustomerNativeRoute(u, CUSTOMER_NATIVE_PAYSTACK_PATHS.customOffer) ||
    matchesCustomerNativeRoute(u, CUSTOMER_NATIVE_PAYSTACK_PATHS.wallet);
  const httpsSuccess = pathnameIncludes(u, CHECKOUT_SUCCESS_PATH);
  if (!httpsSuccess && !nativeBooking) return false;
  if (opts?.bookingId && u.searchParams.get("booking_id") !== opts.bookingId) return false;
  if (opts?.paymentType && u.searchParams.get("payment_type") !== opts.paymentType) return false;
  return true;
}

export function matchesShopPaymentCallbackReturnUrl(url: string): boolean {
  const u = tryParseUrl(url);
  if (!u) return false;
  return (
    pathnameIncludes(u, SHOP_PAYMENT_CALLBACK_PATH) ||
    matchesCustomerNativeRoute(u, CUSTOMER_NATIVE_PAYSTACK_PATHS.shop)
  );
}

export function matchesGiftCardPurchaseSuccessReturnUrl(url: string): boolean {
  const u = tryParseUrl(url);
  if (!u) return false;
  return (
    pathnameIncludes(u, GIFT_CARD_SUCCESS_PATH) ||
    matchesCustomerNativeRoute(u, CUSTOMER_NATIVE_PAYSTACK_PATHS.giftCard)
  );
}

export function matchesAccountPaymentsReturnUrl(url: string): boolean {
  const u = tryParseUrl(url);
  if (!u) return false;
  return (
    pathnameIncludes(u, ACCOUNT_PAYMENTS_PATH) ||
    matchesCustomerNativeRoute(u, CUSTOMER_NATIVE_PAYSTACK_PATHS.addCard)
  );
}

export function matchesBookingPaymentCallbackReturnUrl(url: string, bookingId: string): boolean {
  const u = tryParseUrl(url);
  if (!u) return false;
  const expected = `/account-settings/bookings/${encodeURIComponent(bookingId)}/payment-callback`;
  const httpsMatch = u.pathname === expected || u.pathname.endsWith(expected);
  const nativeMatch =
    matchesCustomerNativeRoute(u, CUSTOMER_NATIVE_PAYSTACK_PATHS.booking) &&
    u.searchParams.get("booking_id") === bookingId;
  return httpsMatch || nativeMatch;
}

/** Auth-session success: redirect shares path prefix with `returnUrl`. */
export function matchesPaystackAuthSessionReturn(url: string, returnUrlPrefix: string): boolean {
  if (!url || !returnUrlPrefix) return false;
  if (url === returnUrlPrefix || url.startsWith(`${returnUrlPrefix}?`) || url.startsWith(`${returnUrlPrefix}#`)) {
    return true;
  }
  const u = tryParseUrl(url);
  const r = tryParseUrl(returnUrlPrefix);
  if (!u || !r) return false;
  if (u.protocol === "customer:" && r.protocol === "customer:") {
    const ur = customerAppRoutePath(u);
    const rr = customerAppRoutePath(r);
    return Boolean(ur && rr && ur === rr);
  }
  return u.origin === r.origin && u.pathname === r.pathname;
}

/**
 * expo-router `redirectSystemPath`: map HTTPS App Links and `customer://` payment
 * returns to in-app cold-start screens (mirrors web NativeAppCheckoutBounce targets).
 */

type RedirectSystemPathParams = {
  path: string;
  initial: boolean;
};

function withQuery(targetPath: string, search: string): string {
  const q = search.startsWith("?") ? search : search ? `?${search}` : "";
  return `${targetPath}${q}`;
}

function parseSafe(url: string): { pathname: string; search: string; host: string } {
  try {
    const u = new URL(url);
    return { pathname: u.pathname, search: u.search, host: u.host };
  } catch {
    return { pathname: url, search: "", host: "" };
  }
}

function bookingPaystackRoute(search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const paymentType = params.get("payment_type");
  if (paymentType === "custom_offer") {
    return withQuery("/(app)/custom-offer-paystack", search);
  }
  if (paymentType === "membership") {
    return withQuery("/(app)/membership-paystack", search);
  }
  if (paymentType === "wallet_topup") {
    return withQuery("/(app)/wallet-return", search);
  }
  return withQuery("/(app)/book/paystack", search);
}

export function redirectSystemPath({ path }: RedirectSystemPathParams): string {
  try {
    const isAbsoluteUrl =
      /^https?:\/\//i.test(path) || /^customer:\/\//i.test(path) || /^exp:\/\//i.test(path);
    const { pathname, search, host } = isAbsoluteUrl
      ? parseSafe(path)
      : {
          pathname: path.split("?")[0],
          search: path.includes("?") ? path.slice(path.indexOf("?")) : "",
          host: "",
        };

    // Deep links: customer://book/paystack, customer://shop/paystack, …
    if (host === "book" && pathname.includes("paystack")) {
      return withQuery("/(app)/book/paystack", search);
    }
    if (host === "shop" && pathname.includes("paystack")) {
      return withQuery("/(app)/shop/paystack", search);
    }
    if (pathname.includes("membership-paystack") || (host && host.includes("membership"))) {
      return withQuery("/(app)/membership-paystack", search);
    }
    if (pathname.includes("custom-offer-paystack")) {
      return withQuery("/(app)/custom-offer-paystack", search);
    }
    if (pathname.includes("wallet-return") || (host === "wallet-return")) {
      return withQuery("/(app)/wallet-return", search);
    }
    if (pathname.includes("gift-card-return")) {
      return withQuery("/(app)/gift-card-return", search);
    }
    if (pathname.includes("payments-return")) {
      return withQuery("/(app)/payments-return", search);
    }
    if (pathname.includes("paystack-callback")) {
      return withQuery("/(app)/paystack-callback", search);
    }

    // HTTPS checkout success / cancel (Paystack callback landings)
    if (pathname.includes("/checkout/success") || pathname.includes("/checkout/cancelled")) {
      return bookingPaystackRoute(search);
    }

    if (pathname.includes("/shop/payment-callback") || pathname.includes("/shop/cancelled")) {
      return withQuery("/(app)/shop/paystack", search);
    }

    if (pathname.includes("/account-settings/wallet")) {
      return withQuery("/(app)/wallet-return", search);
    }

    if (pathname.includes("/gift-card/purchase/success")) {
      return withQuery("/(app)/gift-card-return", search);
    }

    if (pathname.includes("/account-settings/payments")) {
      return withQuery("/(app)/payments-return", search);
    }

    const bookingCallbackMatch = pathname.match(
      /\/account-settings\/bookings\/([^/]+)\/payment-callback/,
    );
    if (bookingCallbackMatch) {
      const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
      if (!params.get("booking_id")) {
        params.set("booking_id", bookingCallbackMatch[1]);
      }
      const q = params.toString();
      return withQuery("/(app)/book/paystack", q ? `?${q}` : "");
    }

    if (pathname === "/booking" || pathname.startsWith("/booking/")) {
      const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
      const slug = params.get("slug");
      if (slug) {
        const embedSuffix = search.includes("embed=1") ? "&embed=1" : "";
        return `/(app)/book?slug=${encodeURIComponent(slug)}${embedSuffix}`;
      }
    }

    const bookMatch = pathname.match(/^\/book\/([^/]+)\/?$/);
    if (bookMatch && bookMatch[1] !== "l" && bookMatch[1] !== "continue") {
      const providerSlug = decodeURIComponent(bookMatch[1]);
      return `/(app)/book/${encodeURIComponent(providerSlug)}${search}`;
    }

    const expressMatch = pathname.match(/^\/book\/l\/([^/]+)\/?$/);
    if (expressMatch) {
      const linkSlug = decodeURIComponent(expressMatch[1]);
      return `/(app)/book/l/${encodeURIComponent(linkSlug)}${search}`;
    }
  } catch {
    // pass through
  }
  return path;
}

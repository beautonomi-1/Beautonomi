/**
 * expo-router v6 `redirectSystemPath` hook.
 *
 * Every inbound URL — HTTPS App Links (beautonomi.com/provider/*, beautonomi.co.za/provider/*)
 * and provider:// deep links — passes through this module before the router resolves it.
 * Without this, verified App Links that Paystack uses as callback_url land on the native app
 * with a path like `/provider/settings/ads/payment-return` that has no expo-router file,
 * producing "Unmatched Route / page could not be found".
 *
 * This normalizer maps every provider payment return URL to the real in-app route,
 * preserving the full query string (reference, trxref, success, cancelled, order_id,
 * campaign_id, payment_success, topup, etc.) so target screens can read params via
 * useLocalSearchParams without changes.
 *
 * Covers:
 *   - Ads payment return   (all hosts + provider://settings/ads-payment-return)
 *   - Subscription return  (all hosts + provider://subscription/success)
 *   - Marketing top-up     (all hosts + provider://settings/marketing-integrations)
 *   - Ads dashboard        (provider://settings/ads)
 *
 * Everything else passes through unchanged so unrelated App Links / deep links
 * are not affected.
 */

type RedirectSystemPathParams = {
  path: string;
  initial: boolean;
};

/**
 * Build the target path, appending the original search string if present.
 */
function withQuery(targetPath: string, search: string): string {
  const q = search.startsWith("?") ? search : search ? `?${search}` : "";
  return `${targetPath}${q}`;
}

/**
 * Destructure a URL string into { pathname, search } without throwing.
 * For `provider://` URLs the host becomes part of the pathname analysis.
 */
function parseSafe(url: string): { pathname: string; search: string; host: string } {
  try {
    const u = new URL(url);
    return { pathname: u.pathname, search: u.search, host: u.host };
  } catch {
    // Not a parseable URL — pass raw string through
    return { pathname: url, search: "", host: "" };
  }
}

export function redirectSystemPath({ path }: RedirectSystemPathParams): string {
  try {
    // `path` is either:
    //  - An absolute URL  (https://beautonomi.co.za/provider/settings/ads/payment-return?...)
    //  - A root path      (/provider/settings/ads/payment-return?...)
    //  - A custom scheme  (provider://settings/ads-payment-return?...)
    const isAbsoluteUrl = /^https?:\/\//i.test(path) || /^provider:\/\//i.test(path);
    const { pathname, search, host } = isAbsoluteUrl
      ? parseSafe(path)
      : { pathname: path.split("?")[0], search: path.includes("?") ? path.slice(path.indexOf("?")) : "", host: "" };

    // Terminal order payment return
    // HTTPS: /provider/settings/sales/terminal-payment-return
    // Deep:  provider://settings/terminal-payment-return
    if (
      pathname.includes("terminal-payment-return") ||
      (host === "settings" && pathname.includes("terminal-payment-return"))
    ) {
      return withQuery("/(app)/(tabs)/more/terminal-payment-return", search);
    }

    // Staff join (App Link / universal link)
    if (pathname === "/provider/join" || pathname.startsWith("/provider/join/")) {
      const search = isAbsoluteUrl ? parseSafe(path).search : (path.includes("?") ? path.slice(path.indexOf("?")) : "");
      return withQuery("/join", search);
    }
    // HTTPS: /provider/settings/ads/payment-return
    // Deep:  provider://settings/ads-payment-return  (host=settings, pathname=/ads-payment-return)
    if (
      pathname.includes("ads/payment-return") ||
      pathname.includes("ads-payment-return") ||
      (host === "settings" && pathname.includes("ads-payment-return"))
    ) {
      return withQuery("/(app)/(tabs)/more/settings/ads-payment-return", search);
    }

    // Subscription payment return / success
    // HTTPS: /provider/subscription  (with ?payment_success=true or ?payment_cancelled=1)
    // Deep:  provider://subscription/success  (host=subscription)
    // Cold-start screen: subscription-payment-return
    if (
      pathname.includes("subscription-payment-return") ||
      (host === "settings" && pathname.includes("subscription-payment-return")) ||
      host === "subscription" ||
      // HTTPS path: /provider/subscription — only intercept when it carries a payment flag
      (pathname.endsWith("/provider/subscription") &&
        (search.includes("payment_success") || search.includes("payment_cancelled") || search.includes("order_id")))
    ) {
      return withQuery("/(app)/(tabs)/more/settings/subscription-payment-return", search);
    }

    // Marketing credits top-up return
    // HTTPS: /provider/settings/marketing-integrations?topup=success
    // Deep:  provider://settings/marketing-integrations
    if (
      pathname.includes("marketing-integrations") ||
      (host === "settings" && pathname.includes("marketing-integrations"))
    ) {
      return withQuery("/(app)/(tabs)/more/settings/marketing-integrations", search);
    }

    // Ads dashboard (bare link, not payment-return)
    // Deep: provider://settings/ads  (must not also match ads-payment-return above)
    if (
      (host === "settings" && pathname === "/ads") ||
      pathname === "/provider/settings/ads"
    ) {
      return withQuery("/(app)/(tabs)/more/settings/ads", search);
    }
  } catch {
    // Safety: if anything throws, return the original path unchanged
  }

  return path;
}

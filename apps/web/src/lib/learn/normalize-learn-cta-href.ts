/** Default topic hubs when CMS `link` is missing or invalid. */
const CUSTOMER_TOPIC_FALLBACK = "/learn/booking-checkout";
const PROVIDER_TOPIC_FALLBACK = "/learn/provider-onboarding";

/**
 * Ensures Learning Center CTA `link` values resolve to an in-app `/learn/...` path.
 */
export function normalizeLearnCtaHref(link: string | undefined | null, isProviderHint: boolean): string {
  let h = (link ?? "").trim();
  if (!h || h === "#") {
    return isProviderHint ? PROVIDER_TOPIC_FALLBACK : CUSTOMER_TOPIC_FALLBACK;
  }

  if (h.startsWith("http://") || h.startsWith("https://")) {
    try {
      const u = new URL(h);
      h = `${u.pathname}${u.search}${u.hash}`;
    } catch {
      return isProviderHint ? PROVIDER_TOPIC_FALLBACK : CUSTOMER_TOPIC_FALLBACK;
    }
  }

  if (!h.startsWith("/")) {
    h = `/${h.replace(/^\/+/, "")}`;
  }

  if (!h.startsWith("/learn")) {
    return isProviderHint ? PROVIDER_TOPIC_FALLBACK : CUSTOMER_TOPIC_FALLBACK;
  }

  return h;
}

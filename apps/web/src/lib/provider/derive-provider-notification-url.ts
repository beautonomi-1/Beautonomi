/**
 * Maps in-app notification payloads (link / action_url + metadata) to provider portal routes.
 * Fixes customer-only paths, legacy URLs, and enriches ecommerce links with order id from payload.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isProviderNotificationUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export type ProviderNotificationLinkInput = {
  link?: string | null;
  metadata?: Record<string, unknown> | null;
  data?: Record<string, unknown> | null;
};

function parsePathAndSearch(raw: string): { pathname: string; searchParams: URLSearchParams } | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const base =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "http://localhost";
    const u = /^https?:\/\//i.test(t) ? new URL(t) : new URL(t.startsWith("/") ? t : `/${t}`, base);
    return { pathname: u.pathname, searchParams: u.searchParams };
  } catch {
    return null;
  }
}

function pathWithQuery(pathname: string, sp: URLSearchParams): string {
  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * Returns a path suitable for `router.push` in the provider web portal, or undefined if unknown.
 */
export function deriveProviderPortalNotificationUrl(
  n: ProviderNotificationLinkInput,
): string | undefined {
  const d = { ...(n.data ?? {}), ...(n.metadata ?? {}) };
  const productOrderId =
    (isProviderNotificationUuid(d.product_order_id) && String(d.product_order_id).trim()) ||
    (isProviderNotificationUuid((d as { order_id?: unknown }).order_id) &&
      String((d as { order_id: string }).order_id).trim()) ||
    null;
  const rawReturnId = (d as { return_request_id?: unknown }).return_request_id;
  const returnRequestId = isProviderNotificationUuid(rawReturnId)
    ? String(rawReturnId).trim()
    : null;

  const linkRaw = typeof n.link === "string" ? n.link.trim() : "";
  if (linkRaw) {
    const p = parsePathAndSearch(linkRaw);
    if (p) {
      const { pathname, searchParams } = p;

      // Customer app paths → provider portal
      if (pathname === "/product-orders" || pathname.startsWith("/product-orders/")) {
        const seg = pathname
          .replace(/^\/product-orders\/?/, "")
          .split("/")
          .filter(Boolean)[0];
        const id = isProviderNotificationUuid(seg) ? seg : productOrderId;
        return id
          ? `/provider/ecommerce/orders?order=${encodeURIComponent(id)}`
          : "/provider/ecommerce/orders";
      }

      const legacyOrders = pathname.match(/^\/provider\/orders\/([0-9a-f-]{36})$/i);
      if (legacyOrders) {
        return `/provider/ecommerce/orders?order=${encodeURIComponent(legacyOrders[1])}`;
      }

      if (pathname === "/provider/ecommerce/returns") {
        return returnRequestId
          ? `/provider/ecommerce/returns?return=${encodeURIComponent(returnRequestId)}`
          : "/provider/ecommerce/returns";
      }

      if (pathname === "/provider/ecommerce/orders") {
        const q = new URLSearchParams(searchParams);
        if (productOrderId && !q.get("order")) q.set("order", productOrderId);
        return pathWithQuery(pathname, q);
      }

      const bookingM = pathname.match(/^\/account-settings\/bookings\/([0-9a-f-]{36})$/i);
      if (bookingM) {
        return `/provider/bookings/${bookingM[1]}`;
      }

      if (pathname === "/account-settings/messages" || pathname.startsWith("/account-settings/messages")) {
        const conv = searchParams.get("conversation");
        if (conv && isProviderNotificationUuid(conv)) {
          return `/provider/messaging?id=${encodeURIComponent(conv)}`;
        }
        return "/provider/messaging";
      }

      if (pathname.startsWith("/provider/")) {
        return pathWithQuery(pathname, searchParams);
      }

      if (pathname.startsWith("/booking")) {
        return pathWithQuery(pathname, searchParams);
      }
    }
  }

  if (isProviderNotificationUuid(d.booking_id)) {
    return `/provider/bookings/${String(d.booking_id).trim()}`;
  }
  if (isProviderNotificationUuid(d.conversation_id)) {
    return `/provider/messaging?id=${encodeURIComponent(String(d.conversation_id).trim())}`;
  }
  if (isProviderNotificationUuid(d.appointment_id)) {
    return `/provider/calendar`;
  }
  if (isProviderNotificationUuid(d.client_id)) {
    return `/provider/clients/${String(d.client_id).trim()}`;
  }
  if (productOrderId) {
    return `/provider/ecommerce/orders?order=${encodeURIComponent(productOrderId)}`;
  }
  if (isProviderNotificationUuid(d.staff_id)) {
    return `/provider/team/members`;
  }

  return undefined;
}

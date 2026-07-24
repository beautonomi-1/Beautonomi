/**
 * Maps a `/api/paystack/verify` payload to the customer mobile route that
 * matches the payment type. Used by the generic `paystack-callback.tsx` cold
 * start screen so deep links / OS-relaunches always land on the right tab.
 *
 * Verify response shapes (from apps/web/src/app/api/paystack/verify/route.ts):
 *  - `{ data: { status, type: "product_order", productOrderId, orderNumber } }`
 *  - `{ data: { status, type: "wallet_topup" } }`
 *  - `{ data: { status, type: "gift_card_order", giftCardOrderId } }`
 *  - `{ data: { status, type: "membership_order", membershipOrderId } }`
 *  - `{ data: { status, type: "ads_budget_order", adsBudgetOrderId, campaignId } }`
 *  - `{ data: { status, type: "provider_subscription_order", subscriptionOrderId, ... } }`
 *  - `{ data: { status, type: "custom_offer", customOfferId, bookingId } }`
 *    (bookingId is present once the offer has finalized into a booking; the
 *    bookingId branch below takes precedence and routes to booking-detail)
 *  - `{ data: { status, type: "card_verification" } }`
 *  - Booking (no `type` field): `{ data: { status, bookingId, payment_status } }`
 *
 * NOTE: `verifyPaystackWithRetry` returns `{ data }` already unwrapped once,
 * so this resolver still walks `cur.data` to be robust against double-wrapped
 * payloads that some callers pass through.
 */

export type RouteTarget = { pathname: string; params?: Record<string, string> };

function pickStr(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0].trim() : "";
  return "";
}

function unwrap(body: unknown, depth = 0): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || depth > 5) return null;
  return body as Record<string, unknown>;
}

export function resolvePaystackVerifyRoute(body: unknown): RouteTarget | null {
  let cur: Record<string, unknown> | null = unwrap(body);
  for (let depth = 0; depth < 5 && cur; depth += 1) {
    const bookingId = pickStr(cur.bookingId) || pickStr(cur.booking_id);
    if (bookingId) {
      return { pathname: "/(app)/booking-detail", params: { id: bookingId } };
    }
    const productOrderId = pickStr(cur.productOrderId) || pickStr(cur.product_order_id);
    if (productOrderId) {
      return { pathname: "/(app)/product-order-detail", params: { id: productOrderId } };
    }
    const customOfferId = pickStr(cur.customOfferId) || pickStr(cur.custom_offer_id);
    if (customOfferId) {
      return { pathname: "/(app)/account-settings/custom-requests" };
    }
    const giftCardOrderId = pickStr(cur.giftCardOrderId) || pickStr(cur.gift_card_order_id);
    if (giftCardOrderId) {
      return { pathname: "/(app)/account-settings/payments" };
    }
    const giftCardId = pickStr(cur.giftCardId) || pickStr(cur.gift_card_id);
    if (giftCardId) {
      return { pathname: "/(app)/account-settings/payments" };
    }
    const membershipOrderId = pickStr(cur.membershipOrderId) || pickStr(cur.membership_order_id);
    if (membershipOrderId) {
      return { pathname: "/(app)/account-settings/membership" };
    }
    const type = pickStr(cur.type) || pickStr(cur.payment_type);
    if (type === "wallet_topup") {
      return { pathname: "/(app)/account-settings/wallet" };
    }
    // Server returns `membership_order` after a successful membership charge,
    // but legacy callers also send `membership` — accept both to avoid
    // regressing to the bookings tab fallback.
    if (type === "membership_order" || type === "membership") {
      return { pathname: "/(app)/account-settings/membership" };
    }
    if (type === "custom_offer") {
      return { pathname: "/(app)/account-settings/custom-requests" };
    }
    if (type === "gift_card_order") {
      return { pathname: "/(app)/account-settings/payments" };
    }
    if (type === "product_order") {
      return productOrderId
        ? { pathname: "/(app)/product-order-detail", params: { id: productOrderId } }
        : { pathname: "/(app)/product-orders" };
    }
    cur = unwrap(cur.data, depth + 1);
  }
  return null;
}

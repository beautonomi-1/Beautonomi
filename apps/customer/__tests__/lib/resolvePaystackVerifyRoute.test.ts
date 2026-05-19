/**
 * @jest-environment node
 */
import { resolvePaystackVerifyRoute } from "@/lib/payments/resolvePaystackVerifyRoute";

describe("resolvePaystackVerifyRoute", () => {
  it("routes booking payloads to booking detail", () => {
    expect(resolvePaystackVerifyRoute({ status: "success", bookingId: "b1" })).toEqual({
      pathname: "/(app)/booking-detail",
      params: { id: "b1" },
    });
    expect(resolvePaystackVerifyRoute({ status: "success", booking_id: "b2" })).toEqual({
      pathname: "/(app)/booking-detail",
      params: { id: "b2" },
    });
  });

  it("routes product orders to product order detail", () => {
    expect(
      resolvePaystackVerifyRoute({ status: "success", type: "product_order", productOrderId: "p1" }),
    ).toEqual({ pathname: "/(app)/product-order-detail", params: { id: "p1" } });
  });

  it("routes wallet top-ups to the wallet screen", () => {
    expect(resolvePaystackVerifyRoute({ status: "success", type: "wallet_topup" })).toEqual({
      pathname: "/(app)/account-settings/wallet",
    });
  });

  it("routes membership payloads (membership_order alias) to explore tab", () => {
    expect(
      resolvePaystackVerifyRoute({ status: "success", type: "membership_order", membershipOrderId: "m1" }),
    ).toEqual({ pathname: "/(app)/(tabs)/explore" });
    expect(resolvePaystackVerifyRoute({ status: "success", type: "membership" })).toEqual({
      pathname: "/(app)/(tabs)/explore",
    });
  });

  it("routes custom offer payloads to custom requests", () => {
    expect(
      resolvePaystackVerifyRoute({ status: "success", type: "custom_offer", customOfferId: "c1" }),
    ).toEqual({ pathname: "/(app)/account-settings/custom-requests" });
  });

  it("routes gift card payloads to payments tab", () => {
    expect(
      resolvePaystackVerifyRoute({ status: "success", type: "gift_card_order", giftCardOrderId: "g1" }),
    ).toEqual({ pathname: "/(app)/account-settings/payments" });
  });

  it("unwraps nested data wrappers", () => {
    expect(
      resolvePaystackVerifyRoute({
        data: { status: "success", type: "wallet_topup" },
      }),
    ).toEqual({ pathname: "/(app)/account-settings/wallet" });
  });

  it("prefers a concrete id (e.g. bookingId) over the generic type", () => {
    expect(
      resolvePaystackVerifyRoute({
        status: "success",
        type: "custom_offer",
        bookingId: "b9",
      }),
    ).toEqual({ pathname: "/(app)/booking-detail", params: { id: "b9" } });
  });

  it("returns null when the payload has nothing routable", () => {
    expect(resolvePaystackVerifyRoute(null)).toBeNull();
    expect(resolvePaystackVerifyRoute(undefined)).toBeNull();
    expect(resolvePaystackVerifyRoute({ status: "failed" })).toBeNull();
  });
});

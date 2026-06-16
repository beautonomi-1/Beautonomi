import { applyProviderNotificationRoute } from "@/lib/resolveProviderNotificationRoute";

describe("resolveProviderNotificationRoute", () => {
  const push = jest.fn();
  const router = { push } as unknown as import("expo-router").Router;

  beforeEach(() => {
    push.mockClear();
  });

  it("routes provider_new_message to chat thread", () => {
    const ok = applyProviderNotificationRoute(router, {
      template_key: "provider_new_message",
      conversation_id: "conv-123",
    });
    expect(ok).toBe(true);
    expect(push).toHaveBeenCalledWith({
      pathname: "/(app)/(tabs)/chats/[id]",
      params: { id: "conv-123" },
    });
  });

  it("routes product_order_placed to orders hub", () => {
    const ok = applyProviderNotificationRoute(router, {
      type: "product_order_placed",
      product_order_id: "order-abc",
    });
    expect(ok).toBe(true);
    expect(push).toHaveBeenCalledWith(
      "/(app)/(tabs)/more/orders-hub?order=order-abc",
    );
  });

  it("routes booking template keys to booking detail", () => {
    const ok = applyProviderNotificationRoute(router, {
      template_key: "provider_booking_request",
      booking_id: "booking-99",
    });
    expect(ok).toBe(true);
    expect(push).toHaveBeenCalledWith({
      pathname: "/(app)/(tabs)/bookings/[id]",
      params: { id: "booking-99" },
    });
  });

  it("returns false for unknown types", () => {
    const ok = applyProviderNotificationRoute(router, { type: "unknown_event_type" });
    expect(ok).toBe(false);
  });
});

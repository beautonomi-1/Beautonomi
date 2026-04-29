import { navigateFromProviderNotification } from "@/lib/provider-notification-navigation";

describe("navigateFromProviderNotification", () => {
  it("routes provider order notifications that use order_id", () => {
    const router = { push: jest.fn() };

    navigateFromProviderNotification(router as never, {
      id: "notification-1",
      data: { order_id: "order-123" },
    });

    expect(router.push).toHaveBeenCalledWith("/(app)/(tabs)/more/orders-hub?order=order-123");
  });

  it("routes provider order notifications that use product_order_id query links", () => {
    const router = { push: jest.fn() };

    navigateFromProviderNotification(router as never, {
      id: "notification-2",
      link: "/provider/ecommerce/orders?product_order_id=order-456",
    });

    expect(router.push).toHaveBeenCalledWith("/(app)/(tabs)/more/orders-hub?order=order-456");
  });

  it("routes on-demand notifications using request id query aliases", () => {
    const router = { push: jest.fn() };

    navigateFromProviderNotification(router as never, {
      id: "notification-3",
      type: "on_demand_incoming",
      link: "/provider/on-demand?request_id=req-123",
    });

    expect(router.push).toHaveBeenCalledWith("/(app)/on-demand/incoming/req-123");
  });
});

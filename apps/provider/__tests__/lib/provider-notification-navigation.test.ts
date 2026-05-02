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

  it("preserves calendar notification date and booking focus params", () => {
    const router = { push: jest.fn() };

    navigateFromProviderNotification(router as never, {
      id: "notification-4",
      link: "/provider/calendar?date=2026-05-02&booking_id=booking-123",
    });

    expect(router.push).toHaveBeenCalledWith(
      "/(app)/(tabs)/calendar?date=2026-05-02&booking_id=booking-123",
    );
  });

  it("routes pending bookings to Front Desk with highlight params", () => {
    const router = { push: jest.fn() };

    navigateFromProviderNotification(router as never, {
      id: "notification-pending",
      data: { booking_id: "booking-pend-1", db_status: "pending" },
    });

    expect(router.push).toHaveBeenCalledWith(
      "/(app)/(tabs)/more/waiting-room?highlight=booking-pend-1&pending_booking_id=booking-pend-1",
    );
  });

  it("keeps data booking ids on calendar links instead of opening booking detail", () => {
    const router = { push: jest.fn() };

    navigateFromProviderNotification(router as never, {
      id: "notification-5",
      link: "/provider/calendar?date=2026-05-02",
      data: { booking_id: "booking-456" },
    });

    expect(router.push).toHaveBeenCalledWith(
      "/(app)/(tabs)/calendar?date=2026-05-02&booking_id=booking-456",
    );
  });

  it("routes provider group booking links to the group booking sheet", () => {
    const router = { push: jest.fn() };
    const id = "00000000-0000-4000-8000-000000000321";

    navigateFromProviderNotification(router as never, {
      id: "notification-group",
      link: `/provider/group-bookings/${id}`,
    });

    expect(router.push).toHaveBeenCalledWith(
      `/(app)/(tabs)/more/group-bookings?open_group_id=${id}`,
    );
  });

  it("routes provider report links to the native reports section", () => {
    const router = { push: jest.fn() };

    navigateFromProviderNotification(router as never, {
      id: "notification-report",
      link: "/provider/reports/packages",
    });

    expect(router.push).toHaveBeenCalledWith("/(app)/(tabs)/more/reports/packages");
  });
});

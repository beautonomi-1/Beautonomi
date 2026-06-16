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

  it("routes legacy calendar links with booking id to booking detail", () => {
    const router = { push: jest.fn() };

    navigateFromProviderNotification(router as never, {
      id: "notification-4",
      link: "/provider/calendar?date=2026-05-02&booking_id=booking-123",
    });

    expect(router.push).toHaveBeenCalledWith(
      "/(app)/(tabs)/bookings?date=2026-05-02&booking_id=booking-123",
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

  it("routes legacy calendar links with data booking id to booking detail", () => {
    const router = { push: jest.fn() };

    navigateFromProviderNotification(router as never, {
      id: "notification-5",
      link: "/provider/calendar?date=2026-05-02",
      data: { booking_id: "booking-456" },
    });

    expect(router.push).toHaveBeenCalledWith(
      "/(app)/(tabs)/bookings?date=2026-05-02&booking_id=booking-456",
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

  it("routes group_booking_id to the group sheet even when booking_id is present", () => {
    const router = { push: jest.fn() };
    const groupId = "00000000-0000-4000-8000-000000000654";

    navigateFromProviderNotification(router as never, {
      id: "notification-group-push",
      type: "provider_booking_request",
      data: {
        booking_id: "booking-child-99",
        group_booking_id: groupId,
      },
    });

    expect(router.push).toHaveBeenCalledWith(
      `/(app)/(tabs)/more/group-bookings?open_group_id=${encodeURIComponent(groupId)}`,
    );
  });

  it("routes booking notifications with date to bookings hub before detail", () => {
    const router = { push: jest.fn() };

    navigateFromProviderNotification(router as never, {
      id: "notification-booking",
      link: "/provider/calendar?date=2026-06-05",
      data: { booking_id: "booking-789", db_status: "confirmed" },
    });

    expect(router.push).toHaveBeenCalledWith(
      "/(app)/(tabs)/bookings?date=2026-06-05&booking_id=booking-789",
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

  it("routes ads payment notifications to native ads settings", () => {
    const router = { push: jest.fn() };

    navigateFromProviderNotification(router as never, {
      id: "notification-ads",
      type: "ads_payment_confirmed",
      link: "/provider/settings/ads",
    });

    expect(router.push).toHaveBeenCalledWith("/(app)/(tabs)/more/settings/ads");
  });

  it("returns false when no route matches (stay on current screen)", () => {
    const router = { push: jest.fn() };

    const navigated = navigateFromProviderNotification(router as never, {
      id: "notification-unknown",
      type: "unknown_type",
    });

    expect(navigated).toBe(false);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("routes custom_offer with booking_id to booking detail before requests list", () => {
    const router = { push: jest.fn() };

    navigateFromProviderNotification(router as never, {
      id: "notification-paid-offer",
      type: "custom_offer",
      data: { booking_id: "booking-from-offer", custom_offer_id: "offer-1" },
    });

    expect(router.push).toHaveBeenCalledWith("/(app)/(tabs)/bookings?booking_id=booking-from-offer");
  });

  it("routes custom_offer without booking_id to requests list", () => {
    const router = { push: jest.fn() };

    navigateFromProviderNotification(router as never, {
      id: "notification-new-offer",
      type: "custom_offer",
      data: { offer_id: "offer-2" },
    });

    expect(router.push).toHaveBeenCalledWith("/(app)/(tabs)/more/custom-requests");
  });
});

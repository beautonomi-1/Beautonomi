import { navigateFromNotification } from "@/lib/notifications";
import { router } from "expo-router";

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
  },
}));

const pushMock = router.push as jest.Mock;

describe("navigateFromNotification", () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  it("opens the exact chat when conversation_id is in notification data", () => {
    navigateFromNotification({
      id: "n1",
      type: "message",
      title: "New message",
      message: "Hello",
      is_read: false,
      created_at: new Date().toISOString(),
      data: { conversation_id: "conversation-1" },
    });

    expect(pushMock).toHaveBeenCalledWith({
      pathname: "/(app)/chat",
      params: { id: "conversation-1" },
    });
  });

  it("opens the exact chat when only action_url has the conversation query", () => {
    navigateFromNotification({
      id: "n2",
      type: "message",
      title: "New message",
      message: "Hello",
      is_read: false,
      created_at: new Date().toISOString(),
      action_url: "/account-settings/messages?conversation=conversation-2",
    });

    expect(pushMock).toHaveBeenCalledWith({
      pathname: "/(app)/chat",
      params: { id: "conversation-2" },
    });
  });

  it("falls back to the chats tab for message notifications without a target conversation", () => {
    navigateFromNotification({
      id: "n3",
      type: "message",
      title: "New message",
      message: "Hello",
      is_read: false,
      created_at: new Date().toISOString(),
    });

    expect(pushMock).toHaveBeenCalledWith("/(app)/(tabs)/chats");
  });

  it("routes customer_new_message template pushes to chats when no conversation id", () => {
    navigateFromNotification({
      id: "n8",
      type: "customer_new_message",
      title: "New message",
      message: "Hello",
      is_read: false,
      created_at: new Date().toISOString(),
    });

    expect(pushMock).toHaveBeenCalledWith("/(app)/(tabs)/chats");
  });

  it("deep links membership win-back to the provider profile memberships tab (in-app row)", () => {
    navigateFromNotification({
      id: "n-wb1",
      // In-app rows store an unknown template type as "system"; the template_key
      // in data is what identifies the win-back notification.
      type: "system",
      title: "Membership Win-Back",
      message: "Glow Salon invited you to rejoin Gold.",
      is_read: false,
      created_at: new Date().toISOString(),
      data: { template_key: "membership_win_back", provider_slug: "glow-salon" },
    });

    expect(pushMock).toHaveBeenCalledWith({
      pathname: "/(app)/partner-profile",
      params: { slug: "glow-salon", tab: "memberships" },
    });
  });

  it("deep links membership win-back push (type carries template_key) using provider_id", () => {
    navigateFromNotification({
      id: "n-wb2",
      type: "membership_win_back",
      title: "Membership Win-Back",
      message: "Glow Salon invited you to rejoin Gold.",
      is_read: false,
      created_at: new Date().toISOString(),
      data: { provider_id: "11111111-1111-1111-1111-111111111111" },
    });

    expect(pushMock).toHaveBeenCalledWith({
      pathname: "/(app)/partner-profile",
      params: { provider_id: "11111111-1111-1111-1111-111111111111", tab: "memberships" },
    });
  });

  it("falls back to the membership management screen when win-back has no provider context", () => {
    navigateFromNotification({
      id: "n-wb3",
      type: "membership_win_back",
      title: "Membership Win-Back",
      message: "You're invited back.",
      is_read: false,
      created_at: new Date().toISOString(),
    });

    expect(pushMock).toHaveBeenCalledWith("/(app)/account-settings/membership");
  });

  it("opens product order detail when notification data uses product_order_id", () => {
    navigateFromNotification({
      id: "n4",
      type: "product_order_update",
      title: "Order update",
      message: "Your order was paid",
      is_read: false,
      created_at: new Date().toISOString(),
      data: { product_order_id: "order-1" },
    });

    expect(pushMock).toHaveBeenCalledWith({
      pathname: "/(app)/product-order-detail",
      params: { id: "order-1" },
    });
  });

  it("opens product order detail when only action_url has product_order_id", () => {
    navigateFromNotification({
      id: "n5",
      type: "product_order_update",
      title: "Order update",
      message: "Your order was paid",
      is_read: false,
      created_at: new Date().toISOString(),
      action_url: "/account-settings/orders?product_order_id=order-2",
    });

    expect(pushMock).toHaveBeenCalledWith({
      pathname: "/(app)/product-order-detail",
      params: { id: "order-2" },
    });
  });

  it("opens product order detail when action_url uses the order query alias", () => {
    navigateFromNotification({
      id: "n6",
      type: "product_order_update",
      title: "Order update",
      message: "Your order was paid",
      is_read: false,
      created_at: new Date().toISOString(),
      action_url: "/account-settings/orders?order=order-3",
    });

    expect(pushMock).toHaveBeenCalledWith({
      pathname: "/(app)/product-order-detail",
      params: { id: "order-3" },
    });
  });

  it("opens product order detail when action_url uses account order path", () => {
    const id = "00000000-0000-4000-8000-000000000123";
    navigateFromNotification({
      id: "n7",
      type: "product_order_update",
      title: "Order update",
      message: "Your order was paid",
      is_read: false,
      created_at: new Date().toISOString(),
      action_url: `/account-settings/orders/${id}`,
    });

    expect(pushMock).toHaveBeenCalledWith({
      pathname: "/(app)/product-order-detail",
      params: { id },
    });
  });

  it("opens booking detail when push carries only booking_id (no type)", () => {
    navigateFromNotification({
      id: "n-booking-only",
      type: "",
      title: "Booking confirmed",
      message: "Confirmed",
      is_read: false,
      created_at: new Date().toISOString(),
      data: { booking_id: "booking-only-1" },
    });

    expect(pushMock).toHaveBeenCalledWith({
      pathname: "/(app)/booking-detail",
      params: { id: "booking-only-1" },
    });
  });

  it("opens support ticket when ticket_id is present", () => {
    navigateFromNotification({
      id: "n-ticket",
      type: "support_ticket_updated",
      title: "Ticket update",
      message: "Reply added",
      is_read: false,
      created_at: new Date().toISOString(),
      data: { ticket_id: "00000000-0000-4000-8000-000000000999" },
    });

    expect(pushMock).toHaveBeenCalledWith(
      "/(app)/(tabs)/support-tickets/00000000-0000-4000-8000-000000000999",
    );
  });

  it("routes booking_confirmed with group_booking_id to group booking detail", () => {
    const groupId = "00000000-0000-4000-8000-000000000456";
    navigateFromNotification({
      id: "n-group-confirmed",
      type: "booking_confirmed",
      title: "Booking confirmed",
      message: "Your booking is confirmed",
      is_read: false,
      created_at: new Date().toISOString(),
      data: {
        booking_id: "booking-child-1",
        group_booking_id: groupId,
      },
    });

    expect(pushMock).toHaveBeenCalledWith({
      pathname: "/(app)/group-booking-detail",
      params: { id: groupId },
    });
  });

  it("routes a typeless group push (booking_id + group_booking_id) to the group screen", () => {
    const groupId = "00000000-0000-4000-8000-000000000abc";
    navigateFromNotification({
      id: "n-group-typeless",
      type: "",
      title: "Booking confirmed",
      message: "Your booking is confirmed",
      is_read: false,
      created_at: new Date().toISOString(),
      data: {
        booking_id: "booking-child-3",
        group_booking_id: groupId,
      },
    });

    expect(pushMock).toHaveBeenCalledWith({
      pathname: "/(app)/group-booking-detail",
      params: { id: groupId },
    });
  });

  it("prefers group screen when group_booking_id is present on generic booking push", () => {
    const groupId = "00000000-0000-4000-8000-000000000789";
    navigateFromNotification({
      id: "n-group-generic",
      type: "booking_update",
      title: "Booking update",
      message: "Your group booking was updated",
      is_read: false,
      created_at: new Date().toISOString(),
      data: {
        booking_id: "booking-child-2",
        group_booking_id: groupId,
      },
    });

    expect(pushMock).toHaveBeenCalledWith({
      pathname: "/(app)/group-booking-detail",
      params: { id: groupId },
    });
  });

  it("routes additional charge push to receipt focus with charge_id", () => {
    const bookingId = "00000000-0000-4000-8000-000000000111";
    const chargeId = "00000000-0000-4000-8000-000000000222";
    navigateFromNotification({
      id: "n-charge",
      type: "additional_charge_requested",
      title: "Additional payment requested",
      message: "Extra charge",
      is_read: false,
      created_at: new Date().toISOString(),
      data: { booking_id: bookingId, charge_id: chargeId },
    });

    expect(pushMock).toHaveBeenCalledWith({
      pathname: "/(app)/booking-detail",
      params: { id: bookingId, focus: "additional_charge", charge_id: chargeId },
    });
  });

  it("routes payment_request in-app row to receipt focus with charge_id", () => {
    const bookingId = "00000000-0000-4000-8000-000000000333";
    const chargeId = "00000000-0000-4000-8000-000000000444";
    navigateFromNotification({
      id: "n-pay-req",
      type: "payment_request",
      title: "Additional payment requested",
      message: "Extra charge",
      is_read: false,
      created_at: new Date().toISOString(),
      data: { booking_id: bookingId, charge_id: chargeId },
    });

    expect(pushMock).toHaveBeenCalledWith({
      pathname: "/(app)/booking-detail",
      params: { id: bookingId, focus: "additional_charge", charge_id: chargeId },
    });
  });

  it("routes provider_arrived_home via template_key to tracking/arrival focus", () => {
    const bookingId = "00000000-0000-4000-8000-000000000555";
    navigateFromNotification({
      id: "n-arrived",
      type: "",
      title: "Provider Has Arrived",
      message: "Your provider has arrived",
      is_read: false,
      created_at: new Date().toISOString(),
      data: { template_key: "provider_arrived_home", booking_id: bookingId },
    });

    expect(pushMock).toHaveBeenCalledWith({
      pathname: "/(app)/booking-detail",
      params: { id: bookingId, focus: "arrival" },
    });
  });

  it("routes service_started to tracking focus", () => {
    const bookingId = "00000000-0000-4000-8000-000000000666";
    navigateFromNotification({
      id: "n-started",
      type: "service_started",
      title: "Service Started",
      message: "Your service has started",
      is_read: false,
      created_at: new Date().toISOString(),
      data: { booking_id: bookingId },
    });

    expect(pushMock).toHaveBeenCalledWith({
      pathname: "/(app)/booking-detail",
      params: { id: bookingId, focus: "tracking" },
    });
  });

  it("routes provider_en_route_home to tracking focus", () => {
    const bookingId = "00000000-0000-4000-8000-000000000777";
    navigateFromNotification({
      id: "n-enroute",
      type: "",
      title: "Provider on the way",
      message: "En route",
      is_read: false,
      created_at: new Date().toISOString(),
      data: { template_key: "provider_en_route_home", booking_id: bookingId },
    });

    expect(pushMock).toHaveBeenCalledWith({
      pathname: "/(app)/booking-detail",
      params: { id: bookingId, focus: "tracking" },
    });
  });
});

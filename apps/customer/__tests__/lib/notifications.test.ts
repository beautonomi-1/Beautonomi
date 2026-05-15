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
});

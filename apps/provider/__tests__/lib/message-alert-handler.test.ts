import {
  conversationAlertMessage,
  conversationAlertTitle,
  shouldAlertForConversationUpdate,
} from "@/lib/message-alert-handler";

describe("message-alert-handler", () => {
  it("alerts when unread count increases", () => {
    expect(
      shouldAlertForConversationUpdate(
        { id: "conv-1", unread_count_provider: 2, last_message_preview: "Hi" },
        1,
      ),
    ).toBe(true);
  });

  it("does not alert when unread count stays the same or drops", () => {
    expect(
      shouldAlertForConversationUpdate({ id: "conv-1", unread_count_provider: 1 }, 1),
    ).toBe(false);
    expect(
      shouldAlertForConversationUpdate({ id: "conv-1", unread_count_provider: 0 }, 2),
    ).toBe(false);
  });

  it("builds title and message from row", () => {
    expect(
      conversationAlertTitle({ id: "c1", customer_name: "Jane", unread_count_provider: 1 }),
    ).toBe("Message from Jane");
    expect(
      conversationAlertMessage({ id: "c1", last_message_preview: "Hello there", unread_count_provider: 1 }),
    ).toBe("Hello there");
  });
});

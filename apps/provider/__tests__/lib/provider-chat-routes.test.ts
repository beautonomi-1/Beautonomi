import { isProviderChatThreadPath } from "@/lib/provider-chat-routes";

describe("isProviderChatThreadPath", () => {
  it("matches chats thread by id", () => {
    expect(isProviderChatThreadPath("/(app)/(tabs)/chats/abc")).toBe(true);
  });

  it("does not match chats hub", () => {
    expect(isProviderChatThreadPath("/(app)/(tabs)/chats")).toBe(false);
  });

  it("matches more messaging thread", () => {
    expect(isProviderChatThreadPath("/(app)/(tabs)/more/messaging/thread-1")).toBe(true);
  });

  it("does not match more messaging inbox", () => {
    expect(isProviderChatThreadPath("/(app)/(tabs)/more/messaging")).toBe(false);
    expect(isProviderChatThreadPath("/(app)/(tabs)/more/messaging/")).toBe(false);
  });

  it("returns false for unrelated routes", () => {
    expect(isProviderChatThreadPath("/(app)/(tabs)/dashboard")).toBe(false);
    expect(isProviderChatThreadPath(null)).toBe(false);
  });
});
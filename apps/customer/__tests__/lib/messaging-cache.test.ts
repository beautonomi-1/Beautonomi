import {
  clearMessagingCache,
  getCachedConversations,
  getCachedMessagesPage,
  setCachedConversations,
  setCachedMessagesPage,
} from "@/lib/messaging-cache";

describe("messaging-cache", () => {
  beforeEach(() => {
    clearMessagingCache();
  });

  it("isolates messages by user and conversation", () => {
    setCachedMessagesPage("u1", "c1", [{ id: "m1" }]);
    setCachedMessagesPage("u2", "c1", [{ id: "m2" }]);
    expect(getCachedMessagesPage("u1", "c1")).toEqual([{ id: "m1" }]);
    expect(getCachedMessagesPage("u2", "c1")).toEqual([{ id: "m2" }]);
    expect(getCachedMessagesPage("u1", "c2")).toBeNull();
  });

  it("caps stored messages at 50", () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({ id: String(i) }));
    setCachedMessagesPage("u1", "c1", rows);
    const cached = getCachedMessagesPage<{ id: string }>("u1", "c1");
    expect(cached).toHaveLength(50);
    expect(cached?.[0]?.id).toBe("10");
  });

  it("stores conversations per user", () => {
    setCachedConversations("u1", [{ id: "a" }]);
    expect(getCachedConversations("u1")).toEqual([{ id: "a" }]);
    expect(getCachedConversations("u2")).toBeNull();
  });

  it("clearMessagingCache wipes memory", () => {
    setCachedMessagesPage("u1", "c1", [{ id: "x" }]);
    setCachedConversations("u1", [{ id: "y" }]);
    clearMessagingCache();
    expect(getCachedMessagesPage("u1", "c1")).toBeNull();
    expect(getCachedConversations("u1")).toBeNull();
  });
});

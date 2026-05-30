import { describe, it, expect } from "vitest";
import {
  sortConversationsPinFirst,
  pickDisplayConversationThread,
} from "../conversation-pin";

describe("sortConversationsPinFirst", () => {
  it("places pinned conversations before others", () => {
    const sorted = sortConversationsPinFirst([
      { id: "a", is_pinned: false, last_message_at: "2026-01-03T00:00:00Z" },
      { id: "b", is_pinned: true, last_message_at: "2026-01-01T00:00:00Z" },
      { id: "c", is_pinned: false, last_message_at: "2026-01-02T00:00:00Z" },
    ]);
    expect(sorted.map((s) => s.id)).toEqual(["b", "a", "c"]);
  });
});

describe("pickDisplayConversationThread", () => {
  it("prefers pinned thread over general", () => {
    const picked = pickDisplayConversationThread([
      { id: "1", booking_id: null, last_message_at: "2026-01-02T00:00:00Z" },
      { id: "2", booking_id: "b1", is_pinned: true, last_message_at: "2026-01-01T00:00:00Z" },
    ]);
    expect(picked.id).toBe("2");
  });
});

import { describe, expect, it } from "vitest";
import {
  enrichSupportTicketMessageForViewer,
  prependSupportTicketDescriptionIfNeeded,
} from "../support-ticket-thread";

describe("support-ticket-thread helpers", () => {
  it("does not duplicate description when first message matches", () => {
    const messages = [{ id: "m1", message: "Same text", user_id: "u1" }];
    const result = prependSupportTicketDescriptionIfNeeded(
      { id: "t1", description: "Same text", user_id: "u1", created_at: "2026-01-01T00:00:00.000Z" },
      messages,
      "u1",
    );
    expect(result).toHaveLength(1);
  });

  it("prepends synthetic description for legacy tickets", () => {
    const result = prependSupportTicketDescriptionIfNeeded(
      { id: "t1", description: "Legacy body", user_id: "u1", created_at: "2026-01-01T00:00:00.000Z" },
      [],
      "u1",
    );
    expect(result[0]).toMatchObject({
      id: "ticket-description-t1",
      message: "Legacy body",
      is_mine: true,
    });
  });

  it("enriches author labels for viewer", () => {
    const mine = enrichSupportTicketMessageForViewer(
      { id: "m1", message: "Hi", user_id: "u1", author: { full_name: "Owner" } },
      "u1",
    );
    const theirs = enrichSupportTicketMessageForViewer(
      { id: "m2", message: "Reply", user_id: "u2", author: { display_name: "Support Agent" } },
      "u1",
    );
    expect(mine.author_name).toBe("You");
    expect(mine.is_mine).toBe(true);
    expect(theirs.author_name).toBe("Support Agent");
    expect(theirs.is_mine).toBe(false);
  });
});

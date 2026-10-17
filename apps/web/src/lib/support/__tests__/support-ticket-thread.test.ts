import { describe, expect, it } from "vitest";
import { enrichSupportTicketMessageForViewer } from "../support-ticket-thread";

describe("enrichSupportTicketMessageForViewer", () => {
  it("labels assistant messages as Beautonomi Assistant, not Support Team", () => {
    const row = enrichSupportTicketMessageForViewer(
      {
        id: "1",
        message: "Hello",
        user_id: "",
        author_kind: "assistant",
      },
      "user-1",
    );
    expect(row.author_name).toBe("Beautonomi Assistant");
    expect(row.is_mine).toBe(false);
  });
});

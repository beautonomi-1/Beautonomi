import { describe, expect, it } from "vitest";
import {
  enrichSupportTicketMessageForViewer,
  prependSupportTicketDescriptionIfNeeded,
  publicSupportAuthorName,
} from "../support-ticket-thread";

describe("publicSupportAuthorName", () => {
  it("uses the first name and falls back when the account name is empty", () => {
    expect(publicSupportAuthorName("Nolo Sehlolo")).toBe("Nolo");
    expect(publicSupportAuthorName("  Nolo  ")).toBe("Nolo");
    expect(publicSupportAuthorName("Mary-Jane Watson")).toBe("Mary-Jane");
    expect(publicSupportAuthorName("")).toBe("Support Team");
    expect(publicSupportAuthorName(null)).toBe("Support Team");
    expect(publicSupportAuthorName("nolo@beautonomi.com")).toBe("Support Team");
  });
});

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

  it("shows a staff reply as a first name", () => {
    const row = enrichSupportTicketMessageForViewer(
      {
        id: "2",
        message: "We can help",
        user_id: "staff-1",
        author_kind: "staff",
        author: { full_name: "Nolo Sehlolo" },
      },
      "customer-1",
    );
    expect(row.author_name).toBe("Nolo");
    expect(row.is_mine).toBe(false);
  });

  it("leaves messages without a staff kind on their full name", () => {
    const row = enrichSupportTicketMessageForViewer(
      {
        id: "5",
        message: "Email follow-up",
        user_id: "owner-1",
        author: { full_name: "Thabo Mokoena" },
      },
      "teammate-1",
    );
    expect(row.author_name).toBe("Thabo Mokoena");
  });

  it("keeps another requester's full name", () => {
    const row = enrichSupportTicketMessageForViewer(
      {
        id: "3",
        message: "The booking failed",
        user_id: "owner-1",
        author_kind: "customer",
        author: { full_name: "Thabo Mokoena" },
      },
      "teammate-1",
    );
    expect(row.author_name).toBe("Thabo Mokoena");
  });

  it("labels the viewer's own message as You", () => {
    const row = enrichSupportTicketMessageForViewer(
      {
        id: "4",
        message: "Thanks",
        user_id: "customer-1",
        author_kind: "customer",
        author: { full_name: "Thabo Mokoena" },
      },
      "customer-1",
    );
    expect(row.author_name).toBe("You");
    expect(row.is_mine).toBe(true);
  });
});

describe("prependSupportTicketDescriptionIfNeeded", () => {
  it("keeps the original request as the requester, not support", () => {
    const messages = prependSupportTicketDescriptionIfNeeded(
      { id: "ticket-1", description: "Original issue", user_id: "owner-1", created_at: "2026-05-01T10:00:00.000Z" },
      [
        {
          id: "message-1",
          message: "A later note",
          user_id: "owner-1",
          author_name: "Thabo Mokoena",
          is_mine: false,
        },
      ],
      "teammate-1",
    );
    expect(messages[0]).toMatchObject({
      author_kind: "customer",
      author_name: "Thabo Mokoena",
      is_mine: false,
    });
  });
});

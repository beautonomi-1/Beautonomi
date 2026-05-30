import { describe, it, expect, vi } from "vitest";
import {
  buildMessageContentPreview,
  validateReplyToMessageId,
  enrichMessagesWithReplyTo,
  isProviderMessageRole,
} from "../message-replies";

describe("isProviderMessageRole", () => {
  it("treats provider_owner and provider_staff as provider", () => {
    expect(isProviderMessageRole("provider_owner")).toBe(true);
    expect(isProviderMessageRole("provider_staff")).toBe(true);
    expect(isProviderMessageRole("customer")).toBe(false);
  });
});

describe("buildMessageContentPreview", () => {
  it("returns trimmed text", () => {
    expect(buildMessageContentPreview("  Hello world  ", [])).toBe("Hello world");
  });

  it("truncates long text", () => {
    const long = "a".repeat(150);
    expect(buildMessageContentPreview(long, []).length).toBe(121);
    expect(buildMessageContentPreview(long, []).endsWith("…")).toBe(true);
  });

  it("describes attachment types", () => {
    expect(buildMessageContentPreview("", [{ type: "custom_offer" }])).toBe("Custom offer");
    expect(buildMessageContentPreview("", [{ type: "image/jpeg", name: "x.jpg" }])).toBe("Photo");
    expect(buildMessageContentPreview("", [{ type: "application/pdf", name: "doc.pdf" }])).toBe(
      "doc.pdf"
    );
  });
});

describe("validateReplyToMessageId", () => {
  it("rejects when parent message is not in conversation", async () => {
    const admin = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      })),
    } as unknown as Parameters<typeof validateReplyToMessageId>[0];

    const result = await validateReplyToMessageId(admin, "conv-1", "msg-1");
    expect(result).toEqual({
      ok: false,
      message: "Reply target message not found in this conversation",
    });
  });

  it("accepts when parent exists in conversation", async () => {
    const admin = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data: { id: "msg-1" }, error: null })),
      })),
    } as unknown as Parameters<typeof validateReplyToMessageId>[0];

    const result = await validateReplyToMessageId(admin, "conv-1", "msg-1");
    expect(result).toEqual({ ok: true });
  });
});

describe("enrichMessagesWithReplyTo", () => {
  it("uses provider business name for provider_owner reply parents", async () => {
    const parentId = "11111111-1111-1111-1111-111111111111";
    const admin = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        in: vi.fn(async () => ({
          data: [
            {
              id: parentId,
              sender_id: "user-p",
              sender_role: "provider_owner",
              content: "Offer sent",
              attachments: [],
              created_at: "2026-01-01T00:00:00.000Z",
              sender: { full_name: "Staff Person" },
            },
          ],
          error: null,
        })),
      })),
    } as unknown as Parameters<typeof enrichMessagesWithReplyTo>[0];

    const enriched = await enrichMessagesWithReplyTo(
      admin,
      [{ id: "2", sender_id: "c", reply_to_message_id: parentId, content: "ok" }],
      { providerBusinessName: "Glow Studio" }
    );
    expect(enriched[0].reply_to?.sender_name).toBe("Glow Studio");
  });

  it("attaches reply_to preview from parent rows", async () => {
    const parentId = "11111111-1111-1111-1111-111111111111";
    const admin = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        in: vi.fn(async () => ({
          data: [
            {
              id: parentId,
              sender_id: "user-a",
              sender_role: "customer",
              content: "Original question",
              attachments: [],
              created_at: "2026-01-01T00:00:00.000Z",
              sender: { full_name: "Alex Customer" },
            },
          ],
          error: null,
        })),
      })),
    } as unknown as Parameters<typeof enrichMessagesWithReplyTo>[0];

    const messages = [
      {
        id: "22222222-2222-2222-2222-222222222222",
        sender_id: "user-b",
        reply_to_message_id: parentId,
        content: "My reply",
      },
    ];

    const enriched = await enrichMessagesWithReplyTo(admin, messages);
    expect(enriched[0].reply_to).toEqual({
      id: parentId,
      sender_id: "user-a",
      sender_name: "Alex Customer",
      content_preview: "Original question",
    });
  });

  it("returns null reply_to when no parent ids", async () => {
    const admin = { from: vi.fn() } as unknown as Parameters<typeof enrichMessagesWithReplyTo>[0];
    const enriched = await enrichMessagesWithReplyTo(admin, [
      { id: "1", sender_id: "a", content: "Hi" },
    ]);
    expect(enriched[0].reply_to).toBeNull();
  });
});

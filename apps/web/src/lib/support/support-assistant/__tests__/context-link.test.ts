import { beforeEach, describe, expect, it, vi } from "vitest";
import { tryAutoLinkSupportContextForAssistant } from "../context-link";

vi.mock("@/lib/support/attach-support-context", () => ({
  attachSupportContextToTicket: vi.fn(async () => ({ ok: true as const, support_context_type: "booking", support_context_id: "b1", support_context_label: "BK-1" })),
}));

import { attachSupportContextToTicket } from "@/lib/support/attach-support-context";

describe("tryAutoLinkSupportContextForAssistant", () => {
  beforeEach(() => {
    vi.mocked(attachSupportContextToTicket).mockClear();
  });

  it("skips when ticket already has context id", async () => {
    const admin = {} as never;
    const ok = await tryAutoLinkSupportContextForAssistant({
      admin,
      ticketId: "t1",
      ticket: { user_id: "u1", category: "booking_issue", support_context_id: "existing" },
      userText: "BK-12345",
    });
    expect(ok).toBe(false);
    expect(attachSupportContextToTicket).not.toHaveBeenCalled();
  });

  it("links booking number from user message", async () => {
    vi.mocked(attachSupportContextToTicket).mockClear();
    const admin = {} as never;
    const ok = await tryAutoLinkSupportContextForAssistant({
      admin,
      ticketId: "t1",
      ticket: { user_id: "u1", category: "booking_issue", support_context_id: null },
      userText: "My booking BK-12345 was cancelled",
    });
    expect(ok).toBe(true);
    expect(attachSupportContextToTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ booking_number: "BK-12345" }),
      }),
    );
  });
});

import { describe, expect, it } from "vitest";
import { supportTicketMessageHref } from "./supportTicketMessageLink";

describe("supportTicketMessageHref", () => {
  it("builds admin ticket path with message hash", () => {
    const href = supportTicketMessageHref("ticket-1", "msg-9");
    expect(href).toContain("/admin/support-tickets/ticket-1");
    expect(href).toContain("#message-msg-9");
  });
});

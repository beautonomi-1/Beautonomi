import { describe, expect, it } from "vitest";
import {
  computeAttentionBanner,
  deliveryStatusBadge,
  detailsTabNeedsAttention,
  hasFailedPublicEmailSend,
  isWideTicketLayout,
  listAttentionBanners,
  nextQueueButtonLabel,
  nextTicketIdInQueue,
  resolveQueueNav,
  shouldAutoScrollThread,
  shouldShowOriginalRequest,
  unwrapAdminBookingPayload,
} from "@/routes/support/ticket-detail/ticketDetailHelpers";

describe("isWideTicketLayout", () => {
  it("uses tabs below 760px (e.g. inbox panel at a 1024px viewport is ~340px)", () => {
    expect(isWideTicketLayout(0)).toBe(false);
    expect(isWideTicketLayout(340)).toBe(false);
    expect(isWideTicketLayout(759)).toBe(false);
  });
  it("shows thread and sidebar side by side at 760px and wider", () => {
    expect(isWideTicketLayout(760)).toBe(true);
    expect(isWideTicketLayout(1200)).toBe(true);
  });
});

describe("shouldAutoScrollThread", () => {
  const base = { ticketChanged: false, prevItemCount: 5, nextItemCount: 5, distanceFromBottom: 0 };
  it("always scrolls when a different ticket opens", () => {
    expect(shouldAutoScrollThread({ ...base, ticketChanged: true, distanceFromBottom: 5000 })).toBe(true);
  });
  it("does not move the agent on a background refetch with no new messages", () => {
    expect(shouldAutoScrollThread(base)).toBe(false);
  });
  it("follows new messages when the agent is near the bottom", () => {
    expect(shouldAutoScrollThread({ ...base, nextItemCount: 6, distanceFromBottom: 40 })).toBe(true);
  });
  it("keeps position when the agent scrolled up to read history", () => {
    expect(shouldAutoScrollThread({ ...base, nextItemCount: 6, distanceFromBottom: 800 })).toBe(false);
  });
});

describe("nextQueueButtonLabel", () => {
  it("returns Next in queue when there is a next id", () => {
    expect(nextQueueButtonLabel("abc")).toBe("Next in queue");
  });
  it("returns Back to queue when queue is empty", () => {
    expect(nextQueueButtonLabel(null)).toBe("Back to queue");
  });
});

describe("deliveryStatusBadge", () => {
  it("shows failed state", () => {
    expect(deliveryStatusBadge("failed")?.label).toBe("Send failed");
  });
  it("shows sending state", () => {
    expect(deliveryStatusBadge("sending")?.label).toBe("Sending…");
  });
  it("shows sent state", () => {
    expect(deliveryStatusBadge("sent")?.label).toBe("Sent");
  });
  it("hides skipped", () => {
    expect(deliveryStatusBadge("skipped")).toBeNull();
  });
});

describe("shouldShowOriginalRequest", () => {
  it("hides when first customer message matches description", () => {
    const messages = [
      {
        user_id: "u1",
        message: "Hello\nworld",
        is_internal: false,
      },
    ];
    expect(shouldShowOriginalRequest("Hello\nworld", messages, "u1")).toBe(false);
  });
  it("shows when description differs", () => {
    const messages = [{ user_id: "u1", message: "Only in thread", is_internal: false }];
    expect(shouldShowOriginalRequest("Different text", messages, "u1")).toBe(true);
  });
});

describe("computeAttentionBanner", () => {
  it("returns null for resolved tickets", () => {
    expect(
      computeAttentionBanner({ status: "resolved", attention_state: "awaiting_agent" }),
    ).toBeNull();
  });
  it("returns awaiting agent banner", () => {
    const b = computeAttentionBanner({
      status: "open",
      attention_state: "awaiting_agent",
      handling_mode: "human",
    });
    expect(b?.text).toContain("Awaiting your reply");
  });
});

describe("listAttentionBanners", () => {
  it("returns empty for resolved tickets", () => {
    expect(listAttentionBanners({ status: "resolved" })).toEqual([]);
  });
  it("shows AI handling plus one SLA line when assistant", () => {
    const banners = listAttentionBanners({
      status: "open",
      handling_mode: "assistant",
      sla_state: "at_risk",
      sla_resolution_due_at: new Date(Date.now() + 3600_000).toISOString(),
    });
    expect(banners).toHaveLength(2);
    expect(banners[0]?.text).toContain("AI handling");
    expect(banners[1]?.text).toContain("at risk");
  });
  it("caps at two banners for human handling", () => {
    const banners = listAttentionBanners({
      status: "open",
      handling_mode: "human",
      attention_state: "first_response_overdue",
      first_response_due_at: new Date(Date.now() - 3600_000).toISOString(),
      sla_state: "breached",
      sla_resolution_due_at: new Date(Date.now() - 7200_000).toISOString(),
    });
    expect(banners).toHaveLength(2);
  });
});

describe("resolveQueueNav", () => {
  it("advances within the page queue", () => {
    const nav = resolveQueueNav({
      currentId: "a",
      queueTicketIds: ["a", "b"],
      remoteNextId: "z",
    });
    expect(nav.label).toBe("Next in queue");
    expect(nav.nextId).toBe("b");
  });
  it("shows end of page on last row", () => {
    const nav = resolveQueueNav({
      currentId: "b",
      queueTicketIds: ["a", "b"],
      remoteNextId: "z",
    });
    expect(nav.label).toBe("End of page");
    expect(nav.endOfPage).toBe(true);
  });
  it("uses remote needs-response queue when not in page list", () => {
    const nav = resolveQueueNav({
      currentId: "x",
      queueTicketIds: null,
      remoteNextId: "y",
    });
    expect(nav.label).toBe("Next needing response");
    expect(nav.nextId).toBe("y");
  });

  it("does not use remote queue when a page list was supplied but id is off-page", () => {
    const nav = resolveQueueNav({
      currentId: "off-page",
      queueTicketIds: ["a", "b"],
      remoteNextId: "y",
    });
    expect(nav.label).toBe("Back to queue");
    expect(nav.nextId).toBeNull();
  });
});

describe("nextTicketIdInQueue", () => {
  it("returns null when id is not on the page", () => {
    expect(nextTicketIdInQueue("missing", ["a", "b"])).toBeNull();
  });
});

describe("detailsTabNeedsAttention", () => {
  it("is true when refund is available", () => {
    expect(detailsTabNeedsAttention({ showCancel: false, showRefund: true, unlinkedContext: false, failedPublicSend: false })).toBe(true);
  });
});

describe("hasFailedPublicEmailSend", () => {
  it("detects failed public messages", () => {
    expect(
      hasFailedPublicEmailSend([{ is_internal: false, email_delivery_status: "failed" }]),
    ).toBe(true);
  });
});

describe("unwrapAdminBookingPayload", () => {
  it("reads nested booking row", () => {
    const row = unwrapAdminBookingPayload({
      data: { status: "confirmed", payment_status: "paid" },
      error: null,
    });
    expect(row?.status).toBe("confirmed");
    expect(row?.payment_status).toBe("paid");
  });
});

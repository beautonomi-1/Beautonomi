import { describe, expect, it } from "vitest";
import {
  computeAttentionBanner,
  deliveryStatusBadge,
  isWideTicketLayout,
  nextQueueButtonLabel,
  shouldAutoScrollThread,
  shouldShowOriginalRequest,
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

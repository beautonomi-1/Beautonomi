import { afterEach, describe, expect, it, vi } from "vitest";

const USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const hoisted = vi.hoisted(() => ({
  sendToUserMock: vi.fn(),
}));

vi.mock("@/lib/notifications/onesignal", () => ({
  sendToUser: hoisted.sendToUserMock,
}));

function pushQueueRow() {
  return {
    id: "queue-row-1",
    channel: "push" as const,
    template_key: "booking_confirmed",
    recipient_user_id: USER_ID,
    booking_id: "booking-1",
    notification_id: null,
    payload: {
      title: "Booking confirmed",
      message: "Your booking is confirmed",
      data: { template_key: "booking_confirmed" },
    },
    attempts: 0,
    max_attempts: 5,
  };
}

describe("deliverQueueRow", () => {
  afterEach(() => {
    hoisted.sendToUserMock.mockReset();
  });

  it("returns failure when sendToUser reports push send failed", async () => {
    hoisted.sendToUserMock.mockResolvedValue({
      success: false,
      error: "push send failed",
    });

    const { deliverQueueRow } = await import("@/lib/notifications/deliver-queue-row");
    const result = await deliverQueueRow(pushQueueRow());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("push send failed");
    }
  });

  it("returns success and passes skipMustDeliverRetryEnqueue to sendToUser", async () => {
    hoisted.sendToUserMock.mockResolvedValue({
      success: true,
      notification_id: "os-1",
    });

    const { deliverQueueRow } = await import("@/lib/notifications/deliver-queue-row");
    const result = await deliverQueueRow(pushQueueRow());

    expect(result.ok).toBe(true);
    expect(hoisted.sendToUserMock).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        title: "Booking confirmed",
        data: expect.objectContaining({ template_key: "booking_confirmed" }),
      }),
      ["push"],
      expect.objectContaining({ skipMustDeliverRetryEnqueue: true }),
    );
  });
});

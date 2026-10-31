import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDispatchTemplateNotification = vi.fn(async () => ({ success: true }));

vi.mock("@/lib/notifications/dispatch-template-notification", () => ({
  dispatchTemplateNotification: (...args: unknown[]) => mockDispatchTemplateNotification(...args),
}));

import { notifySupportStaffInboxActivity } from "../notification-service";

describe("notifySupportStaffInboxActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dispatches support_ticket_updated with admin in-app and email CTA paths", async () => {
    const ticketId = "6506a136-d3cd-4b8e-8c21-d51b411327a3";

    await notifySupportStaffInboxActivity(
      ["staff-1", "staff-2"],
      "TKT-001",
      "Customer replied",
      ticketId,
      ["email", "push"],
    );

    expect(mockDispatchTemplateNotification).toHaveBeenCalledTimes(1);
    expect(mockDispatchTemplateNotification).toHaveBeenCalledWith(
      "support_ticket_updated",
      ["staff-1", "staff-2"],
      {
        ticket_number: "TKT-001",
        update_message: "Customer replied",
        ticket_id: ticketId,
      },
      ["email", "push"],
      {
        appType: "customer",
        inAppActionUrl: `/admin/support-tickets/${ticketId}`,
        emailCtaPath: `/admin/support-tickets/${ticketId}`,
      },
    );
  });

  it("skips dispatch when recipient list is empty", async () => {
    const result = await notifySupportStaffInboxActivity([], "TKT-1", "msg", "ticket-id");

    expect(result).toEqual({ success: true, skipped: true });
    expect(mockDispatchTemplateNotification).not.toHaveBeenCalled();
  });
});

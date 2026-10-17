import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNotifyStaff = vi.fn().mockResolvedValue(undefined);
const mockResolveStaff = vi.fn().mockResolvedValue([]);
const mockStartTriage = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/notifications/notification-service", () => ({
  notifySupportStaffInboxActivity: (...args: unknown[]) => mockNotifyStaff(...args),
  resolveSupportTicketStaffRecipients: (...args: unknown[]) => mockResolveStaff(...args),
}));

vi.mock("@/workflows/start-support-triage", () => ({
  startSupportTriageForTicket: (...args: unknown[]) => mockStartTriage(...args),
}));

describe("handoffSupportTicketToHuman", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no-ops for tickets that were never in assistant mode", async () => {
    const updates: unknown[] = [];
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "support_tickets") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: "t1",
                    ticket_number: "ST-1",
                    subject: "Help",
                    priority: "medium",
                    assigned_to: null,
                    handling_mode: "human",
                    assistant_handoff_at: null,
                  },
                }),
              }),
            }),
            update: vi.fn((row: unknown) => {
              updates.push(row);
              return { eq: vi.fn().mockResolvedValue({ error: null }) };
            }),
          };
        }
        return {};
      }),
    };

    const { handoffSupportTicketToHuman } = await import("../handoff");
    await handoffSupportTicketToHuman({ admin: admin as never, ticketId: "t1" });

    expect(updates).toHaveLength(0);
    expect(mockNotifyStaff).not.toHaveBeenCalled();
    expect(mockStartTriage).not.toHaveBeenCalled();
  });

  it("handoffs assistant tickets and starts triage", async () => {
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "support_tickets") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: "t2",
                    ticket_number: "ST-2",
                    subject: "Chat",
                    priority: "high",
                    assigned_to: null,
                    handling_mode: "assistant",
                    assistant_handoff_at: null,
                  },
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === "support_ticket_notes") {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        return {};
      }),
    };

    const { handoffSupportTicketToHuman } = await import("../handoff");
    await handoffSupportTicketToHuman({
      admin: admin as never,
      ticketId: "t2",
      reason: "User requested a person",
    });

    expect(mockNotifyStaff).toHaveBeenCalled();
    expect(mockStartTriage).toHaveBeenCalledWith("t2");
  });
});

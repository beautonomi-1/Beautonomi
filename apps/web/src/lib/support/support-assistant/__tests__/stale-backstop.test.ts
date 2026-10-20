import { describe, expect, it, vi, beforeEach } from "vitest";
import { handoffStaleSupportAssistantTickets } from "../stale-backstop";

vi.mock("../handoff", () => ({
  handoffSupportTicketToHuman: vi.fn().mockResolvedValue(undefined),
}));

import { handoffSupportTicketToHuman } from "../handoff";

describe("handoffStaleSupportAssistantTickets", () => {
  beforeEach(() => {
    vi.mocked(handoffSupportTicketToHuman).mockClear();
  });

  it("hands off stale assistant tickets with no running turn", async () => {
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "support_tickets") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            lt: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [{ id: "ticket-1" }] }),
          };
        }
        if (table === "agent_runs") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [] }),
          };
        }
        return {};
      }),
    };

    const count = await handoffStaleSupportAssistantTickets(admin as never);
    expect(count).toBe(1);
    expect(handoffSupportTicketToHuman).toHaveBeenCalledTimes(1);
    expect(handoffSupportTicketToHuman).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: "ticket-1", reason: "Assistant reply not delivered" }),
    );
  });

  it("skips tickets with a running agent turn", async () => {
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "support_tickets") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            lt: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [{ id: "ticket-busy" }] }),
          };
        }
        if (table === "agent_runs") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [{ id: "run-1" }] }),
          };
        }
        return {};
      }),
    };

    const count = await handoffStaleSupportAssistantTickets(admin as never);
    expect(count).toBe(0);
    expect(handoffSupportTicketToHuman).not.toHaveBeenCalled();
  });
});

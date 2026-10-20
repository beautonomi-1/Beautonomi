import { describe, expect, it, vi, beforeEach } from "vitest";
import { precheckSupportAssistantTurn } from "../turn-precheck";

vi.mock("../availability", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../availability")>();
  return { ...actual, resolveSupportAssistantAvailability: vi.fn() };
});

vi.mock("@/lib/agents/config-loader", () => ({
  loadAgentOperationalState: vi.fn(),
}));

vi.mock("@/lib/rate-limit/store", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock("../handoff", () => ({
  handoffSupportTicketToHuman: vi.fn().mockResolvedValue(undefined),
}));

import { resolveSupportAssistantAvailability } from "../availability";
import { handoffSupportTicketToHuman } from "../handoff";

describe("precheckSupportAssistantTurn flag off", () => {
  beforeEach(() => {
    vi.mocked(handoffSupportTicketToHuman).mockClear();
  });

  it("hands off and returns ASSISTANT_DISABLED when flag is off", async () => {
    vi.mocked(resolveSupportAssistantAvailability).mockResolvedValue({
      enabled: false,
      code: "FLAG_OFF",
    });

    const admin = {
      from: vi.fn((table: string) => {
        if (table === "support_tickets") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "t1",
                ticket_number: "ST-1",
                subject: "Help",
                description: "d",
                status: "open",
                priority: "medium",
                category: "account",
                provider_id: null,
                user_id: "user-1",
                requester_type: "customer",
                support_context_type: null,
                support_context_id: null,
                support_context_label: null,
                handling_mode: "assistant",
                channel: "app",
              },
            }),
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

    const pre = await precheckSupportAssistantTurn({
      admin: admin as never,
      ticketId: "t1",
    });

    expect(pre.ok).toBe(false);
    if (pre.ok === false) {
      expect(pre.result.code).toBe("ASSISTANT_DISABLED");
      expect(pre.result.handoff).toBe(true);
    }
    expect(handoffSupportTicketToHuman).toHaveBeenCalledTimes(1);
  });
});

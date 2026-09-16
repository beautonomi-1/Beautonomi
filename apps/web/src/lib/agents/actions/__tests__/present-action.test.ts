import { describe, expect, it } from "vitest";
import { agentActionDeepLink, presentAgentAction } from "../present-action";

describe("presentAgentAction", () => {
  it("maps support.reply to human copy", () => {
    const p = presentAgentAction("support.reply");
    expect(p.title).toBe("Suggested reply");
    expect(p.impact).toBe("customer_visible");
    expect(p.primaryButtonLabel).toBe("Approve and send");
  });

  it("maps reconciliation.investigate to internal briefing", () => {
    const p = presentAgentAction("reconciliation.investigate");
    expect(p.title).toBe("Investigation briefing");
    expect(p.impact).toBe("internal_note");
  });

  it("builds domain deep links with assist param", () => {
    const link = agentActionDeepLink("support.reply", "support_ticket", "ticket-1", "action-1");
    expect(link).toContain("/admin/support-tickets/ticket-1");
    expect(link).toContain("assist=action-1");
  });

  it("maps reconciliation.investigate to reconciliation-exceptions route", () => {
    const p = presentAgentAction("reconciliation.investigate");
    expect(p.entityPath("exc-1")).toBe("/admin/reconciliation-exceptions?highlight=exc-1");
  });

  it("maps membership.dunning to finance ai queue", () => {
    const p = presentAgentAction("membership.dunning");
    expect(p.entityPath("mem-1")).toBe("/admin/finance/ai-queue");
  });
});

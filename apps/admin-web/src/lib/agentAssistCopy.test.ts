import { describe, expect, it } from "vitest";
import { agentActionDeepLink } from "./agentAssistCopy";

describe("agentActionDeepLink", () => {
  it("links payout review to payouts list with highlight and assist", () => {
    const link = agentActionDeepLink("payout.review", "payout-1", "action-1");
    expect(link).toBe("/admin/payouts?highlight=payout-1&assist=action-1");
  });

  it("links reconciliation investigate to reconciliation-exceptions", () => {
    const link = agentActionDeepLink("reconciliation.investigate", "exc-1", "action-2");
    expect(link).toBe("/admin/reconciliation-exceptions?highlight=exc-1&assist=action-2");
  });

  it("links refund briefing with highlight", () => {
    const link = agentActionDeepLink("refund.briefing", "ref-1", "action-3");
    expect(link).toContain("highlight=ref-1");
    expect(link).toContain("assist=action-3");
  });

  it("links membership dunning to finance ai queue", () => {
    const link = agentActionDeepLink("membership.dunning", "mem-1", "action-4");
    expect(link).toBe("/admin/finance/ai-queue?assist=action-4");
  });

  it("links support reply to ticket detail", () => {
    const link = agentActionDeepLink("support.reply", "ticket-1", "action-5");
    expect(link).toBe("/admin/support-tickets/ticket-1?assist=action-5");
  });
});

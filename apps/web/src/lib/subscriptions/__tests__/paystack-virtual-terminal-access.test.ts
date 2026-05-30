import { describe, expect, it } from "vitest";

/**
 * Documents expected interpretation of paystack_virtual_terminal plan JSON.
 * Route handlers use: if (access.maxTerminals && count >= access.maxTerminals) → limit.
 */
describe("paystack_virtual_terminal entitlement semantics", () => {
  const unlimitedPlan = {
    paystack_virtual_terminal: {
      enabled: true,
      max_terminals: null,
      per_location_terminals: true,
      advanced_reconciliation: true,
      split_settlement: true,
    },
  };

  it("treats null max_terminals as unlimited (no limit enforced)", () => {
    const terminal = unlimitedPlan.paystack_virtual_terminal;
    const maxTerminals = terminal.max_terminals as number | null | undefined;
    const terminalCount = 99;
    const limitReached = Boolean(maxTerminals && terminalCount >= maxTerminals);
    expect(limitReached).toBe(false);
  });

  it("requires enabled === true for access", () => {
    expect(unlimitedPlan.paystack_virtual_terminal.enabled).toBe(true);
  });

  it("enables all optional capabilities when flags are true", () => {
    const t = unlimitedPlan.paystack_virtual_terminal;
    expect(t.per_location_terminals).toBe(true);
    expect(t.advanced_reconciliation).toBe(true);
    expect(t.split_settlement).toBe(true);
  });
});

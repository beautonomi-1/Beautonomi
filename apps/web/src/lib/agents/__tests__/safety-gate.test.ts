import { describe, it, expect } from "vitest";
import { assertAgentMutationAllowed, assertAgentReadAllowed } from "../safety-gate";

describe("agent safety gate", () => {
  it("blocks mutations when master is off", () => {
    const r = assertAgentMutationAllowed({
      masterEnabled: false,
      shadowMode: false,
      rlsHarnessGreen: true,
    });
    expect(r.allowed).toBe(false);
  });

  it("blocks mutations in shadow mode", () => {
    const r = assertAgentMutationAllowed({
      masterEnabled: true,
      shadowMode: true,
      rlsHarnessGreen: true,
    });
    expect(r.allowed).toBe(false);
  });

  it("blocks mutations until P0 migrations are verified", () => {
    const r = assertAgentMutationAllowed({
      masterEnabled: true,
      shadowMode: false,
      rlsHarnessGreen: true,
      p0MigrationsVerified: false,
    });
    expect(r.allowed).toBe(false);
    expect((r.blockers ?? []).some((b) => b.includes("787_gift_cards_rls_hardening.sql"))).toBe(true);
  });

  it("allows mutations when every gate condition passes", () => {
    const r = assertAgentMutationAllowed({
      masterEnabled: true,
      shadowMode: false,
      rlsHarnessGreen: true,
      p0MigrationsVerified: true,
    });
    expect(r.allowed).toBe(true);
  });

  it("allows read when master enabled", () => {
    expect(assertAgentReadAllowed({ masterEnabled: true }).allowed).toBe(true);
  });
});

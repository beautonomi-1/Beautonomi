import { describe, expect, it } from "vitest";
import { recordAtRiskSaveForCase } from "@/lib/provider-ops/ops-case";

describe("recordAtRiskSaveForCase", () => {
  it("returns invalid_state because saves are automatic", async () => {
    const supabase = {} as never;
    const result = await recordAtRiskSaveForCase(supabase, {
      tenantId: "t1",
      caseId: "case-1",
      actorUserId: "u1",
    });
    expect(result).toEqual({
      error: "invalid_state",
      message: expect.stringContaining("automatically"),
    });
  });
});

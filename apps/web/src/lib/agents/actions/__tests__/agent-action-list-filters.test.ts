import { describe, expect, it } from "vitest";
import { allowedActionTypesForRole } from "../agent-action-list-filters";

describe("allowedActionTypesForRole", () => {
  it("limits support_agent to support action types", () => {
    const types = allowedActionTypesForRole("support_agent", undefined as never);
    expect(types).toContain("support.reply");
    expect(types).not.toContain("payout.review");
  });

  it("allows finance types for admin_finance", () => {
    const types = allowedActionTypesForRole("admin_finance", undefined as never);
    expect(types).toContain("payout.review");
    expect(types).not.toContain("support.reply");
  });
});

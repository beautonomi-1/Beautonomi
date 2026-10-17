import { describe, expect, it } from "vitest";
import {
  deriveSupportContextTypeForTicket,
  parseUserSubmittedCategory,
  validateAdminCategoryValue,
} from "@/lib/support/ticket-categories";

/** Contract tests for create/patch routes (no HTTP stack). */
describe("support ticket category API contract", () => {
  it("user create rejects legacy payments and accepts selectable values", () => {
    expect(parseUserSubmittedCategory("payments").ok).toBe(false);
    expect(parseUserSubmittedCategory("terminal_onboarding").ok).toBe(true);
    expect(parseUserSubmittedCategory(undefined)).toEqual({ ok: true, category: "general_inquiry" });
  });

  it("admin allows null and legacy payments but rejects unknown slugs", () => {
    expect(validateAdminCategoryValue(null)).toEqual({ ok: true, category: null });
    expect(validateAdminCategoryValue("payments")).toEqual({ ok: true, category: "payments" });
    expect(validateAdminCategoryValue("not_a_real_category").ok).toBe(false);
  });

  it("deriveSupportContextTypeForTicket matches server route behavior", () => {
    expect(
      deriveSupportContextTypeForTicket({
        category: "provider_payouts",
        supportContextId: null,
        supportContextLabel: "",
        clientContextType: "booking",
      }),
    ).toBe("payment");
  });
});

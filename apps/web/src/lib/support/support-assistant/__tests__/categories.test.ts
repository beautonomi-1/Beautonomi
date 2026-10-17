import { describe, expect, it } from "vitest";
import { isSafetySupportCategory, categoryExpectsLinkableRecord } from "../categories";

describe("support-assistant categories", () => {
  it("treats safety_* as safety", () => {
    expect(isSafetySupportCategory("safety_emergency")).toBe(true);
    expect(isSafetySupportCategory("payment_refund")).toBe(false);
  });

  it("expects linkable record for booking refund category", () => {
    expect(categoryExpectsLinkableRecord("payment_refund")).toBe(true);
    expect(categoryExpectsLinkableRecord("account_delete")).toBe(false);
  });
});

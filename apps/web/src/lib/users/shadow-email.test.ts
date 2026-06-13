import { describe, expect, it } from "vitest";
import { isShadowEmail, isRealCustomerEmail, createWalkInEmail } from "@/lib/users/shadow-email";

describe("shadow-email", () => {
  it("detects synthetic walk-in domains", () => {
    expect(isShadowEmail("walkin+abc@beautonomi.invalid")).toBe(true);
    expect(isShadowEmail("user@beautonomi.local")).toBe(true);
    expect(isShadowEmail("real@example.com")).toBe(false);
  });

  it("classifies real customer emails", () => {
    expect(isRealCustomerEmail("client@salon.com")).toBe(true);
    expect(isRealCustomerEmail("walkin@beautonomi.invalid")).toBe(false);
  });

  it("creates unique walk-in emails", () => {
    const a = createWalkInEmail();
    const b = createWalkInEmail();
    expect(a).toContain("@beautonomi.invalid");
    expect(a).not.toBe(b);
  });
});

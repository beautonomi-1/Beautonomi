import { describe, expect, it } from "vitest";
import { phoneVerifiedResetPatch } from "../phone-verified-reset";

describe("phoneVerifiedResetPatch (F3-18)", () => {
  it("returns null when phone is not in the patch", () => {
    expect(phoneVerifiedResetPatch("+27821234567", undefined)).toBeNull();
  });

  it("does not clear verification when the number is unchanged (formatting only)", () => {
    expect(phoneVerifiedResetPatch("+27 82 123 4567", "+27821234567")).toEqual({
      phone: "+27821234567",
    });
  });

  it("clears phone_verified when the number changes", () => {
    expect(phoneVerifiedResetPatch("+27821234567", "+27820000000")).toEqual({
      phone: "+27820000000",
      phone_verified: false,
      phone_verified_at: null,
    });
  });

  it("clears verification when the phone is removed", () => {
    expect(phoneVerifiedResetPatch("+27821234567", "")).toEqual({
      phone: null,
      phone_verified: false,
      phone_verified_at: null,
    });
  });
});

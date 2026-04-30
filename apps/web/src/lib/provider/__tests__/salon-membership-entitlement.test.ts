import { describe, expect, it } from "vitest";
import { isSalonMembershipEntitledForDiscount } from "../salon-membership-entitlement";

describe("isSalonMembershipEntitledForDiscount", () => {
  it("returns false when status is not active", () => {
    expect(
      isSalonMembershipEntitledForDiscount({
        status: "cancelled",
        expires_at: null,
        planIsActive: true,
      }),
    ).toBe(false);
  });

  it("returns false when expiry is in the past", () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(
      isSalonMembershipEntitledForDiscount({
        status: "active",
        expires_at: past,
        planIsActive: true,
      }),
    ).toBe(false);
  });

  it("returns true when active, future expiry, plan active", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(
      isSalonMembershipEntitledForDiscount({
        status: "active",
        expires_at: future,
        planIsActive: true,
      }),
    ).toBe(true);
  });

  it("returns true when active with null expiry (open-ended)", () => {
    expect(
      isSalonMembershipEntitledForDiscount({
        status: "active",
        expires_at: null,
        planIsActive: true,
      }),
    ).toBe(true);
  });

  it("returns false when plan is deactivated", () => {
    expect(
      isSalonMembershipEntitledForDiscount({
        status: "active",
        expires_at: null,
        planIsActive: false,
      }),
    ).toBe(false);
  });
});

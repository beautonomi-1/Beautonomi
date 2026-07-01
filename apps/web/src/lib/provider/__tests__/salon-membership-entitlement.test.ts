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

  // ── past_due grace window ────────────────────────────────────────────────
  it("returns true for past_due within 3-day grace window", () => {
    const recentPastDue = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(
      isSalonMembershipEntitledForDiscount({
        status: "past_due",
        expires_at: future,
        planIsActive: true,
        past_due_since: recentPastDue,
      }),
    ).toBe(true);
  });

  it("returns false for past_due after grace window expired", () => {
    const oldPastDue = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(
      isSalonMembershipEntitledForDiscount({
        status: "past_due",
        expires_at: future,
        planIsActive: true,
        past_due_since: oldPastDue,
      }),
    ).toBe(false);
  });

  it("returns false for past_due when past_due_since is null", () => {
    expect(
      isSalonMembershipEntitledForDiscount({
        status: "past_due",
        expires_at: null,
        planIsActive: true,
        past_due_since: null,
      }),
    ).toBe(false);
  });

  it("returns false for past_due when term has expired regardless of grace", () => {
    const recentPastDue = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(
      isSalonMembershipEntitledForDiscount({
        status: "past_due",
        expires_at: past,
        planIsActive: true,
        past_due_since: recentPastDue,
      }),
    ).toBe(false);
  });
});

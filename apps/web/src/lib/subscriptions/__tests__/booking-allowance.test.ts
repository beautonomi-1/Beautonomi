import { describe, expect, it } from "vitest";
import {
  bookingCountsTowardMonthlyAllowance,
  bookingLimitsAreEnforced,
  evaluateBookingAllowance,
  providerBookingEligibilityFromLimit,
  resolveMonthlyBookingCap,
  subscriptionRowIsEntitled,
} from "../limit-checker";

describe("booking allowance", () => {
  it("does not enforce a cap when booking_limits.enabled is false", () => {
    expect(bookingLimitsAreEnforced({ booking_limits: { enabled: false } })).toBe(false);
    const decision = evaluateBookingAllowance({
      planName: "Beautonomi Growth",
      features: { booking_limits: { enabled: false } },
      columnMax: null,
      currentCount: 400,
    });
    expect(decision.canProceed).toBe(true);
    expect(decision.isUnlimited).toBe(true);
  });

  it("caps an enforced plan at the published monthly number", () => {
    const under = evaluateBookingAllowance({
      planName: "Beautonomi Starter",
      features: { booking_limits: { enabled: true, max_bookings_per_month: 50 } },
      columnMax: 50,
      currentCount: 49,
    });
    expect(under.canProceed).toBe(true);
    expect(under.limitValue).toBe(50);

    const atCap = evaluateBookingAllowance({
      planName: "Beautonomi Starter",
      features: { booking_limits: { enabled: true, max_bookings_per_month: 50 } },
      columnMax: 50,
      currentCount: 50,
    });
    expect(atCap.canProceed).toBe(false);
    expect(atCap.reason).toMatch(/50\/50/);
  });

  it("uses the plan column when the JSON cap is null", () => {
    expect(
      resolveMonthlyBookingCap({ booking_limits: { enabled: true, max_bookings_per_month: null } }, 50),
    ).toBe(50);
  });

  it("says the allowance could not be verified when the lookup failed", () => {
    const banner = providerBookingEligibilityFromLimit({
      canProceed: false,
      reason: "Unable to check booking limit",
      currentCount: 0,
      limitValue: null,
      planName: "",
      isUnlimited: false,
    });
    expect(banner.can_accept_online_bookings).toBe(false);
    expect(banner.booking_limit_message).toMatch(/couldn.t verify your online booking allowance/i);
    expect(banner.booking_limit_message).not.toMatch(/reached your monthly/i);
  });

  it("counts online bookings toward the cap and leaves walk-ins and staff-created bookings out", () => {
    expect(bookingCountsTowardMonthlyAllowance("online")).toBe(true);
    expect(bookingCountsTowardMonthlyAllowance(null)).toBe(true);
    expect(bookingCountsTowardMonthlyAllowance(undefined)).toBe(true);
    expect(bookingCountsTowardMonthlyAllowance("walk_in")).toBe(false);
    expect(bookingCountsTowardMonthlyAllowance("provider")).toBe(false);
  });

  it("still tells the provider when Starter is actually at the cap", () => {
    const banner = providerBookingEligibilityFromLimit({
      canProceed: false,
      reason: "Monthly booking limit reached (50/50). Upgrade your plan to continue.",
      currentCount: 50,
      limitValue: 50,
      planName: "Beautonomi Starter",
      isUnlimited: false,
    });
    expect(banner.can_accept_online_bookings).toBe(false);
    expect(banner.booking_limit_message).toMatch(/unlimited bookings/i);
  });

  it("keeps an Apple billing-retry row entitled after expires_at has lapsed", () => {
    const now = Date.parse("2026-09-29T09:00:00.000Z");
    expect(
      subscriptionRowIsEntitled(
        {
          status: "past_due",
          billing_provider: "apple",
          expires_at: "2026-09-01T00:00:00.000Z",
          apple_grace_period_expires_at: "2026-10-01T00:00:00.000Z",
          updated_at: "2026-09-01T00:00:00.000Z",
        },
        now,
      ),
    ).toBe(true);
  });
});

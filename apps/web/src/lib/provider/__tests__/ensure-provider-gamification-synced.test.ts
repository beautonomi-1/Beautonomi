import { describe, expect, it } from "vitest";
import { shouldHealProviderGamification } from "../ensure-provider-gamification-synced";

describe("shouldHealProviderGamification", () => {
  it("heals when stored bookings differ from completed count", () => {
    expect(
      shouldHealProviderGamification({
        completedBookings: 10,
        storedBookings: 8,
        reviewCount: 0,
        transactionCount: 50,
        hasProviderPointsRow: true,
      }),
    ).toBe(true);
  });

  it("heals when ledger is empty but provider has completed bookings", () => {
    expect(
      shouldHealProviderGamification({
        completedBookings: 3,
        storedBookings: 3,
        reviewCount: 0,
        transactionCount: 0,
        hasProviderPointsRow: true,
      }),
    ).toBe(true);
  });

  it("heals when ledger is empty but provider has reviews", () => {
    expect(
      shouldHealProviderGamification({
        completedBookings: 0,
        storedBookings: 0,
        reviewCount: 2,
        transactionCount: 0,
        hasProviderPointsRow: false,
      }),
    ).toBe(true);
  });

  it("does not heal new providers with no activity", () => {
    expect(
      shouldHealProviderGamification({
        completedBookings: 0,
        storedBookings: 0,
        reviewCount: 0,
        transactionCount: 0,
        hasProviderPointsRow: false,
      }),
    ).toBe(false);
  });

  it("does not heal when ledger and stats are aligned", () => {
    expect(
      shouldHealProviderGamification({
        completedBookings: 5,
        storedBookings: 5,
        reviewCount: 1,
        transactionCount: 12,
        hasProviderPointsRow: true,
      }),
    ).toBe(false);
  });
});

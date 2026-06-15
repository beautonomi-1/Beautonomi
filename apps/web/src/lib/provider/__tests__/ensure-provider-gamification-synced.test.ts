import { describe, expect, it } from "vitest";
import { shouldHealProviderGamification } from "../ensure-provider-gamification-synced";

const baseSignals = {
  completedBookings: 5,
  storedBookings: 5,
  reviewCount: 1,
  storedReviewCount: 1,
  ratingAverage: 4.5,
  storedRatingAverage: 4.5,
  transactionCount: 12,
  hasProviderPointsRow: true,
};

describe("shouldHealProviderGamification", () => {
  it("heals when stored bookings differ from completed count", () => {
    expect(
      shouldHealProviderGamification({
        ...baseSignals,
        completedBookings: 10,
        storedBookings: 8,
      }),
    ).toBe(true);
  });

  it("heals when stored review count differs from live reviews", () => {
    expect(
      shouldHealProviderGamification({
        ...baseSignals,
        reviewCount: 2,
        storedReviewCount: 0,
      }),
    ).toBe(true);
  });

  it("heals when stored rating average differs from live average", () => {
    expect(
      shouldHealProviderGamification({
        ...baseSignals,
        ratingAverage: 4.7,
        storedRatingAverage: 4.0,
      }),
    ).toBe(true);
  });

  it("heals when ledger is empty but provider has completed bookings", () => {
    expect(
      shouldHealProviderGamification({
        ...baseSignals,
        completedBookings: 3,
        storedBookings: 3,
        reviewCount: 0,
        storedReviewCount: 0,
        ratingAverage: 0,
        storedRatingAverage: 0,
        transactionCount: 0,
      }),
    ).toBe(true);
  });

  it("heals when ledger is empty but provider has reviews", () => {
    expect(
      shouldHealProviderGamification({
        ...baseSignals,
        completedBookings: 0,
        storedBookings: 0,
        reviewCount: 2,
        storedReviewCount: 2,
        ratingAverage: 5,
        storedRatingAverage: 5,
        transactionCount: 0,
        hasProviderPointsRow: false,
      }),
    ).toBe(true);
  });

  it("does not heal new providers with no activity", () => {
    expect(
      shouldHealProviderGamification({
        ...baseSignals,
        completedBookings: 0,
        storedBookings: 0,
        reviewCount: 0,
        storedReviewCount: 0,
        ratingAverage: 0,
        storedRatingAverage: 0,
        transactionCount: 0,
        hasProviderPointsRow: false,
      }),
    ).toBe(false);
  });

  it("does not heal when ledger and stats are aligned", () => {
    expect(shouldHealProviderGamification(baseSignals)).toBe(false);
  });
});

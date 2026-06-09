import { describe, expect, it } from "vitest";
import { computeReviewPoints } from "@/lib/services/provider-gamification";

const defaultRules = {
  review_received: 5,
  review_received_4star_bonus: 5,
  review_received_5star_bonus: 10,
};

describe("computeReviewPoints", () => {
  it("awards base points only for ratings below 4 stars", () => {
    expect(computeReviewPoints(1, defaultRules)).toBe(5);
    expect(computeReviewPoints(3, defaultRules)).toBe(5);
  });

  it("adds 4-star bonus for ratings 4 and above (but below 5)", () => {
    expect(computeReviewPoints(4, defaultRules)).toBe(10);
    expect(computeReviewPoints(4.5, defaultRules)).toBe(10);
  });

  it("adds 5-star bonus for ratings 5 and above", () => {
    expect(computeReviewPoints(5, defaultRules)).toBe(15);
  });

  it("uses default fallbacks when rules are empty", () => {
    expect(computeReviewPoints(3, {})).toBe(5);
    expect(computeReviewPoints(4, {})).toBe(10);
    expect(computeReviewPoints(5, {})).toBe(15);
  });

  it("uses SQL-compatible defaults when configured rules are zero", () => {
    const disabledRules = {
      review_received: 0,
      review_received_4star_bonus: 0,
      review_received_5star_bonus: 0,
    };
    expect(computeReviewPoints(3, disabledRules)).toBe(5);
    expect(computeReviewPoints(4, disabledRules)).toBe(10);
    expect(computeReviewPoints(5, disabledRules)).toBe(15);
  });

  it("respects custom rule values from superadmin config", () => {
    const custom = {
      review_received: 8,
      review_received_4star_bonus: 2,
      review_received_5star_bonus: 7,
    };
    expect(computeReviewPoints(3, custom)).toBe(8);
    expect(computeReviewPoints(4, custom)).toBe(10);
    expect(computeReviewPoints(5, custom)).toBe(15);
  });
});

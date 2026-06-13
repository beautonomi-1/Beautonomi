import { describe, expect, it } from "vitest";
import {
  badgeMatchesProvider,
  validateBadgeBenefits,
  validateBadgeRequirements,
} from "../validate-badge-payload";

describe("validateBadgeRequirements", () => {
  it("accepts empty requirements object", () => {
    expect(validateBadgeRequirements({})).toEqual({});
  });

  it("accepts recognized non-negative keys", () => {
    expect(
      validateBadgeRequirements({
        points: 100,
        min_rating: 4.5,
        min_reviews: 10,
        min_bookings: 5,
      })
    ).toMatchObject({ points: 100, min_rating: 4.5 });
  });

  it("rejects negative requirement values", () => {
    expect(() => validateBadgeRequirements({ points: -1 })).toThrow(
      "requirements.points must be a non-negative number"
    );
  });

  it("rejects non-object requirements", () => {
    expect(() => validateBadgeRequirements([])).toThrow("Requirements must be a JSON object");
  });
});

describe("validateBadgeBenefits", () => {
  it("accepts empty benefits object", () => {
    expect(validateBadgeBenefits({})).toEqual({});
  });

  it("rejects array benefits", () => {
    expect(() => validateBadgeBenefits([1, 2])).toThrow("Benefits must be a JSON object");
  });
});

describe("badgeMatchesProvider (migration 686 semantics)", () => {
  const provider = { points: 50, rating: 4.2, reviews: 8, bookings: 12 };

  it("matches when requirements object is empty (all mins treated as 0)", () => {
    expect(badgeMatchesProvider({}, provider)).toBe(true);
  });

  it("matches when only points threshold is set and provider qualifies", () => {
    expect(badgeMatchesProvider({ points: 40 }, provider)).toBe(true);
  });

  it("does not match when points threshold exceeds provider total", () => {
    expect(badgeMatchesProvider({ points: 100 }, provider)).toBe(false);
  });

  it("treats missing min_rating as 0 (no rating floor)", () => {
    expect(badgeMatchesProvider({ points: 10 }, { ...provider, rating: 0 })).toBe(true);
  });

  it("enforces min_reviews when present", () => {
    expect(badgeMatchesProvider({ min_reviews: 20 }, provider)).toBe(false);
    expect(badgeMatchesProvider({ min_reviews: 5 }, provider)).toBe(true);
  });
});

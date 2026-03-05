/**
 * Unit tests for provider quality score computation.
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_WEIGHTS,
  computeQualityScoreFromInputs,
  reviewsScore,
  completionRateComponent,
  cancellationsComponent,
  responseTimeComponent,
  type QualityScoreInputs,
} from "../quality-score";

describe("reviewsScore", () => {
  it("returns 0 for no rating", () => {
    expect(reviewsScore(null, 0)).toBe(0);
    expect(reviewsScore(0, 0)).toBe(0);
  });
  it("normalizes 5-star to 1", () => {
    expect(reviewsScore(5, 10)).toBe(1);
  });
  it("damps low review count", () => {
    expect(reviewsScore(5, 1)).toBeLessThan(1);
    expect(reviewsScore(5, 1)).toBe(0.6);
    expect(reviewsScore(5, 4)).toBe(0.85);
  });
});

describe("completionRateComponent", () => {
  it("returns 0.5 when no bookings", () => {
    expect(completionRateComponent(0, 0, 0)).toBe(0.5);
  });
  it("returns 1 when all completed", () => {
    expect(completionRateComponent(10, 0, 0)).toBe(1);
  });
  it("returns 0 when none completed", () => {
    expect(completionRateComponent(0, 5, 5)).toBe(0);
  });
  it("returns correct fraction", () => {
    expect(completionRateComponent(2, 1, 1)).toBe(0.5);
  });
});

describe("cancellationsComponent", () => {
  it("returns 1 when no bookings", () => {
    expect(cancellationsComponent(0, 0, 0)).toBe(1);
  });
  it("returns 0 when all cancelled", () => {
    expect(cancellationsComponent(0, 10, 0)).toBe(0);
  });
  it("returns 1 when no cancellations", () => {
    expect(cancellationsComponent(10, 0, 0)).toBe(1);
  });
  it("returns correct fraction", () => {
    expect(cancellationsComponent(5, 5, 0)).toBe(0.5);
  });
});

describe("responseTimeComponent", () => {
  it("returns 1 for 0h", () => {
    expect(responseTimeComponent(0)).toBe(1);
  });
  it("returns 0 for 48h+", () => {
    expect(responseTimeComponent(48)).toBe(0);
    expect(responseTimeComponent(72)).toBe(0);
  });
  it("returns 0.5 for 24h", () => {
    expect(responseTimeComponent(24)).toBeCloseTo(0.5, 2);
  });
  it("returns mid value for 12h", () => {
    const v = responseTimeComponent(12);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(1);
    expect(v).toBeCloseTo(0.75, 2);
  });
});

describe("computeQualityScoreFromInputs", () => {
  const base: QualityScoreInputs = {
    rating_average: 4,
    review_count: 10,
    response_time_hours: 2,
    completed: 20,
    cancelled: 2,
    no_show: 1,
  };

  it("returns score between 0 and 1", () => {
    const r = computeQualityScoreFromInputs(base);
    expect(r.computed_score).toBeGreaterThanOrEqual(0);
    expect(r.computed_score).toBeLessThanOrEqual(1);
  });
  it("returns all four components", () => {
    const r = computeQualityScoreFromInputs(base);
    expect(r.components.reviews_score).toBeDefined();
    expect(r.components.completion_rate).toBeDefined();
    expect(r.components.cancellations).toBeDefined();
    expect(r.components.response_time).toBeDefined();
  });
  it("perfect provider has high score", () => {
    const r = computeQualityScoreFromInputs({
      rating_average: 5,
      review_count: 100,
      response_time_hours: 0,
      completed: 50,
      cancelled: 0,
      no_show: 0,
    });
    expect(r.computed_score).toBeGreaterThan(0.9);
  });
  it("poor provider has low score", () => {
    const r = computeQualityScoreFromInputs({
      rating_average: 1,
      review_count: 2,
      response_time_hours: 48,
      completed: 5,
      cancelled: 20,
      no_show: 5,
    });
    expect(r.computed_score).toBeLessThan(0.4);
  });
  it("uses default weights when none provided", () => {
    const r = computeQualityScoreFromInputs(base);
    const expected =
      (r.components.reviews_score * DEFAULT_WEIGHTS.reviews_score +
        r.components.completion_rate * DEFAULT_WEIGHTS.completion_rate +
        r.components.cancellations * DEFAULT_WEIGHTS.cancellations +
        r.components.response_time * DEFAULT_WEIGHTS.response_time) /
      (DEFAULT_WEIGHTS.reviews_score +
        DEFAULT_WEIGHTS.completion_rate +
        DEFAULT_WEIGHTS.cancellations +
        DEFAULT_WEIGHTS.response_time);
    expect(r.computed_score).toBeCloseTo(expected, 5);
  });
});

import { describe, expect, it } from "vitest";
import { fetchProviderReviewStats } from "../fetch-provider-review-stats";

describe("fetchProviderReviewStats", () => {
  it("returns zero when there are no reviews", async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    };

    await expect(fetchProviderReviewStats(db as any, "p")).resolves.toEqual({
      review_count: 0,
      rating_average: 0,
    });
  });

  it("computes count and average from live review rows", async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () =>
            Promise.resolve({
              data: [{ rating: 5 }, { rating: 4 }, { rating: 3 }],
              error: null,
            }),
        }),
      }),
    };

    await expect(fetchProviderReviewStats(db as any, "p")).resolves.toEqual({
      review_count: 3,
      rating_average: 4,
    });
  });
});

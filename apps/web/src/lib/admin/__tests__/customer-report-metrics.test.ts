import { describe, expect, it } from "vitest";
import { countVisitBuckets } from "../customer-report-metrics";

describe("customer-report-metrics", () => {
  it("visit buckets group completed counts in period", () => {
    const buckets = countVisitBuckets({
      a: { count: 1, total_amount: 10 },
      b: { count: 2, total_amount: 20 },
      c: { count: 4, total_amount: 40 },
    });
    expect(buckets.one).toBe(1);
    expect(buckets.twoThree).toBe(1);
    expect(buckets.fourPlus).toBe(1);
  });
});

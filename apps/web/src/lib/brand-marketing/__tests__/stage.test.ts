import { describe, expect, it } from "vitest";
import { exceedsGoLiveBudgetThreshold } from "../stage";

describe("brand campaign stage", () => {
  it("exceedsGoLiveBudgetThreshold is strict greater than", () => {
    expect(exceedsGoLiveBudgetThreshold(50001, 50000)).toBe(true);
    expect(exceedsGoLiveBudgetThreshold(50000, 50000)).toBe(false);
    expect(exceedsGoLiveBudgetThreshold(0, 50000)).toBe(false);
  });
});

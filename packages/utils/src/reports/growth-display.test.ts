import { describe, it, expect } from "vitest";
import { computeGrowthPercent, formatGrowthLabel } from "./growth-display";

describe("computeGrowthPercent", () => {
  it("returns new when prior is zero and current is positive", () => {
    expect(computeGrowthPercent(100, 0)).toEqual({ kind: "new", percent: null });
    expect(formatGrowthLabel(computeGrowthPercent(100, 0))).toBe("New");
  });

  it("returns flat when both periods are zero", () => {
    expect(computeGrowthPercent(0, 0)).toEqual({ kind: "flat", percent: 0 });
  });

  it("computes positive and negative percent changes", () => {
    expect(computeGrowthPercent(150, 100)).toEqual({ kind: "up", percent: 50 });
    expect(computeGrowthPercent(50, 100)).toEqual({ kind: "down", percent: -50 });
  });

  it("treats near-zero change as flat", () => {
    expect(computeGrowthPercent(100.02, 100).kind).toBe("flat");
  });
});

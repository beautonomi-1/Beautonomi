import {
  verticalFlatListPerf,
  horizontalFlatListPerf,
  chatFlatListPerf,
} from "@/lib/flatListPerformance";

describe("flatListPerformance presets", () => {
  it("vertical preset is bounded", () => {
    expect(verticalFlatListPerf.windowSize).toBe(8);
    expect(typeof verticalFlatListPerf.removeClippedSubviews).toBe("boolean");
  });

  it("horizontal preset suits chip carousels", () => {
    expect(horizontalFlatListPerf.windowSize).toBe(5);
  });

  it("chat preset is at least as wide as vertical window", () => {
    expect(chatFlatListPerf.windowSize).toBeGreaterThanOrEqual(verticalFlatListPerf.windowSize);
  });
});

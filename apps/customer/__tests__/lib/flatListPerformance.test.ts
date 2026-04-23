import {
  verticalFlatListPerf,
  horizontalFlatListPerf,
  chatFlatListPerf,
} from "@/lib/flatListPerformance";

describe("flatListPerformance presets", () => {
  it("vertical preset uses conservative window and batch sizes", () => {
    expect(verticalFlatListPerf.windowSize).toBe(8);
    expect(verticalFlatListPerf.maxToRenderPerBatch).toBe(8);
    expect(verticalFlatListPerf.initialNumToRender).toBe(8);
    expect(typeof verticalFlatListPerf.removeClippedSubviews).toBe("boolean");
  });

  it("horizontal preset is tuned for carousels", () => {
    expect(horizontalFlatListPerf.windowSize).toBe(5);
    expect(horizontalFlatListPerf.initialNumToRender).toBe(12);
  });

  it("chat preset allows slightly larger window than vertical", () => {
    expect(chatFlatListPerf.windowSize).toBeGreaterThanOrEqual(verticalFlatListPerf.windowSize);
  });
});

import {
  clampExploreTrimRange,
  EXPLORE_MIN_CLIP_MS,
} from "@/lib/explore-video-trim";

describe("clampExploreTrimRange", () => {
  it("enforces minimum clip length", () => {
    const out = clampExploreTrimRange(
      { trim_start_ms: 0, trim_end_ms: 200 },
      120_000,
      60_000,
      EXPLORE_MIN_CLIP_MS,
      "end",
    );
    expect(out.trim_end_ms - out.trim_start_ms).toBeGreaterThanOrEqual(EXPLORE_MIN_CLIP_MS);
  });

  it("caps clip at platform max", () => {
    const out = clampExploreTrimRange(
      { trim_start_ms: 0, trim_end_ms: 120_000 },
      120_000,
      60_000,
      EXPLORE_MIN_CLIP_MS,
      "end",
    );
    expect(out.trim_end_ms - out.trim_start_ms).toBeLessThanOrEqual(60_000);
  });
});

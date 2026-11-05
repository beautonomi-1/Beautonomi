import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { processExploreDisplayJpeg } from "@/lib/explore/brand-display-image";

describe("processExploreDisplayJpeg", () => {
  it("skips provider mark for video posters", async () => {
    const input = await sharp({
      create: { width: 400, height: 500, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .toBuffer();

    const withMark = await processExploreDisplayJpeg(input, "Salon One");
    const withoutMark = await processExploreDisplayJpeg(input, "Salon One", null, { skipProviderMark: true });

    expect(withoutMark.buffer.length).toBeLessThan(withMark.buffer.length + 5000);
    expect(withoutMark.width).toBeGreaterThan(0);
    expect(withoutMark.height).toBeGreaterThan(0);
  });
});

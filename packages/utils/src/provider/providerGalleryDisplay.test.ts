import { describe, expect, it } from "vitest";
import {
  PROVIDER_GALLERY_ASPECT_RATIO,
  providerGalleryFrameHeight,
} from "./providerGalleryDisplay";

describe("providerGalleryDisplay", () => {
  it("uses 16:9 landscape aspect ratio", () => {
    expect(PROVIDER_GALLERY_ASPECT_RATIO).toBeCloseTo(16 / 9, 5);
  });

  it("computes frame height from width", () => {
    expect(providerGalleryFrameHeight(320)).toBe(180);
    expect(providerGalleryFrameHeight(0)).toBe(0);
  });
});

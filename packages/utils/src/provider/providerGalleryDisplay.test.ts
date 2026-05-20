import { describe, expect, it } from "vitest";
import {
  PROVIDER_GALLERY_ASPECT_RATIO,
  providerGalleryFrameHeight,
} from "./providerGalleryDisplay";

describe("providerGalleryDisplay", () => {
  it("uses 4:5 portrait aspect ratio", () => {
    expect(PROVIDER_GALLERY_ASPECT_RATIO).toBeCloseTo(4 / 5, 5);
  });

  it("computes frame height from width", () => {
    expect(providerGalleryFrameHeight(320)).toBe(400);
    expect(providerGalleryFrameHeight(0)).toBe(0);
  });
});

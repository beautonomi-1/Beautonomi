import { describe, expect, it } from "vitest";
import { isRealImage, PLACEHOLDER_IMAGE_PATHS } from "./learn-article-hero";

describe("isRealImage", () => {
  it("rejects empty and whitespace values", () => {
    expect(isRealImage(null)).toBe(false);
    expect(isRealImage(undefined)).toBe(false);
    expect(isRealImage("")).toBe(false);
    expect(isRealImage("   ")).toBe(false);
  });

  it("rejects seeded placeholder paths", () => {
    for (const path of PLACEHOLDER_IMAGE_PATHS) {
      expect(isRealImage(path)).toBe(false);
      expect(isRealImage(`https://example.com${path}`)).toBe(false);
    }
    expect(isRealImage("/images/learn/feature-browser-placeholder.svg")).toBe(false);
    expect(isRealImage("/some/placeholder-image.png")).toBe(false);
  });

  it("accepts real image URLs", () => {
    expect(isRealImage("/images/learn/account-profile-screenshot.png")).toBe(true);
    expect(isRealImage("https://cdn.example.com/hero.jpg")).toBe(true);
  });
});

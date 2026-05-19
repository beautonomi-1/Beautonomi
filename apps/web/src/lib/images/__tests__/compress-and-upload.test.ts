import { describe, expect, it } from "vitest";
import {
  isDataUrl,
  stripDataUrl,
  stripDataUrlsFromArray,
} from "@/lib/images/compress-and-upload";

describe("stripDataUrl", () => {
  it("returns undefined for null/empty/whitespace", () => {
    expect(stripDataUrl(null)).toBeUndefined();
    expect(stripDataUrl(undefined)).toBeUndefined();
    expect(stripDataUrl("")).toBeUndefined();
    expect(stripDataUrl("   ")).toBeUndefined();
  });

  it("strips inline data URLs (the source of the 413)", () => {
    expect(stripDataUrl("data:image/png;base64,iVBORw0K...")).toBeUndefined();
    expect(stripDataUrl("  data:image/jpeg;base64,abc  ")).toBeUndefined();
  });

  it("passes through public URLs unchanged", () => {
    const url =
      "https://abc.supabase.co/storage/v1/object/public/provider-gallery/123/thumbnail.jpg";
    expect(stripDataUrl(url)).toBe(url);
    // Trims surrounding whitespace.
    expect(stripDataUrl(`  ${url}  `)).toBe(url);
  });
});

describe("stripDataUrlsFromArray", () => {
  it("returns [] for non-arrays / missing input", () => {
    expect(stripDataUrlsFromArray(undefined)).toEqual([]);
    expect(stripDataUrlsFromArray(null)).toEqual([]);
  });

  it("filters out data URLs and empty strings, preserves https URLs", () => {
    const input = [
      "https://cdn.example.com/a.jpg",
      "data:image/png;base64,abc",
      "",
      null,
      "  https://cdn.example.com/b.jpg  ",
    ];
    expect(stripDataUrlsFromArray(input)).toEqual([
      "https://cdn.example.com/a.jpg",
      "https://cdn.example.com/b.jpg",
    ]);
  });
});

describe("isDataUrl", () => {
  it("detects inline data URLs that would blow past the Vercel payload cap", () => {
    expect(isDataUrl("data:image/png;base64,xxx")).toBe(true);
    expect(isDataUrl("  data:image/webp;base64,xxx  ")).toBe(true);
  });
  it("returns false for normal URLs / empty / non-strings", () => {
    expect(isDataUrl("https://example.com/a.jpg")).toBe(false);
    expect(isDataUrl("")).toBe(false);
    expect(isDataUrl(undefined)).toBe(false);
    expect(isDataUrl(null)).toBe(false);
  });
});

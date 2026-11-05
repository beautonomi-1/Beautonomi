import { describe, expect, it } from "vitest";
import { resolveExplorePosterUrl } from "@/lib/explore/video-media";

const MP4 = "https://x.supabase.co/storage/v1/object/public/explore-posts/explore/p/video-1.mp4";
const JPG = "https://x.supabase.co/storage/v1/object/public/explore-posts/explore/p/cover.jpg";

describe("resolveExplorePosterUrl", () => {
  it("returns null for a video post without a poster (never the mp4 itself)", () => {
    expect(resolveExplorePosterUrl({ display_url: null, media_urls: [MP4], media_meta: null })).toBeNull();
  });

  it("skips a display_url that is actually a video file", () => {
    expect(resolveExplorePosterUrl({ display_url: MP4, media_urls: [MP4] })).toBeNull();
  });

  it("uses the processed cover for video posts", () => {
    expect(resolveExplorePosterUrl({ display_url: JPG, media_urls: [MP4] })).toBe(JPG);
    expect(
      resolveExplorePosterUrl({
        display_url: null,
        media_urls: ["explore/p/clip"],
        media_meta: [{ kind: "video", display_path: JPG } as never],
      }),
    ).toBe(JPG);
  });

  it("does not use an extension-less original when metadata says video", () => {
    expect(
      resolveExplorePosterUrl({
        display_url: null,
        media_urls: ["https://x.supabase.co/storage/v1/object/public/explore-posts/clip"],
        media_meta: [{ kind: "video" } as never],
      }),
    ).toBeNull();
  });

  it("falls back to the original image for photo posts", () => {
    expect(resolveExplorePosterUrl({ display_url: null, media_urls: [JPG] })).toBe(JPG);
  });
});

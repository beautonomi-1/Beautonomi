import { describe, expect, it, vi } from "vitest";
import { uploadExploreVideoPosterJpeg } from "@/lib/explore/upload-video-poster-jpeg";
import { videoNeedsSeek } from "@/lib/explore/capture-video-frame-jpeg";

describe("videoNeedsSeek", () => {
  it("does not wait for seeked when the clip already sits on the trim start", () => {
    expect(videoNeedsSeek(0, 0)).toBe(false);
    expect(videoNeedsSeek(1.2, 1.22)).toBe(false);
    expect(videoNeedsSeek(0, 1.5)).toBe(true);
  });
});

describe("uploadExploreVideoPosterJpeg", () => {
  it("uploads the trim frame with the signed image slot and does not call photo finalize", async () => {
    const post = vi.fn(async (url: string) => {
      if (String(url).includes("finalize")) {
        throw new Error("finalize should not run");
      }
      return { data: { path: "explore/p/frame.jpg", signed_url: "https://upload.example/put" } };
    });
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadExploreVideoPosterJpeg(
      { post } as never,
      new Blob(["jpeg"]),
      720,
      1280,
    );

    expect(result).toEqual({ display_path: "explore/p/frame.jpg", width: 720, height: 1280 });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]?.[0]).toBe("/api/explore/upload");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://upload.example/put",
      expect.objectContaining({ method: "PUT" }),
    );
    vi.unstubAllGlobals();
  });
});

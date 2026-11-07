import { explorePostCoverVideoUrl, explorePostGridImageUrl } from "@/lib/explore-media";

const MP4 = "https://cdn.example/explore/clip.mp4";
const JPG = "https://cdn.example/explore/cover.jpg";

describe("explore video covers", () => {
  it("uses the video file when a post has no poster image", () => {
    const post = {
      display_url: null,
      media_urls: [MP4],
      media_meta: [{ kind: "video" as const, display_path: null }],
      playback_path: null,
    };
    expect(explorePostGridImageUrl(post)).toBe("");
    expect(explorePostCoverVideoUrl(post)).toBe(MP4);
  });

  it("prefers a poster image and does not also load the video", () => {
    const post = {
      display_url: JPG,
      media_urls: [MP4],
      media_meta: [{ kind: "video" as const }],
      playback_path: null,
    };
    expect(explorePostGridImageUrl(post)).toBe(JPG);
    expect(explorePostCoverVideoUrl(post)).toBeNull();
  });
});

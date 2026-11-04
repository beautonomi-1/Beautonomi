import { providerExplorePostBadge } from "@/lib/explore/provider-explore-post-status";

describe("providerExplorePostBadge", () => {
  it("hidden wins", () => {
    expect(
      providerExplorePostBadge({
        is_hidden: true,
        media_urls: ["x.mp4"],
        media_meta: [{ kind: "video", status: "failed" }],
      }),
    ).toBe("hidden");
  });

  it("failed video", () => {
    expect(
      providerExplorePostBadge({
        media_urls: ["x.mp4"],
        media_meta: [{ kind: "video", status: "failed" }],
      }),
    ).toBe("video_failed");
  });

  it("processing when no delivered playback", () => {
    expect(
      providerExplorePostBadge({
        media_urls: ["x.mp4"],
        media_meta: [{ kind: "video", status: "encoding" }],
      }),
    ).toBe("video_processing");
  });

  it("null when delivered", () => {
    expect(
      providerExplorePostBadge({
        media_urls: ["x.mp4"],
        media_meta: [
          { kind: "video", playback_path: "https://cdn/x.mp4", status: "delivered" },
        ],
      }),
    ).toBeNull();
  });
});

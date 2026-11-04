import {
  deliveredExploreVideoShareUrl,
  getExploreVideoPlaybackTrimWindow,
} from "@/lib/explore-video-playback-trim";
import { buildExploreShareActionButtons, resolveShareMediaUrl } from "@/lib/share-explore-post";

describe("explore video playback trim", () => {
  it("returns trim window before delivery", () => {
    const w = getExploreVideoPlaybackTrimWindow({
      slide: {
        kind: "video",
        trim_start_ms: 1000,
        trim_end_ms: 5000,
        status: "encoding",
      },
      mediaUrl: "https://x/v.mp4",
    });
    expect(w).toEqual({ trim_start_ms: 1000, trim_end_ms: 5000 });
  });

  it("returns null after delivered playback", () => {
    const w = getExploreVideoPlaybackTrimWindow({
      slide: {
        kind: "video",
        trim_start_ms: 1000,
        trim_end_ms: 5000,
        playback_path: "https://cdn/x.mp4",
        status: "delivered",
      },
      mediaUrl: "https://x/v.mp4",
    });
    expect(w).toBeNull();
  });
});

describe("share explore video media url", () => {
  const base = {
    postId: "p1",
    providerName: "Salon",
    webBaseUrl: "https://beautonomi.com",
    mediaUrls: ["https://x/raw.mp4"],
    playbackPath: null,
    mediaMeta: [{ kind: "video" as const, status: "encoding" }],
  };

  it("omits undelivered video from share media url", () => {
    expect(resolveShareMediaUrl(base, 0)).toBeNull();
  });

  it("includes delivered playback for share media", () => {
    expect(
      resolveShareMediaUrl(
        {
          ...base,
          playbackPath: "https://cdn/out.mp4",
          mediaMeta: [
            {
              kind: "video",
              playback_path: "https://cdn/out.mp4",
              status: "delivered",
            },
          ],
        },
        0,
      ),
    ).toBe("https://cdn/out.mp4");
  });

  it("still returns the photo display url for image slides", () => {
    expect(
      resolveShareMediaUrl(
        {
          ...base,
          mediaUrls: ["https://x/raw.jpg"],
          displayUrl: "https://x/display.jpg",
          mediaMeta: [{ kind: "image" }],
        },
        0,
      ),
    ).toBe("https://x/display.jpg");
  });

  it("deliveredExploreVideoShareUrl requires https", () => {
    expect(
      deliveredExploreVideoShareUrl({
        slide: { kind: "video", playback_path: "https://cdn/out.mp4", status: "delivered" },
        mediaUrl: "https://x/raw.mp4",
        postPlaybackPath: "https://cdn/out.mp4",
      }),
    ).toBe("https://cdn/out.mp4");
  });
});

describe("explore share action buttons", () => {
  const labels = {
    shareLink: "Share link",
    shareMedia: "Share photo",
    shareMediaVideo: "Share video",
    copyLink: "Copy link",
    cancel: "Cancel",
  };
  const undelivered = {
    postId: "p1",
    providerName: "Salon",
    webBaseUrl: "https://beautonomi.com",
    mediaUrls: ["https://x/raw.mp4"],
    mediaMeta: [{ kind: "video" as const, status: "encoding" }],
  };
  const delivered = {
    ...undelivered,
    mediaMeta: [
      { kind: "video" as const, status: "delivered", playback_path: "https://cdn/out" },
    ],
  };

  it("offers link and copy only before delivery", () => {
    for (const platform of ["ios", "android"]) {
      const texts = buildExploreShareActionButtons(undelivered, labels, platform).map((b) => b.text);
      expect(texts).toEqual(["Share link", "Copy link", "Cancel"]);
    }
  });

  it("offers Share video after delivery and keeps Cancel on iOS", () => {
    const texts = buildExploreShareActionButtons(delivered, labels, "ios").map((b) => b.text);
    expect(texts).toEqual(["Share link", "Share video", "Copy link", "Cancel"]);
  });

  it("stays within Android's three-button limit", () => {
    const buttons = buildExploreShareActionButtons(delivered, labels, "android");
    expect(buttons.map((b) => b.text)).toEqual(["Share link", "Share video", "Copy link"]);
  });

  it("detects video from slide kind when the playback url has no extension", () => {
    const buttons = buildExploreShareActionButtons(delivered, labels, "ios");
    expect(buttons.find((b) => b.action === "media")?.text).toBe("Share video");
  });
});

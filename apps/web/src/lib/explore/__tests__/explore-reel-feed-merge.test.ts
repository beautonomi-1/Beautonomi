import { describe, expect, it } from "vitest";
import {
  appendExploreCommentPage,
  nextOffsetAfterEmptyCommentPage,
  appendExploreReelVideos,
  placeExploreComment,
  removedExploreCommentCount,
  pendingReelAdvanceStillApplies,
  preserveReelEngagement,
  reelHasAnotherPage,
  reelScrollLanded,
  shouldAdvanceExploreReel,
  shouldCompleteExploreReelClip,
} from "@/lib/explore/explore-reel-feed";
import { patchExploreSlideCover } from "@/lib/explore/patch-explore-slide-cover";
import type { ExploreMediaSlideMeta } from "@/lib/explore/media-types";

describe("reel feed merge", () => {
  const isVideo = (item: { kind: string }) => item.kind === "video";

  it("drops duplicate ids and photos", () => {
    const prev = [{ id: "a", kind: "video" }];
    const page = [
      { id: "a", kind: "video" },
      { id: "b", kind: "image" },
      { id: "c", kind: "video" },
    ];
    expect(appendExploreReelVideos(prev, page, isVideo).map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("stops paging when has_more is false or the cursor is missing", () => {
    expect(reelHasAnotherPage(false, "cursor")).toBe(false);
    expect(reelHasAnotherPage(true, undefined)).toBe(false);
    expect(reelHasAnotherPage(true, "cursor")).toBe(true);
  });

  it("does not advance while comments are open or on the last item", () => {
    expect(
      shouldAdvanceExploreReel({
        commentsOpen: true,
        shareOpen: false,
        reportOpen: false,
        dragging: false,
        index: 0,
        length: 3,
      }),
    ).toBe(false);
    expect(
      shouldAdvanceExploreReel({
        commentsOpen: false,
        shareOpen: false,
        reportOpen: false,
        dragging: false,
        index: 2,
        length: 3,
      }),
    ).toBe(false);
    expect(
      shouldAdvanceExploreReel({
        commentsOpen: false,
        shareOpen: true,
        reportOpen: false,
        dragging: false,
        index: 0,
        length: 3,
      }),
    ).toBe(false);
    expect(
      shouldAdvanceExploreReel({
        commentsOpen: false,
        shareOpen: false,
        reportOpen: false,
        dragging: false,
        index: 0,
        length: 3,
      }),
    ).toBe(true);
  });

  it("keeps a like made while the feed request was in flight", () => {
    const started = [{ id: "a", is_liked: false, like_count: 1, is_saved: false, comment_count: 0 }];
    const current = [{ id: "a", is_liked: true, like_count: 2, is_saved: false, comment_count: 0 }];
    const incoming = { id: "a", is_liked: false, like_count: 1, is_saved: false, comment_count: 4 };
    expect(preserveReelEngagement(incoming, current, started)).toMatchObject({
      is_liked: true,
      like_count: 2,
      comment_count: 4,
    });
    expect(preserveReelEngagement(incoming, current, [])).toBe(incoming);
  });

  it("does not treat the halfway point of a smooth scroll as the next page", () => {
    expect(reelScrollLanded(400, 800, 1)).toBe(false);
    expect(reelScrollLanded(800, 800, 1)).toBe(true);
    expect(reelScrollLanded(790, 800, 1)).toBe(true);
    expect(reelScrollLanded(0, 0, 1)).toBe(false);
  });

  it("drops a queued advance after the viewer scrolls to another clip", () => {
    expect(pendingReelAdvanceStillApplies("ended", "ended")).toBe(true);
    expect(pendingReelAdvanceStillApplies("ended", "landed")).toBe(false);
    expect(pendingReelAdvanceStillApplies(null, "ended")).toBe(false);
  });

  it("completes a trimmed clip when the file ends after it has played", () => {
    expect(
      shouldCompleteExploreReelClip({
        active: true,
        seeking: false,
        playedInside: true,
        alreadyCompleted: false,
      }),
    ).toBe(true);
    expect(
      shouldCompleteExploreReelClip({
        active: true,
        seeking: true,
        playedInside: true,
        alreadyCompleted: false,
      }),
    ).toBe(false);
    expect(
      shouldCompleteExploreReelClip({
        active: true,
        seeking: false,
        playedInside: false,
        alreadyCompleted: false,
      }),
    ).toBe(false);
  });
});

describe("patchExploreSlideCover", () => {
  it("keeps a comment posted before the next page in time order", () => {
    const prev = [
      { id: "old", created_at: "2026-01-01T00:00:00.000Z" },
      { id: "new", created_at: "2026-03-01T00:00:00.000Z" },
    ];
    const page = [{ id: "mid", created_at: "2026-02-01T00:00:00.000Z" }];
    expect(appendExploreCommentPage(prev, page).map((comment) => comment.id)).toEqual(["old", "mid", "new"]);
    const withReply = placeExploreComment(prev, {
      id: "reply",
      parent_id: "old",
      created_at: "2026-03-02T00:00:00.000Z",
    });
    expect(withReply[0]?.replies?.map((reply) => reply.id)).toEqual(["reply"]);
    expect(
      removedExploreCommentCount(
        [{ id: "old", replies: [{ id: "reply" }, { id: "reply-2" }] }],
        "old",
      ),
    ).toBe(3);
    expect(removedExploreCommentCount([{ id: "old", replies: [{ id: "reply" }] }], "reply")).toBe(1);
    expect(
      nextOffsetAfterEmptyCommentPage({ offset: 0, visibleCount: 0, hasMore: true, nextOffset: 20 }),
    ).toBe(20);
    expect(
      nextOffsetAfterEmptyCommentPage({ offset: 0, visibleCount: 2, hasMore: true, nextOffset: 20 }),
    ).toBeNull();
  });

  it("patches the fresh slide cover and keeps playback and overlays", () => {
    const meta: ExploreMediaSlideMeta[] = [
      {
        kind: "video",
        playback_path: "explore/p/play.mp4",
        display_path: "explore/p/old.jpg",
        text_overlays: [{ text: "Hi", x: 0.5, y: 0.2, font_size: 0.05, color: "#fff", align: "center" }],
      },
    ];
    const next = patchExploreSlideCover(meta, 0, {
      display_path: "explore/p/poster.jpg",
      width: 720,
      height: 1280,
    });
    expect(next?.[0]?.display_path).toBe("explore/p/poster.jpg");
    expect(next?.[0]?.playback_path).toBe("explore/p/play.mp4");
    expect(next?.[0]?.text_overlays?.[0]?.text).toBe("Hi");
    expect(next?.[0]?.width).toBe(720);
  });
});

import {
  appendExploreCommentPage,
  nextOffsetAfterEmptyCommentPage,
  exploreCommentTotal,
  placeExploreComment,
  removeExploreComment,
  appendExploreReelVideos,
  reelHasAnotherPage,
  exploreClipWatchedMs,
  exploreClipPlayheadAtEnd,
  exploreClipShowsReplay,
  preserveReelEngagement,
  pendingReelAdvanceStillApplies,
  shouldAdvanceExploreReel,
  shouldCompleteExploreReelClip,
} from "@/lib/explore-reel-feed";

describe("explore reel feed", () => {
  it("drops duplicate ids and stops when there is no next page", () => {
    const prev = [{ id: "a" }];
    const page = [{ id: "a" }, { id: "b" }];
    expect(appendExploreReelVideos(prev, page, () => true).map((p) => p.id)).toEqual(["a", "b"]);
    expect(reelHasAnotherPage(false, "next")).toBe(false);
  });

  it("does not advance while comments are open or on the last item", () => {
    expect(
      shouldAdvanceExploreReel({
        commentsOpen: true,
        shareOpen: false,
        reportOpen: false,
        dragging: false,
        index: 0,
        length: 2,
      }),
    ).toBe(false);
    expect(
      shouldAdvanceExploreReel({
        commentsOpen: false,
        shareOpen: false,
        reportOpen: false,
        dragging: false,
        index: 1,
        length: 2,
      }),
    ).toBe(false);
  });

  it("drops a queued advance after the viewer scrolls to another clip", () => {
    expect(pendingReelAdvanceStillApplies("ended", "ended")).toBe(true);
    expect(pendingReelAdvanceStillApplies("ended", "landed")).toBe(false);
  });

  it("counts watch time inside the trim, not from the start of the file", () => {
    expect(exploreClipWatchedMs(6.2, 5000, 8000)).toBe(1200);
    expect(exploreClipWatchedMs(1, 5000, 8000)).toBe(0);
    expect(exploreClipWatchedMs(9, 5000, 8000)).toBe(3000);
    expect(exploreClipWatchedMs(2.5, null, null)).toBe(2500);
    expect(exploreClipPlayheadAtEnd({ currentSec: 4.9, durationSec: 5, trimEndMs: null })).toBe(true);
    expect(exploreClipPlayheadAtEnd({ currentSec: 2, durationSec: 5, trimEndMs: null })).toBe(false);
    expect(exploreClipPlayheadAtEnd({ currentSec: 7.95, durationSec: 12, trimEndMs: 8000 })).toBe(true);
    expect(exploreClipShowsReplay(false, true)).toBe(true);
    expect(exploreClipShowsReplay(true, true)).toBe(false);
  });

  it("keeps a like made while the feed request was in flight", () => {
    const started = [{ id: "a", is_liked: false, like_count: 1 }];
    const current = [{ id: "a", is_liked: true, like_count: 2 }];
    const incoming = { id: "a", is_liked: false, like_count: 1 };
    expect(preserveReelEngagement(incoming, current, started).is_liked).toBe(true);
    expect(preserveReelEngagement(incoming, current, []).like_count).toBe(1);
  });

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
    expect(removeExploreComment(withReply, "reply")[0]?.replies).toEqual([]);
    expect(removeExploreComment(withReply, "old")).toEqual([{ ...prev[1], replies: [] }]);
    expect(exploreCommentTotal(withReply, 1)).toBe(3);
    expect(exploreCommentTotal([], 4)).toBe(4);
    expect(
      nextOffsetAfterEmptyCommentPage({ offset: 0, visibleCount: 0, hasMore: true, nextOffset: 20 }),
    ).toBe(20);
    expect(
      nextOffsetAfterEmptyCommentPage({ offset: 0, visibleCount: 2, hasMore: true, nextOffset: 20 }),
    ).toBeNull();
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
        active: false,
        seeking: false,
        playedInside: true,
        alreadyCompleted: false,
      }),
    ).toBe(false);
  });
});

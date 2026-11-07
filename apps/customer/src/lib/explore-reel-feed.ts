export function shouldAdvanceExploreReel(input: {
  commentsOpen: boolean;
  shareOpen: boolean;
  reportOpen: boolean;
  dragging: boolean;
  index: number;
  length: number;
}): boolean {
  if (input.commentsOpen || input.shareOpen || input.reportOpen || input.dragging) return false;
  if (input.length <= 0 || input.index >= input.length - 1) return false;
  return true;
}

export function reelHasAnotherPage(hasMore: boolean, nextCursor?: string | null): boolean {
  return hasMore === true && Boolean(nextCursor);
}

/** A queued end may advance only while the viewer is still on the clip that finished. */
export function pendingReelAdvanceStillApplies(
  endedPostId: string | null | undefined,
  activePostId: string | null | undefined,
): boolean {
  return Boolean(endedPostId) && endedPostId === activePostId;
}

/** Clip-relative watch time. Post duration is the trim length, so a later trim start must not count as already watched. */
export function exploreClipWatchedMs(
  currentSec: number,
  trimStartMs: number | null,
  trimEndMs: number | null,
): number {
  const ms = Math.max(0, Math.floor((Number.isFinite(currentSec) ? currentSec : 0) * 1000));
  if (trimStartMs == null || trimEndMs == null || trimEndMs <= trimStartMs) return ms;
  return Math.max(0, Math.min(trimEndMs - trimStartMs, ms - trimStartMs));
}

const CLIP_END_SLACK_SEC = 0.12;

/** True when the playhead is sitting on the end of the clip the viewer actually sees. */
export function exploreClipPlayheadAtEnd(input: {
  currentSec: number;
  durationSec: number;
  trimEndMs: number | null;
}): boolean {
  const end = input.trimEndMs != null ? input.trimEndMs / 1000 : input.durationSec;
  return end > 0 && input.currentSec >= end - CLIP_END_SLACK_SEC;
}

/** A finished clip that is not playing needs an explicit replay. A looping clip stays hidden. */
export function exploreClipShowsReplay(playing: boolean, atEnd: boolean): boolean {
  return !playing && atEnd;
}

/** File end and trim end both complete the clip. A seek or a clip that has not played yet does not. */
export function shouldCompleteExploreReelClip(input: {
  active: boolean;
  seeking: boolean;
  playedInside: boolean;
  alreadyCompleted: boolean;
}): boolean {
  return input.active && !input.seeking && input.playedInside && !input.alreadyCompleted;
}

type ReelEngagement = {
  id: string;
  is_liked?: boolean;
  like_count?: number;
  is_saved?: boolean;
  comment_count?: number;
};

/** Keep a like, save, or comment the viewer made while the feed request was in flight. */
export function preserveReelEngagement<T extends ReelEngagement>(
  item: T,
  current: T[],
  started: T[],
): T {
  const live = current.find((post) => post.id === item.id);
  const base = started.find((post) => post.id === item.id);
  if (!live || !base) return item;
  return {
    ...item,
    is_liked: live.is_liked !== base.is_liked ? live.is_liked : item.is_liked,
    like_count: live.like_count !== base.like_count ? live.like_count : item.like_count,
    is_saved: live.is_saved !== base.is_saved ? live.is_saved : item.is_saved,
    comment_count:
      live.comment_count !== base.comment_count ? live.comment_count : item.comment_count,
  };
}

type ThreadComment = {
  id: string;
  parent_id?: string | null;
  created_at?: string;
  replies?: ThreadComment[];
};

/** A page of only hidden authors still has a next page. Follow it instead of stopping on an empty sheet. */
export function nextOffsetAfterEmptyCommentPage(input: {
  offset: number;
  visibleCount: number;
  hasMore: boolean;
  nextOffset?: number;
}): number | null {
  if (input.visibleCount > 0 || !input.hasMore) return null;
  if (typeof input.nextOffset !== "number" || input.nextOffset <= input.offset) return null;
  return input.nextOffset;
}

/** Insert a page of older-to-newer comments without burying a comment just posted. */
export function appendExploreCommentPage<T extends ThreadComment>(prev: T[], page: T[]): T[] {
  if (!page.length) return prev;
  const pageIds = new Set(page.map((comment) => comment.id));
  const kept = prev.filter((comment) => !pageIds.has(comment.id));
  const lastCreated = page.reduce((max, comment) => {
    const created = comment.created_at ?? "";
    return created > max ? created : max;
  }, "");
  if (!lastCreated) return [...kept, ...page];
  const older: T[] = [];
  const newer: T[] = [];
  for (const comment of kept) {
    if (!comment.created_at || comment.created_at > lastCreated) newer.push(comment);
    else older.push(comment);
  }
  return [...older, ...page, ...newer];
}

/** Visible rows, or the server total when later pages are not loaded yet. */
export function exploreCommentTotal(
  comments: { replies?: unknown[] }[],
  serverCount?: number | null,
): number {
  const loaded = comments.reduce((total, comment) => total + 1 + (comment.replies?.length ?? 0), 0);
  return Math.max(loaded, serverCount ?? 0);
}

/** Deleting a comment also deletes its replies. The count has to drop by all of those rows. */
export function removedExploreCommentCount<T extends { id: string; replies?: { id: string }[] }>(
  comments: T[],
  commentId: string,
): number {
  for (const comment of comments) {
    if (comment.id === commentId) return 1 + (comment.replies?.length ?? 0);
    if (comment.replies?.some((reply) => reply.id === commentId)) return 1;
  }
  return 1;
}

/** Drop a comment, or a reply under its parent, after it is deleted. */
export function removeExploreComment<T extends { id: string; replies?: T[] }>(
  comments: T[],
  commentId: string,
): T[] {
  return comments
    .filter((comment) => comment.id !== commentId)
    .map((comment) => ({
      ...comment,
      replies: (comment.replies ?? []).filter((reply) => reply.id !== commentId),
    }));
}

/** Add a comment the viewer just posted, or a reply under its parent. */
export function placeExploreComment<T extends ThreadComment>(list: T[], created: T): T[] {
  if (created.parent_id) {
    return list.map((comment) => {
      if (comment.id !== created.parent_id) return comment;
      const replies = comment.replies ?? [];
      if (replies.some((reply) => reply.id === created.id)) return comment;
      return { ...comment, replies: [...replies, created] };
    });
  }
  if (list.some((comment) => comment.id === created.id)) return list;
  return [...list, created];
}

/** Keep first-slide videos and drop ids already in the reel. */
export function appendExploreReelVideos<T extends { id: string }>(
  prev: T[],
  page: T[],
  isFirstSlideVideo: (item: T) => boolean,
): T[] {
  const ids = new Set(prev.map((item) => item.id));
  const fresh = page.filter((item) => isFirstSlideVideo(item) && !ids.has(item.id));
  return fresh.length ? [...prev, ...fresh] : prev;
}

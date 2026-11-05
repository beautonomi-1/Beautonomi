"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, Bookmark, Flag, Heart, Loader2, MessageCircle, Share2, Volume2, VolumeX, X } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { useAuth } from "@/providers/AuthProvider";
import { useTranslation } from "@beautonomi/i18n";
import type { ExploreComment, ExplorePost } from "@/types/explore";
import type { WebContentReportTargetType } from "@/components/safety/ContentReportDialog";
import {
  firstSlideIsVideo,
  resolveExplorePosterUrl,
  resolveExploreVideoSrc,
} from "@/lib/explore/video-media";
import { getExploreVideoPlaybackTrimWindow } from "@/lib/explore/explore-video-playback-trim";
import {
  filterOverlaysForPlaybackTime,
  shouldDrawVideoTextOverlays,
} from "@/lib/explore/explore-overlay-playback";
import { ExploreTextOverlayLayer } from "@/components/explore/ExploreTextOverlayLayer";
import { ExploreVideoSideLogo } from "@/components/explore/ExploreVideoSideLogo";
import {
  appendExploreCommentPage,
  nextOffsetAfterEmptyCommentPage,
  appendExploreReelVideos,
  pendingReelAdvanceStillApplies,
  placeExploreComment,
  removedExploreCommentCount,
  preserveReelEngagement,
  reelHasAnotherPage,
  reelScrollLanded,
  shouldAdvanceExploreReel,
  shouldCompleteExploreReelClip,
} from "@/lib/explore/explore-reel-feed";

const END_MARK_MS = 1200;

function mergeVideoFeed(list: ExplorePost[], single?: ExplorePost | null): ExplorePost[] {
  const videos = list.filter((p) => firstSlideIsVideo(p.media_urls, p.media_meta));
  if (single?.id && !videos.some((p) => p.id === single.id)) videos.unshift(single);
  return videos;
}

function parseFeedPage(raw: unknown): { items: ExplorePost[]; next?: string; more: boolean } {
  const root = raw as { data?: ExplorePost[] | { data?: ExplorePost[]; next_cursor?: string; has_more?: boolean } };
  const body = root?.data ?? raw;
  if (Array.isArray(body)) return { items: body, more: false };
  const page = body as { data?: ExplorePost[]; next_cursor?: string; has_more?: boolean };
  return {
    items: page?.data ?? [],
    next: page?.next_cursor,
    more: page?.has_more ?? false,
  };
}

function ReelVideoSlide({
  post,
  active,
  muted,
  onEnded,
  onPlayingChange,
}: {
  post: ExplorePost;
  active: boolean;
  muted: boolean;
  onEnded: () => void;
  onPlayingChange?: (playing: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const endedRef = useRef(false);
  const playedInsideRef = useRef(false);
  const watchedRef = useRef(0);
  const audibleRef = useRef(false);
  const trim = getExploreVideoPlaybackTrimWindow({
    slide: post.media_meta?.[0],
    mediaUrl: post.media_urls?.[0],
    slideIndex: 0,
    postPlaybackPath: post.playback_path,
  });
  const src =
    resolveExploreVideoSrc({
      mediaUrls: post.media_urls ?? [],
      playbackPath: trim ? null : post.playback_path,
      mediaMeta: trim ? null : post.media_meta,
    }) ?? post.media_urls?.[0];
  const poster = resolveExplorePosterUrl(post) ?? undefined;
  const [timeMs, setTimeMs] = useState(0);
  const [progress, setProgress] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const slide0 = post.media_meta?.[0];
  const overlays = shouldDrawVideoTextOverlays(slide0)
    ? filterOverlaysForPlaybackTime(slide0?.text_overlays, timeMs)
    : [];
  const soundtrack = Boolean(post.sound_url);
  audibleRef.current = !muted && !soundtrack;

  useEffect(() => {
    if (!active) return;
    watchedRef.current = 0;
    void fetcher
      .post("/api/explore/events", { post_id: post.id, event_type: "view" })
      .catch(() => undefined);
    return () => {
      const watched = watchedRef.current;
      if (watched <= 0) return;
      void fetcher
        .post(`/api/explore/posts/${post.id}/watch-progress`, { watched_ms: watched })
        .catch(() => undefined);
    };
  }, [active, post.id]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !active || muted || soundtrack;
  }, [active, muted, soundtrack]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (!active) {
      v.muted = true;
      v.pause();
      return;
    }
    endedRef.current = false;
    playedInsideRef.current = false;
    let cancelled = false;
    const nearEnd = !trim && v.duration > 0 && v.currentTime >= v.duration - 0.1;
    const restart = Boolean(trim) || v.ended || nearEnd;
    if (restart) {
      const target = trim ? trim.trim_start_ms / 1000 : 0;
      if (Math.abs(v.currentTime - target) > 0.05) v.currentTime = target;
    }
    // Start muted so the browser allows the next clip after the viewer unmuted.
    v.muted = true;
    const playFromHere = async () => {
      try {
        await v.play();
      } catch {
        if (cancelled) return;
        try {
          await v.play();
        } catch {
          return;
        }
      }
      if (cancelled) return;
      const hearVideo = audibleRef.current;
      v.muted = !hearVideo;
      if (hearVideo && v.paused) {
        try {
          await v.play();
        } catch {
          // The browser kept the clip muted.
        }
      }
    };
    void playFromHere();
    return () => {
      cancelled = true;
    };
  }, [active, post.id, trim?.trim_start_ms, trim?.trim_end_ms]);

  return (
    <div className="relative h-full w-full bg-black">
      <video
        ref={videoRef}
        key={post.id}
        src={src ?? undefined}
        poster={poster}
        playsInline
        muted
        loop={false}
        preload={active ? "auto" : "none"}
        className="h-full w-full object-cover"
        onPlay={() => {
          if (active) onPlayingChange?.(true);
        }}
        onPause={() => {
          onPlayingChange?.(false);
        }}
        onLoadedMetadata={(e) => {
          if (!active || !trim) return;
          const v = e.currentTarget;
          const target = trim.trim_start_ms / 1000;
          if (v.currentTime >= target - 0.05) return;
          v.currentTime = target;
          v.muted = true;
          void v.play().then(() => {
            if (!active) return;
            v.muted = !audibleRef.current;
          }).catch(() => undefined);
        }}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          if (v.seeking) return;
          const ms = Math.floor(v.currentTime * 1000);
          if (trim) {
            const { trim_start_ms: start, trim_end_ms: end } = trim;
            if (ms >= start + 200 && ms < end - 80) playedInsideRef.current = true;
            if (ms >= end - 50) {
              v.pause();
              if (
                shouldCompleteExploreReelClip({
                  active,
                  seeking: false,
                  playedInside: playedInsideRef.current,
                  alreadyCompleted: endedRef.current,
                })
              ) {
                endedRef.current = true;
                onEnded();
              }
              return;
            }
            if (ms < start - 300) v.currentTime = start / 1000;
            const rel = Math.max(0, ms - start);
            const len = end - start;
            watchedRef.current = rel;
            setTimeMs(rel);
            setProgress(len > 0 ? rel / len : 0);
            setDurationMs(len);
            return;
          }
          if (v.currentTime > 0.25) playedInsideRef.current = true;
          watchedRef.current = ms;
          setTimeMs(ms);
          const dur = v.duration || 0;
          setProgress(dur > 0 ? v.currentTime / dur : 0);
          setDurationMs(Math.floor(dur * 1000));
        }}
        onEnded={() => {
          if (
            !shouldCompleteExploreReelClip({
              active,
              seeking: Boolean(videoRef.current?.seeking),
              playedInside: playedInsideRef.current,
              alreadyCompleted: endedRef.current,
            })
          ) {
            return;
          }
          endedRef.current = true;
          onEnded();
        }}
      />
      <ExploreTextOverlayLayer overlays={overlays} />
      <ReelEndMark progress={progress} durationMs={durationMs} />
    </div>
  );
}

function ReelEndMark({ progress, durationMs }: { progress: number; durationMs: number }) {
  const nearEnd = durationMs > 0 && progress >= Math.max(0, 1 - END_MARK_MS / durationMs);
  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-300"
      style={{ opacity: nearEnd ? 1 : 0 }}
    >
      <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-black/55">
        <Image src="/images/logo.svg" alt="" width={36} height={36} />
      </div>
    </div>
  );
}

export function ExploreSingleVideoReelView({
  post,
  shareOpen,
  reportOpen,
  onRequireLogin,
  onShare,
  onReport,
}: {
  post: ExplorePost;
  shareOpen: boolean;
  reportOpen: boolean;
  onRequireLogin: () => void;
  onShare: (active: ExplorePost) => void;
  onReport: (targetType: WebContentReportTargetType, targetId: string, title?: string) => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const pd = "web.explore.postDetail";
  const [posts, setPosts] = useState<ExplorePost[]>([post]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(true);
  const [muted, setMuted] = useState(true);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [comments, setComments] = useState<ExploreComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsOffset, setCommentsOffset] = useState(0);
  const [hasMoreComments, setHasMoreComments] = useState(false);
  const [commentInput, setCommentInput] = useState("");
  const [commentSending, setCommentSending] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [clipPlaying, setClipPlaying] = useState(false);
  const [clipEnded, setClipEnded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const soundRef = useRef<HTMLAudioElement>(null);
  const appendRef = useRef(false);
  const draggingRef = useRef(false);
  const dragTimer = useRef<number | null>(null);
  const pendingEndRef = useRef(false);
  const pendingEndPostIdRef = useRef<string | null>(null);
  const feedReadyRef = useRef(false);
  const feedRequestRef = useRef(0);
  const alignTokenRef = useRef(0);
  const scrollTargetRef = useRef<number | null>(null);
  const postRef = useRef(post);
  const postsRef = useRef(posts);
  const activePostIdRef = useRef<string | null>(null);
  const commentsRequestRef = useRef(0);
  postRef.current = post;
  postsRef.current = posts;
  const [scrollLocked, setScrollLocked] = useState(false);

  const activePost = posts[activeIndex] ?? post;
  const activeSound = activePost.sound_url || "";

  useEffect(() => {
    const audio = soundRef.current;
    if (!audio) return;
    if (!activeSound || muted || clipEnded) {
      audio.pause();
      audio.loop = false;
      return;
    }
    audio.loop = true;
    if (audio.dataset.track !== activeSound) {
      audio.dataset.track = activeSound;
      audio.src = activeSound;
    }
    void audio.play().catch(() => undefined);
  }, [activeSound, clipEnded, muted]);

  useEffect(() => {
    const audio = soundRef.current;
    return () => {
      audio?.pause();
    };
  }, []);

  useEffect(() => {
    const shell = document.querySelector("[data-explore-shell]");
    if (!shell) return;
    const hidden = Array.from(shell.children).filter((node) => node.tagName !== "MAIN") as HTMLElement[];
    const previousDisplay = hidden.map((el) => el.style.display);
    hidden.forEach((el) => {
      el.style.display = "none";
    });
    const shellEl = shell as HTMLElement;
    const previousPadding = shellEl.style.paddingBottom;
    shellEl.style.paddingBottom = "0px";
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      hidden.forEach((el, i) => {
        el.style.display = previousDisplay[i] ?? "";
      });
      shellEl.style.paddingBottom = previousPadding;
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const loadInitialFeed = useCallback(async (requestId: number) => {
    const seed = postRef.current;
    const started = postsRef.current.slice();
    try {
      const res = await fetcher.get<unknown>("/api/explore/posts?limit=30", { staleTimeMs: 0 });
      if (requestId !== feedRequestRef.current) return;
      const parsed = parseFeedPage(res);
      const merged = mergeVideoFeed(parsed.items, seed);
      const start = Math.max(0, merged.findIndex((p) => p.id === seed.id));
      feedReadyRef.current = true;
      alignTokenRef.current += 1;
      setPosts((current) => merged.map((item) => preserveReelEngagement(item, current, started)));
      setActiveIndex(start);
      setNextCursor(parsed.next);
      setHasMore(parsed.more);
    } catch {
      if (requestId !== feedRequestRef.current) return;
      feedReadyRef.current = true;
      setHasMore(false);
    }
  }, []);

  useEffect(() => {
    const requestId = ++feedRequestRef.current;
    feedReadyRef.current = false;
    activePostIdRef.current = post.id;
    setCommentsOpen(false);
    setMoreOpen(false);
    setClipEnded(false);
    setClipPlaying(false);
    setCommentInput("");
    setReplyTo(null);
    void loadInitialFeed(requestId);
  }, [loadInitialFeed, post.id]);

  const scrollReelTo = useCallback((index: number, behavior: ScrollBehavior) => {
    const scroller = containerRef.current;
    if (!scroller || index < 0 || index >= scroller.children.length) return;
    const topFor = (el: HTMLElement) => index * el.clientHeight;
    scrollTargetRef.current = index;
    scroller.scrollTo({ top: topFor(scroller), behavior });
    window.setTimeout(() => {
      if (scrollTargetRef.current !== index) return;
      const el = containerRef.current;
      if (!el) {
        scrollTargetRef.current = null;
        return;
      }
      const height = el.clientHeight;
      if (height > 0 && !reelScrollLanded(el.scrollTop, height, index)) {
        el.scrollTop = index * height;
      }
      requestAnimationFrame(() => {
        if (scrollTargetRef.current !== index) return;
        const now = containerRef.current;
        if (!now) {
          scrollTargetRef.current = null;
          return;
        }
        if (reelScrollLanded(now.scrollTop, now.clientHeight, index)) {
          scrollTargetRef.current = null;
        }
      });
    }, 700);
  }, []);

  useEffect(() => {
    if (!alignTokenRef.current) return;
    scrollReelTo(activeIndex, "auto");
    alignTokenRef.current = 0;
  }, [activeIndex, posts, scrollReelTo]);

  const appendPage = useCallback(async () => {
    if (!reelHasAnotherPage(hasMore, nextCursor) || appendRef.current) return;
    appendRef.current = true;
    try {
      const res = await fetcher.get<unknown>(
        `/api/explore/posts?limit=30&cursor=${encodeURIComponent(nextCursor!)}`,
        { staleTimeMs: 0 },
      );
      const parsed = parseFeedPage(res);
      setPosts((prev) =>
        appendExploreReelVideos(prev, parsed.items, (item) =>
          firstSlideIsVideo(item.media_urls, item.media_meta),
        ),
      );
      setNextCursor(parsed.next);
      setHasMore(parsed.more);
    } finally {
      appendRef.current = false;
    }
  }, [hasMore, nextCursor]);

  useEffect(() => {
    if (activeIndex >= posts.length - 3 && reelHasAnotherPage(hasMore, nextCursor)) void appendPage();
  }, [activeIndex, appendPage, hasMore, nextCursor, posts.length]);

  const markDragging = () => {
    draggingRef.current = true;
    setScrollLocked(true);
    if (dragTimer.current) window.clearTimeout(dragTimer.current);
    dragTimer.current = window.setTimeout(() => {
      draggingRef.current = false;
      setScrollLocked(false);
    }, 180);
  };

  const advance = useCallback(() => {
    if (!feedReadyRef.current) {
      pendingEndRef.current = true;
      pendingEndPostIdRef.current = posts[activeIndex]?.id ?? null;
      setClipEnded(true);
      return;
    }
    const sheetOpen = commentsOpen || shareOpen || reportOpen || moreOpen;
    if (
      !shouldAdvanceExploreReel({
        commentsOpen,
        shareOpen,
        reportOpen: reportOpen || moreOpen,
        dragging: scrollLocked || draggingRef.current,
        index: activeIndex,
        length: posts.length,
      })
    ) {
      const nowhereToGo = activeIndex >= posts.length - 1 && !reelHasAnotherPage(hasMore, nextCursor);
      pendingEndRef.current =
        !nowhereToGo && (sheetOpen || scrollLocked || draggingRef.current || activeIndex >= posts.length - 1);
      pendingEndPostIdRef.current = pendingEndRef.current ? (posts[activeIndex]?.id ?? null) : null;
      setClipEnded(true);
      return;
    }
    pendingEndRef.current = false;
    pendingEndPostIdRef.current = null;
    setClipEnded(false);
    const next = activeIndex + 1;
    setActiveIndex(next);
    setCommentsOpen(false);
    scrollReelTo(next, "smooth");
  }, [activeIndex, commentsOpen, hasMore, moreOpen, nextCursor, posts, reportOpen, scrollLocked, scrollReelTo, shareOpen]);

  useEffect(() => {
    if (!pendingEndRef.current) return;
    if (!feedReadyRef.current) return;
    const activeId = posts[activeIndex]?.id ?? null;
    if (!pendingReelAdvanceStillApplies(pendingEndPostIdRef.current, activeId)) {
      pendingEndRef.current = false;
      pendingEndPostIdRef.current = null;
      setClipEnded(false);
      return;
    }
    if (commentsOpen || shareOpen || reportOpen || moreOpen || scrollLocked) return;
    pendingEndRef.current = false;
    pendingEndPostIdRef.current = null;
    advance();
  }, [activeIndex, advance, commentsOpen, moreOpen, posts, reportOpen, scrollLocked, shareOpen]);

  useEffect(() => {
    if (clipEnded) setClipPlaying(false);
  }, [clipEnded]);

  useEffect(() => {
    const nextId = postsRef.current[activeIndex]?.id ?? null;
    const sameClip = nextId != null && nextId === activePostIdRef.current;
    activePostIdRef.current = nextId;
    if (sameClip) return;
    setClipEnded(false);
    setClipPlaying(false);
    setCommentsOpen(false);
    setMoreOpen(false);
    setCommentInput("");
    setReplyTo(null);
  }, [activeIndex]);

  const patchActive = (patch: Partial<ExplorePost>) => {
    setPosts((prev) => prev.map((p, i) => (i === activeIndex ? { ...p, ...patch } : p)));
  };

  const toggleLike = async () => {
    if (!user) {
      onRequireLogin();
      return;
    }
    const current = posts[activeIndex];
    if (!current) return;
    const nextLiked = !current.is_liked;
    patchActive({
      is_liked: nextLiked,
      like_count: nextLiked ? (current.like_count ?? 0) + 1 : Math.max(0, (current.like_count ?? 1) - 1),
    });
    try {
      if (nextLiked) {
        await fetcher.post("/api/explore/events", {
          post_id: current.id,
          event_type: "like",
          idempotency_key: `like-${current.id}-${user.id}`,
        });
      } else {
        await fetcher.delete(`/api/explore/events?post_id=${current.id}&event_type=like`);
      }
    } catch {
      patchActive({ is_liked: current.is_liked, like_count: current.like_count });
      toast.error(t(`${pd}.likeFailed`));
    }
  };

  const toggleSave = async () => {
    if (!user) {
      onRequireLogin();
      return;
    }
    const current = posts[activeIndex];
    if (!current) return;
    const nextSaved = !current.is_saved;
    patchActive({ is_saved: nextSaved });
    try {
      if (nextSaved) await fetcher.post("/api/explore/saved", { post_id: current.id });
      else await fetcher.delete(`/api/explore/saved?post_id=${current.id}`);
    } catch {
      patchActive({ is_saved: current.is_saved });
      toast.error(t(`${pd}.saveFailed`));
    }
  };

  const deleteComment = async (commentId: string) => {
    const current = posts[activeIndex];
    if (!current) return;
    try {
      await fetcher.delete(`/api/explore/posts/${current.id}/comments/${commentId}`);
      const removed = removedExploreCommentCount(comments, commentId);
      setComments((prev) =>
        prev
          .filter((c) => c.id !== commentId)
          .map((c) => ({
            ...c,
            replies: (c.replies ?? []).filter((r) => r.id !== commentId),
          })),
      );
      patchActive({ comment_count: Math.max(0, (current.comment_count ?? removed) - removed) });
    } catch {
      toast.error(t(`${pd}.deleteCommentFailed`));
    }
  };

  const loadComments = async (postId: string, offset: number, append: boolean, keepVisible = false) => {
    const requestId = ++commentsRequestRef.current;
    if (!append && !keepVisible) {
      setComments([]);
      setCommentsOffset(0);
      setHasMoreComments(false);
    }
    setCommentsLoading(true);
    try {
      let cursor = offset;
      let pageAppend = append;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const res = await fetcher.get<{
          data?: { data?: ExploreComment[]; next_offset?: number; has_more?: boolean };
        }>(`/api/explore/posts/${postId}/comments?limit=20&offset=${cursor}`, { staleTimeMs: 0 });
        if (requestId !== commentsRequestRef.current) return;
        const payload = res?.data;
        const list = Array.isArray(payload?.data) ? payload.data : [];
        const nextOffset = payload?.next_offset;
        const hasMore = payload?.has_more ?? nextOffset != null;
        const skipTo = nextOffsetAfterEmptyCommentPage({
          offset: cursor,
          visibleCount: list.length,
          hasMore,
          nextOffset,
        });
        if (skipTo == null || attempt === 4) {
          setComments((prev) => (pageAppend ? appendExploreCommentPage(prev, list) : list));
          setCommentsOffset(typeof nextOffset === "number" ? nextOffset : cursor + list.length);
          setHasMoreComments(hasMore);
          return;
        }
        cursor = skipTo;
        pageAppend = true;
      }
    } catch {
      if (requestId !== commentsRequestRef.current) return;
      if (!append) setComments([]);
    } finally {
      if (requestId === commentsRequestRef.current) setCommentsLoading(false);
    }
  };

  const openComments = async () => {
    const current = posts[activeIndex];
    if (!current) return;
    setCommentsOpen(true);
    setReplyTo(null);
    await loadComments(current.id, 0, false);
  };

  const sendComment = async () => {
    const current = posts[activeIndex];
    const text = commentInput.trim();
    if (!current || !text) return;
    if (!user) {
      onRequireLogin();
      return;
    }
    setCommentSending(true);
    try {
      const res = await fetcher.post<{ data?: ExploreComment }>(`/api/explore/posts/${current.id}/comments`, {
        body: text,
        ...(replyTo ? { parent_id: replyTo } : {}),
      });
      const created = res?.data;
      if (!created?.id) throw new Error("comment_missing");
      setCommentInput("");
      setReplyTo(null);
      patchActive({ comment_count: (current.comment_count ?? 0) + 1 });
      setComments((prev) =>
        placeExploreComment(prev, { ...created, body: created.body ?? text, replies: created.replies ?? [] }),
      );
    } catch {
      toast.error(t(`${pd}.commentFailed`));
    } finally {
      setCommentSending(false);
    }
  };

  const blockAuthor = async () => {
    const current = posts[activeIndex];
    if (!current) return;
    if (!user) {
      onRequireLogin();
      return;
    }
    setMoreOpen(false);
    try {
      await fetcher.post("/api/me/blocks", { provider_id: current.provider_id });
      const remaining = posts.filter((p) => p.provider_id !== current.provider_id);
      pendingEndRef.current = false;
      pendingEndPostIdRef.current = null;
      activePostIdRef.current = remaining[0]?.id ?? null;
      setClipEnded(false);
      setClipPlaying(false);
      setCommentsOpen(false);
      setCommentInput("");
      setReplyTo(null);
      setPosts(remaining);
      toast.success(t("customer.blockUser.confirmAction"));
      if (remaining.length === 0) {
        router.push("/explore");
        return;
      }
      setActiveIndex(0);
      scrollReelTo(0, "auto");
    } catch {
      toast.error(t("customer.blockUser.errorBody"));
    }
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-black lg:rounded-2xl lg:shadow-xl">
      <audio ref={soundRef} preload="auto" />
      <Link
        href="/explore"
        className="absolute left-3 top-[max(1rem,env(safe-area-inset-top))] z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white"
        aria-label="Back to explore"
      >
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <div
        ref={containerRef}
        className={`h-full w-full snap-y snap-mandatory ${
          commentsOpen || moreOpen || shareOpen || reportOpen ? "overflow-hidden" : "overflow-y-auto"
        }`}
        onPointerDown={() => {
          scrollTargetRef.current = null;
          markDragging();
        }}
        onWheel={() => {
          scrollTargetRef.current = null;
          markDragging();
        }}
        onScroll={(e) => {
          const el = e.currentTarget;
          const height = el.clientHeight;
          const idx = height > 0 ? Math.round(el.scrollTop / height) : 0;
          if (scrollTargetRef.current != null) {
            if (reelScrollLanded(el.scrollTop, height, scrollTargetRef.current)) {
              scrollTargetRef.current = null;
            }
            return;
          }
          markDragging();
          if (idx !== activeIndex && idx >= 0 && idx < posts.length) setActiveIndex(idx);
        }}
      >
        {posts.map((p, i) => (
          <div key={p.id} className="relative h-full w-full shrink-0 snap-start">
            <ReelVideoSlide
              post={p}
              active={i === activeIndex && !clipEnded}
              muted={muted}
              onEnded={advance}
              onPlayingChange={i === activeIndex ? setClipPlaying : undefined}
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => {
          setMuted((current) => {
            const next = !current;
            const audio = soundRef.current;
            if (!audio) return next;
            if (next || !activeSound || clipEnded) {
              audio.pause();
              audio.loop = false;
              return next;
            }
            audio.loop = true;
            if (audio.dataset.track !== activeSound) {
              audio.dataset.track = activeSound;
              audio.src = activeSound;
            }
            void audio.play().catch(() => undefined);
            return next;
          });
        }}
        className="absolute right-3 top-[max(1rem,env(safe-area-inset-top))] z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white"
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
      </button>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pt-16 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Link
          href={`/partner-profile?slug=${encodeURIComponent(activePost.provider.slug)}`}
          className="pointer-events-auto text-sm font-bold text-white"
        >
          {activePost.provider.business_name}
        </Link>
        {activePost.caption ? (
          <p className="pointer-events-auto mt-1 line-clamp-2 text-sm text-white/95">{activePost.caption}</p>
        ) : null}
      </div>

      <div className="absolute bottom-[max(6rem,calc(env(safe-area-inset-bottom)+5rem))] right-3 z-20 flex flex-col items-center gap-4">
        <button type="button" onClick={() => void toggleLike()} className="flex flex-col items-center text-white">
          <Heart className={`h-7 w-7 ${activePost.is_liked ? "fill-[#FF0077] text-[#FF0077]" : ""}`} />
          <span className="text-xs">{activePost.like_count || ""}</span>
        </button>
        <button type="button" onClick={() => void openComments()} className="flex flex-col items-center text-white">
          <MessageCircle className="h-7 w-7" />
          <span className="text-xs">{activePost.comment_count || ""}</span>
        </button>
        <button type="button" onClick={() => void toggleSave()} className="text-white">
          <Bookmark className={`h-7 w-7 ${activePost.is_saved ? "fill-[#FF0077] text-[#FF0077]" : ""}`} />
        </button>
        <button type="button" onClick={() => onShare(activePost)} className="text-white">
          <Share2 className="h-6 w-6" />
        </button>
        <ExploreVideoSideLogo spinning={clipPlaying} />
        <button type="button" onClick={() => setMoreOpen((v) => !v)} className="text-white" aria-label="More">
          <Flag className="h-5 w-5" />
        </button>
      </div>

      {moreOpen ? (
        <div className="absolute bottom-24 right-16 z-30 w-52 rounded-xl bg-white py-2 shadow-lg">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
            onClick={() => {
              setMoreOpen(false);
              onReport("explore_post", activePost.id, t("customer.contentReport.reportPost"));
            }}
          >
            <Flag className="h-4 w-4" />
            {t("customer.contentReport.reportPost")}
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
            onClick={() => void blockAuthor()}
          >
            <Ban className="h-4 w-4" />
            {t("customer.blockUser.confirmAction")}
          </button>
        </div>
      ) : null}

      {commentsOpen ? (
        <div className="absolute inset-x-0 bottom-0 z-40 flex max-h-[70%] flex-col rounded-t-2xl bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-semibold text-gray-900">{t(`${pd}.comments`, "Comments")}</p>
            <button type="button" onClick={() => setCommentsOpen(false)} aria-label="Close comments">
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {commentsLoading && comments.length === 0 ? (
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-400" />
            ) : comments.length === 0 && !hasMoreComments ? (
              <p className="text-sm text-gray-500">{t(`${pd}.noCommentsYet`)}</p>
            ) : comments.length > 0 ? (
              <ul className="space-y-3">
                {comments.map((c) => (
                  <li key={c.id}>
                    <p className="text-sm font-medium text-gray-900">{c.author?.full_name || t(`${pd}.someone`)}</p>
                    <p className="text-sm text-gray-800">{c.body}</p>
                    <div className="mt-1 flex gap-3">
                      {user ? (
                        <button type="button" className="text-xs text-gray-500" onClick={() => setReplyTo(c.id)}>
                          {t(`${pd}.reply`, "Reply")}
                        </button>
                      ) : null}
                      {user && user.id === c.user_id ? (
                        <button type="button" className="text-xs text-gray-500" onClick={() => void deleteComment(c.id)}>
                          {t(`${pd}.deleteComment`)}
                        </button>
                      ) : null}
                      {user && user.id !== c.user_id ? (
                        <button
                          type="button"
                          className="text-xs text-gray-500"
                          onClick={() =>
                            onReport("explore_comment", c.id, t("customer.contentReport.reportComment"))
                          }
                        >
                          {t("customer.contentReport.reportComment")}
                        </button>
                      ) : null}
                    </div>
                    {(c.replies ?? []).map((r) => (
                      <div key={r.id} className="ms-4 mt-2 border-s border-gray-100 ps-3">
                        <p className="text-xs font-medium text-gray-900">{r.author?.full_name || t(`${pd}.someone`)}</p>
                        <p className="text-sm text-gray-800">{r.body}</p>
                        <div className="mt-1 flex gap-3">
                          {user && user.id === r.user_id ? (
                            <button
                              type="button"
                              className="text-xs text-gray-500"
                              onClick={() => void deleteComment(r.id)}
                            >
                              {t(`${pd}.deleteComment`)}
                            </button>
                          ) : null}
                          {user && user.id !== r.user_id ? (
                            <button
                              type="button"
                              className="text-xs text-gray-500"
                              onClick={() =>
                                onReport("explore_comment", r.id, t("customer.contentReport.reportComment"))
                              }
                            >
                              {t("customer.contentReport.reportComment")}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            ) : null}
            {hasMoreComments ? (
              <button
                type="button"
                onClick={() => {
                  const current = posts[activeIndex];
                  if (!current || commentsLoading) return;
                  void loadComments(current.id, commentsOffset, true);
                }}
                disabled={commentsLoading}
                className="mt-3 text-sm text-[#FF0077] hover:underline disabled:opacity-40"
              >
                {commentsLoading ? t(`${pd}.loading`) : t(`${pd}.loadMoreComments`)}
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-2 border-t border-gray-100 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {replyTo ? (
              <button type="button" className="text-xs text-gray-500" onClick={() => setReplyTo(null)}>
                {t(`${pd}.cancelReply`, "Cancel reply")}
              </button>
            ) : null}
            <input
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
              placeholder={user ? t(`${pd}.addCommentMention`) : t(`${pd}.signInToComment`)}
              className="flex-1 rounded-full bg-gray-100 px-4 py-2 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") void sendComment();
              }}
            />
            <button
              type="button"
              disabled={!commentInput.trim() || commentSending}
              onClick={() => void sendComment()}
              className="text-sm font-semibold text-[#FF0077] disabled:opacity-40"
            >
              {t(`${pd}.post`, "Post")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

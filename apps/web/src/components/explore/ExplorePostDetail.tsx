"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { Heart, Bookmark, Share2, MoreHorizontal, ZoomIn, MessageCircle, ImageIcon, Link2, Mail, Loader2, X, Trash2 } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import LoginModal from "@/components/global/login-modal";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import type { ExplorePost, ExploreComment } from "@/types/explore";

/** Renders comment body with @username segments highlighted */
function CommentBody({ body }: { body: string }) {
  const parts = body.split(/(@[\w.-]+)/g);
  return (
    <span className="text-sm text-gray-800 break-words">
      {parts.map((part, i) =>
        part.startsWith("@") ? (
          <span key={i} className="font-medium text-[#FF0077]">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

function formatCommentTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffM = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);
  if (diffM < 1) return "Just now";
  if (diffM < 60) return `${diffM}m`;
  if (diffH < 24) return `${diffH}h`;
  if (diffD < 7) return `${diffD}d`;
  return d.toLocaleDateString();
}

function isVideoUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.endsWith(".mov");
}

interface ExplorePostDetailProps {
  post: ExplorePost;
  relatedPosts: ExplorePost[];
}

export function ExplorePostDetail({ post, relatedPosts }: ExplorePostDetailProps) {
  const { user } = useAuth();
  const [isLiked, setIsLiked] = useState(post.is_liked ?? false);
  const [isSaved, setIsSaved] = useState(post.is_saved ?? false);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [commentCount, setCommentCount] = useState(post.comment_count ?? 0);
  const [comments, setComments] = useState<ExploreComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentInput, setCommentInput] = useState("");
  const [commentsOffset, setCommentsOffset] = useState(0);
  const [hasMoreComments, setHasMoreComments] = useState(true);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showZoomModal, setShowZoomModal] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const viewTrackedRef = useRef(false);
  const commentsFetchedRef = useRef(false);

  const fetchComments = useCallback(async (offset = 0, append = false) => {
    try {
      if (offset === 0) setCommentsLoading(true);
      const res = await fetcher.get<{ data: { data: ExploreComment[]; next_offset?: number; has_more: boolean } }>(
        `/api/explore/posts/${post.id}/comments?limit=20&offset=${offset}`
      );
      const payload = (res as { data?: { data: ExploreComment[]; next_offset?: number; has_more: boolean } })?.data;
      const list = Array.isArray(payload?.data) ? payload.data : [];
      const nextOffset = payload?.next_offset;
      const hasMore = payload?.has_more ?? !!nextOffset;
      setComments((prev) => (append ? [...prev, ...list] : list));
      setCommentsOffset(offset + list.length);
      setHasMoreComments(hasMore);
    } catch {
      if (offset === 0) setComments([]);
    } finally {
      if (offset === 0) setCommentsLoading(false);
    }
  }, [post.id]);

  useEffect(() => {
    commentsFetchedRef.current = false;
    setComments([]);
    setCommentCount(post.comment_count ?? 0);
    setCommentsOffset(0);
    setHasMoreComments(true);
  }, [post.id, post.comment_count]);

  useEffect(() => {
    if (!post.id || commentsFetchedRef.current) return;
    commentsFetchedRef.current = true;
    fetchComments(0, false);
  }, [post.id, fetchComments]);

  const loadMoreComments = () => {
    if (!commentsLoading && hasMoreComments) fetchComments(commentsOffset, true);
  };

  const submitComment = async () => {
    const text = commentInput.trim();
    if (!text || !user) return;
    setCommentSubmitting(true);
    try {
      await fetcher.post(`/api/explore/posts/${post.id}/comments`, { body: text });
      setCommentInput("");
      setCommentCount((c) => c + 1);
      await fetchComments(0, false);
    } catch {
      toast.error("Could not post comment");
    } finally {
      setCommentSubmitting(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    try {
      await fetcher.delete(`/api/explore/posts/${post.id}/comments/${commentId}`);
      setCommentCount((c) => Math.max(0, c - 1));
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch {
      toast.error("Could not delete comment");
    }
  };

  useEffect(() => {
    if (viewTrackedRef.current) return;
    viewTrackedRef.current = true;
    fetcher
      .post("/api/explore/events", {
        post_id: post.id,
        event_type: "view",
        idempotency_key: `view-${post.id}-${Date.now().toString(36)}`,
      })
      .catch(() => {});
  }, [post.id]);

  useEffect(() => {
    if (!showZoomModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowZoomModal(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showZoomModal]);

  const handleLike = async () => {
    if (!user) {
      setIsLoginModalOpen(true);
      return;
    }
    if (isUpdating) return;
    setIsUpdating(true);
    const newLiked = !isLiked;
    try {
      if (newLiked) {
        await fetcher.post("/api/explore/events", {
          post_id: post.id,
          event_type: "like",
          idempotency_key: `like-${post.id}-${user.id}`,
        });
        setLikeCount((c) => c + 1);
      } else {
        await fetcher.delete(
          `/api/explore/events?post_id=${post.id}&event_type=like`
        );
        setLikeCount((c) => Math.max(0, c - 1));
      }
      setIsLiked(newLiked);
    } catch {
      toast.error("Could not update like");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSave = async () => {
    if (!user) {
      setIsLoginModalOpen(true);
      return;
    }
    if (isUpdating) return;
    setIsUpdating(true);
    const newSaved = !isSaved;
    try {
      if (newSaved) {
        await fetcher.post("/api/explore/saved", { post_id: post.id });
      } else {
        await fetcher.delete(`/api/explore/saved?post_id=${post.id}`);
      }
      setIsSaved(newSaved);
    } catch {
      toast.error("Could not update save");
    } finally {
      setIsUpdating(false);
    }
  };

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const shareTitle = post.caption || "Explore post";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied!");
      setShowShareModal(false);
    } catch {
      toast.error("Could not copy link");
    }
  };

  const shareToWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareTitle + " " + shareUrl)}`, "_blank");
    setShowShareModal(false);
  };

  const shareToFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, "_blank", "width=600,height=400");
    setShowShareModal(false);
  };

  const shareToX = () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareTitle)}&url=${encodeURIComponent(shareUrl)}`, "_blank");
    setShowShareModal(false);
  };

  const shareToEmail = () => {
    window.location.href = `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(shareUrl)}`;
    setShowShareModal(false);
  };

  const handleDownloadImage = async () => {
    setShowMoreMenu(false);
    const mediaUrl = post.media_urls?.[0];
    if (!mediaUrl || isVideoUrl(mediaUrl)) {
      toast.error("Download is available for images only");
      return;
    }
    try {
      const res = await fetch(mediaUrl);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `post-${post.id}.${mediaUrl.split(".").pop()?.split("?")[0] || "jpg"}`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Download started");
    } catch {
      toast.error("Could not download image");
    }
  };

  const primaryMedia = post.media_urls?.[0];
  const firstRelated = relatedPosts[0];
  const moreRelated = relatedPosts.slice(1, 13);
  const caption = post.caption ?? "";
  const captionShort = caption.length > 120 ? caption.slice(0, 120) + "..." : caption;
  const hasMoreCaption = caption.length > 120;

  return (
    <div className="min-h-screen bg-white">
      {/* Mobile: Pinterest-style stacked layout */}
      <div className="lg:hidden">
        {/* Full-bleed image */}
        <div className="relative w-full aspect-[4/5] max-h-[70vh] bg-gray-100">
          {primaryMedia && (
            <>
              <div className="absolute inset-0 z-0">
              {isVideoUrl(primaryMedia) ? (
                <video
                  src={primaryMedia}
                  controls
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <Image
                  src={primaryMedia}
                  alt={post.caption || "Post"}
                  fill
                  className="object-cover"
                  sizes="100vw"
                  priority
                />
              )}
              </div>
              {/* Action bar - absolute so it sticks to the image container only */}
              <div className="absolute top-4 right-4 p-2 flex items-center gap-2 z-10 bg-white/95 backdrop-blur-sm rounded-full shadow-lg border border-gray-100">
                <button
                  type="button"
                  onClick={() => handleLike()}
                  disabled={isUpdating}
                  className={`flex items-center gap-1.5 p-2 rounded-full hover:bg-gray-100 transition-colors ${isLiked ? "text-[#FF0077]" : "text-gray-700"}`}
                >
                  <Heart className={`w-5 h-5 ${isLiked ? "fill-current" : ""}`} />
                  <span className="text-sm font-medium">{likeCount}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowShareModal(true)}
                  className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-700"
                >
                  <Share2 className="w-5 h-5" />
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowMoreMenu((v) => !v)}
                    className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-700"
                  >
                    <MoreHorizontal className="w-5 h-5" />
                  </button>
                  {showMoreMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-[501]"
                        onClick={() => setShowMoreMenu(false)}
                        aria-hidden
                      />
                      <div className="absolute top-full right-0 mt-1 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-[502]">
                        <button
                          type="button"
                          onClick={handleDownloadImage}
                          className="w-full px-4 py-2.5 text-left text-gray-800 hover:bg-gray-50 flex items-center gap-3"
                        >
                          <ImageIcon className="w-5 h-5 text-gray-500" />
                          <span className="text-sm">Download image</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowMoreMenu(false);
                            handleSave();
                          }}
                          disabled={isUpdating}
                          className="w-full px-4 py-2.5 text-left text-gray-800 hover:bg-gray-50 flex items-center gap-3"
                        >
                          <Bookmark className={`w-5 h-5 ${isSaved ? "fill-current text-[#FF0077]" : "text-gray-500"}`} />
                          <span className="text-sm">{isSaved ? "Saved" : "Save image"}</span>
                        </button>
                        <Link
                          href={`/partner-profile?slug=${encodeURIComponent(post.provider.slug)}`}
                          onClick={() => setShowMoreMenu(false)}
                          className="w-full px-4 py-2.5 text-left text-gray-800 hover:bg-gray-50 flex items-center gap-3 block"
                        >
                          <span className="text-sm">Find out more about this</span>
                        </Link>
                      </div>
                    </>
                  )}
                </div>
              </div>
              {/* Zoom - sticks to image; opens lightbox */}
              <button
                type="button"
                onClick={() => primaryMedia && setShowZoomModal(true)}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 p-2.5 bg-white/90 backdrop-blur-sm rounded-full shadow hover:bg-white z-10"
                aria-label="Zoom"
              >
                <ZoomIn className="w-5 h-5 text-gray-700" />
              </button>
            </>
          )}
        </div>

        {/* Content panel below image */}
        <div className="px-4 pb-6 -mt-2 relative z-10">
          <div className="bg-white rounded-t-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.08)] pt-6 px-4 pb-4">
            {/* Title */}
            <h1 className="text-xl font-bold text-gray-900 mb-2">
              {caption ? (captionExpanded ? caption : captionShort) : "Untitled post"}
            </h1>
            {hasMoreCaption && (
              <button
                onClick={() => setCaptionExpanded(!captionExpanded)}
                className="text-sm text-gray-500 hover:text-[#FF0077] mb-3"
              >
                {captionExpanded ? "less" : "more"}
              </button>
            )}

            {/* Partner profile */}
            <Link
              href={`/partner-profile?slug=${encodeURIComponent(post.provider.slug)}`}
              className="flex items-center gap-3 mb-4"
            >
              <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-semibold text-sm shrink-0">
                {post.provider.business_name?.charAt(0) || "?"}
              </div>
              <span className="font-medium text-gray-900 text-sm">
                {post.provider.business_name}
              </span>
            </Link>

            {/* Comments */}
            <div className="py-2 border-t border-gray-100">
              <p className="text-sm text-gray-500 mb-2">
                {commentCount === 0
                  ? "No comments yet"
                  : `${commentCount} comment${commentCount === 1 ? "" : "s"}`}
              </p>
              {commentsLoading && comments.length === 0 ? (
                <div className="flex items-center gap-2 py-4 text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Loading comments...</span>
                </div>
              ) : (
                <ul className="space-y-3 max-h-64 overflow-y-auto mb-3">
                  {comments.map((c) => (
                    <li key={c.id} className="flex gap-3 group/comment">
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-semibold text-xs shrink-0 overflow-hidden">
                        {c.author?.avatar_url ? (
                          <Image src={c.author.avatar_url} alt="" width={32} height={32} className="w-full h-full object-cover" />
                        ) : (
                          (c.author?.full_name || "?").charAt(0)
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-900 font-medium">
                          {c.author?.full_name || "Someone"}
                          <span className="text-gray-400 font-normal ml-1.5">{formatCommentTime(c.created_at)}</span>
                        </p>
                        <CommentBody body={c.body} />
                      </div>
                      {user?.id === c.user_id && (
                        <button
                          type="button"
                          onClick={() => deleteComment(c.id)}
                          className="shrink-0 p-1.5 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover/comment:opacity-100 transition-opacity"
                          aria-label="Delete comment"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {hasMoreComments && comments.length > 0 && (
                <button
                  type="button"
                  onClick={loadMoreComments}
                  disabled={commentsLoading}
                  className="text-sm text-[#FF0077] hover:underline mb-2"
                >
                  {commentsLoading ? "Loading..." : "Load more comments"}
                </button>
              )}
              <div className="flex items-center gap-3 py-2">
                <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0 flex items-center justify-center text-gray-500 text-sm overflow-hidden">
                  {(user as any)?.user_metadata?.avatar_url ? (
                    <Image src={(user as any).user_metadata.avatar_url} alt="" width={32} height={32} className="w-full h-full object-cover" />
                  ) : (
                    ((user as any)?.user_metadata?.full_name || user?.email || "?").toString().charAt(0)
                  )}
                </div>
                <input
                  type="text"
                  placeholder={user ? "Add a comment... (use @username to mention)" : "Sign in to comment"}
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submitComment();
                    }
                  }}
                  onFocus={() => { if (!user) setIsLoginModalOpen(true); }}
                  disabled={!user || commentSubmitting}
                  maxLength={200}
                  className="flex-1 min-w-0 rounded-full bg-gray-100 border-0 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-[#FF0077]/30 outline-none"
                />
                <button
                  type="button"
                  onClick={submitComment}
                  disabled={!user || !commentInput.trim() || commentSubmitting}
                  className="shrink-0 p-2 rounded-full text-[#FF0077] hover:bg-pink-50 disabled:opacity-50 disabled:pointer-events-none"
                >
                  {commentSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageCircle className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* More like this - mobile */}
        {(firstRelated || moreRelated.length > 0) && (
          <div className="px-4 pb-8">
            <h2 className="text-base font-bold text-gray-900 mb-4">
              More like this
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {[firstRelated, ...moreRelated].filter(Boolean).slice(0, 6).map((p) => (
                <Link
                  key={p.id}
                  href={`/explore/${p.id}`}
                  className="block group"
                >
                  <div className="relative aspect-[4/5] w-full rounded-xl overflow-hidden bg-gray-100">
                    {p.media_urls?.[0] &&
                      (isVideoUrl(p.media_urls[0]) ? (
                        <video
                          src={p.media_urls[0]}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          muted
                          playsInline
                        />
                      ) : (
                        <Image
                          src={p.media_urls[0]}
                          alt={p.caption || "Post"}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform"
                          sizes="50vw"
                        />
                      ))}
                  </div>
                  {p.caption && (
                    <p className="mt-1.5 text-sm text-gray-700 line-clamp-2 flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate">{p.caption}</span>
                      <MoreHorizontal className="w-4 h-4 text-gray-400 shrink-0" />
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Desktop: Side-by-side layout */}
      <div className="hidden lg:block min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 py-10">
          <div className="flex flex-row gap-10">
            <div className="flex-1 flex justify-center">
              <div className="w-full max-w-xl aspect-square max-h-[80vh] bg-white rounded-2xl overflow-hidden shadow-lg relative group">
                {primaryMedia && (
                  <>
                    {isVideoUrl(primaryMedia) ? (
                      <video src={primaryMedia} controls playsInline className="w-full h-full object-cover" />
                    ) : (
                      <Image
                        src={primaryMedia}
                        alt={post.caption || "Post"}
                        fill
                        className="object-contain"
                        sizes="50vw"
                        priority
                      />
                    )}
                    {/* Action bar - sticks to image */}
                    <div className="absolute top-3 right-3 p-2 flex items-center gap-1 bg-white/95 backdrop-blur-sm rounded-full shadow-lg border border-gray-100 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={handleLike}
                        disabled={isUpdating}
                        className={`flex items-center gap-2 p-2 rounded-full transition-colors ${isLiked ? "text-[#FF0077]" : "text-gray-600 hover:text-[#FF0077] hover:bg-pink-50"}`}
                      >
                        <Heart className={`w-5 h-5 ${isLiked ? "fill-current" : ""}`} />
                        <span className="text-sm font-medium">{likeCount.toLocaleString()}</span>
                      </button>
                      <button onClick={() => setShowShareModal(true)} className="p-2 rounded-full text-gray-600 hover:text-[#FF0077] hover:bg-pink-50 transition-colors">
                        <Share2 className="w-5 h-5" />
                      </button>
                      <div className="relative">
                        <button onClick={() => setShowMoreMenu(!showMoreMenu)} className="p-2 rounded-full text-gray-600 hover:bg-gray-100 transition-colors">
                          <MoreHorizontal className="w-5 h-5" />
                        </button>
                        {showMoreMenu && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setShowMoreMenu(false)} aria-hidden />
                            <div className="absolute top-full right-0 mt-1 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-20">
                              <button onClick={handleDownloadImage} className="w-full px-4 py-2.5 text-left text-gray-800 hover:bg-gray-50 flex items-center gap-3">
                                <ImageIcon className="w-5 h-5 text-gray-500" />
                                <span className="text-sm">Download image</span>
                              </button>
                              <button onClick={() => { setShowMoreMenu(false); handleSave(); }} disabled={isUpdating} className="w-full px-4 py-2.5 text-left text-gray-800 hover:bg-gray-50 flex items-center gap-3">
                                <Bookmark className={`w-5 h-5 ${isSaved ? "fill-current text-[#FF0077]" : "text-gray-500"}`} />
                                <span className="text-sm">{isSaved ? "Saved" : "Save image"}</span>
                              </button>
                              <Link href={`/partner-profile?slug=${encodeURIComponent(post.provider.slug)}`} onClick={() => setShowMoreMenu(false)} className="w-full px-4 py-2.5 text-left text-gray-800 hover:bg-gray-50 flex items-center gap-3 block">
                                <span className="text-sm">Find out more about this</span>
                              </Link>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowZoomModal(true)}
                      className="absolute bottom-3 right-3 p-2.5 bg-white/90 backdrop-blur-sm rounded-full shadow hover:bg-white z-10 opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Zoom"
                    >
                      <ZoomIn className="w-5 h-5 text-gray-700" />
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="w-[400px] flex-shrink-0">
              <div className="bg-white rounded-2xl shadow-lg p-6 flex flex-col gap-5">
                <div className="flex items-center justify-end">
                  <button
                    onClick={handleSave}
                    disabled={isUpdating}
                    className={`px-5 py-2.5 rounded-full font-medium transition-colors ${isSaved ? "bg-[#FF0077] text-white" : "bg-gray-900 text-white hover:bg-gray-800"}`}
                  >
                    Save
                  </button>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900 mb-2 break-words">{post.caption || "Untitled post"}</h1>
                  <Link href={`/partner-profile?slug=${encodeURIComponent(post.provider.slug)}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-semibold shrink-0">
                      {post.provider.business_name?.charAt(0) || "?"}
                    </div>
                    <span className="font-medium text-gray-900">{post.provider.business_name}</span>
                  </Link>
                </div>
                {/* Desktop comments */}
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-sm text-gray-500 mb-3">
                    {commentCount === 0 ? "No comments yet" : `${commentCount} comment${commentCount === 1 ? "" : "s"}`}
                  </p>
                  {commentsLoading && comments.length === 0 ? (
                    <div className="flex items-center gap-2 py-4 text-gray-400">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-sm">Loading comments...</span>
                    </div>
                  ) : (
                    <ul className="space-y-3 max-h-48 overflow-y-auto mb-3">
                      {comments.map((c) => (
                        <li key={c.id} className="flex gap-3 group/comment">
                          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-semibold text-xs shrink-0 overflow-hidden">
                            {c.author?.avatar_url ? (
                              <Image src={c.author.avatar_url} alt="" width={32} height={32} className="w-full h-full object-cover" />
                            ) : (
                              (c.author?.full_name || "?").charAt(0)
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-gray-900 font-medium">
                              {c.author?.full_name || "Someone"}
                              <span className="text-gray-400 font-normal ml-1.5">{formatCommentTime(c.created_at)}</span>
                            </p>
                            <CommentBody body={c.body} />
                          </div>
                          {user?.id === c.user_id && (
                            <button
                              type="button"
                              onClick={() => deleteComment(c.id)}
                              className="shrink-0 p-1.5 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover/comment:opacity-100 transition-opacity"
                              aria-label="Delete comment"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {hasMoreComments && comments.length > 0 && (
                    <button type="button" onClick={loadMoreComments} disabled={commentsLoading} className="text-sm text-[#FF0077] hover:underline mb-3">
                      {commentsLoading ? "Loading..." : "Load more comments"}
                    </button>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0 flex items-center justify-center text-gray-500 text-sm overflow-hidden">
                      {((user as any)?.user_metadata?.full_name || user?.email || "?").toString().charAt(0)}
                    </div>
                    <input
                      type="text"
                      placeholder={user ? "Add a comment... (@username to mention)" : "Sign in to comment"}
                      value={commentInput}
                      onChange={(e) => setCommentInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
                      onFocus={() => { if (!user) setIsLoginModalOpen(true); }}
                      disabled={!user || commentSubmitting}
                      maxLength={200}
                      className="flex-1 min-w-0 rounded-full bg-gray-100 border-0 px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-[#FF0077]/30 outline-none"
                    />
                    <button
                      type="button"
                      onClick={submitComment}
                      disabled={!user || !commentInput.trim() || commentSubmitting}
                      className="shrink-0 p-2 rounded-full text-[#FF0077] hover:bg-pink-50 disabled:opacity-50 disabled:pointer-events-none"
                    >
                      {commentSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageCircle className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                {firstRelated && firstRelated.media_urls?.[0] && (
                  <div>
                    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">More like this</h2>
                    <Link href={`/explore/${firstRelated.id}`} className="block relative aspect-[4/5] max-h-64 w-full rounded-xl overflow-hidden bg-gray-100 group">
                      {isVideoUrl(firstRelated.media_urls[0]) ? (
                        <video src={firstRelated.media_urls[0]} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" muted playsInline />
                      ) : (
                        <Image src={firstRelated.media_urls[0]} alt={firstRelated.caption || "Related"} fill className="object-cover group-hover:scale-105 transition-transform duration-300" sizes="400px" />
                      )}
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
          {moreRelated.length > 0 && (
            <div className="mt-12">
              <h2 className="text-lg font-bold text-gray-900 mb-6">Related posts</h2>
              <div className="columns-3 xl:columns-4 gap-4">
                {moreRelated.map((p) => (
                  <Link key={p.id} href={`/explore/${p.id}`} className="block break-inside-avoid mb-4 group">
                    <div className="relative aspect-[4/5] w-full rounded-xl overflow-hidden bg-gray-100">
                      {p.media_urls?.[0] && (isVideoUrl(p.media_urls[0]) ? (
                        <video src={p.media_urls[0]} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" muted playsInline />
                      ) : (
                        <Image src={p.media_urls[0]} alt={p.caption || "Post"} fill className="object-cover group-hover:scale-105 transition-transform duration-300" sizes="25vw" />
                      ))}
                    </div>
                    {p.caption && <p className="mt-2 text-sm text-gray-700 line-clamp-2">{p.caption}</p>}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Zoom lightbox */}
      {showZoomModal && primaryMedia && (
        <>
          <div
            className="fixed inset-0 bg-black/90 z-[602]"
            onClick={() => setShowZoomModal(false)}
            onKeyDown={(e) => e.key === "Escape" && setShowZoomModal(false)}
            role="button"
            tabIndex={0}
            aria-label="Close zoom"
          />
          <div className="fixed inset-4 md:inset-8 z-[603] flex items-center justify-center pointer-events-none">
            <div className="relative w-full h-full max-w-5xl max-h-[90vh] pointer-events-auto" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setShowZoomModal(false)}
                className="absolute -top-12 right-0 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white z-10"
                aria-label="Close"
              >
                <X className="w-6 h-6" />
              </button>
              {isVideoUrl(primaryMedia) ? (
                <video
                  src={primaryMedia}
                  controls
                  playsInline
                  autoPlay
                  className="w-full h-full object-contain rounded-lg"
                />
              ) : (
                <Image
                  src={primaryMedia}
                  alt={post.caption || "Post"}
                  fill
                  className="object-contain"
                  sizes="100vw"
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </div>
          </div>
        </>
      )}

      {/* Share modal - Pinterest style */}
      {showShareModal && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-[600]"
            onClick={() => setShowShareModal(false)}
            aria-hidden
          />
          <div className="fixed bottom-0 left-0 right-0 lg:left-1/2 lg:right-auto lg:bottom-1/2 lg:translate-x-[-50%] lg:translate-y-[50%] lg:max-w-md w-full bg-white rounded-t-2xl lg:rounded-2xl shadow-xl z-[601] max-h-[85vh] overflow-hidden">
            <div className="p-5 pb-8 lg:pb-5">
              <h3 className="text-lg font-bold text-gray-900 mb-5">Share</h3>
              <div className="grid grid-cols-4 gap-4">
                <button
                  type="button"
                  onClick={copyLink}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                    <Link2 className="w-6 h-6 text-gray-700" />
                  </div>
                  <span className="text-xs font-medium text-gray-700 text-center">Copy link</span>
                </button>
                <button
                  type="button"
                  onClick={shareToWhatsApp}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <div className="w-12 h-12 rounded-full bg-[#25D366]/20 flex items-center justify-center">
                    <MessageCircle className="w-6 h-6 text-[#25D366]" />
                  </div>
                  <span className="text-xs font-medium text-gray-700 text-center">WhatsApp</span>
                </button>
                <button
                  type="button"
                  onClick={shareToFacebook}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <div className="w-12 h-12 rounded-full bg-[#1877F2]/20 flex items-center justify-center">
                    <Share2 className="w-6 h-6 text-[#1877F2]" />
                  </div>
                  <span className="text-xs font-medium text-gray-700 text-center">Facebook</span>
                </button>
                <button
                  type="button"
                  onClick={shareToX}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <div className="w-12 h-12 rounded-full bg-gray-900/10 flex items-center justify-center">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  </div>
                  <span className="text-xs font-medium text-gray-700 text-center">X</span>
                </button>
                <button
                  type="button"
                  onClick={shareToEmail}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                    <Mail className="w-6 h-6 text-gray-700" />
                  </div>
                  <span className="text-xs font-medium text-gray-700 text-center">Email</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="w-full mt-4 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      <LoginModal open={isLoginModalOpen} setOpen={setIsLoginModalOpen} />
    </div>
  );
}

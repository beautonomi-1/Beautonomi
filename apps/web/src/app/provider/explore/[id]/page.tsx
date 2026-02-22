"use client";

import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import RoleGuard from "@/components/auth/RoleGuard";
import { PageHeader } from "@/components/provider/PageHeader";
import { Button } from "@/components/ui/button";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import {
  Loader2,
  ChevronLeft,
  Pencil,
  MessageCircle,
  Eye,
  Heart,
  ExternalLink,
  Trash2,
} from "lucide-react";
import type { ExplorePost, ExploreComment } from "@/types/explore";

function isVideoUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.endsWith(".mov");
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

export default function ProviderExploreViewPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const [post, setPost] = useState<ExplorePost | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [comments, setComments] = useState<ExploreComment[]>([]);
  const [commentCount, setCommentCount] = useState(0);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentInput, setCommentInput] = useState("");
  const [commentsOffset, setCommentsOffset] = useState(0);
  const [hasMoreComments, setHasMoreComments] = useState(true);

  const fetchComments = useCallback(
    async (offset = 0, append = false) => {
      if (!id) return;
      try {
        if (offset === 0) setCommentsLoading(true);
        const res = await fetcher.get<{
          data: { data: ExploreComment[]; next_offset?: number; has_more: boolean };
        }>(`/api/explore/posts/${id}/comments?limit=20&offset=${offset}`);
        const payload = (res as { data?: { data: ExploreComment[]; next_offset?: number; has_more: boolean } })
          ?.data;
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
    },
    [id]
  );

  useEffect(() => {
    if (!id) return;
    fetcher
      .get<{ data: ExplorePost[] }>("/api/explore/posts/mine")
      .then((res: any) => {
        const data = res?.data ?? res;
        const list = Array.isArray(data) ? data : [];
        const found = list.find((p: ExplorePost) => p.id === id);
        setPost(found ?? null);
        if (found) setCommentCount(found.comment_count ?? 0);
      })
      .catch(() => setPost(null))
      .finally(() => setIsLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id || !post) return;
    fetchComments(0, false);
  }, [id, post?.id, fetchComments]);

  const loadMoreComments = () => {
    if (!commentsLoading && hasMoreComments) fetchComments(commentsOffset, true);
  };

  const submitComment = async () => {
    const text = commentInput.trim();
    if (!text || !id) return;
    setCommentSubmitting(true);
    try {
      await fetcher.post(`/api/explore/posts/${id}/comments`, { body: text });
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
      await fetcher.delete(`/api/explore/posts/${id}/comments/${commentId}`);
      setCommentCount((c) => Math.max(0, c - 1));
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch {
      toast.error("Could not delete comment");
    }
  };

  if (isLoading) {
    return (
      <RoleGuard
        allowedRoles={["provider_owner", "provider_staff"]}
        redirectTo="/provider/dashboard"
        showLoading={false}
      >
        <div className="min-h-screen bg-white flex items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-[#FF0077]" />
        </div>
      </RoleGuard>
    );
  }

  if (!post) {
    return (
      <RoleGuard
        allowedRoles={["provider_owner", "provider_staff"]}
        redirectTo="/provider/dashboard"
        showLoading={false}
      >
        <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
          <p className="text-gray-600 mb-4">Post not found</p>
          <Button variant="outline" onClick={() => router.push("/provider/explore")}>
            Back to Explore
          </Button>
        </div>
      </RoleGuard>
    );
  }

  const primaryMedia = post.media_urls?.[0];

  return (
    <RoleGuard
      allowedRoles={["provider_owner", "provider_staff"]}
      redirectTo="/provider/dashboard"
      showLoading={false}
    >
      <div className="min-h-screen bg-white">
        <PageHeader
          title="View post"
          subtitle={post.caption || "Explore post"}
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Provider", href: "/provider" },
            { label: "Explore", href: "/provider/explore" },
            { label: "View post" },
          ]}
        />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-12">
          <div className="flex items-center gap-2 mb-4">
            <Link
              href="/provider/explore"
              className="flex items-center gap-1 text-gray-600 hover:text-gray-900"
            >
              <ChevronLeft className="w-5 h-5" />
              Back
            </Link>
          </div>

          <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
            <div className="aspect-square max-h-[60vh] bg-gray-100 relative">
              {primaryMedia ? (
                isVideoUrl(primaryMedia) ? (
                  <video
                    src={primaryMedia}
                    controls
                    playsInline
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <Image
                    src={primaryMedia}
                    alt={post.caption || "Post"}
                    fill
                    className="object-contain"
                    sizes="(max-width: 768px) 100vw, 672px"
                  />
                )
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  No media
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-100">
              <p className="text-sm text-gray-700 whitespace-pre-wrap mb-3">
                {post.caption || "No caption"}
              </p>
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 mb-4">
                <span
                  className={`px-2 py-0.5 rounded ${
                    post.status === "published" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {post.status}
                </span>
                <span className="flex items-center gap-1">
                  <Heart className="w-4 h-4" />
                  {post.like_count} likes
                </span>
                <span className="flex items-center gap-1">
                  <MessageCircle className="w-4 h-4" />
                  {commentCount} comments
                </span>
                {typeof post.view_count === "number" && (
                  <span className="flex items-center gap-1">
                    <Eye className="w-4 h-4" />
                    {post.view_count} views
                  </span>
                )}
                {post.status === "published" && (
                  <Link
                    href="/explore"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[#FF0077] hover:underline ml-auto"
                  >
                    <ExternalLink className="w-4 h-4" />
                    View on Explore
                  </Link>
                )}
              </div>
              <div className="flex gap-2">
                <Link href={`/provider/explore/${post.id}/edit`}>
                  <Button variant="outline" size="sm">
                    <Pencil className="w-4 h-4 mr-1" />
                    Edit post
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          {/* Comments section */}
          <div className="mt-8 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">
                Comments ({commentCount})
              </h2>
            </div>
            <div className="p-4">
              {commentsLoading && comments.length === 0 ? (
                <div className="flex items-center gap-2 py-8 text-gray-400 justify-center">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Loading comments...</span>
                </div>
              ) : (
                <ul className="space-y-4 max-h-80 overflow-y-auto">
                  {comments.map((c) => (
                    <li key={c.id} className="flex gap-3 group/comment">
                      <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-semibold text-sm shrink-0 overflow-hidden">
                        {c.author?.avatar_url ? (
                          <Image
                            src={c.author.avatar_url}
                            alt=""
                            width={36}
                            height={36}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          (c.author?.full_name || "?").charAt(0)
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-900 font-medium">
                          {c.author?.full_name || "Someone"}
                          <span className="text-gray-400 font-normal ml-2">
                            {formatCommentTime(c.created_at)}
                          </span>
                        </p>
                        <CommentBody body={c.body} />
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteComment(c.id)}
                        className="shrink-0 p-2 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover/comment:opacity-100 transition-opacity"
                        aria-label="Delete comment"
                        title="Delete comment"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {hasMoreComments && comments.length > 0 && (
                <button
                  type="button"
                  onClick={loadMoreComments}
                  disabled={commentsLoading}
                  className="mt-3 text-sm text-[#FF0077] hover:underline"
                >
                  {commentsLoading ? "Loading..." : "Load more comments"}
                </button>
              )}

              <div className="mt-4 pt-4 border-t border-gray-100 flex gap-3">
                <input
                  type="text"
                  placeholder="Reply to comments... (use @username to mention)"
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submitComment();
                    }
                  }}
                  maxLength={200}
                  className="flex-1 min-w-0 rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-[#FF0077]/30 focus:border-[#FF0077] outline-none"
                />
                <Button
                  onClick={submitComment}
                  disabled={!commentInput.trim() || commentSubmitting}
                  className="bg-[#FF0077] hover:bg-[#D60565] text-white shrink-0"
                >
                  {commentSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin mr-1" />
                      Sending...
                    </>
                  ) : (
                    "Reply"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}

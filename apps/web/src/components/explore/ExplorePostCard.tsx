"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";

function isVideoUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.endsWith(".mov");
}
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Heart, Bookmark, MessageCircle } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import LoginModal from "@/components/global/login-modal";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import type { ExplorePost } from "@/types/explore";

interface ExplorePostCardProps {
  post: ExplorePost;
  onLikeChange?: (postId: string, liked: boolean) => void;
  onSaveChange?: (postId: string, saved: boolean) => void;
  /** First few cards above the fold – use loading="eager" for LCP */
  priority?: boolean;
}

export function ExplorePostCard({
  post,
  onLikeChange,
  onSaveChange,
  priority = false,
}: ExplorePostCardProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [isLiked, setIsLiked] = useState(post.is_liked ?? false);
  const [isSaved, setIsSaved] = useState(post.is_saved ?? false);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const viewTrackedRef = useRef(false);

  useEffect(() => {
    const el = document.getElementById(`explore-post-${post.id}`);
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !viewTrackedRef.current) {
          viewTrackedRef.current = true;
          fetcher
            .post("/api/explore/events", {
              post_id: post.id,
              event_type: "view",
              idempotency_key: `view-${post.id}-${Date.now().toString(36)}`,
            })
            .catch(() => {});
        }
      },
      { threshold: 0.5 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [post.id]);

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
      onLikeChange?.(post.id, newLiked);
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
      onSaveChange?.(post.id, newSaved);
    } catch {
      toast.error("Could not update save");
    } finally {
      setIsUpdating(false);
    }
  };

  const primaryImage = post.media_urls?.[0];
  const postDetailUrl = `/explore/${post.id}`;

  return (
    <article
      id={`explore-post-${post.id}`}
      className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 group cursor-pointer"
    >
      <Link href={postDetailUrl} className="block">
        {primaryImage && (
          <div className="relative w-full bg-gray-100 overflow-hidden">
            <div className="relative aspect-[4/5] w-full bg-gray-100">
              {isVideoUrl(primaryImage) ? (
                <video
                  src={primaryImage}
                  controls
                  playsInline
                  muted
                  loop
                  className="w-full h-full object-cover"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <Image
                  src={primaryImage}
                  alt={post.caption || "Post"}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  priority={priority}
                />
              )}
            </div>
          </div>
        )}
      </Link>
      <div className="p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span
            role="button"
            tabIndex={0}
            onClick={() => router.push(`/partner-profile?slug=${encodeURIComponent(post.provider.slug)}`)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                router.push(`/partner-profile?slug=${encodeURIComponent(post.provider.slug)}`);
              }
            }}
            className="flex items-center gap-2 min-w-0 hover:opacity-80 cursor-pointer"
          >
            <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-xs font-semibold shrink-0">
              {post.provider.business_name?.charAt(0) || "?"}
            </div>
            <span className="font-medium text-gray-900 text-sm truncate">
              {post.provider.business_name}
            </span>
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleLike}
              disabled={isUpdating}
              className={`p-1.5 rounded-full ${isLiked ? "text-[#FF0077]" : "text-gray-600 hover:text-[#FF0077] hover:bg-pink-50"}`}
            >
              <Heart className={`w-5 h-5 ${isLiked ? "fill-current" : ""}`} />
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isUpdating}
              className={`p-1.5 rounded-full ${isSaved ? "text-[#FF0077]" : "text-gray-600 hover:text-[#FF0077] hover:bg-pink-50"}`}
            >
              <Bookmark className={`w-5 h-5 ${isSaved ? "fill-current" : ""}`} />
            </button>
          </div>
        </div>
        {post.caption && (
          <p className="text-sm text-gray-700 line-clamp-2">{post.caption}</p>
        )}
        {(likeCount > 0 || (post.comment_count ?? 0) > 0) && (
          <p className="text-xs text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
            {likeCount > 0 && <span>{likeCount} likes</span>}
            {(post.comment_count ?? 0) > 0 && (
              <span className="flex items-center gap-0.5">
                <MessageCircle className="w-3.5 h-3.5" />
                {post.comment_count} comment{(post.comment_count ?? 0) === 1 ? "" : "s"}
              </span>
            )}
          </p>
        )}
      </div>

      <LoginModal open={isLoginModalOpen} setOpen={setIsLoginModalOpen} />
    </article>
  );
}

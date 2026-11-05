"use client";

import Image from "next/image";
import type { ExplorePost } from "@/types/explore";
import {
  firstSlideIsVideo,
  resolveExplorePosterUrl,
  resolveExploreVideoSrc,
} from "@/lib/explore/video-media";

type ExplorePostThumbProps = {
  post: Pick<ExplorePost, "display_url" | "media_urls" | "media_meta" | "playback_path">;
  alt: string;
  sizes: string;
  className?: string;
  priority?: boolean;
};

/**
 * Fills its (relatively positioned) parent with the post's cover image, or the
 * first video frame when a video post has no poster yet.
 */
export function ExplorePostThumb({ post, alt, sizes, className = "object-cover", priority }: ExplorePostThumbProps) {
  const poster = resolveExplorePosterUrl(post);
  if (poster) {
    return <Image src={poster} alt={alt} fill className={className} sizes={sizes} priority={priority} />;
  }

  const videoSrc = firstSlideIsVideo(post.media_urls, post.media_meta)
    ? resolveExploreVideoSrc({
        mediaUrls: post.media_urls ?? [],
        playbackPath: post.playback_path,
        mediaMeta: post.media_meta,
      })
    : null;
  if (!videoSrc) return null;

  return (
    <video
      src={`${videoSrc}#t=0.1`}
      aria-label={alt}
      muted
      playsInline
      preload="metadata"
      className={`absolute inset-0 h-full w-full pointer-events-none ${className}`}
    />
  );
}

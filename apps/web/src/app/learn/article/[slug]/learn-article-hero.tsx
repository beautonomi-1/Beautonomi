import React from "react";
import { LearnHeroGif, LearnHeroImage, LearnHeroVideo } from "./learn-hero-image";

/** Seeded placeholder paths — not real hero images; keep in sync with migration 708. */
export const PLACEHOLDER_IMAGE_PATHS = ["/images/learn/feature-browser-placeholder.svg"] as const;

export function isRealImage(url?: string | null): boolean {
  const trimmed = url?.trim();
  if (!trimmed) return false;

  const lower = trimmed.toLowerCase();
  if (PLACEHOLDER_IMAGE_PATHS.some((path) => lower === path || lower.endsWith(path))) {
    return false;
  }
  if (lower.includes("feature-browser-placeholder") || lower.includes("placeholder")) {
    return false;
  }

  return true;
}

function parseYouTubeId(raw: string): string | null {
  try {
    const trimmed = raw.trim();
    const url = trimmed.startsWith("http") ? new URL(trimmed) : new URL(`https://${trimmed}`);
    if (url.hostname === "youtu.be") {
      return url.pathname.replace(/^\//, "").split("/")[0] || null;
    }
    if (url.hostname.includes("youtube.com")) {
      const v = url.searchParams.get("v");
      if (v) return v;
      const embed = url.pathname.match(/\/embed\/([^/?]+)/);
      if (embed) return embed[1];
      const short = url.pathname.match(/\/shorts\/([^/?]+)/);
      if (short) return short[1];
    }
  } catch {
    return null;
  }
  return null;
}

function parseVimeoId(raw: string): string | null {
  try {
    const trimmed = raw.trim();
    const url = trimmed.startsWith("http") ? new URL(trimmed) : new URL(`https://${trimmed}`);
    if (!url.hostname.includes("vimeo.com")) return null;
    const m = url.pathname.match(/\/(\d+)(?:\/|$)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function isDirectMedia(url: string): "gif" | "video" | null {
  const lower = url.split("?")[0]?.toLowerCase() ?? "";
  if (/\.gif($|[?#])/.test(lower)) return "gif";
  if (/\.(mp4|webm|ogg)($|[?#])/.test(lower)) return "video";
  return null;
}

/**
 * Hero area: optional embed (YouTube/Vimeo), direct video, GIF, or static image.
 * `heroVideoUrl` takes precedence over `imageUrl` when set.
 */
export function LearnArticleHero(props: {
  title: string;
  imageUrl?: string | null;
  heroVideoUrl?: string | null;
}) {
  const { title, imageUrl, heroVideoUrl } = props;
  const videoRaw = heroVideoUrl?.trim();
  const imgRaw = imageUrl?.trim();

  if (videoRaw) {
    const yt = parseYouTubeId(videoRaw);
    if (yt) {
      return (
        <div className="relative w-full overflow-hidden rounded-xl bg-zinc-100 aspect-video max-h-[min(70vh,420px)] border border-zinc-200/80 shadow-sm">
          <iframe
            title={`${title} — video`}
            src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(yt)}`}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      );
    }

    const vm = parseVimeoId(videoRaw);
    if (vm) {
      return (
        <div className="relative w-full overflow-hidden rounded-xl bg-zinc-100 aspect-video max-h-[min(70vh,420px)] border border-zinc-200/80 shadow-sm">
          <iframe
            title={`${title} — video`}
            src={`https://player.vimeo.com/video/${encodeURIComponent(vm)}`}
            className="absolute inset-0 h-full w-full"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      );
    }

    const direct = isDirectMedia(videoRaw);
    if (direct === "gif") {
      return <LearnHeroGif src={videoRaw} />;
    }
    if (direct === "video") {
      return <LearnHeroVideo src={videoRaw} />;
    }

    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="font-medium">Could not embed this hero media URL automatically.</p>
        <p className="mt-1 text-amber-800/90">
          Use a YouTube or Vimeo link, a direct <code className="text-xs">.mp4</code> /{" "}
          <code className="text-xs">.webm</code> / <code className="text-xs">.gif</code> URL, or add the embed in the
          article body instead.
        </p>
        <a
          href={videoRaw}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-[#ff0077] underline break-all"
        >
          Open link
        </a>
      </div>
    );
  }

  if (imgRaw && isRealImage(imgRaw)) {
    return <LearnHeroImage src={imgRaw} />;
  }

  return null;
}

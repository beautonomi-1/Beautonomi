import type { ExploreMediaSlideMeta } from "@/lib/explore/media-types";
import { sanitizeExploreTextOverlays } from "@/lib/explore/explore-overlay-schema";
import {
  sanitizeExploreVideoTrim,
  trimWindowDurationMs,
} from "@/lib/explore/explore-video-trim";
import { DEFAULT_MAX_DURATION_MS } from "@/lib/explore/explore-feature-gates";
import { isExploreVideoPathOrUrl } from "@/lib/explore/video-media";

const MAX_SLIDES = 5;

export function inferSlideKind(path: string, explicit?: string): "image" | "video" {
  if (explicit === "video" || explicit === "image") return explicit;
  return isExploreVideoPathOrUrl(path) ? "video" : "image";
}

export function denormalizeFirstSlideFromMeta(
  mediaUrls: string[],
  mediaMeta: ExploreMediaSlideMeta[] | null | undefined,
): {
  display_path: string | null;
  media_width: number | null;
  media_height: number | null;
  duration_ms: number | null;
  playback_path: string | null;
} {
  const slide0 = mediaMeta?.[0];
  const display =
    slide0?.display_path ??
    (slide0?.kind === "image" || !slide0?.kind ? mediaUrls[0] ?? null : null);
  return {
    display_path: display ?? null,
    media_width: slide0?.width ?? null,
    media_height: slide0?.height ?? null,
    duration_ms: slide0?.duration_ms ?? null,
    playback_path: slide0?.playback_path ?? null,
  };
}

/** PATCH `media_meta` without `media_urls`: merge per-slide patches onto stored meta. */
export function mergeExploreMediaMetaPatch(
  existingMeta: ExploreMediaSlideMeta[],
  mediaUrls: string[],
  patch: ExploreMediaSlideMeta[] | null | undefined,
): ExploreMediaSlideMeta[] {
  if (!patch?.length) return existingMeta;
  return mediaUrls.map((url, i) => {
    const existing = existingMeta[i];
    const slidePatch = patch[i];
    const kind = slidePatch?.kind ?? existing?.kind ?? inferSlideKind(url);
    return {
      ...existing,
      ...slidePatch,
      kind,
    };
  });
}

export function validateProviderMediaPaths(
  providerId: string,
  mediaUrls: string[],
  mediaMeta?: ExploreMediaSlideMeta[] | null,
): { ok: true; mediaMeta: ExploreMediaSlideMeta[] } | { ok: false; message: string } {
  if (!mediaUrls.length) return { ok: false, message: "At least one media file is required" };
  if (mediaUrls.length > MAX_SLIDES) return { ok: false, message: `At most ${MAX_SLIDES} slides allowed` };

  const prefix = `explore/${providerId}/`;
  for (const p of mediaUrls) {
    const path = p.split("?")[0]?.replace(/^\//, "") ?? "";
    if (!path.startsWith(prefix)) {
      return { ok: false, message: "Media path must belong to this provider" };
    }
  }

  const meta: ExploreMediaSlideMeta[] = [];
  for (let i = 0; i < mediaUrls.length; i += 1) {
    const url = mediaUrls[i]!;
    const incoming = mediaMeta?.[i];
    const kind = inferSlideKind(url, incoming?.kind);
    if (incoming?.display_path) {
      const dp = incoming.display_path.split("?")[0]?.replace(/^\//, "") ?? "";
      if (!dp.startsWith(prefix)) {
        return { ok: false, message: "Display path must belong to this provider" };
      }
    }
    const text_overlays = sanitizeExploreTextOverlays(incoming?.text_overlays);
    const sourceDur =
      incoming?.source_duration_ms ?? (kind === "video" ? incoming?.duration_ms : null);
    const trim =
      kind === "video" && sourceDur
        ? sanitizeExploreVideoTrim(Number(sourceDur), DEFAULT_MAX_DURATION_MS, incoming)
        : null;
    const duration_ms =
      kind === "video" && trim
        ? trimWindowDurationMs(trim)
        : incoming?.duration_ms ?? null;
    meta.push({
      kind,
      display_path: incoming?.display_path ?? (kind === "image" ? url : incoming?.display_path ?? null),
      width: incoming?.width ?? null,
      height: incoming?.height ?? null,
      duration_ms,
      ...(kind === "video" && trim
        ? {
            trim_start_ms: trim.trim_start_ms,
            trim_end_ms: trim.trim_end_ms,
            source_duration_ms: Math.round(Number(sourceDur)),
          }
        : {}),
      playback_path: incoming?.playback_path ?? null,
      probe_job_id: incoming?.probe_job_id ?? null,
      encode_job_id: incoming?.encode_job_id ?? null,
      status: incoming?.status ?? null,
      error_code: incoming?.error_code ?? null,
      ...(text_overlays?.length ? { text_overlays } : {}),
    });
  }

  return { ok: true, mediaMeta: meta };
}

export function postNeedsVideoProcessing(mediaMeta: ExploreMediaSlideMeta[] | null | undefined): boolean {
  return (mediaMeta ?? []).some(
    (s) => s.kind === "video" && !s.playback_path && s.status !== "failed",
  );
}

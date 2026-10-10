"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  defaultExploreVideoTrim,
  exploreMaxClipMs,
  slideExploreVideoTrimStart,
  type ExploreVideoTrimWindow,
} from "@/lib/explore/explore-video-trim";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@beautonomi/i18n";

export type ExploreVideoTrimResult = ExploreVideoTrimWindow & {
  source_duration_ms: number;
};

type Props = {
  open: boolean;
  videoUrl: string;
  fullDurationMs: number;
  maxClipMs: number;
  onConfirm: (result: ExploreVideoTrimResult) => void;
  onCancel: () => void;
};

function formatSec(ms: number) {
  const s = Math.max(0, ms / 1000);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function ExploreVideoTrimModal({
  open,
  videoUrl,
  fullDurationMs,
  maxClipMs,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [probedMs, setProbedMs] = useState<number | null>(null);
  const [startMs, setStartMs] = useState(0);

  useEffect(() => {
    if (!open) {
      setProbedMs(null);
      return;
    }
    setStartMs(0);
  }, [open, videoUrl]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !open) return;
    const syncDuration = () => {
      const d = v.duration;
      if (typeof d === "number" && Number.isFinite(d) && d > 0) {
        setProbedMs(Math.round(d * 1000));
      }
    };
    v.addEventListener("loadedmetadata", syncDuration);
    v.addEventListener("durationchange", syncDuration);
    syncDuration();
    return () => {
      v.removeEventListener("loadedmetadata", syncDuration);
      v.removeEventListener("durationchange", syncDuration);
    };
  }, [open, videoUrl]);

  const resolvedFullMs =
    probedMs != null && probedMs > 0
      ? probedMs
      : fullDurationMs > 0
        ? fullDurationMs
        : 0;

  const clipMs = useMemo(
    () => (resolvedFullMs > 0 ? exploreMaxClipMs(resolvedFullMs, maxClipMs) : maxClipMs),
    [resolvedFullMs, maxClipMs],
  );
  const maxStartMs = Math.max(0, resolvedFullMs - clipMs);

  const trim = useMemo(
    () =>
      resolvedFullMs <= 0
        ? { trim_start_ms: 0, trim_end_ms: maxClipMs }
        : maxStartMs <= 0
          ? defaultExploreVideoTrim(resolvedFullMs, maxClipMs)
          : slideExploreVideoTrimStart(startMs, resolvedFullMs, maxClipMs),
    [startMs, resolvedFullMs, maxClipMs, maxStartMs],
  );

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !open) return;
    const onTimeUpdate = () => {
      const endSec = trim.trim_end_ms / 1000;
      if (v.currentTime >= endSec - 0.05) {
        v.currentTime = trim.trim_start_ms / 1000;
      }
    };
    v.addEventListener("timeupdate", onTimeUpdate);
    return () => v.removeEventListener("timeupdate", onTimeUpdate);
  }, [open, trim.trim_start_ms, trim.trim_end_ms]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !open || resolvedFullMs <= 0) return;
    v.currentTime = trim.trim_start_ms / 1000;
    void v.play().catch(() => {});
  }, [open, resolvedFullMs, trim.trim_start_ms, trim.trim_end_ms]);

  if (!open) return null;

  const ready = resolvedFullMs > 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <h2 className="text-lg font-semibold text-gray-900">
            {t("web.provider.explorePostForm.trimVideoTitle", { defaultValue: "Trim video" })}
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            {t("web.provider.explorePostForm.trimVideoHint", {
              defaultValue: "Drag to choose which part of your video appears on Explore.",
            })}
          </p>
        </div>
        <div className="relative aspect-[4/5] max-h-[50vh] bg-black mx-4 rounded-xl overflow-hidden">
          {ready ? (
            <video ref={videoRef} src={videoUrl} playsInline muted loop className="h-full w-full object-cover" />
          ) : (
            <>
              <video ref={videoRef} src={videoUrl} playsInline muted className="hidden" preload="metadata" />
              <div className="flex h-full items-center justify-center text-sm text-white/80">
                {t("web.provider.explorePostForm.trimVideoLoading", { defaultValue: "Loading video…" })}
              </div>
            </>
          )}
        </div>
        <div className="px-4 py-4 space-y-3">
          {ready ? (
            <>
              <div className="flex justify-between text-xs text-gray-500 tabular-nums">
                <span>{formatSec(trim.trim_start_ms)}</span>
                <span>
                  {t("web.provider.explorePostForm.trimClipLength", {
                    defaultValue: "{{seconds}}s clip",
                    seconds: Math.round(clipMs / 1000),
                  })}
                </span>
                <span>{formatSec(trim.trim_end_ms)}</span>
              </div>
              {maxStartMs > 0 ? (
                <input
                  type="range"
                  min={0}
                  max={maxStartMs}
                  step={100}
                  value={startMs}
                  onChange={(e) => setStartMs(Number(e.target.value))}
                  className="w-full accent-violet-600"
                  aria-label={t("web.provider.explorePostForm.trimVideoScrubber", {
                    defaultValue: "Choose clip start",
                  })}
                />
              ) : null}
            </>
          ) : (
            <p className="text-center text-sm text-gray-500">
              {t("web.provider.explorePostForm.trimVideoLoading", { defaultValue: "Loading video…" })}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={!ready}
              onClick={() =>
                onConfirm({
                  ...trim,
                  source_duration_ms: resolvedFullMs,
                })
              }
            >
              {t("web.provider.explorePostForm.trimVideoConfirm", { defaultValue: "Use clip" })}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

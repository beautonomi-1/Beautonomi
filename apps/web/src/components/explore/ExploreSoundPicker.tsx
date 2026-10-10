"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

export type ExploreSoundPickerItem = {
  id: string;
  title: string;
  public_url?: string | null;
  source?: "platform" | "provider";
};

type Props = {
  sounds: ExploreSoundPickerItem[];
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  labels: {
    addMusic: string;
    originalAudio: string;
    viewerHint: string;
    soundsEmpty: string;
    sectionPlatform: string;
    sectionYours: string;
    previewPlay: string;
    previewStop: string;
  };
};

export function ExploreSoundPicker({ sounds, value, onChange, disabled, labels }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const stopPreview = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    setPreviewId(null);
  }, []);

  useEffect(() => () => stopPreview(), [stopPreview]);

  const togglePreview = (sound: ExploreSoundPickerItem) => {
    if (!sound.public_url || disabled) return;
    if (previewId === sound.id) {
      stopPreview();
      return;
    }
    stopPreview();
    const el = audioRef.current ?? new Audio();
    audioRef.current = el;
    el.src = sound.public_url;
    void el.play().then(() => setPreviewId(sound.id)).catch(() => setPreviewId(null));
    el.onended = () => setPreviewId(null);
  };

  const platform = sounds.filter((s) => s.source === "platform");
  const provider = sounds.filter((s) => s.source !== "platform");

  const renderChip = (sound: ExploreSoundPickerItem) => {
    const selected = value === sound.id;
    return (
      <div
        key={sound.id}
        className={cn(
          "flex shrink-0 items-center gap-1 rounded-full border px-3 py-2 text-sm",
          selected ? "border-violet-600 bg-violet-600 text-white" : "border-gray-200 bg-gray-50 text-gray-800",
          disabled && "opacity-60 pointer-events-none",
        )}
      >
        <button
          type="button"
          className="max-w-[140px] truncate font-medium"
          onClick={() => {
            stopPreview();
            onChange(sound.id);
          }}
          aria-pressed={selected}
        >
          {selected ? <Check className="mr-1 inline h-3.5 w-3.5" aria-hidden /> : null}
          {sound.title}
        </button>
        {sound.public_url ? (
          <button
            type="button"
            className={cn(
              "rounded-full p-1",
              selected ? "hover:bg-violet-500" : "hover:bg-gray-200",
            )}
            aria-label={previewId === sound.id ? labels.previewStop : labels.previewPlay}
            onClick={(e) => {
              e.stopPropagation();
              togglePreview(sound);
            }}
          >
            {previewId === sound.id ? (
              <Pause className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Play className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
        ) : null}
      </div>
    );
  };

  const renderSection = (title: string, items: ExploreSoundPickerItem[]) => {
    if (!items.length) return null;
    return (
      <div className="mb-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">{title}</p>
        <div className="flex gap-2 overflow-x-auto pb-1">{items.map(renderChip)}</div>
      </div>
    );
  };

  return (
    <div className="mt-4">
      <p className="text-sm font-medium text-gray-800">{labels.addMusic}</p>
      <p className="mt-1 text-xs text-gray-500">{labels.viewerHint}</p>
      <div className="mt-3">
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              stopPreview();
              onChange(null);
            }}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-sm font-medium",
              value === null
                ? "bg-violet-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200",
            )}
            aria-pressed={value === null}
          >
            {labels.originalAudio}
          </button>
        </div>
        {sounds.length === 0 ? (
          <p className="text-sm text-gray-500">{labels.soundsEmpty}</p>
        ) : (
          <>
            {renderSection(labels.sectionPlatform, platform.length ? platform : sounds.filter((s) => !s.source))}
            {renderSection(labels.sectionYours, provider)}
          </>
        )}
      </div>
    </div>
  );
}

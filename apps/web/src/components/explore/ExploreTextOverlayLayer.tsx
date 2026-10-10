"use client";

import type { ExploreTextOverlay } from "@/types/explore";

type Props = {
  overlays: ExploreTextOverlay[];
  className?: string;
};

/** Absolute-positioned text stickers (normalized x/y). */
export function ExploreTextOverlayLayer({ overlays, className }: Props) {
  if (!overlays.length) return null;
  return (
    <div
      className={`pointer-events-none absolute inset-0 z-10 ${className ?? ""}`}
      aria-hidden
    >
      {overlays.map((layer, i) => (
        <div
          key={`${i}-${layer.text.slice(0, 12)}`}
          className="absolute max-w-[85%] rounded-md bg-black/45 px-2 py-1 text-white shadow-sm"
          style={{
            left: `${layer.x * 100}%`,
            top: `${layer.y * 100}%`,
            transform: "translate(-50%, -50%)",
            fontSize: `clamp(12px, ${layer.font_size * 100}vw, 28px)`,
            color: layer.color,
            textAlign: layer.align ?? "center",
          }}
        >
          {layer.text}
        </div>
      ))}
    </div>
  );
}

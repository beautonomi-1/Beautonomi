"use client";

import { useCallback, useRef } from "react";
import type { ExploreTextOverlay } from "@/types/explore";

type Props = {
  overlays: ExploreTextOverlay[];
  onChangeOverlays?: (layers: ExploreTextOverlay[]) => void;
  className?: string;
};

function clamp01(n: number) {
  return Math.min(0.95, Math.max(0.05, n));
}

/** Provider compose preview — draggable stickers when `onChangeOverlays` is set. */
export function ExploreAuthorOverlayLayer({ overlays, onChangeOverlays, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ index: number; startX: number; startY: number; ox: number; oy: number } | null>(
    null,
  );

  const onPointerDown = useCallback(
    (index: number, e: React.PointerEvent) => {
      if (!onChangeOverlays) return;
      e.preventDefault();
      e.stopPropagation();
      const layer = overlays[index];
      if (!layer) return;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = { index, startX: e.clientX, startY: e.clientY, ox: layer.x, oy: layer.y };
    },
    [onChangeOverlays, overlays],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || !onChangeOverlays || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const nx = clamp01(drag.ox + (e.clientX - drag.startX) / rect.width);
      const ny = clamp01(drag.oy + (e.clientY - drag.startY) / rect.height);
      onChangeOverlays(
        overlays.map((layer, i) => (i === drag.index ? { ...layer, x: nx, y: ny } : layer)),
      );
    },
    [onChangeOverlays, overlays],
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  if (!overlays.length) return null;

  const editable = Boolean(onChangeOverlays);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 z-10 ${className ?? ""}`}
      aria-hidden={!editable}
      onPointerMove={editable ? onPointerMove : undefined}
      onPointerUp={editable ? onPointerUp : undefined}
      onPointerCancel={editable ? onPointerUp : undefined}
    >
      {overlays.map((layer, i) => (
        <div
          key={`${i}-${layer.text.slice(0, 12)}`}
          role={editable ? "button" : undefined}
          onPointerDown={editable ? (e) => onPointerDown(i, e) : undefined}
          className={`absolute max-w-[85%] rounded-md bg-black/45 px-2 py-1 text-white shadow-sm ${
            editable ? "cursor-grab touch-none active:cursor-grabbing ring-1 ring-transparent hover:ring-violet-400/80" : "pointer-events-none"
          }`}
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
